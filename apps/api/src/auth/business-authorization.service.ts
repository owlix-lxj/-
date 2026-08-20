import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { MysqlService } from '../database/mysql.service';

type BusinessAuthorizationRow = {
  user_id: string;
  provider: string;
  key_ciphertext: string;
  key_iv: string;
  key_auth_tag: string;
  key_prefix: string;
};

type MysqlLockRow = RowDataPacket & {
  acquired: number | null;
};

const DEFAULT_PROVIDER = 'vectorengine';

@Injectable()
export class BusinessAuthorizationService {
  private readonly logger = new Logger(BusinessAuthorizationService.name);

  constructor(
    private readonly mysqlService: MysqlService,
    private readonly configService: ConfigService,
  ) {}

  async saveProviderKey(userId: string, providerKey: string, provider = DEFAULT_PROVIDER) {
    const normalizedKey = providerKey.trim();
    if (!normalizedKey) {
      throw new BadRequestException('请填写授权码');
    }
    if (!this.isValidProviderKey(normalizedKey)) {
      throw new BadRequestException('授权码格式不正确');
    }

    const encrypted = this.encrypt(normalizedKey);
    const now = this.toSqlDate(new Date());
    const normalizedProvider = this.normalizeProvider(provider);
    const keyHash = createHash('sha256').update(normalizedKey).digest('hex');
    const keyPrefix = this.maskKeyPrefix(normalizedKey);

    await this.mysqlService.query(
      `INSERT INTO user_business_authorizations
       (user_id, provider, key_ciphertext, key_iv, key_auth_tag, key_hash, key_prefix, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         key_ciphertext = VALUES(key_ciphertext),
         key_iv = VALUES(key_iv),
         key_auth_tag = VALUES(key_auth_tag),
         key_hash = VALUES(key_hash),
         key_prefix = VALUES(key_prefix),
         updated_at = VALUES(updated_at)`,
      [
        userId,
        normalizedProvider,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        keyHash,
        keyPrefix,
        now,
        now,
      ],
    );

    return { provider: normalizedProvider, keyPrefix };
  }

  async getProviderKey(userId: string, provider = DEFAULT_PROVIDER) {
    const rows = await this.mysqlService.query<BusinessAuthorizationRow[]>(
      `SELECT user_id, provider, key_ciphertext, key_iv, key_auth_tag, key_prefix
       FROM user_business_authorizations
       WHERE user_id = ? AND provider = ?
       LIMIT 1`,
      [userId, this.normalizeProvider(provider)],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      provider: row.provider,
      key: this.decrypt({
        ciphertext: row.key_ciphertext,
        iv: row.key_iv,
        authTag: row.key_auth_tag,
      }),
      keyPrefix: row.key_prefix,
    };
  }

  async getProviderKeyForModel(userId: string, provider?: string | null) {
    const candidates = [
      this.normalizeProvider(provider || DEFAULT_PROVIDER),
      DEFAULT_PROVIDER,
    ].filter((item, index, items) => item && items.indexOf(item) === index);

    for (const candidate of candidates) {
      const providerKey = await this.getProviderKey(userId, candidate);
      if (providerKey?.key) {
        return providerKey;
      }
    }

    return null;
  }

