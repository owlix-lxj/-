import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';

export type DbRow = RowDataPacket;
export type DbResult = ResultSetHeader;

@Injectable()
export class MysqlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MysqlService.name);
  private pool?: Pool;
  private available = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      this.pool = mysql.createPool({
        host: this.configService.get<string>('MYSQL_HOST', '127.0.0.1'),
        port: Number(this.configService.get<string>('MYSQL_PORT', '3306')),
        user: this.configService.get<string>('MYSQL_USER', 'root'),
        password: this.configService.get<string>('MYSQL_PASSWORD', ''),
        database: this.configService.get<string>('MYSQL_DATABASE', 'geo_saas'),
        waitForConnections: true,
        connectionLimit: Number(
          this.configService.get<string>('MYSQL_CONNECTION_LIMIT', '10'),
        ),
        queueLimit: 0,
        charset: 'utf8mb4',
        dateStrings: true,
        namedPlaceholders: true,
      });

      await this.pool.query('SELECT 1');
      this.available = true;
      this.logger.log('MySQL connected');

      if (this.configService.get<string>('DB_AUTO_INIT', 'true') === 'true') {
        await this.runSchema();
      }
    } catch (error) {
      this.available = false;
      if (this.configService.get<string>('MYSQL_OPTIONAL', 'false') === 'true') {
        this.logger.warn(`MySQL unavailable, continuing in optional mode: ${this.getMysqlErrorCode(error)}`);
        return;
      }
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async query<T = unknown>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ) {
    if (!this.pool || !this.available) {
      throw new Error('MySQL is not available');
    }
    const [rows] = await this.pool.query(sql, params as never);
    return rows as T;
  }

  async getConnection(): Promise<PoolConnection> {
    if (!this.pool || !this.available) {
      throw new Error('MySQL is not available');
    }
    return this.pool.getConnection();
  }

  isAvailable() {
    return this.available;
  }

  private async runSchema() {
    if (!this.pool) {
      throw new Error('MySQL is not available');
    }
    const filePath = join(process.cwd(), 'sql', 'init.mysql.sql');
    const sql = await readFile(filePath, 'utf8');
    const statements = sql
      .split(/;\s*\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    const connection = await this.pool.getConnection();
    try {
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (error) {
          if (this.isIgnorableSchemaError(error)) {
            this.logger.warn(
              `Skip schema statement because it is already applied: ${this.getMysqlErrorCode(error)}`,
            );
            continue;
          }
          throw error;
        }
      }
      this.logger.log('MySQL schema ensured');
    } finally {
      connection.release();
    }
  }

  private isIgnorableSchemaError(error: unknown) {
    const code = this.getMysqlErrorCode(error);
    return code === 'ER_DUP_FIELDNAME' || code === 'ER_DUP_KEYNAME';
  }

  private getMysqlErrorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      return String(error.code);
    }

    return 'UNKNOWN';
  }
}
