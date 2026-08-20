import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { MysqlService } from '../database/mysql.service';

export interface StoredOrganization {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  status: string;
  plan: string;
  subscriptionStatus: string;
  planOverrides: Record<string, unknown> | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionEndsAt: string | null;
  businessLicense: string | null;
  unifiedSocialCreditCode: string | null;
  registeredAddress: string | null;
  industryCategory: string | null;
  businessCode: string | null;
  legalRepresentativeName: string | null;
  legalRepresentativeIdCardNo: string | null;
  legalRepresentativeIdCardFront: string | null;
  legalRepresentativeIdCardBack: string | null;
  enterpriseVerificationStatus: string | null;
  enterpriseVerificationMessage: string | null;
  enterpriseVerifiedAt: string | null;
  country: string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'analyst' | 'viewer';
  status: 'active' | 'invited' | 'removed';
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type TeamRole = StoredMembership['role'];

export interface StoredTeamMember {
  membershipId: string;
  organizationId: string;
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  status: StoredMembership['status'];
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredOrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: TeamRole;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  status: string;
  plan: string;
  subscription_status: string;
  plan_overrides: string | Record<string, unknown> | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_ends_at: string | null;
  business_license: string | null;
  unified_social_credit_code: string | null;
  registered_address: string | null;
  industry_category: string | null;
  business_code: string | null;
  legal_representative_name: string | null;
  legal_representative_id_card_no: string | null;
  legal_representative_id_card_front: string | null;
  legal_representative_id_card_back: string | null;
  enterprise_verification_status: string | null;
  enterprise_verification_message: string | null;
  enterprise_verified_at: string | null;
  country: string | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: StoredMembership['role'];
  status: StoredMembership['status'];
  joined_at: string;
  created_at: string;
  updated_at: string;
}

interface TeamMemberRow extends MembershipRow {
  email: string;
  name: string;
}

interface OrganizationInvitationRow {
  id: string;
  organization_id: string;
  email: string;
  role: TeamRole;
  token: string;
  status: StoredOrganizationInvitation['status'];
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class OrganizationStoreService {
  constructor(private readonly mysqlService: MysqlService) {}

  async createOrganization(input: {
    userId: string;
    name: string;
    businessLicense?: string;
    unifiedSocialCreditCode?: string;
    registeredAddress?: string;
    legalRepresentativeName?: string;
    legalRepresentativeIdCardNo?: string;
    legalRepresentativeIdCardFront?: string;
    legalRepresentativeIdCardBack?: string;
    country?: string;
    currency?: string;
  }) {
    const connection = await this.mysqlService.getConnection();
    try {
      await connection.beginTransaction();
      const now = this.nowSql();
      const slug = await this.createUniqueSlug(input.name, connection);

      const organization: StoredOrganization = {
        id: randomUUID(),
        name: input.name.trim(),
        slug,
        ownerUserId: input.userId,
        status: 'active',
        plan: 'starter',
        subscriptionStatus: 'inactive',
        planOverrides: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionEndsAt: null,
        businessLicense: input.businessLicense?.trim() || null,
        unifiedSocialCreditCode:
          input.unifiedSocialCreditCode?.trim().toUpperCase() || null,
        registeredAddress: input.registeredAddress?.trim() || null,
        industryCategory: null,
        businessCode: null,
        legalRepresentativeName: input.legalRepresentativeName?.trim() || null,
        legalRepresentativeIdCardNo:
          input.legalRepresentativeIdCardNo?.trim().toUpperCase() || null,
        legalRepresentativeIdCardFront:
          input.legalRepresentativeIdCardFront?.trim() || null,
        legalRepresentativeIdCardBack:
          input.legalRepresentativeIdCardBack?.trim() || null,
        enterpriseVerificationStatus: 'unverified',
        enterpriseVerificationMessage: null,
        enterpriseVerifiedAt: null,
        country: input.country?.trim() || null,
        currency: input.currency?.trim() || null,
        createdAt: this.toIso(now),
        updatedAt: this.toIso(now),
      };

      const membership: StoredMembership = {
        id: randomUUID(),
        organizationId: organization.id,
        userId: input.userId,
        role: 'owner',
        status: 'active',
        joinedAt: this.toIso(now),
        createdAt: this.toIso(now),
        updatedAt: this.toIso(now),
      };

      await connection.query(
        `INSERT INTO organizations (
          id, name, slug, owner_user_id, status, plan, subscription_status, plan_overrides,
          stripe_customer_id, stripe_subscription_id, subscription_ends_at,
          business_license, unified_social_credit_code, registered_address,
          industry_category, business_code,
          legal_representative_name, legal_representative_id_card_no,
          legal_representative_id_card_front, legal_representative_id_card_back,
          enterprise_verification_status, enterprise_verification_message, enterprise_verified_at,
          country, currency, created_at, updated_at
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          organization.id,
          organization.name,
          organization.slug,
          organization.ownerUserId,
          organization.status,
          organization.plan,
          organization.subscriptionStatus,
          organization.planOverrides ? JSON.stringify(organization.planOverrides) : null,
          organization.stripeCustomerId,
          organization.stripeSubscriptionId,
          organization.subscriptionEndsAt,
          organization.businessLicense,
          organization.unifiedSocialCreditCode,
          organization.registeredAddress,
          organization.industryCategory,
          organization.businessCode,
          organization.legalRepresentativeName,
          organization.legalRepresentativeIdCardNo,
          organization.legalRepresentativeIdCardFront,
          organization.legalRepresentativeIdCardBack,
          organization.enterpriseVerificationStatus,
          organization.enterpriseVerificationMessage,
          organization.enterpriseVerifiedAt,
          organization.country,
          organization.currency,
          now,
          now,
        ],
      );

      await connection.query(
        `INSERT INTO memberships (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          membership.id,
          membership.organizationId,
          membership.userId,
          membership.role,
          membership.status,
          now,
          now,
          now,
        ],
      );

      await connection.commit();
      return { organization, membership };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findOrganizationById(organizationId: string) {
    const rows = await this.mysqlService.query<OrganizationRow[]>(
      'SELECT * FROM organizations WHERE id = ? LIMIT 1',
      [organizationId],
    );
    return rows[0] ? this.mapOrganization(rows[0]) : null;
  }

  async findOrganizationByStripeCustomerId(stripeCustomerId: string) {
    const rows = await this.mysqlService.query<OrganizationRow[]>(
      'SELECT * FROM organizations WHERE stripe_customer_id = ? LIMIT 1',
      [stripeCustomerId],
    );
    return rows[0] ? this.mapOrganization(rows[0]) : null;
  }

  async updateOrganizationBilling(
    organizationId: string,
    updates: {
      plan?: string | null;
      subscriptionStatus?: string | null;
      planOverrides?: Record<string, unknown> | null;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      subscriptionEndsAt?: string | null;
    },
  ) {
    const fields: string[] = [];
    const params: unknown[] = [];

    if ('plan' in updates) {
      fields.push('plan = ?');
      params.push(updates.plan ?? 'starter');
    }
    if ('subscriptionStatus' in updates) {
      fields.push('subscription_status = ?');
      params.push(updates.subscriptionStatus ?? 'inactive');
    }
    if ('planOverrides' in updates) {
      fields.push('plan_overrides = ?');
      params.push(updates.planOverrides ? JSON.stringify(updates.planOverrides) : null);
    }
    if ('stripeCustomerId' in updates) {
      fields.push('stripe_customer_id = ?');
      params.push(updates.stripeCustomerId ?? null);
    }
    if ('stripeSubscriptionId' in updates) {
      fields.push('stripe_subscription_id = ?');
      params.push(updates.stripeSubscriptionId ?? null);
    }
    if ('subscriptionEndsAt' in updates) {
      fields.push('subscription_ends_at = ?');
      params.push(
        updates.subscriptionEndsAt ? this.toSqlDate(new Date(updates.subscriptionEndsAt)) : null,
      );
    }

    if (fields.length === 0) {
      return this.findOrganizationById(organizationId);
    }

    fields.push('updated_at = ?');
    params.push(this.nowSql(), organizationId);

    await this.mysqlService.query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );

    return this.findOrganizationById(organizationId);
  }

  async updateOrganizationBillingByStripeCustomerId(
    stripeCustomerId: string,
    updates: {
      plan?: string | null;
      subscriptionStatus?: string | null;
      planOverrides?: Record<string, unknown> | null;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
      subscriptionEndsAt?: string | null;
    },
  ) {
    const organization = await this.findOrganizationByStripeCustomerId(stripeCustomerId);
    if (!organization) {
      return null;
    }
    return this.updateOrganizationBilling(organization.id, updates);
  }

  async updateOrganizationEnterpriseProfile(
    organizationId: string,
    updates: {
      name?: string;
      businessLicense?: string | null;
      unifiedSocialCreditCode?: string | null;
      registeredAddress?: string | null;
      industryCategory?: string | null;
      businessCode?: string | null;
      legalRepresentativeName?: string | null;
      legalRepresentativeIdCardNo?: string | null;
      legalRepresentativeIdCardFront?: string | null;
      legalRepresentativeIdCardBack?: string | null;
      enterpriseVerificationStatus?: string | null;
      enterpriseVerificationMessage?: string | null;
      enterpriseVerifiedAt?: string | null;
    },
  ) {
    const fields: string[] = [];
    const params: unknown[] = [];

    if ('name' in updates) {
      fields.push('name = ?');
      params.push(String(updates.name || '').trim());
    }
    if ('businessLicense' in updates) {
      fields.push('business_license = ?');
      params.push(updates.businessLicense?.trim() || null);
    }
    if ('unifiedSocialCreditCode' in updates) {
      fields.push('unified_social_credit_code = ?');
      params.push(updates.unifiedSocialCreditCode?.trim().toUpperCase() || null);
    }
    if ('registeredAddress' in updates) {
      fields.push('registered_address = ?');
      params.push(updates.registeredAddress?.trim() || null);
    }
    if ('industryCategory' in updates) {
      fields.push('industry_category = ?');
      params.push(updates.industryCategory?.trim() || null);
    }
    if ('businessCode' in updates) {
      fields.push('business_code = ?');
      params.push(updates.businessCode?.trim().toUpperCase() || null);
    }
    if ('legalRepresentativeName' in updates) {
      fields.push('legal_representative_name = ?');
      params.push(updates.legalRepresentativeName?.trim() || null);
    }
    if ('legalRepresentativeIdCardNo' in updates) {
      fields.push('legal_representative_id_card_no = ?');
      params.push(updates.legalRepresentativeIdCardNo?.trim().toUpperCase() || null);
    }
    if ('legalRepresentativeIdCardFront' in updates) {
      fields.push('legal_representative_id_card_front = ?');
      params.push(updates.legalRepresentativeIdCardFront?.trim() || null);
    }
    if ('legalRepresentativeIdCardBack' in updates) {
      fields.push('legal_representative_id_card_back = ?');
      params.push(updates.legalRepresentativeIdCardBack?.trim() || null);
    }
    if ('enterpriseVerificationStatus' in updates) {
      fields.push('enterprise_verification_status = ?');
      params.push(updates.enterpriseVerificationStatus?.trim() || null);
    }
    if ('enterpriseVerificationMessage' in updates) {
      fields.push('enterprise_verification_message = ?');
      params.push(updates.enterpriseVerificationMessage?.trim() || null);
    }
    if ('enterpriseVerifiedAt' in updates) {
      fields.push('enterprise_verified_at = ?');
      params.push(
        updates.enterpriseVerifiedAt ? this.toSqlDate(new Date(updates.enterpriseVerifiedAt)) : null,
      );
    }

    if (fields.length === 0) {
      return this.findOrganizationById(organizationId);
    }

    fields.push('updated_at = ?');
    params.push(this.nowSql(), organizationId);

    await this.mysqlService.query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`,
      params,
    );

    return this.findOrganizationById(organizationId);
  }

  async findFirstBrandIdByOrganizationId(organizationId: string) {
    const rows = await this.mysqlService.query<Array<{ id: string }>>(
      `SELECT id
       FROM monitor_brands
       WHERE organization_id = ?
       ORDER BY created_at ASC
       LIMIT 1`,
      [organizationId],
    );
    return rows[0]?.id ?? null;
  }

  async alignPromptEnginesForOrganization(
    organizationId: string,
    platforms: string[],
    models: string[],
  ) {
    const brandRows = await this.mysqlService.query<Array<{ id: string }>>(
      'SELECT id FROM monitor_brands WHERE organization_id = ?',
      [organizationId],
    );
    const brandIds = brandRows.map((row) => row.id).filter(Boolean);
    if (brandIds.length === 0) {
      return 0;
    }

    const promptSetRows = await this.mysqlService.query<Array<{ id: string }>>(
      `SELECT id
       FROM monitor_prompt_sets
       WHERE brand_id IN (${brandIds.map(() => '?').join(', ')})`,
      brandIds,
    );
    const promptSetIds = promptSetRows.map((row) => row.id).filter(Boolean);
    if (promptSetIds.length === 0) {
      return 0;
    }

    const result = await this.mysqlService.query<{
      affectedRows?: number;
    }>(
      `UPDATE monitor_prompts
       SET platforms_json = ?, models_json = ?, updated_at = ?
       WHERE prompt_set_id IN (${promptSetIds.map(() => '?').join(', ')})`,
      [
        JSON.stringify(platforms),
        JSON.stringify(models),
        this.nowSql(),
        ...promptSetIds,
      ],
    );

    const queryResult = result as unknown as { affectedRows?: number };
    return Number(queryResult?.affectedRows ?? 0);
  }

  async findMembership(organizationId: string, userId: string) {
    const rows = await this.mysqlService.query<MembershipRow[]>(
      'SELECT * FROM memberships WHERE organization_id = ? AND user_id = ? LIMIT 1',
      [organizationId, userId],
    );
    return rows[0] ? this.mapMembership(rows[0]) : null;
  }

  async findOrganizationsByUserId(userId: string) {
    const rows = await this.mysqlService.query<
      (OrganizationRow & {
        membership_id: string;
        membership_role: StoredMembership['role'];
        membership_status: StoredMembership['status'];
        membership_joined_at: string;
      })[]
    >(
      `SELECT o.*, m.id AS membership_id, m.role AS membership_role, m.status AS membership_status, m.joined_at AS membership_joined_at
       FROM memberships m
       INNER JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY o.created_at DESC`,
      [userId],
    );

    return rows.map((row) => ({
      ...this.mapOrganization(row),
      membership: {
        id: row.membership_id,
        role: row.membership_role,
        status: row.membership_status,
        joinedAt: this.toIso(row.membership_joined_at),
      },
    }));
  }

  async getOrCreatePersonalKnowledgeBaseWorkspace(userId: string) {
    const existing = await this.findPersonalKnowledgeBaseWorkspace(userId);
    if (existing) {
      return existing;
    }

    const created = await this.createOrganization({
      userId,
      name: '个人知识库',
      country: 'CN',
      currency: 'CNY',
    });
    const now = this.nowSql();

    try {
      await this.mysqlService.query(
        `INSERT INTO knowledge_base_personal_workspaces (
          user_id, organization_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?)`,
        [userId, created.organization.id, now, now],
      );
      return created;
    } catch (error) {
      const concurrent = await this.findPersonalKnowledgeBaseWorkspace(userId);
      if (concurrent) {
        return concurrent;
      }
      throw error;
    }
  }

  private async findPersonalKnowledgeBaseWorkspace(userId: string) {
    const rows = await this.mysqlService.query<Array<{ organization_id: string }>>(
      'SELECT organization_id FROM knowledge_base_personal_workspaces WHERE user_id = ? LIMIT 1',
      [userId],
    );
    const organizationId = rows[0]?.organization_id;
    if (!organizationId) {
      return null;
    }

    const [organization, membership] = await Promise.all([
      this.findOrganizationById(organizationId),
      this.findMembership(organizationId, userId),
    ]);
    if (!organization || !membership || membership.status !== 'active') {
      return null;
    }
    return { organization, membership };
  }

  async listTeamMembers(organizationId: string) {
    const rows = await this.mysqlService.query<TeamMemberRow[]>(
      `SELECT m.*, u.email, u.name
       FROM memberships m
       INNER JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ? AND m.status = 'active'
       ORDER BY
         CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END,
         m.created_at ASC`,
      [organizationId],
    );

    return rows.map((row) => this.mapTeamMember(row));
  }

  async countActiveMembers(organizationId: string) {
    const rows = await this.mysqlService.query<{ count: number }[]>(
      `SELECT COUNT(*) AS count
       FROM memberships
       WHERE organization_id = ? AND status = 'active'`,
      [organizationId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countActiveNonOwnerMembers(organizationId: string) {
    const rows = await this.mysqlService.query<{ count: number }[]>(
      `SELECT COUNT(*) AS count
       FROM memberships
       WHERE organization_id = ? AND status = 'active' AND role <> 'owner'`,
      [organizationId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countPendingInvitations(organizationId: string) {
    const rows = await this.mysqlService.query<{ count: number }[]>(
      `SELECT COUNT(*) AS count
       FROM organization_invitations
       WHERE organization_id = ? AND status = 'pending'`,
      [organizationId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async listPendingInvitations(organizationId: string) {
    const rows = await this.mysqlService.query<OrganizationInvitationRow[]>(
      `SELECT *
       FROM organization_invitations
       WHERE organization_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
      [organizationId],
    );

    return rows.map((row) => this.mapInvitation(row));
  }

  async findPendingInvitationByEmail(organizationId: string, email: string) {
    const rows = await this.mysqlService.query<OrganizationInvitationRow[]>(
      `SELECT *
       FROM organization_invitations
       WHERE organization_id = ? AND email = ? AND status = 'pending'
       LIMIT 1`,
      [organizationId, email.toLowerCase()],
    );
    return rows[0] ? this.mapInvitation(rows[0]) : null;
  }

  async listPendingInvitationsByEmail(email: string) {
    const rows = await this.mysqlService.query<OrganizationInvitationRow[]>(
      `SELECT *
       FROM organization_invitations
       WHERE email = ? AND status = 'pending'
       ORDER BY created_at ASC`,
      [email.toLowerCase()],
    );
    return rows.map((row) => this.mapInvitation(row));
  }

  async findInvitationById(organizationId: string, invitationId: string) {
    const rows = await this.mysqlService.query<OrganizationInvitationRow[]>(
      `SELECT *
       FROM organization_invitations
       WHERE organization_id = ? AND id = ?
       LIMIT 1`,
      [organizationId, invitationId],
    );
    return rows[0] ? this.mapInvitation(rows[0]) : null;
  }

  async findInvitationByToken(token: string) {
    const rows = await this.mysqlService.query<
      (OrganizationInvitationRow & { organization_name: string | null })[]
    >(
      `SELECT i.*, o.name AS organization_name
       FROM organization_invitations i
       INNER JOIN organizations o ON o.id = i.organization_id
       WHERE i.token = ?
       LIMIT 1`,
      [token],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      ...this.mapInvitation(row),
      organizationName: row.organization_name,
    };
  }

  async createInvitation(input: {
    organizationId: string;
    email: string;
    role: TeamRole;
    token: string;
    invitedBy: string;
    expiresAt: string;
  }) {
    const now = this.nowSql();
    const id = randomUUID();

    await this.mysqlService.query(
      `INSERT INTO organization_invitations
       (id, organization_id, email, role, token, status, invited_by, expires_at, accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?)`,
      [
        id,
        input.organizationId,
        input.email.toLowerCase(),
        input.role,
        input.token,
        input.invitedBy,
        this.toSqlDate(new Date(input.expiresAt)),
        now,
        now,
      ],
    );

    return this.findInvitationById(input.organizationId, id);
  }

  async renewInvitation(organizationId: string, invitationId: string, expiresAt: string) {
    await this.mysqlService.query(
      `UPDATE organization_invitations
       SET expires_at = ?, updated_at = ?
       WHERE organization_id = ? AND id = ? AND status = 'pending'`,
      [
        this.toSqlDate(new Date(expiresAt)),
        this.nowSql(),
        organizationId,
        invitationId,
      ],
    );

    return this.findInvitationById(organizationId, invitationId);
  }

  async updateInvitationStatus(
    invitationId: string,
    status: StoredOrganizationInvitation['status'],
    acceptedAt?: string | null,
  ) {
    await this.mysqlService.query(
      `UPDATE organization_invitations
       SET status = ?, accepted_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        status,
        acceptedAt ? this.toSqlDate(new Date(acceptedAt)) : null,
        this.nowSql(),
        invitationId,
      ],
    );
  }

  async updateMemberRole(organizationId: string, userId: string, role: TeamRole) {
    await this.mysqlService.query(
      `UPDATE memberships
       SET role = ?, updated_at = ?
       WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      [role, this.nowSql(), organizationId, userId],
    );

    return this.findMembership(organizationId, userId);
  }

  async removeMember(organizationId: string, userId: string) {
    await this.mysqlService.query(
      `UPDATE memberships
       SET status = 'removed', updated_at = ?
       WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
      [this.nowSql(), organizationId, userId],
    );
  }

  async upsertActiveMembership(input: {
    organizationId: string;
    userId: string;
    role: TeamRole;
  }) {
    const now = this.nowSql();
    const id = randomUUID();

    await this.mysqlService.query(
      `INSERT INTO memberships
       (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         role = VALUES(role),
         status = 'active',
         joined_at = VALUES(joined_at),
         updated_at = VALUES(updated_at)`,
      [
        id,
        input.organizationId,
        input.userId,
        input.role,
        now,
        now,
        now,
      ],
    );

    return this.findMembership(input.organizationId, input.userId);
  }

  private async createUniqueSlug(name: string, connection: PoolConnection) {
    const base = this.slugify(name);
    if (!base) {
      throw new BadRequestException('组织名称无效');
    }

    let slug = base;
    let counter = 2;
    while (true) {
      const [rows] = await connection.query<any[]>(
        'SELECT COUNT(*) AS count FROM organizations WHERE slug = ?',
        [slug],
      );
      if (!rows[0] || rows[0].count === 0) break;
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  private slugify(input: string) {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private mapOrganization(row: OrganizationRow): StoredOrganization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerUserId: row.owner_user_id,
      status: row.status,
      plan: row.plan,
      subscriptionStatus: row.subscription_status,
      planOverrides: this.parseJsonObject(row.plan_overrides),
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      subscriptionEndsAt: row.subscription_ends_at ? this.toIso(row.subscription_ends_at) : null,
      businessLicense: row.business_license,
      unifiedSocialCreditCode: row.unified_social_credit_code,
      registeredAddress: row.registered_address,
      industryCategory: row.industry_category,
      businessCode: row.business_code,
      legalRepresentativeName: row.legal_representative_name,
      legalRepresentativeIdCardNo: row.legal_representative_id_card_no,
      legalRepresentativeIdCardFront: row.legal_representative_id_card_front,
      legalRepresentativeIdCardBack: row.legal_representative_id_card_back,
      enterpriseVerificationStatus: row.enterprise_verification_status,
      enterpriseVerificationMessage: row.enterprise_verification_message,
      enterpriseVerifiedAt: row.enterprise_verified_at ? this.toIso(row.enterprise_verified_at) : null,
      country: row.country,
      currency: row.currency,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapMembership(row: MembershipRow): StoredMembership {
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      joinedAt: this.toIso(row.joined_at),
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapTeamMember(row: TeamMemberRow): StoredTeamMember {
    return {
      membershipId: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      joinedAt: this.toIso(row.joined_at),
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapInvitation(row: OrganizationInvitationRow): StoredOrganizationInvitation {
    return {
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role,
      token: row.token,
      status: row.status,
      invitedBy: row.invited_by,
      expiresAt: this.toIso(row.expires_at),
      acceptedAt: row.accepted_at ? this.toIso(row.accepted_at) : null,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private nowSql() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  private parseJsonObject(value: string | Record<string, unknown> | null) {
    if (!value) {
      return null;
    }
    if (typeof value === 'object') {
      return value;
    }
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private toSqlDate(value: Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  private toIso(value: string) {
    return value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  }
}