  async ensureProviderKeyForUser(input: {
    userId: string;
    email?: string | null;
    name?: string | null;
    provider?: string | null;
  }) {
    const userId = input.userId.trim();
    if (!userId) {
      throw new BadRequestException('缺少用户 ID');
    }

    const provider = this.normalizeProvider(input.provider || DEFAULT_PROVIDER);
    const existing = await this.getProviderKey(userId, provider);
    if (existing?.key) {
      return { ...existing, filled: true, created: false };
    }

    const connection = await this.mysqlService.getConnection();
    const lockName = `business-auth:${provider}:${userId}`;
    try {
      const [lockRows] = await connection.query<MysqlLockRow[]>(
        'SELECT GET_LOCK(?, 10) AS acquired',
        [lockName],
      );
      if (lockRows[0]?.acquired !== 1) {
        throw new InternalServerErrorException('授权码创建繁忙，请稍后重试');
      }

      const existingAfterLock = await this.getProviderKey(userId, provider);
      if (existingAfterLock?.key) {
        return { ...existingAfterLock, filled: true, created: false };
      }

      const providerKey = await this.createProviderTokenForUser({
        userId,
        email: input.email,
        name: input.name,
      });
      const saved = await this.saveProviderKey(userId, providerKey, provider);

      this.logger.log(
        `已为用户自动创建模型授权码：user=${userId} provider=${saved.provider} key=${saved.keyPrefix}`,
      );

      return {
        provider: saved.provider,
        key: providerKey,
        keyPrefix: saved.keyPrefix,
        filled: true,
        created: true,
      };
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined);
      connection.release();
    }
  }

  async getProviderKeySummary(userId: string, provider = DEFAULT_PROVIDER) {
    const rows = await this.mysqlService.query<BusinessAuthorizationRow[]>(
      `SELECT user_id, provider, key_ciphertext, key_iv, key_auth_tag, key_prefix
       FROM user_business_authorizations
       WHERE user_id = ? AND provider = ?
       LIMIT 1`,
      [userId, this.normalizeProvider(provider)],
    );
    const row = rows[0];

    return {
      provider: this.normalizeProvider(provider),
      filled: Boolean(row),
      keyPrefix: row?.key_prefix ?? null,
    };
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  private async createProviderTokenForUser(input: {
    userId: string;
    email?: string | null;
    name?: string | null;
  }) {
    const baseUrl = this.getTokenApiBaseUrl();
    const authorization = this.getTokenApiAuthorization();
    const newApiUser = this.configService.get<string>('VECTORENGINE_TOKEN_API_USER_ID')?.trim();
    if (!authorization || !newApiUser) {
      throw new InternalServerErrorException('模型服务商令牌创建接口未配置');
    }

    const tokenName = this.buildProviderTokenName(input);

    const response = await fetch(`${baseUrl}/api/token/`, {
      method: 'POST',
      headers: this.buildTokenApiHeaders(authorization, newApiUser),
      body: JSON.stringify({
        name: tokenName,
        remain_quota: this.readIntegerEnv('VECTORENGINE_TOKEN_REMAIN_QUOTA', 0),
        expired_time: this.readIntegerEnv('VECTORENGINE_TOKEN_EXPIRED_TIME', -1),
        unlimited_quota: this.readBooleanEnv('VECTORENGINE_TOKEN_UNLIMITED_QUOTA', true),
        model_limits_enabled: this.readBooleanEnv('VECTORENGINE_TOKEN_MODEL_LIMITS_ENABLED', false),
        model_limits: this.configService.get<string>('VECTORENGINE_TOKEN_MODEL_LIMITS') ?? '',
        allow_ips: this.configService.get<string>('VECTORENGINE_TOKEN_ALLOW_IPS') ?? '',
        group: this.getTokenGroup(),
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || this.readSuccessFlag(payload) === false) {
      throw new InternalServerErrorException(
        this.readString((payload as Record<string, unknown>)?.message) ||
          this.readString((payload as Record<string, unknown>)?.error) ||
          '模型服务商令牌创建失败',
      );
    }

    const providerKey =
      this.extractProviderKey(payload) || await this.findProviderTokenKeyByName(tokenName);
    if (!this.isValidProviderKey(providerKey)) {
      throw new InternalServerErrorException('模型服务商未返回有效授权码');
    }

    return providerKey;
  }

  private async findProviderTokenKeyByName(tokenName: string) {
    const baseUrl = this.getTokenApiBaseUrl();
    const authorization = this.getTokenApiAuthorization();
    const newApiUser = this.configService.get<string>('VECTORENGINE_TOKEN_API_USER_ID')?.trim();
    if (!authorization || !newApiUser) {
      return '';
    }

    const searchUrl = `${baseUrl}/api/token/search?keyword=${encodeURIComponent(tokenName)}`;
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: this.buildTokenApiHeaders(authorization, newApiUser),
    });
    const searchPayload = await searchResponse.json().catch(() => null);
    const searchItems = this.extractProviderTokenItems(searchPayload);
    const exactSearchItem = this.pickLatestProviderTokenItem(searchItems, tokenName);
    const searchKey = this.extractProviderKey(exactSearchItem);
    if (searchKey) {
      return searchKey;
    }

    const listResponse = await fetch(`${baseUrl}/api/token/?p=1&size=100`, {
      method: 'GET',
      headers: this.buildTokenApiHeaders(authorization, newApiUser),
    });
    const listPayload = await listResponse.json().catch(() => null);
    const listItems = this.extractProviderTokenItems(listPayload);
    return this.extractProviderKey(this.pickLatestProviderTokenItem(listItems, tokenName));
  }

  private pickLatestProviderTokenItem(items: Record<string, unknown>[], tokenName: string) {
    return items
      .filter((item) => this.readString(item.name) === tokenName)
      .sort((left, right) => {
        const rightTime = this.readNumber(right.created_time, 0) || this.readNumber(right.id, 0);
        const leftTime = this.readNumber(left.created_time, 0) || this.readNumber(left.id, 0);
        return rightTime - leftTime;
      })[0] ?? null;
  }

  private buildTokenApiHeaders(authorization: string, newApiUser: string) {
    return {
      'content-type': 'application/json',
      accept: 'application/json',
      'new-api-user': newApiUser,
      Authorization: authorization,
    };
  }

  private buildProviderTokenName(input: {
    userId: string;
    email?: string | null;
    name?: string | null;
  }) {
    const suffix = Date.now().toString(36).slice(-5);
    return `owlix-${input.userId.slice(0, 8)}-${suffix}`;
  }

  private getTokenGroup() {
    return this.configService.get<string>('VECTORENGINE_TOKEN_GROUP')?.trim() || 'default';
  }

  private getTokenApiBaseUrl() {
    const configured =
      this.configService.get<string>('VECTORENGINE_TOKEN_API_BASE_URL')?.trim() ||
      this.configService.get<string>('VECTORENGINE_BASE_URL')?.trim() ||
      'https://api.vectorengine.ai';
    return configured.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  }

  private getTokenApiAuthorization() {
    const raw =
      this.configService.get<string>('VECTORENGINE_TOKEN_API_AUTHORIZATION')?.trim() ||
      this.configService.get<string>('VECTORENGINE_TOKEN_API_KEY')?.trim() ||
      '';
    if (!raw) {
      return '';
    }
    const scheme =
      this.configService.get<string>('VECTORENGINE_TOKEN_API_AUTH_SCHEME')?.trim().toLowerCase() ||
      'bearer';
    if (scheme === 'raw') {
      return raw;
    }
    return /^Bearer\s+/i.test(raw) ? raw : `Bearer ${raw}`;
  }

  private extractProviderKey(payload: unknown) {
    const record = this.asRecord(payload);
    const data = this.asRecord(record?.data);
    return (
      this.readString(data?.key) ||
      this.readString(data?.key_value) ||
      this.readString(data?.token_value) ||
      this.readString(data?.token) ||
      this.readString(data?.token_key) ||
      this.readString(data?.value) ||
      this.readString(data?.content) ||
      this.readString(record?.data) ||
      this.readString(record?.key) ||
      this.readString(record?.key_value) ||
      this.readString(record?.token_value) ||
      this.readString(record?.token) ||
      this.readString(record?.token_key) ||
      this.readString(record?.value) ||
      this.readString(record?.content)
    );
  }

  private isValidProviderKey(value: unknown) {
    return /^sk-[a-zA-Z0-9_-]{20,}$/.test(this.readString(value));
  }

  private extractProviderTokenItems(payload: unknown) {
    const record = this.asRecord(payload);
    const data = this.asRecord(record?.data);
    const nestedData = this.asRecord(data?.data);
    const candidates = [
      record?.data,
      record?.items,
      record?.tokens,
      record?.rows,
      data?.items,
      data?.tokens,
      data?.rows,
      data?.list,
      nestedData?.items,
      nestedData?.tokens,
      nestedData?.rows,
      nestedData?.list,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item) => this.asRecord(item)) as Record<string, unknown>[];
      }
    }

    return [];
  }

  private readSuccessFlag(payload: unknown) {
    const record = this.asRecord(payload);
    return typeof record?.success === 'boolean' ? record.success : null;
  }

  private readIntegerEnv(name: string, fallback: number) {
    const parsed = Number(this.configService.get<string>(name));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }

  private readBooleanEnv(name: string, fallback: boolean) {
    const value = this.configService.get<string>(name)?.trim().toLowerCase();
    if (value === 'true' || value === '1') {
      return true;
    }
    if (value === 'false' || value === '0') {
      return false;
    }
    return fallback;
  }

  private asRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private readNumber(value: unknown, fallback = 0) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private decrypt(input: { ciphertext: string; iv: string; authTag: string }) {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(input.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(input.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getEncryptionKey() {
    const secret =
      this.configService.get<string>('BUSINESS_AUTHORIZATION_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'dev-secret-change-me';
    return createHash('sha256').update(secret).digest();
  }

  private normalizeProvider(provider: string) {
    return provider.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || DEFAULT_PROVIDER;
  }

  private maskKeyPrefix(value: string) {
    return value.length <= 10 ? `${value.slice(0, 4)}…` : `${value.slice(0, 6)}…${value.slice(-4)}`;
  }

  private toSqlDate(value: Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
}
