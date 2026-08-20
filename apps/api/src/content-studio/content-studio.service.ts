import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import OSS from 'ali-oss';
import { isApiCloudMode } from '../common/cloud-mode';
import { buildOssUploadHeaders } from '../common/oss-upload-headers';
import { MysqlService } from '../database/mysql.service';
import { OrganizationStoreService } from '../organization-store/organization-store.service';
import {
  CodexExecutorService,
  type MediaPublishCodexPlan,
  type MediaPublishCodexResult,
  type MediaPublishCodexToolStep,
} from './codex-executor.service';

interface BrandRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  industry: string | null;
  description: string | null;
  region: string | null;
  language: string | null;
}

interface BrandDomainRow {
  id: string;
  brand_id: string;
  domain: string;
  country: string | null;
  is_primary: number;
}

interface DraftRow {
  id: string;
  brand_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  draft_id: string;
  brand_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  updated_at: string;
}

interface ContentWebhookConfigRow {
  id: string;
  brand_id: string;
  name: string;
  webhook_url: string;
  webhook_secret: string | null;
  events_json: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface MiaosheChatUploadRow {
  id: string;
  user_id: string;
  brand_id: string;
  thread_id: string;
  client_message_id: string | null;
  message_text: string;
  attachments_json: string;
  created_at: string;
  updated_at: string;
}

interface MediaAssetRow {
  id: string;
  user_id: string;
  brand_id: string;
  asset_type: string;
  title: string;
  asset_url: string;
  thumbnail_url: string | null;
  mime_type: string | null;
  provider: string | null;
  model: string | null;
  source: string | null;
  prompt: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

type AnthropicContentBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: string;
        data: string;
      };
    }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

type BrandIntelligenceToolName =
  | 'get_brand_answer_engine_overview'
  | 'get_brand_topics'
  | 'get_brand_prompts'
  | 'get_brand_citations'
  | 'get_brand_ai_traffic'
  | 'get_brand_competitors'
  | 'get_brand_creator_platform_status'
  | 'refresh_brand_creator_platform_data'
  | 'get_brand_creator_platform_report';

type MiaosheSkillToolName =
  | 'ensure_bridge_connection'
  | 'list_platforms'
  | 'check_auth'
  | 'refresh_platform_data'
  | 'sync_article';

type MiaosheConversationToolName = BrandIntelligenceToolName | MiaosheSkillToolName;

type ContentStudioEffectivePlanId = 'self_hosted' | 'free' | 'starter' | 'growth' | 'enterprise';

type ContentStudioUsageQuotaRules = {
  maxImages: number;
  maxVideos: number;
  maxMessages: number;
};

const CONTENT_STUDIO_USAGE_QUOTA_RULES: Record<
  ContentStudioEffectivePlanId,
  ContentStudioUsageQuotaRules
> = {
  self_hosted: {
    maxImages: -1,
    maxVideos: -1,
    maxMessages: -1,
  },
  free: {
    maxImages: -1,
    maxVideos: -1,
    maxMessages: -1,
  },
  starter: {
    maxImages: -1,
    maxVideos: -1,
    maxMessages: -1,
  },
  growth: {
    maxImages: -1,
    maxVideos: -1,
    maxMessages: -1,
  },
  enterprise: {
    maxImages: -1,
    maxVideos: -1,
    maxMessages: -1,
  },
};

interface WechatSyncBridgeSessionRow {
  id: string;
  organization_id: string;
  user_id: string;
  public_id: string;
  session_token: string;
  status: string;
  last_error: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  disconnected_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatorPlatformConnectionRow {
  id: string;
  organization_id: string;
  user_id: string;
  brand_id: string;
  bridge_session_public_id: string | null;
  platform: string;
  platform_label: string;
  account_key: string;
  external_account_id: string | null;
  account_name: string | null;
  creator_url: string | null;
  dashboard_url: string | null;
  status: string;
  metadata_json: string | null;
  last_seen_at: string | null;
  last_crawled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatorPlatformSnapshotRow {
  id: string;
  connection_id: string | null;
  organization_id: string;
  user_id: string;
  brand_id: string;
  platform: string;
  platform_label: string;
  account_key: string;
  account_name: string | null;
  snapshot_kind: string;
  source: string;
  status: string;
  metric_date: string | null;
  summary_text: string | null;
  metrics_json: string;
  raw_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatorPlatformJobRow {
  id: string;
  organization_id: string;
  user_id: string;
  brand_id: string;
  bridge_session_public_id: string | null;
  requested_platforms_json: string | null;
  status: string;
  summary_text: string | null;
  result_json: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatorPlatformAccount {
  platform: string;
  platformLabel: string;
  accountKey: string;
  externalAccountId: string | null;
  accountName: string;
  creatorUrl: string | null;
  dashboardUrl: string | null;
  homepage: string | null;
  metadata: Record<string, unknown>;
}

export type AgentRunStatus = 'completed' | 'needs_action' | 'failed';
export type AgentStepStatus = 'completed' | 'needs_action' | 'failed';
export type AgentToolCallStatus = 'success' | 'blocked' | 'error';

export interface AgentRunStep {
  id: string;
  title: string;
  detail: string;
  status: AgentStepStatus;
}

export interface AgentToolCall {
  id: string;
  name: string;
  status: AgentToolCallStatus;
  summary: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

export interface AgentActionLink {
  id: string;
  label: string;
  href: string;
  description: string;
  platform?: string;
}

export interface AgentConfirmationRequest {
  id: string;
  title: string;
  description: string;
  confirmLabel: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AgentRunPayload {
  id: string;
  scene: 'media_publish' | 'miaoshe';
  status: AgentRunStatus;
  summary: string;
  steps: AgentRunStep[];
  toolCalls: AgentToolCall[];
  actions: AgentActionLink[];
}

type MediaPlatformTarget = {
  id: string;
  name: string;
  patterns: string[];
};

type MiaosheWorkflowRoute =
  | 'chat'
  | 'article_draft'
  | 'image_generate'
  | 'video_storyboard'
  | 'video_generate'
  | 'media_edit'
  | 'media_publish'
  | 'platform_data'
  | 'status_check'
  | 'login_help'
  | 'integration_help';

type MiaosheRouteDecision = {
  route: MiaosheWorkflowRoute;
  mode: 'chat' | 'agent';
  assetType: 'none' | 'image' | 'video';
  shouldRunWorkflow: boolean;
  visibleReplyType:
    | 'answer'
    | 'artifact'
    | 'run_status'
    | 'confirmation_or_result'
    | 'clarification_or_artifact';
  confidence: number;
  reason: string;
  needsClarification: boolean;
  clarificationQuestions: string[];
  targetPlatformIds: string[];
  requiresConfirmation: boolean;
  source: 'fallback' | 'ai';
};

type MiaosheArticleArtifactResult = {
  title: string;
  markdown: string;
  format: 'markdown';
};

type MiaosheMediaArtifactResult = {
  id: string;
  type: 'media_generation';
  kind: 'image' | 'video';
  intent: string;
  title: string;
  summary: string;
  prompt: string;
  taskId?: string;
  generationStatus?: string;
  error?: string;
  aspectRatio?: string;
  duration?: string;
  style?: string;
  videoModel?: string;
  imageCount?: number;
  needsClarification?: boolean;
  confirmationRequired?: boolean;
  clarificationQuestions?: string[];
  storyboard?: Array<{
    shot?: string;
    duration?: string;
    visual?: string;
    camera?: string;
    subtitle?: string;
    voiceover?: string;
  }>;
  images: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
    storage?: string;
    createdAt?: number;
  }>;
  videos?: Array<{
    url?: string;
  }>;
};

const MIAOSHE_MAX_BATCH_IMAGE_COUNT = 6;
const MIAOSHE_MAX_REFERENCE_VIDEO_IMAGE_COUNT = 9;

type MiaosheChatInput = {
  message?: string;
  mode?: 'chat' | 'agent';
  history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
  workspaceContext?: string;
  locale?: string;
  threadId?: string;
  clientMessageId?: string;
  displayMessage?: string;
  executeConfirmed?: boolean;
  latestArticleArtifact?: {
    title?: string;
    markdown?: string;
    format?: string;
  };
  uploadedAttachments?: Array<{
    url?: string;
    thumbnailUrl?: string;
    title?: string;
    mimeType?: string;
    type?: 'image' | 'file';
  }>;
};

type MiaosheConversationTitleInput = {
  mode?: 'chat' | 'agent';
  history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
  workspaceContext?: string;
  locale?: string;
  latestArticleArtifact?: {
    title?: string;
    markdown?: string;
    format?: string;
  };
};

type PreparedMiaosheChatRequest = {
  brand: BrandRow;
  domains: BrandDomainRow[];
  message: string;
  mode: 'chat' | 'agent';
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  threadId: string;
  workspaceContext: string;
  executeConfirmed: boolean;
  latestArticleArtifact: {
    title: string;
    markdown: string;
    format: string;
  } | null;
  uploadedAttachments: Array<{
    url: string;
    thumbnailUrl: string;
    title: string;
    mimeType: string;
    type: 'image' | 'file';
  }>;
  clientMessageId: string;
  displayMessage: string;
};

@Injectable()
export class ContentStudioService {
  private readonly logger = new Logger(ContentStudioService.name);
  private publicImageUsageTableEnsured?: Promise<void>;

  constructor(
    private readonly mysqlService: MysqlService,
    private readonly organizationStore: OrganizationStoreService,
    private readonly configService: ConfigService,
    private readonly codexExecutorService: CodexExecutorService,
  ) {}

  async generatePublicImage(input: {
    id?: string;
    accountId?: string;
    userId?: string;
    prompt?: string;
    size?: string;
    ip?: string;
  }) {
    const accountId = this.normalizePublicImageAccountId(input);
    const prompt = this.normalizePublicImagePrompt(input.prompt);
    const size = this.normalizePublicImageSize(input.size);
    const config = this.getMiaosheImageConfig();
    const quota = await this.consumePublicImageQuota(accountId);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.getMiaosheRequestTimeoutMs('agent', 180_000),
    );

    try {
      const payloadResult = await this.requestSingleMiaosheImagePayload({
        config,
        prompt,
        size,
        requestedCount: 1,
        useImageEdit: false,
        referenceImages: [],
        signal: controller.signal,
      });

      if (!payloadResult.ok) {
        throw new BadGatewayException(
          payloadResult.payload?.error?.message ||
            payloadResult.payload?.message ||
            '图片生成失败，请稍后重试。',
        );
      }

      const responseItems = Array.isArray(payloadResult.payload?.data)
        ? payloadResult.payload.data
        : [];
      if (responseItems.length === 0) {
        throw new BadGatewayException('图片生成接口没有返回可用图片。');
      }

      return {
        id: `public-image-${Date.now()}`,
        object: 'image.generation',
        created: Math.floor(Date.now() / 1000),
        model: config.model,
        size,
        quota,
        data: responseItems.slice(0, 1).map((item) => ({
          url: item.url || undefined,
          b64Json: item.b64_json || item.b64Json || undefined,
          revisedPrompt: item.revised_prompt || item.revisedPrompt || undefined,
          mimeType: item.mime_type || item.mimeType || 'image/png',
        })),
      };
    } catch (error) {
      await this.refundPublicImageQuota(accountId);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listDrafts(userId: string, brandId: string) {
    await this.assertBrandAccess(brandId, userId);
    const rows = await this.mysqlService.query<DraftRow[]>(
      `SELECT * FROM monitor_content_drafts
       WHERE brand_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [brandId],
    );

    return {
      drafts: rows.map((row) => this.mapDraft(row)),
    };
  }

  async createDraft(
    userId: string,
    brandId: string,
    input: { title?: string; content?: string },
  ) {
    await this.assertBrandAccess(brandId, userId);
    const now = this.nowSql();
    const id = randomUUID();
    const title = this.normalizeTitle(input.title);
    const content = this.normalizeContent(input.content);

    await this.mysqlService.query(
      `INSERT INTO monitor_content_drafts (id, brand_id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, brandId, title, content, now, now],
    );

    const row = await this.findDraftRow(id);
    return { draft: this.mapDraft(row) };
  }

  async getDraft(userId: string, draftId: string) {
    const row = await this.findDraftRow(draftId);
    await this.assertBrandAccess(row.brand_id, userId);

    const messageRows = await this.mysqlService.query<MessageRow[]>(
      `SELECT * FROM monitor_content_messages
       WHERE draft_id = ?
       ORDER BY created_at ASC`,
      [draftId],
    );

    return {
      draft: this.mapDraft(row),
      messages: messageRows.map((message) => this.mapMessage(message)),
    };
  }

  async getContentWebhookConfig(userId: string, brandId: string) {
    await this.assertBrandAccess(brandId, userId);
    const row = await this.findContentWebhookConfigRowByBrandId(brandId);
    return { config: row ? this.mapContentWebhookConfig(row) : null };
  }

  async saveContentWebhookConfig(
    userId: string,
    brandId: string,
    input: { webhookUrl?: string; webhookSecret?: string; isActive?: boolean },
  ) {
    await this.assertBrandAccess(brandId, userId);
    const webhookUrl = String(input.webhookUrl || '').trim();
    if (!webhookUrl) {
      throw new BadRequestException('Webhook URL is required');
    }

    const now = this.nowSql();
    const existing = await this.findContentWebhookConfigRowByBrandId(brandId);
    if (existing) {
      await this.mysqlService.query(
        `UPDATE monitor_content_webhook_configs
         SET webhook_url = ?, webhook_secret = ?, is_active = ?, updated_at = ?
         WHERE id = ?`,
        [
          webhookUrl,
          this.nullableTrim(input.webhookSecret),
          input.isActive === false ? 0 : 1,
          now,
          existing.id,
        ],
      );
    } else {
      await this.mysqlService.query(
        `INSERT INTO monitor_content_webhook_configs (
          id, brand_id, name, webhook_url, webhook_secret, events_json, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          brandId,
          'Default',
          webhookUrl,
          this.nullableTrim(input.webhookSecret),
          JSON.stringify([]),
          input.isActive === false ? 0 : 1,
          now,
          now,
        ],
      );
    }

    const row = await this.findContentWebhookConfigRowByBrandId(brandId);
    return { config: row ? this.mapContentWebhookConfig(row) : null };
  }

  async updateDraft(
    userId: string,
    draftId: string,
    input: { title?: string; content?: string },
  ) {
    const existing = await this.findDraftRow(draftId);
    await this.assertBrandAccess(existing.brand_id, userId);

    const title =
      input.title === undefined ? existing.title : this.normalizeTitle(input.title);
    const content =
      input.content === undefined ? existing.content : this.normalizeContent(input.content);

    await this.mysqlService.query(
      `UPDATE monitor_content_drafts
       SET title = ?, content = ?, updated_at = ?
       WHERE id = ?`,
      [title, content, this.nowSql(), draftId],
    );

    const row = await this.findDraftRow(draftId);
    return { draft: this.mapDraft(row) };
  }

  async deleteDraft(userId: string, draftId: string) {
    const row = await this.findDraftRow(draftId);
    await this.assertBrandAccess(row.brand_id, userId);
    await this.mysqlService.query(`DELETE FROM monitor_content_drafts WHERE id = ?`, [draftId]);
    return { success: true };
  }

  async clearMessages(userId: string, draftId: string) {
    const row = await this.findDraftRow(draftId);
    await this.assertBrandAccess(row.brand_id, userId);
    await this.mysqlService.query(`DELETE FROM monitor_content_messages WHERE draft_id = ?`, [draftId]);
    return { success: true };
  }

  async chat(
    userId: string,
    draftId: string,
    input: {
      message?: string;
      customContext?: string;
      title?: string;
      content?: string;
    },
  ) {
    const draftRow = await this.findDraftRow(draftId);
    const brand = await this.assertBrandAccess(draftRow.brand_id, userId);
    const domains = await this.findBrandDomains(brand.id);
    await this.assertConversationMessageQuota(brand.organization_id, 1);

    const message = (input.message || '').trim();
    if (!message) {
      throw new BadRequestException('消息不能为空');
    }

    const title = input.title === undefined ? draftRow.title : this.normalizeTitle(input.title);
    const content = input.content === undefined ? draftRow.content : this.normalizeContent(input.content);
    if (title !== draftRow.title || content !== draftRow.content) {
      await this.mysqlService.query(
        `UPDATE monitor_content_drafts
         SET title = ?, content = ?, updated_at = ?
         WHERE id = ?`,
        [title, content, this.nowSql(), draftId],
      );
    }

    const now = this.nowSql();
    const userMessageId = randomUUID();
    await this.mysqlService.query(
      `INSERT INTO monitor_content_messages (id, draft_id, brand_id, role, content, created_at, updated_at)
       VALUES (?, ?, ?, 'user', ?, ?, ?)`,
      [userMessageId, draftId, brand.id, message, now, now],
    );

    const historyRows = await this.mysqlService.query<MessageRow[]>(
      `SELECT * FROM monitor_content_messages
       WHERE draft_id = ?
       ORDER BY created_at ASC`,
      [draftId],
    );
    const recentHistory = historyRows.slice(-12);
    const assistantText = await this.requestAssistant({
      brand,
      domains,
      draftTitle: title,
      draftContent: content,
      customContext: (input.customContext || '').trim(),
      history: recentHistory.map((item) => ({
        role: item.role,
        content: item.content,
      })),
    });

    const assistantNow = this.nowSql();
    const assistantId = randomUUID();
    await this.mysqlService.query(
      `INSERT INTO monitor_content_messages (id, draft_id, brand_id, role, content, created_at, updated_at)
       VALUES (?, ?, ?, 'assistant', ?, ?, ?)`,
      [assistantId, draftId, brand.id, assistantText, assistantNow, assistantNow],
    );

    const messageRows = await this.mysqlService.query<MessageRow[]>(
      `SELECT * FROM monitor_content_messages
       WHERE draft_id = ?
       ORDER BY created_at ASC`,
      [draftId],
    );

    return {
      assistantMessage: {
        id: assistantId,
        role: 'assistant' as const,
        content: assistantText,
        timestamp: Date.parse(assistantNow.replace(' ', 'T') + 'Z'),
      },
      messages: messageRows.map((row) => this.mapMessage(row)),
    };
  }

  async chatWithMiaoshe(userId: string, brandId: string, input: MiaosheChatInput) {
    const request = await this.prepareMiaosheChatRequest(userId, brandId, input);

    const miaosheResult = await this.requestMiaosheConversationWithSkills({
      userId,
      brand: request.brand,
      domains: request.domains,
      mode: request.mode,
      workspaceContext: request.workspaceContext,
      history: [
        ...request.history,
        {
          role: 'user',
          content: request.message,
        },
      ],
      message: request.message,
      threadId: request.threadId || null,
      executeConfirmed: request.executeConfirmed,
      latestArticleArtifact: request.latestArticleArtifact,
      uploadedAttachments: request.uploadedAttachments,
    });

    const resolved = this.extractExplicitMiaosheArticleArtifact(miaosheResult.content);
    const assistantContent = this.ensureMiaosheAssistantContent({
      content: resolved.content,
      confirmationRequest: miaosheResult.confirmationRequest || null,
      agentRun: miaosheResult.agentRun || null,
      articleArtifact:
        request.mode === 'agent'
          ? miaosheResult.articleArtifact || resolved.articleArtifact
          : null,
      mediaArtifact: miaosheResult.mediaArtifact || null,
    });

    return {
      assistantMessage: {
        id: randomUUID(),
        role: 'assistant' as const,
        content: assistantContent,
        timestamp: Date.now(),
        articleArtifact: request.mode === 'agent' ? miaosheResult.articleArtifact || resolved.articleArtifact : null,
        agentRun: miaosheResult.agentRun || null,
        confirmationRequest: miaosheResult.confirmationRequest || null,
        mediaArtifact: miaosheResult.mediaArtifact || null,
      },
      threadId: request.threadId || null,
      usage: null,
    };
  }

  async summarizeMiaosheConversationTitle(
    userId: string,
    brandId: string,
    input: MiaosheConversationTitleInput,
  ) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const domains = await this.findBrandDomains(brand.id);
    const mode = input.mode === 'agent' ? 'agent' : 'chat';
    const workspaceContext = String(input.workspaceContext || '').trim();
    const rawHistory: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(
      input.history,
    )
      ? input.history
          .map((item) => ({
            role: item?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: String(item?.content || '').trim(),
          }))
          .filter((item) => item.content)
      : [];
    const latestArticleArtifact = this.normalizeMiaosheArticleArtifact(input.latestArticleArtifact);

    if (latestArticleArtifact?.title) {
      rawHistory.push({
        role: 'assistant',
        content: `当前产出标题：${latestArticleArtifact.title}`,
      });
    }

    const history = this.pruneMiaosheHistoryByTokenBudget(rawHistory, 1_200);
    if (history.length === 0) {
      throw new BadRequestException('缺少可用于生成标题的会话内容');
    }

    const config = await this.buildMiaosheAssistantConfig({
      userId,
      brand,
      domains,
      mode,
      workspaceContext,
      history,
    });
    const titleResponse = await this.requestMiaosheText({
      systemPrompt: [
        '你是妙设AIO的会话标题生成助手。',
        '请根据下面这段对话，生成一个简短、自然、准确的中文会话标题。',
        '要求：',
        '1. 聚焦本次会话的核心任务或主题，忽略寒暄和客套话。',
        '2. 长度控制在 6 到 16 个汉字或等价短语。',
        '3. 不要输出引号、句号、冒号、编号、emoji。',
        '4. 不要使用“新对话”“聊天记录”“未命名”等空泛标题。',
        '5. 只返回标题本身，不要解释。',
      ].join('\n'),
      brandContext: config.brandContext,
      history,
      protocol: config.protocol,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      temperature: 0.2,
      maxTokens: 48,
      timeoutMs: Math.min(this.getMiaosheRequestTimeoutMs(mode), 45_000),
    });

    return {
      title: this.normalizeMiaosheConversationTitle(
        titleResponse,
        history,
        latestArticleArtifact?.title || '',
      ),
    };
  }

  async streamChatWithMiaoshe(
    userId: string,
    brandId: string,
    input: MiaosheChatInput,
    response: Response,
  ) {
    response.socket?.setNoDelay?.(true);
    response.socket?.setKeepAlive?.(true, 15_000);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    this.writeMiaosheKeepAlive(response);

    const keepAliveTimer = setInterval(() => this.writeMiaosheKeepAlive(response), 15_000);

    try {
      const request = await this.prepareMiaosheChatRequest(userId, brandId, input);
      const assistantMessageId = randomUUID();

      await this.streamMiaosheConversationWithSkills(response, {
        userId,
        brand: request.brand,
        domains: request.domains,
        mode: request.mode,
        workspaceContext: request.workspaceContext,
        history: [
          ...request.history,
          {
            role: 'user',
            content: request.message,
          },
        ],
        message: request.message,
        threadId: request.threadId || null,
        executeConfirmed: request.executeConfirmed,
        latestArticleArtifact: request.latestArticleArtifact,
        uploadedAttachments: request.uploadedAttachments,
        assistantMessageId,
      });
      return;
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'miaoshechat stream failed');
      this.writeMiaosheStreamEvent(response, 'error', {
        message: error instanceof Error ? error.message : 'miaoshechat 暂时没能响应，请稍后重试。',
      });
    } finally {
      clearInterval(keepAliveTimer);
      response.end();
    }
  }

  private writeMiaosheStreamEvent(response: Response, event: string, data: unknown) {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
    (response as Response & { flush?: () => void }).flush?.();
  }

  private writeMiaosheKeepAlive(response: Response) {
    response.write(`: keepalive ${Date.now()}\n\n`);
    (response as Response & { flush?: () => void }).flush?.();
  }

  private async streamMiaoshePlainTextResponse(
    response: Response,
    input: {
      content: string;
      mode: 'chat' | 'agent';
      threadId: string | null;
    },
  ) {
    const resolved = this.extractExplicitMiaosheArticleArtifact(input.content);
    const content = this.ensureMiaosheAssistantContent({
      content: resolved.content,
      confirmationRequest: null,
      agentRun: null,
      articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
      mediaArtifact: null,
    });
    let streamedContent = '';
    for (const delta of this.splitMiaosheStreamChunks(content)) {
      streamedContent += delta;
      this.writeMiaosheStreamEvent(response, 'message_delta', {
        delta,
        content: streamedContent,
        threadId: input.threadId,
      });
      await this.sleep(this.getMiaosheStreamChunkDelay(delta));
    }

    this.writeMiaosheStreamEvent(response, 'status', {
      phase: 'completed',
      source: 'miaoshechat',
      label: 'miaoshechat 已完成',
      detail: '回复已经返回。',
      threadId: input.threadId,
    });
    this.writeMiaosheStreamEvent(response, 'done', {
      threadId: input.threadId,
      usage: null,
      assistantMessage: {
        id: randomUUID(),
        role: 'assistant',
        content,
        timestamp: Date.now(),
        articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
        agentRun: null,
        confirmationRequest: null,
      },
    });
  }

  private async streamMiaosheAssistantResponse(
    response: Response,
    input: {
      userId: string;
      brand: BrandRow;
      domains: BrandDomainRow[];
      mode: 'chat' | 'agent';
      workspaceContext: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      threadId: string | null;
      message: string;
    },
  ) {
    const config = await this.buildMiaosheAssistantConfig(input);
    const maxTokens = this.getMiaosheMaxOutputTokens(input.mode);
    const history = this.fitMiaosheHistoryWithinContext({
      history: input.history,
      mode: input.mode,
      reservedOutputTokens: maxTokens,
      contextParts: [config.systemPrompt, config.brandContext],
    });
    if (config.protocol !== 'openai') {
      const assistantText = await this.requestMiaosheText({
        systemPrompt: config.systemPrompt,
        brandContext: config.brandContext,
        history,
        protocol: config.protocol,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        temperature: 0.7,
        maxTokens,
        timeoutMs: this.getMiaosheRequestTimeoutMs(input.mode),
      });
      await this.streamMiaoshePlainTextResponse(response, {
        content: assistantText,
        mode: input.mode,
        threadId: input.threadId,
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.getMiaosheRequestTimeoutMs(input.mode),
    );

    try {
      const providerResponse = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.7,
          max_tokens: maxTokens,
          stream: true,
          messages: [
            {
              role: 'system',
              content: `${config.systemPrompt}\n\n${config.brandContext}`,
            },
            ...history,
          ],
        }),
        signal: controller.signal,
      });

      if (!providerResponse.ok) {
        const payload = await providerResponse.json().catch(() => ({}));
        throw new BadGatewayException(
          payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
        );
      }

      if (!providerResponse.body) {
        throw new BadGatewayException('MiaoSheChat 流式返回为空，请稍后重试');
      }

      const reader = providerResponse.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const frames = sseBuffer.split('\n\n');
        sseBuffer = frames.pop() ?? '';

        for (const frame of frames) {
          const dataLines = frame
            .split('\n')
            .filter((line) => line.trimStart().startsWith('data:'))
            .map((line) => line.replace(/^data:\s*/, '').trim())
            .filter(Boolean);
          if (!dataLines.length) {
            continue;
          }

          for (const data of dataLines) {
            if (data === '[DONE]') {
              continue;
            }

            const payload = this.safeJsonParse(data);
            const delta = this.extractMiaosheOpenAiStreamDelta(payload);
            if (!delta) {
              continue;
            }

            fullContent += delta;
            this.writeMiaosheStreamEvent(response, 'message_delta', {
              delta,
              content: fullContent,
              threadId: input.threadId,
            });
          }
        }
      }

      const resolved = this.extractExplicitMiaosheArticleArtifact(fullContent);
      const content = this.ensureMiaosheAssistantContent({
        content: resolved.content,
        confirmationRequest: null,
        agentRun: null,
        articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
        mediaArtifact: null,
      });

      this.writeMiaosheStreamEvent(response, 'status', {
        phase: 'completed',
        source: 'miaoshechat',
        label: 'miaoshechat 已完成',
        detail: '回复已经返回。',
        threadId: input.threadId,
      });
      this.writeMiaosheStreamEvent(response, 'done', {
        threadId: input.threadId,
        usage: null,
        assistantMessage: {
          id: randomUUID(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
          articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
          agentRun: null,
          confirmationRequest: null,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async buildMiaosheAssistantConfig(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<{
    apiKey: string;
    model: string;
    baseUrl: string;
    protocol: 'openai' | 'anthropic';
    systemPrompt: string;
    brandContext: string;
  }> {
    const apiKey =
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      this.configService.get<string>('VECTORENGINE_API_KEY');
    if (!apiKey) {
      throw new BadGatewayException('MiaoSheChat 模型未配置，请先配置 API Key');
    }

    const agentApiKey =
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      apiKey;
    const useAgentModel = input.mode === 'agent' && Boolean(agentApiKey);
    const model = useAgentModel
      ? this.configService.get<string>('MIAOSHE_AGENT_MODEL') ||
        this.configService.get<string>('CODEX_EXECUTOR_MODEL') ||
        'gpt-5.3-codex'
      : this.configService.get<string>('MIAOSHE_CHAT_MODEL') || 'claude-sonnet-4-6';
    const baseUrl = this.normalizeBaseUrl(
      useAgentModel
        ? this.configService.get<string>('OPENAI_BASE_URL') ||
            this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
            this.configService.get<string>('VECTORENGINE_BASE_URL') ||
            'https://api.vectorengine.ai/v1'
        : this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
            this.configService.get<string>('VECTORENGINE_BASE_URL') ||
            'https://api.vectorengine.ai/v1',
    );
    const protocol = useAgentModel
      ? 'openai'
      : this.normalizeChatProtocol(
          this.configService.get<string>('MIAOSHE_CHAT_PROTOCOL') || 'openai',
        );

    const systemPrompt =
      input.mode === 'agent'
        ? '你是妙设AIO中的 MiaoShe Agent。你要像一位擅长内容运营、渠道分发和任务推进的中文营销操盘手一样工作。回答要直接、可执行、带步骤，优先给出接下来该做什么。'
        : '你是妙设AIO中的 MiaoShe Chat。你是中文营销与内容运营助手，要像一个可靠、专业、节奏感很强的搭档一样回答。优先给出清晰建议、内容思路、执行方案和下一步动作。';
    const brandContext = await this.buildMiaosheBrandContext(
      input.brand,
      input.domains,
      input.workspaceContext,
    );

    return {
      apiKey: useAgentModel ? agentApiKey : apiKey,
      model,
      baseUrl,
      protocol,
      systemPrompt,
      brandContext,
    };
  }

  private async requestMiaosheConversationWithSkills(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
    threadId: string | null;
    executeConfirmed: boolean;
    latestArticleArtifact: {
      title: string;
      markdown: string;
      format: string;
    } | null;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
    onStatus?: (status: { label: string; detail: string }) => Promise<void> | void;
  }): Promise<{
    content: string;
    confirmationRequest: AgentConfirmationRequest | null;
    agentRun: AgentRunPayload | null;
    articleArtifact: MiaosheArticleArtifactResult | null;
    mediaArtifact: MiaosheMediaArtifactResult | null;
  }> {
    const executeConfirmed =
      input.executeConfirmed ||
      this.isMiaosheNaturalMediaExecutionConfirmation(input.message, input.history);

    if (executeConfirmed) {
      const workflowResult = await this.tryHandleMiaosheWorkflow({
        ...input,
        executeConfirmed: true,
        explicitWorkflowIntent: null,
      });
      if (workflowResult) {
        return workflowResult;
      }
    }

    const config = await this.buildMiaosheAssistantConfig(input);
    const conversationInput = {
      ...input,
      ...config,
    };

    const conversationResult =
      config.protocol === 'anthropic'
        ? await this.requestMiaosheAnthropicConversationWithSkills(conversationInput)
        : await this.requestMiaosheOpenAiConversationWithSkills(conversationInput);

    const workflowTrigger = this.resolveMiaosheWorkflowTriggerFromAssistant({
      assistantContent: conversationResult.content,
      message: input.message,
      history: input.history,
    });
    const resolvedConversation = this.extractExplicitMiaosheArticleArtifact(workflowTrigger.content);

    if (workflowTrigger.trigger && !executeConfirmed) {
      const workflowResult = await this.tryHandleMiaosheWorkflow({
        ...input,
        explicitWorkflowIntent: workflowTrigger.trigger.intent,
      });
      if (workflowResult) {
        return workflowResult;
      }
    }

    return {
      ...conversationResult,
      content: resolvedConversation.content,
      articleArtifact:
        input.mode === 'agent'
          ? conversationResult.articleArtifact || resolvedConversation.articleArtifact
          : null,
    };
  }

  private async streamMiaosheConversationWithSkills(
    response: Response,
    input: {
      userId: string;
      brand: BrandRow;
      domains: BrandDomainRow[];
      mode: 'chat' | 'agent';
      workspaceContext: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      message: string;
      threadId: string | null;
      executeConfirmed: boolean;
      latestArticleArtifact: {
        title: string;
        markdown: string;
        format: string;
      } | null;
      uploadedAttachments: Array<{
        url: string;
        thumbnailUrl: string;
        title: string;
        mimeType: string;
        type: 'image' | 'file';
      }>;
      assistantMessageId: string;
    },
  ) {
    const executeConfirmed =
      input.executeConfirmed ||
      this.isMiaosheNaturalMediaExecutionConfirmation(input.message, input.history);
    const config = await this.buildMiaosheAssistantConfig(input);

    if (!executeConfirmed && config.protocol === 'openai') {
      await this.streamMiaosheOpenAiConversationWithSkills(response, {
        ...input,
        executeConfirmed,
        ...config,
      });
      return;
    }

    const result = await this.requestMiaosheConversationWithSkills({
      ...input,
      executeConfirmed,
      onStatus: async (status) => {
        this.writeMiaosheStreamEvent(response, 'status', {
          phase: 'thinking',
          source: 'miaoshechat',
          label: status.label,
          detail: status.detail,
          threadId: input.threadId,
        });
      },
    });

    await this.streamMiaosheConversationResult(response, {
      assistantMessageId: input.assistantMessageId,
      message: input.message,
      mode: input.mode,
      threadId: input.threadId,
      result,
    });
  }

  private async tryHandleMiaosheWorkflow(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
    threadId: string | null;
    executeConfirmed: boolean;
    latestArticleArtifact: {
      title: string;
      markdown: string;
      format: string;
    } | null;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
    explicitWorkflowIntent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate' | null;
    onStatus?: (status: { label: string; detail: string }) => Promise<void> | void;
    onMediaArtifactProgress?: (artifact: MiaosheMediaArtifactResult) => Promise<void> | void;
  }): Promise<{
    content: string;
    confirmationRequest: AgentConfirmationRequest | null;
    agentRun: AgentRunPayload | null;
    articleArtifact: MiaosheArticleArtifactResult | null;
    mediaArtifact: MiaosheMediaArtifactResult | null;
  } | null> {
    const { decision, codexResult } = input.explicitWorkflowIntent
      ? await this.resolveExplicitMiaosheWorkflow({
          brand: input.brand,
          domains: input.domains,
          mode: input.mode,
          message: input.message,
          history: input.history,
          workspaceContext: input.workspaceContext,
          intent: input.explicitWorkflowIntent,
        })
      : await this.resolveMiaosheRouterDecision({
          brand: input.brand,
          domains: input.domains,
          mode: input.mode,
          message: input.message,
          history: input.history,
          workspaceContext: input.workspaceContext,
        });

    if (
      decision.route !== 'image_generate' &&
      decision.route !== 'media_edit' &&
      decision.route !== 'video_storyboard' &&
      decision.route !== 'video_generate'
    ) {
      return null;
    }

    if (decision.needsClarification) {
      // Let the chat model ask follow-up questions naturally first.
      // Once the user provides enough detail, later turns will re-enter the workflow.
      return null;
    }

    await input.onStatus?.(this.buildMiaosheThinkingStatus(decision));

    const workflowResult = await this.runMediaPublishAgent({
      userId: input.userId,
      brand: input.brand,
      domains: input.domains,
      workspaceContext: input.workspaceContext,
      history: input.history,
      message: input.message,
      mode: input.mode,
      routerDecision: decision,
      codexResult,
      requireConfirmation: decision.requiresConfirmation,
      executeConfirmed: input.executeConfirmed,
      threadId: input.threadId,
      uploadedAttachments: input.uploadedAttachments,
      onStatus: input.onStatus,
      onMediaArtifactProgress: input.onMediaArtifactProgress,
    });

    if (!workflowResult) {
      return null;
    }

    return {
      content: workflowResult.assistantText,
      confirmationRequest: workflowResult.confirmationRequest || null,
      agentRun: workflowResult.run,
      articleArtifact: workflowResult.articleArtifact || null,
      mediaArtifact:
        workflowResult.mediaArtifact && !workflowResult.mediaArtifact.needsClarification
          ? workflowResult.mediaArtifact
          : null,
    };
  }

  private async resolveExplicitMiaosheWorkflow(input: {
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    workspaceContext: string;
    intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate';
  }) {
    const assetType: 'image' | 'video' =
      input.intent === 'video_storyboard' || input.intent === 'video_generate'
        ? 'video'
        : /(视频|短视频|片子|动画|分镜|图生视频|文生视频)/i.test(input.message)
          ? 'video'
          : 'image';
    return {
      decision: {
        route: input.intent,
        mode: input.mode,
        assetType,
        shouldRunWorkflow: true,
        visibleReplyType: 'clarification_or_artifact' as const,
        confidence: 0.98,
        reason: assetType === 'video' ? 'AI 主会话已明确触发视频技能。' : 'AI 主会话已明确触发图片技能。',
        needsClarification: false,
        clarificationQuestions: [],
        targetPlatformIds: [],
        requiresConfirmation: true,
        source: 'ai' as const,
      },
      codexResult: null,
    };
  }

  private async streamMiaosheConversationResult(
    response: Response,
    input: {
      assistantMessageId: string;
      message: string;
      mode: 'chat' | 'agent';
      threadId: string | null;
      result: {
        content: string;
        confirmationRequest: AgentConfirmationRequest | null;
        agentRun: AgentRunPayload | null;
        articleArtifact: MiaosheArticleArtifactResult | null;
        mediaArtifact: MiaosheMediaArtifactResult | null;
      };
    },
  ) {
    const resolved = this.extractExplicitMiaosheArticleArtifact(input.result.content);
    const content = this.ensureMiaosheAssistantContent({
      content: resolved.content,
      confirmationRequest: input.result.confirmationRequest || null,
      agentRun: input.result.agentRun || null,
      articleArtifact:
        input.mode === 'agent'
          ? input.result.articleArtifact || resolved.articleArtifact
          : null,
      mediaArtifact: input.result.mediaArtifact || null,
    });
    let streamedContent = '';
    for (const delta of this.splitMiaosheStreamChunks(content)) {
      streamedContent += delta;
      this.writeMiaosheStreamEvent(response, 'message_delta', {
        delta,
        content: streamedContent,
        threadId: input.threadId,
      });
      await this.sleep(this.getMiaosheStreamChunkDelay(delta));
    }

    this.writeMiaosheStreamEvent(response, 'status', {
      phase: 'completed',
      source: 'miaoshechat',
      label: 'miaoshechat 已完成',
      detail: input.result.confirmationRequest ? '等待确认执行。' : '回复已经返回。',
      threadId: input.threadId,
    });
    this.writeMiaosheStreamEvent(response, 'done', {
      threadId: input.threadId,
      usage: null,
      assistantMessage: {
        id: input.assistantMessageId,
        role: 'assistant',
        content,
        timestamp: Date.now(),
        articleArtifact:
          input.mode === 'agent'
            ? input.result.articleArtifact || resolved.articleArtifact
            : null,
        agentRun: input.result.agentRun || null,
        confirmationRequest: input.result.confirmationRequest || null,
        mediaArtifact: input.result.mediaArtifact || null,
      },
    });
  }

  private async streamMiaosheOpenAiConversationWithSkills(
    response: Response,
    input: {
      userId: string;
      brand: BrandRow;
      domains: BrandDomainRow[];
      mode: 'chat' | 'agent';
      workspaceContext: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      message: string;
      threadId: string | null;
      executeConfirmed: boolean;
      latestArticleArtifact: {
        title: string;
        markdown: string;
        format: string;
      } | null;
      uploadedAttachments: Array<{
        url: string;
        thumbnailUrl: string;
        title: string;
        mimeType: string;
        type: 'image' | 'file';
      }>;
      assistantMessageId: string;
      apiKey: string;
      model: string;
      baseUrl: string;
      systemPrompt: string;
      brandContext: string;
    },
  ) {
    const controller = new AbortController();
    const maxTokens = this.getMiaosheMaxOutputTokens(input.mode);
    const timeout = setTimeout(
      () => controller.abort(),
      this.getMiaosheRequestTimeoutMs(input.mode, 600_000),
    );
    const latestArticleContext = this.buildMiaosheLatestArticleContext(input.latestArticleArtifact);
    const history = this.fitMiaosheHistoryWithinContext({
      history: input.history,
      mode: input.mode,
      reservedOutputTokens: maxTokens,
      contextParts: [
        input.systemPrompt,
        input.brandContext,
        this.buildMiaosheConversationSkillPrompt(),
        latestArticleContext,
      ],
    });
    const historyMessages = await this.buildMiaosheOpenAiHistoryMessages({
      brandId: input.brand.id,
      history,
      currentMessage: input.message,
      uploadedAttachments: input.uploadedAttachments,
    });
    const messages: Array<Record<string, unknown>> = [
      {
        role: 'system',
        content: `${input.systemPrompt}\n\n${input.brandContext}\n\n${this.buildMiaosheConversationSkillPrompt()}`,
      },
      ...(latestArticleContext
        ? [
            {
              role: 'system',
              content: latestArticleContext,
            },
          ]
        : []),
      ...historyMessages,
    ];
    const run = this.createEmptyMiaosheAgentRun();
    let fullContent = '';
    let visibleContent = '';

    try {
      for (let iteration = 0; iteration < 4; iteration += 1) {
        const providerResponse = await fetch(`${input.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model: input.model,
            temperature: 0.7,
            max_tokens: maxTokens,
            stream: true,
            messages,
            tools: this.buildOpenAiMiaosheConversationTools(),
            tool_choice: 'auto',
          }),
          signal: controller.signal,
        });

        if (!providerResponse.ok) {
          const payload = await providerResponse.json().catch(() => ({}));
          throw new BadGatewayException(
            payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
          );
        }

        if (!providerResponse.body) {
          throw new BadGatewayException('MiaoSheChat 流式返回为空，请稍后重试');
        }

        const reader = providerResponse.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let assistantTurnContent = '';
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          sseBuffer += decoder.decode(value, { stream: true });
          const frames = sseBuffer.split('\n\n');
          sseBuffer = frames.pop() ?? '';

          for (const frame of frames) {
            const dataLines = frame
              .split('\n')
              .filter((line) => line.trimStart().startsWith('data:'))
              .map((line) => line.replace(/^data:\s*/, '').trim())
              .filter(Boolean);
            if (!dataLines.length) {
              continue;
            }

            for (const data of dataLines) {
              if (data === '[DONE]') {
                continue;
              }

              const payload = this.safeJsonParse(data);
              const choice = payload?.choices?.[0];
              if (!choice) {
                continue;
              }

              const delta = String(choice?.delta?.content || '');
              if (delta) {
                assistantTurnContent += delta;
                fullContent += delta;
                const nextVisibleContent = this.extractMiaosheVisibleStreamContent(fullContent);
                const visibleDelta = this.removeOverlappingPrefix(visibleContent, nextVisibleContent);
                if (visibleDelta) {
                  visibleContent = nextVisibleContent;
                  this.writeMiaosheStreamEvent(response, 'message_delta', {
                    delta: visibleDelta,
                    content: visibleContent,
                    threadId: input.threadId,
                  });
                }
              }

              if (Array.isArray(choice?.delta?.tool_calls)) {
                this.mergeOpenAiStreamToolCalls(toolCalls, choice.delta.tool_calls);
              }
            }
          }
        }

        if (toolCalls.length === 0) {
          const workflowTrigger = this.resolveMiaosheWorkflowTriggerFromAssistant({
            assistantContent: fullContent,
            message: input.message,
            history: input.history,
          });
          const resolved = this.extractExplicitMiaosheArticleArtifact(workflowTrigger.content);
          const finalContent = resolved.content.trim();

          if (
            workflowTrigger.trigger &&
            !input.executeConfirmed &&
            this.shouldHonorMiaosheWorkflowTrigger({
              triggerIntent: workflowTrigger.trigger.intent,
              message: input.message,
              history: input.history,
            })
          ) {
            const workflowResult = await this.tryHandleMiaosheWorkflow({
              userId: input.userId,
              brand: input.brand,
              domains: input.domains,
              mode: input.mode,
              workspaceContext: input.workspaceContext,
              history: input.history,
              message: input.message,
              threadId: input.threadId,
              executeConfirmed: false,
              latestArticleArtifact: input.latestArticleArtifact,
              uploadedAttachments: input.uploadedAttachments,
              explicitWorkflowIntent: workflowTrigger.trigger.intent,
              onStatus: async (status) => {
                this.writeMiaosheStreamEvent(response, 'status', {
                  phase: 'thinking',
                  source: 'miaoshechat',
                  label: status.label,
                  detail: status.detail,
                  threadId: input.threadId,
                });
              },
              onMediaArtifactProgress: async (artifact) => {
                this.writeMiaosheStreamEvent(response, 'media_artifact', {
                  artifact,
                  threadId: input.threadId,
                });
              },
            });

            if (workflowResult) {
              if (workflowResult.mediaArtifact) {
                this.writeMiaosheStreamEvent(response, 'media_artifact', {
                  artifact: workflowResult.mediaArtifact,
                  threadId: input.threadId,
                });
              }
              this.writeMiaosheStreamEvent(response, 'status', {
                phase: 'completed',
                source: 'miaoshechat',
                label: 'miaoshechat 已完成',
                detail: workflowResult.confirmationRequest ? '等待确认执行。' : '回复已经返回。',
                threadId: input.threadId,
              });
              this.writeMiaosheStreamEvent(response, 'done', {
                threadId: input.threadId,
                usage: null,
                assistantMessage: {
                  id: input.assistantMessageId,
                  role: 'assistant',
                  content: workflowResult.content,
                  timestamp: Date.now(),
                  articleArtifact: input.mode === 'agent' ? workflowResult.articleArtifact : null,
                  agentRun: workflowResult.agentRun || null,
                  confirmationRequest: workflowResult.confirmationRequest || null,
                  mediaArtifact: workflowResult.mediaArtifact || null,
                },
              });
              return;
            }
          }

          const agentRun = run.toolCalls.length > 0 ? this.finalizeMiaosheAgentRun(run) : null;
          const content = this.ensureMiaosheAssistantContent({
            content: finalContent,
            confirmationRequest: null,
            agentRun,
            articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
            mediaArtifact: null,
          });
          this.writeMiaosheStreamEvent(response, 'status', {
            phase: 'completed',
            source: 'miaoshechat',
            label: 'miaoshechat 已完成',
            detail: '回复已经返回。',
            threadId: input.threadId,
          });
          this.writeMiaosheStreamEvent(response, 'done', {
            threadId: input.threadId,
            usage: null,
            assistantMessage: {
              id: input.assistantMessageId,
              role: 'assistant',
              content,
              timestamp: Date.now(),
              articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
              agentRun,
              confirmationRequest: null,
              mediaArtifact: null,
            },
          });
          return;
        }

        const normalizedToolCalls = toolCalls
          .map((toolCall) => ({
            id: toolCall.id || randomUUID(),
            type: 'function' as const,
            function: {
              name: String(toolCall.function?.name || '').trim(),
              arguments: String(toolCall.function?.arguments || ''),
            },
          }))
          .filter((toolCall) => toolCall.function.name);

        if (normalizedToolCalls.length === 0) {
          continue;
        }

        if (input.mode !== 'agent') {
          const toolNames = normalizedToolCalls.map((toolCall) => toolCall.function.name);
          const confirmationRequest = this.buildMiaosheSkillConfirmationRequest(
            toolNames,
            input.message,
            input.history,
          );
          const confirmationText = `这一步需要调用技能后才能继续。我已经识别出需要执行：${this.formatMiaosheSkillLabels(
            toolNames,
          )}。请切换到 Agent 模式并确认执行。`;
          const separator = fullContent.trim() ? '\n\n' : '';
          fullContent = `${fullContent}${separator}${confirmationText}`.trim();
          this.writeMiaosheStreamEvent(response, 'message_delta', {
            delta: `${separator}${confirmationText}`,
            content: fullContent,
            threadId: input.threadId,
          });
          this.writeMiaosheStreamEvent(response, 'status', {
            phase: 'completed',
            source: 'miaoshechat',
            label: 'miaoshechat 等待确认',
            detail: '检测到需要调用技能，请先切换到 Agent 模式。',
            threadId: input.threadId,
          });
          this.writeMiaosheStreamEvent(response, 'done', {
            threadId: input.threadId,
            usage: null,
            assistantMessage: {
              id: input.assistantMessageId,
              role: 'assistant',
              content: fullContent,
              timestamp: Date.now(),
              articleArtifact: null,
              agentRun: null,
              confirmationRequest,
              mediaArtifact: null,
            },
          });
          return;
        }

        messages.push({
          role: 'assistant',
          content: assistantTurnContent || '',
          tool_calls: normalizedToolCalls,
        });

        for (const toolCall of normalizedToolCalls) {
          const toolName = toolCall.function.name as MiaosheConversationToolName;
          this.writeMiaosheStreamEvent(response, 'status', {
            phase: 'thinking',
            source: 'miaoshechat',
            label: 'miaoshechat 正在执行',
            detail: `正在调用技能：${this.formatMiaosheSkillName(toolName)}`,
            threadId: input.threadId,
          });
          const toolResult = await this.executeMiaosheConversationTool({
            brand: input.brand,
            domains: input.domains,
            userId: input.userId,
            toolName,
            rawArguments: toolCall.function.arguments,
            message: input.message,
            latestArticleArtifact: input.latestArticleArtifact,
          });
          this.appendMiaosheToolExecutionToRun(
            run,
            toolName,
            toolCall.function.arguments,
            toolResult,
          );

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        this.writeMiaosheStreamEvent(response, 'status', {
          phase: 'thinking',
          source: 'miaoshechat',
          label: 'miaoshechat 正在思考',
          detail: '正在根据技能执行结果继续生成回复...',
          threadId: input.threadId,
        });
      }

      throw new BadGatewayException('MiaoSheChat 技能调用轮次超限，请稍后重试');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestMiaosheOpenAiConversationWithSkills(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
    executeConfirmed: boolean;
    latestArticleArtifact: {
      title: string;
      markdown: string;
      format: string;
    } | null;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
    apiKey: string;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    brandContext: string;
    onStatus?: (status: { label: string; detail: string }) => Promise<void> | void;
  }) {
    const controller = new AbortController();
    const maxTokens = this.getMiaosheMaxOutputTokens(input.mode);
    const timeout = setTimeout(
      () => controller.abort(),
      this.getMiaosheRequestTimeoutMs(input.mode, 600_000),
    );
    const latestArticleContext = this.buildMiaosheLatestArticleContext(input.latestArticleArtifact);
    const history = this.fitMiaosheHistoryWithinContext({
      history: input.history,
      mode: input.mode,
      reservedOutputTokens: maxTokens,
      contextParts: [
        input.systemPrompt,
        input.brandContext,
        this.buildMiaosheConversationSkillPrompt(),
        latestArticleContext,
      ],
    });
    const historyMessages = await this.buildMiaosheOpenAiHistoryMessages({
      brandId: input.brand.id,
      history,
      currentMessage: input.message,
      uploadedAttachments: input.uploadedAttachments,
    });
    const messages: Array<Record<string, unknown>> = [
      {
        role: 'system',
        content: `${input.systemPrompt}\n\n${input.brandContext}\n\n${this.buildMiaosheConversationSkillPrompt()}`,
      },
      ...(latestArticleContext
        ? [
            {
              role: 'system',
              content: latestArticleContext,
            },
          ]
        : []),
      ...historyMessages,
    ];
    const run = this.createEmptyMiaosheAgentRun();

    try {
      for (let iteration = 0; iteration < 4; iteration += 1) {
        const response = await fetch(`${input.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model: input.model,
            temperature: 0.7,
            max_tokens: maxTokens,
            messages,
            tools: this.buildOpenAiMiaosheConversationTools(),
            tool_choice: 'auto',
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        const message = payload?.choices?.[0]?.message;
        if (!response.ok || !message) {
          throw new BadGatewayException(
            payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
          );
        }

        const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
        const assistantContent = this.extractOpenAiMessageText(message);
        if (toolCalls.length === 0) {
          const resolved = this.extractExplicitMiaosheArticleArtifact(assistantContent);
          const workflowTrigger = this.resolveMiaosheWorkflowTriggerFromAssistant({
            assistantContent,
            message: input.message,
            history: input.history,
          });
          if (
            workflowTrigger.trigger &&
            !input.executeConfirmed &&
            this.shouldHonorMiaosheWorkflowTrigger({
              triggerIntent: workflowTrigger.trigger.intent,
              message: input.message,
              history: input.history,
            })
          ) {
            const workflowResult = await this.tryHandleMiaosheWorkflow({
              userId: input.userId,
              brand: input.brand,
              domains: input.domains,
              mode: input.mode,
              workspaceContext: input.workspaceContext,
              history: input.history,
              message: input.message,
              threadId: null,
              executeConfirmed: false,
              latestArticleArtifact: input.latestArticleArtifact,
              uploadedAttachments: [],
              explicitWorkflowIntent: workflowTrigger.trigger.intent,
              onStatus: input.onStatus,
            });

            if (workflowResult) {
              return {
                content: workflowResult.content,
                confirmationRequest: workflowResult.confirmationRequest,
                agentRun: workflowResult.agentRun,
                articleArtifact: input.mode === 'agent' ? workflowResult.articleArtifact : null,
                mediaArtifact: workflowResult.mediaArtifact,
              };
            }
          }

          const agentRun = run.toolCalls.length > 0 ? this.finalizeMiaosheAgentRun(run) : null;
          const content = this.ensureMiaosheAssistantContent({
            content: resolved.content,
            confirmationRequest: null,
            agentRun,
            articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
            mediaArtifact: null,
          });
          return {
            content,
            confirmationRequest: null,
            agentRun,
            articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
            mediaArtifact: null,
          };
        }

        if (input.mode !== 'agent') {
          const confirmationRequest = this.buildMiaosheSkillConfirmationRequest(
            toolCalls.map((toolCall: any) => String(toolCall?.function?.name || '')),
            input.message,
            input.history,
          );
          return {
            content: `这一步需要调用技能后才能继续。我已经识别出需要执行：${this.formatMiaosheSkillLabels(
              toolCalls.map((toolCall: any) => String(toolCall?.function?.name || '')),
            )}。请切换到 Agent 模式并确认执行。`,
            confirmationRequest,
            agentRun: null,
            articleArtifact: null,
            mediaArtifact: null,
          };
        }

        messages.push({
          role: 'assistant',
          content: assistantContent || '',
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const toolName = String(toolCall?.function?.name || '').trim() as MiaosheConversationToolName;
          await input.onStatus?.({
            label: 'miaoshechat 正在执行',
            detail: `正在调用技能：${this.formatMiaosheSkillName(toolName)}`,
          });
          const rawArguments = String(toolCall?.function?.arguments || '{}');
          const toolResult = await this.executeMiaosheConversationTool({
            brand: input.brand,
            domains: input.domains,
            userId: input.userId,
            toolName,
            rawArguments,
            message: input.message,
            latestArticleArtifact: input.latestArticleArtifact,
          });
          this.appendMiaosheToolExecutionToRun(run, toolName, rawArguments, toolResult);

          messages.push({
            role: 'tool',
            tool_call_id: String(toolCall?.id || randomUUID()),
            content: JSON.stringify(toolResult),
          });
        }
      }

      throw new BadGatewayException('MiaoSheChat 技能调用轮次超限，请稍后重试');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestMiaosheAnthropicConversationWithSkills(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
    executeConfirmed: boolean;
    latestArticleArtifact: {
      title: string;
      markdown: string;
      format: string;
    } | null;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
    apiKey: string;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    brandContext: string;
    onStatus?: (status: { label: string; detail: string }) => Promise<void> | void;
  }) {
    const controller = new AbortController();
    const maxTokens = this.getMiaosheMaxOutputTokens(input.mode);
    const timeout = setTimeout(
      () => controller.abort(),
      this.getMiaosheRequestTimeoutMs(input.mode, 600_000),
    );
    const latestArticleContext = this.buildMiaosheLatestArticleContext(input.latestArticleArtifact);
    const history = this.fitMiaosheHistoryWithinContext({
      history: input.history,
      mode: input.mode,
      reservedOutputTokens: maxTokens,
      contextParts: [
        input.systemPrompt,
        input.brandContext,
        this.buildMiaosheConversationSkillPrompt(),
        latestArticleContext,
      ],
    });
    const historyMessages = await this.buildMiaosheAnthropicHistoryMessages({
      brandId: input.brand.id,
      history,
      currentMessage: input.message,
      uploadedAttachments: input.uploadedAttachments,
    });
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: latestArticleContext
              ? `${input.brandContext}\n\n${latestArticleContext}`
              : input.brandContext,
          },
        ],
      },
      ...historyMessages,
    ];
    const run = this.createEmptyMiaosheAgentRun();

    try {
      for (let iteration = 0; iteration < 4; iteration += 1) {
        const response = await fetch(`${input.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': input.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: input.model,
            max_tokens: maxTokens,
            temperature: 0.7,
            system: `${input.systemPrompt}\n\n${this.buildMiaosheConversationSkillPrompt()}`,
            messages,
            tools: this.buildAnthropicMiaosheConversationTools(),
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
        if (!response.ok || contentBlocks.length === 0) {
          throw new BadGatewayException(
            payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
          );
        }

        const normalizedBlocks = this.normalizeAnthropicContentBlocks(contentBlocks);
        const toolUses = normalizedBlocks.filter(
          (block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use',
        );
        const textContent = normalizedBlocks
          .filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text')
          .map((block) => block.text)
          .join('')
          .trim();

        messages.push({
          role: 'assistant',
          content: normalizedBlocks,
        });

        if (toolUses.length === 0) {
          const resolved = this.extractExplicitMiaosheArticleArtifact(textContent);
          const workflowTrigger = this.extractExplicitMiaosheWorkflowTrigger(textContent);
          if (
            workflowTrigger.trigger &&
            !input.executeConfirmed &&
            this.shouldHonorMiaosheWorkflowTrigger({
              triggerIntent: workflowTrigger.trigger.intent,
              message: input.message,
              history: input.history,
            })
          ) {
            const workflowResult = await this.tryHandleMiaosheWorkflow({
              userId: input.userId,
              brand: input.brand,
              domains: input.domains,
              mode: input.mode,
              workspaceContext: input.workspaceContext,
              history: input.history,
              message: input.message,
              threadId: null,
              executeConfirmed: false,
              latestArticleArtifact: input.latestArticleArtifact,
              uploadedAttachments: [],
              explicitWorkflowIntent: workflowTrigger.trigger.intent,
              onStatus: input.onStatus,
            });

            if (workflowResult) {
              return {
                content: workflowResult.content,
                confirmationRequest: workflowResult.confirmationRequest,
                agentRun: workflowResult.agentRun,
                articleArtifact: input.mode === 'agent' ? workflowResult.articleArtifact : null,
                mediaArtifact: workflowResult.mediaArtifact,
              };
            }
          }

          const agentRun = run.toolCalls.length > 0 ? this.finalizeMiaosheAgentRun(run) : null;
          const content = this.ensureMiaosheAssistantContent({
            content: resolved.content,
            confirmationRequest: null,
            agentRun,
            articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
            mediaArtifact: null,
          });
          return {
            content,
            confirmationRequest: null,
            agentRun,
            articleArtifact: input.mode === 'agent' ? resolved.articleArtifact : null,
            mediaArtifact: null,
          };
        }

        if (input.mode !== 'agent') {
          const confirmationRequest = this.buildMiaosheSkillConfirmationRequest(
            toolUses.map((toolUse) => toolUse.name),
            input.message,
            input.history,
          );
          return {
            content: `这一步需要调用技能后才能继续。我已经识别出需要执行：${this.formatMiaosheSkillLabels(
              toolUses.map((toolUse) => toolUse.name),
            )}。请切换到 Agent 模式并确认执行。`,
            confirmationRequest,
            agentRun: null,
            articleArtifact: null,
            mediaArtifact: null,
          };
        }

        const toolResults: AnthropicContentBlock[] = [];
        for (const toolUse of toolUses) {
          await input.onStatus?.({
            label: 'miaoshechat 正在执行',
            detail: `正在调用技能：${this.formatMiaosheSkillName(toolUse.name)}`,
          });
          const toolResult = await this.executeMiaosheConversationTool({
            brand: input.brand,
            domains: input.domains,
            userId: input.userId,
            toolName: toolUse.name as MiaosheConversationToolName,
            rawArguments: toolUse.input || {},
            message: input.message,
            latestArticleArtifact: input.latestArticleArtifact,
          });
          this.appendMiaosheToolExecutionToRun(
            run,
            toolUse.name as MiaosheConversationToolName,
            toolUse.input || {},
            toolResult,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(toolResult),
          });
        }

        messages.push({
          role: 'user',
          content: toolResults,
        });
      }

      throw new BadGatewayException('MiaoSheChat 技能调用轮次超限，请稍后重试');
    } finally {
      clearTimeout(timeout);
    }
  }

  private createEmptyMiaosheAgentRun(): AgentRunPayload {
    return {
      id: randomUUID(),
      scene: 'miaoshe',
      status: 'completed',
      summary: '',
      steps: [],
      toolCalls: [],
      actions: [],
    };
  }

  private finalizeMiaosheAgentRun(run: AgentRunPayload) {
    const hasError = run.toolCalls.some((item) => item.status === 'error');
    const hasBlocked = run.toolCalls.some((item) => item.status === 'blocked');
    run.status = hasError ? 'failed' : hasBlocked ? 'needs_action' : 'completed';
    if (!run.summary) {
      run.summary = hasError
        ? '部分技能执行失败，请按返回信息处理。'
        : hasBlocked
          ? '技能执行到了需要你补充操作的阶段。'
          : '技能执行完成。';
    }
    return run;
  }

  private buildMiaosheSkillConfirmationRequest(
    toolNames: string[],
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): AgentConfirmationRequest {
    const labels = this.formatMiaosheSkillLabels(toolNames);
    return {
      id: randomUUID(),
      title: '切换到 Agent 并执行技能',
      description: `这一步需要调用技能：${labels}。切换到 Agent 模式后我会继续执行。`,
      confirmLabel: '切换到 Agent 并执行',
      message,
      history,
    };
  }

  private buildMiaosheImageSkillConfirmationRequest(input: {
    artifact: MiaosheMediaArtifactResult;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): AgentConfirmationRequest {
    const isReferenceImageFlow = input.artifact.intent === 'media_edit';
    const requestedCount = this.normalizeMiaosheImageCount(input.artifact.imageCount);
    return {
      id: randomUUID(),
      title: isReferenceImageFlow ? '切换到 Agent 并执行参考图生图' : '切换到 Agent 并执行图片生成',
      description: `将切换到 Agent 模式，并按当前整理好的需求开始${isReferenceImageFlow ? '参考图生图' : '图片生成'}。本次计划生成 ${requestedCount} 张图片，单次最多批量生成 ${MIAOSHE_MAX_BATCH_IMAGE_COUNT} 张。`,
      confirmLabel: '切换到 Agent 并执行',
      message: input.message,
      history: input.history,
    };
  }

  private buildMiaosheVideoSkillConfirmationRequest(input: {
    artifact: MiaosheMediaArtifactResult;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): AgentConfirmationRequest {
    const isReferenceVideoFlow =
      input.artifact.intent === 'media_edit' || input.artifact.intent === 'video_generate';
    return {
      id: randomUUID(),
      title: isReferenceVideoFlow ? '切换到 Agent 并执行参考图生视频' : '切换到 Agent 并执行视频生成',
      description: `将切换到 Agent 模式，并按当前整理好的需求开始${isReferenceVideoFlow ? '参考图生视频' : '文生视频'}。${input.artifact.duration ? `目标时长 ${input.artifact.duration}。` : ''}`,
      confirmLabel: '切换到 Agent 并执行',
      message: input.message,
      history: input.history,
    };
  }

  private formatMiaosheSkillLabels(toolNames: string[]) {
    const labels = Array.from(
      new Set(
        toolNames
          .map((toolName) => this.formatMiaosheSkillName(toolName))
          .filter((item) => String(item || '').trim()),
      ),
    );
    return labels.join('、') || '相关技能';
  }

  private formatMiaosheSkillName(toolName: string) {
    const labels: Record<string, string> = {
      get_brand_answer_engine_overview: '品牌答案引擎总览',
      get_brand_topics: '品牌主题分析',
      get_brand_prompts: '品牌提示词分析',
      get_brand_citations: '品牌引用来源分析',
      get_brand_ai_traffic: '品牌 AI 流量分析',
      get_brand_competitors: '品牌竞品分析',
      get_brand_creator_platform_status: '平台连接状态查询',
      refresh_brand_creator_platform_data: '平台数据刷新',
      get_brand_creator_platform_report: '平台数据报告',
      ensure_bridge_connection: '扩展连接检查',
      list_platforms: '平台账号同步',
      check_auth: '平台登录校验',
      refresh_platform_data: '创作者后台抓数',
      sync_article: '文章同步发布',
    };
    return labels[toolName] || toolName;
  }

  private async executeMiaosheConversationTool(input: {
    brand: BrandRow;
    domains: BrandDomainRow[];
    userId: string;
    toolName: MiaosheConversationToolName;
    rawArguments: string | Record<string, unknown>;
    message: string;
    latestArticleArtifact: {
      title: string;
      markdown: string;
      format: string;
    } | null;
  }) {
    const args = this.parseToolArguments(input.rawArguments);
    if (this.isBrandIntelligenceToolName(input.toolName)) {
      return this.executeBrandIntelligenceTool(
        input.brand,
        input.domains,
        input.toolName,
        args,
        input.userId,
      );
    }

    switch (input.toolName) {
      case 'ensure_bridge_connection':
        return this.ensureBridgeConnectionSkill(input.brand, input.userId);
      case 'list_platforms':
        return this.listPlatformsSkill(input.brand, input.userId, args);
      case 'check_auth':
        return this.checkAuthSkill(input.brand, input.userId, args);
      case 'refresh_platform_data':
        return this.refreshPlatformDataSkill(input.brand, input.userId, args);
      case 'sync_article':
        return this.syncArticleSkill(input.brand, input.userId, args, input.latestArticleArtifact);
      default:
        return {
          ok: false,
          tool: input.toolName,
          summary: '未定义的 MiaoShe 技能。',
        };
    }
  }

  private isBrandIntelligenceToolName(toolName: string): toolName is BrandIntelligenceToolName {
    return [
      'get_brand_answer_engine_overview',
      'get_brand_topics',
      'get_brand_prompts',
      'get_brand_citations',
      'get_brand_ai_traffic',
      'get_brand_competitors',
      'get_brand_creator_platform_status',
      'refresh_brand_creator_platform_data',
      'get_brand_creator_platform_report',
    ].includes(toolName);
  }

  private async ensureBridgeConnectionSkill(brand: BrandRow, userId: string) {
    const session = await this.getOrCreateWechatSyncBridgeSession(userId, brand.organization_id);
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    const bridge = this.mapWechatSyncBridgeSession(session, sessionStatus);
    return {
      ok: sessionStatus.reachable && sessionStatus.connected,
      tool: 'ensure_bridge_connection',
      bridge,
      reachable: sessionStatus.reachable,
      connected: sessionStatus.connected,
      summary: !sessionStatus.reachable
        ? sessionStatus.error || '服务器侧还没有配置 WechatSync 桥接地址。'
        : sessionStatus.connected
          ? '扩展桥接已连接。'
          : '桥接服务已在线，但浏览器扩展尚未连接。',
    };
  }

  private async listPlatformsSkill(
    brand: BrandRow,
    userId: string,
    args: Record<string, unknown>,
  ) {
    const session = await this.getOrCreateWechatSyncBridgeSession(userId, brand.organization_id);
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    if (!sessionStatus.reachable || !sessionStatus.connected) {
      return {
        ok: false,
        tool: 'list_platforms',
        bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
        connections: [],
        summary: !sessionStatus.reachable
          ? sessionStatus.error || '服务器侧还没有配置 WechatSync 桥接地址。'
          : '桥接服务已在线，但浏览器扩展尚未连接。',
      };
    }

    const connections = await this.syncCreatorPlatformConnectionsFromBridge(brand, userId, {
      session,
      sessionStatus,
      forceRefresh: args.forceRefresh !== false,
    });
    return {
      ok: true,
      tool: 'list_platforms',
      bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
      count: connections.length,
      connections,
      summary: connections.length
        ? `已同步 ${connections.length} 个已登录平台账号。`
        : '扩展已连接，但当前还没有识别到已登录的平台账号。',
    };
  }

  private async checkAuthSkill(
    brand: BrandRow,
    userId: string,
    args: Record<string, unknown>,
  ) {
    const requestedIds = this.normalizeRequestedPlatforms(args.platforms);
    const session = await this.getOrCreateWechatSyncBridgeSession(userId, brand.organization_id);
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    if (!sessionStatus.reachable || !sessionStatus.connected) {
      return {
        ok: false,
        tool: 'check_auth',
        requestedPlatforms: this.resolveMediaPlatformsByIds(requestedIds).map((item) => ({
          id: item.id,
          name: item.name,
        })),
        summary: !sessionStatus.reachable
          ? sessionStatus.error || '服务器侧还没有配置 WechatSync 桥接地址。'
          : '桥接服务已在线，但浏览器扩展尚未连接。',
      };
    }

    const connections = await this.syncCreatorPlatformConnectionsFromBridge(brand, userId, {
      session,
      sessionStatus,
      forceRefresh: true,
    });
    const lookup = new Map(
      connections.map((item) => [this.normalizeCreatorPlatformKey(item.platform), item]),
    );
    const requestedPlatforms = this.resolveMediaPlatformsByIds(requestedIds).map((item) => {
      const connected = lookup.get(this.normalizeCreatorPlatformKey(item.id));
      return {
        id: item.id,
        name: item.name,
        connected: Boolean(connected),
        accountName: connected?.accountName || null,
      };
    });
    const unauthenticatedPlatforms = requestedPlatforms.filter((item) => !item.connected);
    return {
      ok: requestedPlatforms.length > 0 && unauthenticatedPlatforms.length === 0,
      tool: 'check_auth',
      requestedPlatforms,
      unauthenticatedPlatforms,
      summary:
        requestedPlatforms.length === 0
          ? '这次还没有指定要检查的平台。'
          : unauthenticatedPlatforms.length === 0
            ? `目标平台都已登录：${requestedPlatforms.map((item) => item.name).join('、')}`
            : `以下平台还未登录：${unauthenticatedPlatforms.map((item) => item.name).join('、')}`,
    };
  }

  private async refreshPlatformDataSkill(
    brand: BrandRow,
    userId: string,
    args: Record<string, unknown>,
  ) {
    const result = await this.refreshPlatformData(userId, brand.id, {
      platforms: this.normalizeRequestedPlatforms(args.platforms),
      forceRefresh: args.forceRefresh !== false,
    });
    return {
      ...result,
      tool: 'refresh_platform_data',
      summary: result.summary || result.message || '平台数据刷新完成。',
    };
  }

  private async syncArticleSkill(
    brand: BrandRow,
    userId: string,
    args: Record<string, unknown>,
    latestArticleArtifact: {
      title: string;
      markdown: string;
      format: string;
    } | null,
  ) {
    const platforms = this.normalizeRequestedPlatforms(args.platforms);
    const title = String(args.title || latestArticleArtifact?.title || '').trim();
    const markdown = String(args.markdown || args.content || latestArticleArtifact?.markdown || '').trim();
    if (!title || !markdown || platforms.length === 0) {
      return {
        ok: false,
        tool: 'sync_article',
        summary: '调用发布技能时缺少标题、正文或目标平台。',
      };
    }

    const session = await this.getOrCreateWechatSyncBridgeSession(userId, brand.organization_id);
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    if (!sessionStatus.reachable || !sessionStatus.connected) {
      return {
        ok: false,
        tool: 'sync_article',
        summary: !sessionStatus.reachable
          ? sessionStatus.error || '服务器侧还没有配置 WechatSync 桥接地址。'
          : '桥接服务已在线，但浏览器扩展尚未连接。',
      };
    }

    try {
      const syncResponse = await this.requestWechatSyncBridge(
        this.getWechatSyncBridgeBaseUrl(),
        session.public_id,
        'syncArticle',
        {
          platforms,
          article: {
            title,
            markdown,
            content: markdown,
          },
        },
      );
      const syncResults = Array.isArray(syncResponse)
        ? syncResponse
        : Array.isArray((syncResponse as Record<string, unknown> | null)?.results)
          ? (((syncResponse as Record<string, unknown>).results as unknown[]) || []) as Array<Record<string, any>>
          : Array.isArray((syncResponse as Record<string, unknown> | null)?.syncResults)
            ? (((syncResponse as Record<string, unknown>).syncResults as unknown[]) || []) as Array<Record<string, any>>
            : syncResponse && typeof syncResponse === 'object'
              ? [syncResponse as Record<string, any>]
              : [];
      const ok = syncResults.length > 0 && syncResults.every((item) => item?.success);
      return {
        ok,
        tool: 'sync_article',
        title,
        platforms,
        results: syncResults,
        summary: ok
          ? `已创建 ${syncResults.length} 个平台草稿。`
          : syncResults.length > 0
            ? '部分平台创建草稿失败，请查看返回结果。'
            : '平台返回了空的同步结果，请检查扩展返回结构。',
      };
    } catch (error) {
      return {
        ok: false,
        tool: 'sync_article',
        summary: error instanceof Error ? error.message : '调用 sync_article 失败，请稍后重试。',
      };
    }
  }

  private appendMiaosheToolExecutionToRun(
    run: AgentRunPayload,
    toolName: MiaosheConversationToolName,
    rawArguments: string | Record<string, unknown>,
    toolResult: any,
  ) {
    const status: AgentToolCallStatus =
      toolResult?.ok === false
        ? toolName === 'ensure_bridge_connection' || toolName === 'list_platforms' || toolName === 'check_auth'
          ? 'blocked'
          : 'error'
        : 'success';
    const summary = String(toolResult?.summary || toolResult?.message || `${toolName} 已执行`).trim();

    run.toolCalls.push({
      id: randomUUID(),
      name: toolName,
      status,
      summary,
      input: this.parseToolArguments(rawArguments),
      output: toolResult,
    });

    run.steps.push({
      id: randomUUID(),
      title: this.formatMiaosheSkillName(toolName),
      detail: summary,
      status: status === 'success' ? 'completed' : status === 'blocked' ? 'needs_action' : 'failed',
    });

    if (toolName === 'ensure_bridge_connection' && toolResult?.ok === false) {
      run.actions.push(
        {
          id: randomUUID(),
          label: '安装 WechatSync 扩展',
          href: toolResult?.bridge?.installUrl || this.buildWechatSyncExtensionDownloadUrl(),
          description: '先在本地浏览器安装发布扩展。',
        },
        {
          id: randomUUID(),
          label: '查看桥接说明',
          href: 'https://github.com/wechatsync/Wechatsync/tree/master/packages/mcp-server',
          description: '确认远程桥接地址、Token 和扩展设置一致。',
        },
      );
    }

    if (toolName === 'check_auth' && Array.isArray(toolResult?.unauthenticatedPlatforms)) {
      for (const platform of toolResult.unauthenticatedPlatforms) {
        run.actions.push({
          id: randomUUID(),
          label: `登录 ${platform.name}`,
          href: this.getPlatformHomepage(platform.id),
          description: '在本地浏览器完成登录后，再回来继续执行。',
          platform: platform.id,
        });
      }
    }

    run.summary = summary;
  }

  private extractMiaosheOpenAiStreamDelta(payload: any) {
    return (
      payload?.choices?.[0]?.delta?.content ||
      payload?.choices?.[0]?.message?.content ||
      payload?.choices?.[0]?.text ||
      ''
    );
  }

  private safeJsonParse(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private mergeOpenAiStreamToolCalls(
    target: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>,
    deltaCalls: any[],
  ) {
    for (const item of deltaCalls) {
      const index =
        typeof item?.index === 'number' && Number.isFinite(item.index) ? item.index : target.length;
      if (!target[index]) {
        target[index] = {
          id: '',
          type: 'function',
          function: {
            name: '',
            arguments: '',
          },
        };
      }

      if (typeof item?.id === 'string' && item.id) {
        target[index].id = item.id;
      }
      if (typeof item?.function?.name === 'string' && item.function.name) {
        target[index].function.name += item.function.name;
      }
      if (typeof item?.function?.arguments === 'string' && item.function.arguments) {
        target[index].function.arguments += item.function.arguments;
      }
    }
  }

  private async requestMiaosheStreamFallbackContent(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
    partialContent: string;
  }) {
    if (!input.partialContent.trim()) {
      return this.requestMiaosheAssistant({
        userId: input.userId,
        brand: input.brand,
        domains: input.domains,
        mode: input.mode,
        workspaceContext: input.workspaceContext,
        history: [
          ...input.history,
          {
            role: 'user',
            content: input.message,
          },
        ],
      });
    }

    const systemPrompt =
      input.mode === 'agent'
        ? '你是妙设AIO中的 MiaoShe Agent。你上一条回复在传输时中断了。现在请在不重复已输出内容的前提下，从断点自然续写，把整件事交代完整。只输出后续需要追加的内容，不要解释。'
        : '你是妙设AIO中的 MiaoShe Chat。你上一条回复在传输时中断了。现在请在不重复已输出内容的前提下，从断点自然续写，把回答完整收尾。只输出后续需要追加的内容，不要解释。';

    const brandContext = await this.buildMiaosheBrandContext(
      input.brand,
      input.domains,
      input.workspaceContext,
    );

    return this.requestMiaosheText({
      systemPrompt,
      brandContext,
      history: [
        ...input.history,
        {
          role: 'user',
          content: input.message,
        },
        {
          role: 'assistant',
          content: input.partialContent,
        },
        {
          role: 'user',
          content:
            '上面的 assistant 回复已经有一部分成功发给用户了。请只输出还没发出的后续内容，从最后一句自然续写，不要重复已经写过的内容，不要加说明。',
        },
      ],
      temperature: 0.65,
      maxTokens: this.getMiaosheMaxOutputTokens(input.mode),
      timeoutMs: this.getMiaosheRequestTimeoutMs(input.mode),
    });
  }

  private shouldFallbackMiaosheCodexError(error: unknown) {
    const message = this.getMiaosheErrorMessage(error).toLowerCase();
    return (
      message.includes('request timed out') ||
      message.includes('timed out') ||
      message.includes('reconnecting') ||
      message.includes('connection') ||
      message.includes('stream') ||
      message.includes('中断') ||
      message.includes('timeout')
    );
  }

  private getMiaosheErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message || error.name || 'unknown error';
    }
    return String(error || 'unknown error');
  }

  private extractMiaosheVisibleStreamContent(rawContent: string) {
    const markers = ['```miaoshe-workflow', '```miaoshe-article'];
    let visible = String(rawContent || '');

    for (const marker of markers) {
      while (true) {
        const start = visible.indexOf(marker);
        if (start === -1) {
          break;
        }
        const end = visible.indexOf('```', start + marker.length);
        if (end === -1) {
          visible = visible.slice(0, start);
          break;
        }
        visible = `${visible.slice(0, start)}${visible.slice(end + 3)}`;
      }
    }

    const maxMarkerLength = Math.max(...markers.map((marker) => marker.length));
    const searchStart = Math.max(0, visible.length - maxMarkerLength);
    for (let index = searchStart; index < visible.length; index += 1) {
      const tail = visible.slice(index);
      if (markers.some((marker) => marker.startsWith(tail))) {
        return this.stripLeakedMiaosheWorkflowPrefix(visible.slice(0, index));
      }
    }

    return this.stripLeakedMiaosheWorkflowPrefix(visible);
  }

  private stripLeakedMiaosheWorkflowPrefix(content: string) {
    const markerName = 'miaoshe-workflow';
    const lines = String(content || '').split('\n');
    const filtered = lines.filter((line, index) => {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed || trimmed.length > markerName.length) {
        return true;
      }
      if (!/^[a-z-]+$/.test(trimmed)) {
        return true;
      }
      if (!markerName.startsWith(trimmed)) {
        return true;
      }

      const nextNonEmpty = lines
        .slice(index + 1)
        .map((item) => item.trim())
        .find(Boolean);
      return !nextNonEmpty;
    });

    return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  }

  private splitMiaosheStreamChunks(content: string) {
    const chunks: string[] = [];
    let offset = 0;

    while (offset < content.length) {
      const nextOffset = Math.min(offset + 20, content.length);
      chunks.push(content.slice(offset, nextOffset));
      offset = nextOffset;
    }

    return chunks.filter((item) => item.length > 0);
  }

  private getMiaosheStreamChunkDelay(delta: string) {
    const compactLength = delta.replace(/\s+/g, '').length;
    return Math.max(24, Math.min(90, 22 + compactLength * 3));
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private removeOverlappingPrefix(existingContent: string, nextContent: string) {
    if (!existingContent || !nextContent) {
      return nextContent;
    }

    const maxOverlap = Math.min(existingContent.length, nextContent.length);
    for (let size = maxOverlap; size > 0; size -= 1) {
      if (existingContent.slice(-size) === nextContent.slice(0, size)) {
        return nextContent.slice(size);
      }
    }

    return nextContent;
  }

  private async prepareMiaosheChatRequest(
    userId: string,
    brandId: string,
    input: MiaosheChatInput,
  ): Promise<PreparedMiaosheChatRequest> {
    const brand = await this.assertBrandAccess(brandId, userId);
    const domains = await this.findBrandDomains(brand.id);
    const message = (input.message || '').trim();

    if (!message) {
      throw new BadRequestException('消息不能为空');
    }

    const rawHistory: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(
      input.history,
    )
      ? input.history
          .map((item) => ({
            role: item?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: (item?.content || '').trim(),
          }))
          .filter((item) => item.content)
      : [];
    const history = this.pruneMiaosheHistoryByTokenBudget(
      rawHistory,
      this.getMiaosheClientHistoryTokenBudget(),
    );

    const threadId = (input.threadId || '').trim();
    const clientMessageId = this.normalizeClientMessageId(input.clientMessageId);
    const displayMessage = (input.displayMessage || message).trim() || message;
    const uploadedAttachments = this.normalizeMiaosheUploadedAttachments(input.uploadedAttachments);
    const latestArticleArtifact = this.normalizeMiaosheArticleArtifact(input.latestArticleArtifact);
    const shouldCountAsNewMessage = !(await this.hasExistingMiaosheUserMessageLog(
      brand.id,
      threadId,
      clientMessageId,
    ));
    if (shouldCountAsNewMessage) {
      await this.assertConversationMessageQuota(brand.organization_id, 1);
    }
    await this.saveMiaosheChatUploads(
      userId,
      brand.id,
      threadId,
      clientMessageId,
      displayMessage,
      uploadedAttachments,
    );

    return {
      brand,
      domains,
      message,
      mode: input.mode === 'agent' ? 'agent' : 'chat',
      history,
      threadId,
      workspaceContext: (input.workspaceContext || '').trim(),
      executeConfirmed: Boolean(input.executeConfirmed),
      latestArticleArtifact,
      uploadedAttachments,
      clientMessageId,
      displayMessage,
    };
  }

  private async runMediaPublishAgent(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
    mode: 'chat' | 'agent';
    routerDecision: MiaosheRouteDecision;
    codexResult: MediaPublishCodexResult | null;
    requireConfirmation: boolean;
    executeConfirmed: boolean;
    threadId?: string | null;
    uploadedAttachments?: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
    onStatus?: (status: { label: string; detail: string }) => Promise<void> | void;
    onMediaArtifactProgress?: (artifact: MiaosheMediaArtifactResult) => Promise<void> | void;
  }): Promise<{
    assistantText: string;
    run: AgentRunPayload;
    confirmationRequest?: AgentConfirmationRequest;
    articleArtifact?: MiaosheArticleArtifactResult;
    mediaArtifact?: MiaosheMediaArtifactResult;
  } | null> {
    const explicitMessagePlatforms = this.extractMediaPlatforms(input.message);
    const fallbackPlatforms = this.extractMediaPlatformsFromConversation(input.message, input.history);
    let targetPlatforms = explicitMessagePlatforms.length > 0 ? explicitMessagePlatforms : fallbackPlatforms;
    const routerRoute = input.routerDecision.route;
    const codexPlan: MediaPublishCodexPlan | null = input.codexResult?.plan ?? null;
    const resolvedImageIntent: 'image_generate' | 'media_edit' | null =
      codexPlan?.intent === 'image_generate' || codexPlan?.intent === 'media_edit'
        ? codexPlan.intent
        : routerRoute === 'image_generate' || routerRoute === 'media_edit'
          ? routerRoute
          : null;
    const toolSequence = this.resolveMiaosheAgentToolSequence({
      routerDecision: input.routerDecision,
      codexPlan,
      message: input.message,
    });
    const requestedTools = new Set(toolSequence.map((item) => item.tool));

    const wantsPublish =
      requestedTools.has('sync_article') ||
      (input.routerDecision.source === 'fallback' &&
        (routerRoute === 'media_publish' ||
          /发布|发到|发去|同步|分发|推送|投到|投递|发文|上稿|草稿/.test(input.message)));
    const wantsLogin =
      requestedTools.has('check_auth') ||
      (input.routerDecision.source === 'fallback' &&
        (routerRoute === 'login_help' || /登录|登陆|授权|账号/.test(input.message)));
    const wantsSetup =
      requestedTools.has('ensure_bridge_connection') ||
      (input.routerDecision.source === 'fallback' &&
        (routerRoute === 'integration_help' || /扩展|插件|桥接|连接|安装|mcp/.test(input.message)));
    const wantsPlatformData =
      requestedTools.has('refresh_platform_data') ||
      (input.routerDecision.source === 'fallback' &&
        (routerRoute === 'platform_data' ||
          /后台数据|创作者后台|作品数据|平台数据|账号数据|数据分析|查看数据|看数据|播放量|阅读量|曝光|互动|点赞|评论|收藏|转发|粉丝|爆文|复盘/.test(
            input.message,
          )));
    const wantsStatus =
      requestedTools.has('list_platforms') ||
      requestedTools.has('check_auth') ||
      (input.routerDecision.source === 'fallback' &&
        (routerRoute === 'status_check' || /检查|检测|状态|查看|平台|已登录/.test(input.message)));
    const wantsArticleDraft =
      routerRoute === 'article_draft' ||
      /(生成|起草|撰写|写一篇|写篇|创作|产出).*(文章|文案|草稿|内容)|帮我写|写.*文章/.test(
        input.message,
      );
    if (
      !(
        input.routerDecision.shouldRunWorkflow ||
        targetPlatforms.length ||
        wantsPublish ||
        wantsLogin ||
        wantsSetup ||
        wantsPlatformData ||
        wantsStatus ||
        wantsArticleDraft
      )
    ) {
      return null;
    }

    const run: AgentRunPayload = {
      id: randomUUID(),
      scene: 'media_publish',
      status: 'needs_action',
      summary: '',
      steps: [],
      toolCalls: [],
      actions: [],
    };

    if (codexPlan) {
      run.toolCalls.push({
        id: randomUUID(),
        name: 'codex_exec',
        status: 'success',
        summary: codexPlan.summary || 'miaoshechat 已完成执行单编排。',
        input: {
          intent: codexPlan.intent,
          targetPlatformIds: codexPlan.targetPlatformIds,
        },
        output: {
          plan: codexPlan,
          usage: input.codexResult?.usage || null,
          threadId: input.codexResult?.threadId || null,
        },
      });

      if (
        codexPlan.shouldEnterWorkflow === false &&
        !input.executeConfirmed &&
        !wantsSetup &&
        !wantsArticleDraft &&
        !wantsPlatformData
      ) {
        return null;
      }

      const plannedPlatforms = this.resolveMediaPlatformsByIds(codexPlan.targetPlatformIds);
      if (plannedPlatforms.length > 0) {
        targetPlatforms = this.mergeMediaPlatforms(targetPlatforms, plannedPlatforms);
      }
      for (const step of toolSequence) {
        const sequencePlatforms = this.resolveMediaPlatformsByIds(step.platformIds);
        if (sequencePlatforms.length > 0) {
          targetPlatforms = this.mergeMediaPlatforms(targetPlatforms, sequencePlatforms);
        }
      }

      run.steps.push({
        id: randomUUID(),
        title: 'miaoshechat 编排执行单',
        detail:
          codexPlan.summary ||
          `已把当前需求整理成结构化执行单，计划调用 ${toolSequence.map((item) => item.tool).join(' -> ')}。`,
        status: 'completed',
      });
    } else {
      run.toolCalls.push({
        id: randomUUID(),
        name: 'codex_exec',
        status: 'error',
        summary: 'miaoshechat 编排暂不可用，已切回本地兜底逻辑。',
      });
    }

    run.steps.push({
      id: randomUUID(),
      title: '识别任务目标',
      detail:
        targetPlatforms.length > 0
          ? `已识别目标平台：${targetPlatforms.map((item) => item.name).join('、')}`
          : wantsArticleDraft
            ? '已识别为文章生成任务，下一步生成文章草稿。'
            : resolvedImageIntent
              ? '已识别为图片/素材任务，下一步继续完善生成需求。'
              : wantsPlatformData
                ? '已识别为平台数据任务，下一步检查扩展桥接、账号状态并抓取数据。'
                : '已识别为媒体发布工作流，下一步需要检查扩展桥接和平台登录状态。',
      status: 'completed',
    });

    if (wantsArticleDraft && !wantsPublish) {
      const article = this.extractArticleFromCodexPlan(codexPlan);

      if (!article) {
        run.summary = '已经识别为文章生成任务，但当前还缺少可直接编辑的标题或正文。';
        run.steps.push({
          id: randomUUID(),
          title: '等待文章草稿',
          detail: '请补充主题、目标受众或篇幅要求，我会继续生成可直接编辑的文章草稿。',
          status: 'needs_action',
        });
        return {
          assistantText:
            '我已经识别到这是文章生成任务，但这次还没有整理出可直接编辑的完整草稿。请再补充一下主题、风格或篇幅要求。',
          run,
        };
      }

      run.summary = `已生成《${article.title}》的文章草稿，可继续在编辑器中修改。`;
      run.status = 'completed';
      run.steps.push({
        id: randomUUID(),
        title: '生成文章草稿',
        detail: `已生成《${article.title}》，正文已经可以直接继续编辑。`,
        status: 'completed',
      });

      return {
        assistantText: `我已经生成了《${article.title}》的文章草稿，可以直接打开编辑。`,
        run,
        articleArtifact: {
          title: article.title,
          markdown: article.markdown,
          format: 'markdown',
        } satisfies MiaosheArticleArtifactResult,
      };
    }

    const plannedMediaArtifact = this.buildMediaArtifactFromCodexPlan(
      codexPlan,
      input.message,
      input.history,
    );
    if ((resolvedImageIntent || plannedMediaArtifact.kind === 'video') && !wantsPublish) {
      let mediaArtifact = plannedMediaArtifact;
      if (mediaArtifact.intent !== resolvedImageIntent) {
        mediaArtifact = {
          ...mediaArtifact,
          intent: resolvedImageIntent || mediaArtifact.intent,
        };
      }
      run.summary = mediaArtifact.needsClarification
        ? '已识别为素材生成任务，但还需要补充关键信息。'
        : mediaArtifact.kind === 'image'
          ? '已整理好图片生成需求，可继续按当前参数生成。'
          : '已整理好视频生成需求，可继续按当前参数生成。';
      run.status = mediaArtifact.needsClarification ? 'needs_action' : 'completed';
      run.steps.push({
        id: randomUUID(),
        title:
          mediaArtifact.needsClarification
            ? '等待补充生成需求'
            : mediaArtifact.kind === 'image'
              ? '整理图片生成需求'
              : '整理视频生成需求',
        detail: mediaArtifact.needsClarification
          ? mediaArtifact.clarificationQuestions?.join('；') || '请补充主体、风格、比例或用途。'
          : mediaArtifact.kind === 'image'
            ? '图片生成需求已经整理完成。'
            : '视频生成需求已经整理完成。',
        status: mediaArtifact.needsClarification ? 'needs_action' : 'completed',
      });

      if (
        !mediaArtifact.needsClarification &&
        (
          (mediaArtifact.kind === 'image' && this.isMiaosheImageSkillIntent(mediaArtifact.intent)) ||
          mediaArtifact.kind === 'video'
        )
      ) {
        if (input.mode !== 'agent' && input.requireConfirmation && !input.executeConfirmed) {
          mediaArtifact = {
            ...mediaArtifact,
            confirmationRequired: true,
          };
          run.summary =
            mediaArtifact.kind === 'video'
              ? '视频生成需求已经准备好。请切换到 Agent 模式后确认执行。'
              : mediaArtifact.intent === 'media_edit'
              ? '参考图生图需求已经准备好。请切换到 Agent 模式后确认执行。'
              : '图片生成需求已经准备好。请切换到 Agent 模式后确认执行。';
          run.status = 'needs_action';
          run.steps.push({
            id: randomUUID(),
            title: '等待切换到 Agent 模式',
            detail:
              mediaArtifact.kind === 'video'
                ? '切换到 Agent 模式并确认后，我再开始生成视频。'
                : mediaArtifact.intent === 'media_edit'
                ? '切换到 Agent 模式并确认后，我再开始参考图生图。'
                : '切换到 Agent 模式并确认后，我再真正开始生图。',
            status: 'needs_action',
          });
          return {
            assistantText:
              mediaArtifact.kind === 'video'
                ? '我已经把视频生成需求整理好了。你可以点击下方按钮切换到 Agent 模式，我就继续开始生成。'
                : mediaArtifact.intent === 'media_edit'
                ? '我已经把参考图生图需求整理好了。你可以点击下方按钮切换到 Agent 模式，我就继续开始生成。'
                : '我已经把图片生成需求整理好了。你可以点击下方按钮切换到 Agent 模式，我就继续开始生成。',
            run,
            confirmationRequest:
              mediaArtifact.kind === 'video'
                ? this.buildMiaosheVideoSkillConfirmationRequest({
                    artifact: mediaArtifact,
                    message: input.message,
                    history: input.history,
                  })
                : this.buildMiaosheImageSkillConfirmationRequest({
                    artifact: mediaArtifact,
                    message: input.message,
                    history: input.history,
                  }),
            mediaArtifact: this.shouldExposeMiaosheMediaArtifact(mediaArtifact) ? mediaArtifact : undefined,
          };
        }

        if (mediaArtifact.kind === 'video') {
          await input.onStatus?.({
            label: 'miaoshechat 正在生成视频',
            detail: `正在根据提示词生成视频${mediaArtifact.duration ? `（${mediaArtifact.duration}）` : ''}...`,
          });
          mediaArtifact = await this.generateMiaosheVideos({
            userId: input.userId,
            brand: input.brand,
            brandId: input.brand.id,
            threadId: input.threadId || 'default',
            artifact: mediaArtifact,
            uploadedAttachments: input.uploadedAttachments || [],
            sourceMessage: input.message,
            onProgress: input.onMediaArtifactProgress,
          });
          run.summary =
            mediaArtifact.generationStatus === 'completed'
              ? `已生成 ${mediaArtifact.videos?.length || 0} 条视频，可直接预览和继续引用。`
              : mediaArtifact.error || '视频生成失败，请稍后重试。';
          run.status = mediaArtifact.generationStatus === 'completed' ? 'completed' : 'failed';
          run.steps.push({
            id: randomUUID(),
            title: mediaArtifact.generationStatus === 'completed' ? '生成视频' : '视频生成失败',
            detail:
              mediaArtifact.generationStatus === 'completed'
                ? `已生成 ${mediaArtifact.videos?.length || 0} 条视频，并同步到素材区。`
                : mediaArtifact.error || '视频生成失败，请稍后重试。',
            status: mediaArtifact.generationStatus === 'completed' ? 'completed' : 'failed',
          });
        } else {
          await input.onStatus?.({
            label: 'miaoshechat 正在生图',
            detail: `正在根据提示词生成图片${mediaArtifact.aspectRatio ? `（${mediaArtifact.aspectRatio}）` : ''}...`,
          });
          mediaArtifact = await this.generateMiaosheImages({
            userId: input.userId,
            brand: input.brand,
            brandId: input.brand.id,
            threadId: input.threadId || 'default',
            artifact: mediaArtifact,
            uploadedAttachments: input.uploadedAttachments || [],
            sourceMessage: input.message,
            onProgress: input.onMediaArtifactProgress,
          });
          run.summary =
            mediaArtifact.generationStatus === 'completed'
              ? `已生成 ${mediaArtifact.images.length} 张图片，可直接预览和继续引用。`
              : mediaArtifact.error || '图片生成失败，请稍后重试。';
          run.status = mediaArtifact.generationStatus === 'completed' ? 'completed' : 'failed';
          run.steps.push({
            id: randomUUID(),
            title: mediaArtifact.generationStatus === 'completed' ? '生成图片' : '图片生成失败',
            detail:
              mediaArtifact.generationStatus === 'completed'
                ? `已生成 ${mediaArtifact.images.length} 张图片，并同步到素材区。`
                : mediaArtifact.error || '图片生成失败，请稍后重试。',
            status: mediaArtifact.generationStatus === 'completed' ? 'completed' : 'failed',
          });
        }
      }

      return {
        assistantText:
          mediaArtifact.kind === 'video'
            ? this.buildMiaosheVideoAssistantText(mediaArtifact)
            : this.buildMiaosheImageAssistantText(mediaArtifact),
        run,
        mediaArtifact: this.shouldExposeMiaosheMediaArtifact(mediaArtifact) ? mediaArtifact : undefined,
      };
    }

    const session = await this.getOrCreateWechatSyncBridgeSession(
      input.userId,
      input.brand.organization_id,
    );
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    const bridge = this.mapWechatSyncBridgeSession(session, sessionStatus);

    if (requestedTools.has('ensure_bridge_connection')) {
      run.toolCalls.push({
        id: randomUUID(),
        name: 'ensure_bridge_connection',
        status: sessionStatus.reachable ? (sessionStatus.connected ? 'success' : 'blocked') : 'error',
        summary: !sessionStatus.reachable
          ? sessionStatus.error || '服务器侧还没有配置 WechatSync 桥接地址。'
          : sessionStatus.connected
            ? '桥接服务与浏览器扩展已经连接。'
            : '桥接服务已在线，但浏览器扩展尚未连接。',
        input: {
          forceRefresh: requestedTools.has('list_platforms') || requestedTools.has('check_auth'),
        },
        output: {
          bridge,
          reachable: sessionStatus.reachable,
          connected: sessionStatus.connected,
          error: sessionStatus.error || null,
        },
      });
    }

    if (!sessionStatus.reachable) {
      run.summary = sessionStatus.error || '服务器侧还没有配置 WechatSync 桥接地址。';
      run.steps.push({
        id: randomUUID(),
        title: '连接发布扩展',
        detail: run.summary,
        status: 'needs_action',
      });
      run.actions.push(
        {
          id: randomUUID(),
          label: '安装 WechatSync 扩展',
          href: bridge.installUrl,
          description: '先在本地浏览器安装发布扩展。',
        },
        {
          id: randomUUID(),
          label: '查看桥接说明',
          href: 'https://github.com/wechatsync/Wechatsync/tree/master/packages/mcp-server',
          description: '确认远程桥接地址、Token 和扩展设置一致。',
        },
      );
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run,
      };
    }

    if (!sessionStatus.connected) {
      run.summary = '桥接服务已在线，但还没有收到浏览器扩展连接。';
      run.steps.push({
        id: randomUUID(),
        title: '等待浏览器扩展连入',
        detail: '请在本地浏览器打开扩展设置，启用桥接连接并确认当前账号已登录对应平台。',
        status: 'needs_action',
      });
      run.actions.push(
        {
          id: randomUUID(),
          label: '安装 WechatSync 扩展',
          href: bridge.installUrl,
          description: '本地浏览器没有扩展时先安装。',
        },
        {
          id: randomUUID(),
          label: '查看桥接说明',
          href: 'https://github.com/wechatsync/Wechatsync/tree/master/packages/mcp-server',
          description: '开启扩展里的桥接功能后，再回来继续执行。',
        },
      );
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run,
      };
    }

    const connections = await this.syncCreatorPlatformConnectionsFromBridge(input.brand, input.userId, {
      session,
      sessionStatus,
      forceRefresh: wantsStatus || wantsLogin || wantsPublish,
    });

    run.toolCalls.push({
      id: randomUUID(),
      name: 'list_platforms',
      status: 'success',
      summary: connections.length
        ? `已同步 ${connections.length} 个已登录平台账号。`
        : '扩展已连接，但当前还没有同步到已登录的平台账号。',
      input: {
        forceRefresh: wantsStatus || wantsLogin || wantsPublish,
      },
      output: connections,
    });

    const authenticatedLookup = new Map(
      connections.map((item) => [this.normalizeCreatorPlatformKey(item.platform), item]),
    );
    const unauthenticatedPlatforms = targetPlatforms.filter(
      (item) => !authenticatedLookup.has(this.normalizeCreatorPlatformKey(item.id)),
    );

    if (targetPlatforms.length > 0) {
      for (const platform of targetPlatforms) {
        const connected = authenticatedLookup.get(this.normalizeCreatorPlatformKey(platform.id));
        run.toolCalls.push({
          id: randomUUID(),
          name: 'check_auth',
          status: connected ? 'success' : 'blocked',
          summary: connected
            ? `${platform.name} 已登录${connected.accountName ? `：${connected.accountName}` : ''}`
            : `${platform.name} 当前未登录`,
          input: {
            platform: platform.id,
          },
          output: connected || null,
        });
      }
    }

    if (unauthenticatedPlatforms.length > 0) {
      run.steps.push({
        id: randomUUID(),
        title: '检查平台登录状态',
        detail: `以下平台还没有登录：${unauthenticatedPlatforms.map((item) => item.name).join('、')}`,
        status: 'needs_action',
      });
      run.actions.push(
        ...unauthenticatedPlatforms.map((item) => ({
          id: randomUUID(),
          label: `登录 ${item.name}`,
          href: this.getPlatformHomepage(item.id),
          description: '在本地浏览器完成登录后，再回来继续执行发布。',
          platform: item.id,
        })),
      );
    } else {
      const readyPlatforms =
        targetPlatforms.length > 0
          ? targetPlatforms.map((item) => item.name)
          : connections.map((item) => item.platformLabel || this.getPlatformLabel(item.platform));

      run.steps.push({
        id: randomUUID(),
        title: '检查平台登录状态',
        detail: readyPlatforms.length
          ? `当前已就绪：${readyPlatforms.join('、')}`
          : '当前扩展已连接，可继续选择目标平台。',
        status: 'completed',
      });
    }

    if (wantsPlatformData) {
      const refreshResult = await this.refreshPlatformData(input.userId, input.brand.id, {
        platforms: targetPlatforms.map((item) => item.id),
        forceRefresh: true,
      });

      run.toolCalls.push({
        id: randomUUID(),
        name: 'refresh_platform_data',
        status: refreshResult.ok ? 'success' : 'error',
        summary: refreshResult.summary || refreshResult.message || '平台数据刷新完成。',
        input: {
          platforms: targetPlatforms.map((item) => item.id),
          forceRefresh: true,
        },
        output: refreshResult,
      });

      run.summary = refreshResult.summary || refreshResult.message || '平台数据刷新完成。';
      run.status = refreshResult.ok ? 'completed' : 'failed';
      run.steps.push({
        id: randomUUID(),
        title: '抓取平台数据',
        detail: run.summary,
        status: refreshResult.ok ? 'completed' : 'failed',
      });

      return {
        assistantText: this.buildPlatformDataAssistantText(input.brand.name, run),
        run,
      };
    }

    if (!wantsPublish) {
      const authenticatedNames = connections.map(
        (item) => item.platformLabel || this.getPlatformLabel(item.platform),
      );
      run.summary = authenticatedNames.length
        ? `已检查平台状态，可直接继续发布到：${authenticatedNames.join('、')}`
        : '桥接连接正常，但当前还没有识别到已登录的平台账号。';
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run,
      };
    }

    const article =
      this.extractArticleFromCodexPlan(codexPlan) ||
      this.extractArticleFromConversation(input.message, input.history);

    if (!article) {
      run.summary = '已经完成发布环境检查，但还缺少可投递的标题和正文。';
      run.steps.push({
        id: randomUUID(),
        title: '等待文章内容',
        detail: codexPlan?.missingFields.length
          ? `当前缺少：${codexPlan.missingFields.join('、')}。请按“标题：… 正文：…”补充完整内容。`
          : '请按“标题：… 正文：…”补充完整内容，我就可以继续投递到目标平台。',
        status: 'needs_action',
      });
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run,
      };
    }

    if (targetPlatforms.length === 0) {
      run.summary = '发布正文已经准备好了，但你还没有指定目标平台。';
      run.steps.push({
        id: randomUUID(),
        title: '等待目标平台',
        detail: '请直接告诉我要发到哪些平台，比如“发布到知乎和小红书”。',
        status: 'needs_action',
      });
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run,
      };
    }

    if (unauthenticatedPlatforms.length > 0) {
      run.summary = '发布动作已就绪，但部分目标平台未登录，暂时无法继续投递。';
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run,
      };
    }

    if (input.requireConfirmation && !input.executeConfirmed) {
      run.summary = `发布前检查已经完成，准备把内容投递到 ${targetPlatforms
        .map((item) => item.name)
        .join('、')}。当前处于 Chat 模式，真正执行前需要切换到 Agent 模式并确认。`;
      run.steps.push({
        id: randomUUID(),
        title: '等待切换到 Agent 模式',
        detail:
          codexPlan?.confirmationNote ||
          '这是 Chat 模式下的执行保护。切换到 Agent 模式并确认后，我再真正创建平台草稿。',
        status: 'needs_action',
      });
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run,
        confirmationRequest: {
          id: randomUUID(),
          title: '切换到 Agent 并执行媒体发布',
          description: `将切换到 Agent 模式，把这篇内容投递到 ${targetPlatforms
            .map((item) => item.name)
            .join('、')}，并在各平台创建草稿。${codexPlan?.confirmationNote ? ` ${codexPlan.confirmationNote}` : ''}`,
          confirmLabel: '切换到 Agent 并执行',
          message: input.message,
          history: input.history,
        } satisfies AgentConfirmationRequest,
      };
    }

    const bridgeBaseUrl = this.getWechatSyncBridgeBaseUrl();
    let syncResults: Array<Record<string, any>> = [];

    try {
      const syncResponse = await this.requestWechatSyncBridge(
        bridgeBaseUrl,
        session.public_id,
        'syncArticle',
        {
          platforms: targetPlatforms.map((item) => item.id),
          article: {
            title: article.title,
            markdown: article.markdown,
            content: article.markdown,
          },
        },
      );

      syncResults = Array.isArray(syncResponse)
        ? syncResponse
        : Array.isArray((syncResponse as Record<string, unknown> | null)?.results)
          ? (((syncResponse as Record<string, unknown>).results as unknown[]) || []) as Array<Record<string, any>>
          : Array.isArray((syncResponse as Record<string, unknown> | null)?.syncResults)
            ? (((syncResponse as Record<string, unknown>).syncResults as unknown[]) || []) as Array<Record<string, any>>
            : syncResponse && typeof syncResponse === 'object'
              ? [syncResponse as Record<string, any>]
              : [];

      const syncSucceeded = syncResults.length > 0 && syncResults.every((item) => item?.success);
      run.toolCalls.push({
        id: randomUUID(),
        name: 'sync_article',
        status: syncSucceeded ? 'success' : 'error',
        summary: syncSucceeded
          ? `已创建 ${syncResults.length} 个平台草稿。`
          : syncResults.length
            ? '部分平台创建草稿失败，请查看返回结果。'
            : '平台返回了空的同步结果，请检查扩展返回结构。',
        input: {
          platforms: targetPlatforms.map((item) => item.id),
          title: article.title,
        },
        output: syncResponse,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '调用 sync_article 失败，请稍后重试。';
      run.summary = detail;
      run.toolCalls.push({
        id: randomUUID(),
        name: 'sync_article',
        status: 'error',
        summary: detail,
      });
      run.steps.push({
        id: randomUUID(),
        title: '创建平台草稿',
        detail,
        status: 'failed',
      });
      return {
        assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
        run: {
          ...run,
          status: 'failed',
        },
      };
    }

    const failedPlatforms = syncResults.filter((item) => !item?.success);
    const successfulPlatforms = syncResults.filter((item) => item?.success);

    run.steps.push({
      id: randomUUID(),
      title: '创建平台草稿',
      detail:
        failedPlatforms.length === 0
          ? `已在 ${successfulPlatforms
              .map((item) => this.getPlatformLabel(String(item.platform || '')))
              .join('、')} 创建草稿。`
          : `已成功 ${successfulPlatforms.length} 个，失败 ${failedPlatforms.length} 个。`,
      status: failedPlatforms.length === 0 ? 'completed' : 'failed',
    });

    run.actions.push(
      ...successfulPlatforms
        .filter((item) => typeof item?.postUrl === 'string' && item.postUrl.trim())
        .map((item) => ({
          id: randomUUID(),
          label: `查看 ${this.getPlatformLabel(String(item.platform || ''))} 草稿`,
          href: String(item.postUrl),
          description: '打开平台草稿页继续润色或提交。',
          platform: String(item.platform || ''),
        })),
    );

    if (failedPlatforms.length > 0) {
      run.summary = `草稿投递已执行，但还有 ${failedPlatforms.length} 个平台失败。`;
      run.status = 'failed';
    } else {
      run.summary = `媒体发布链路已跑通，${successfulPlatforms.length} 个平台草稿已经创建完成。`;
      run.status = 'completed';
    }

    return {
      assistantText: this.buildMediaPublishAssistantText(input.brand.name, run),
      run,
    };
  }

  async listMiaosheChatUploads(userId: string, brandId: string, threadId?: string) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const normalizedThreadId = (threadId || '').trim();
    if (!normalizedThreadId) {
      return { uploads: [] };
    }
    const rows = await this.mysqlService.query<MiaosheChatUploadRow[]>(
      `SELECT * FROM monitor_miaoshe_chat_uploads
       WHERE brand_id = ? AND thread_id = ?
       ORDER BY created_at ASC`,
      [brand.id, normalizedThreadId],
    );
    return {
      uploads: rows.map((row) => this.mapMiaosheChatUpload(row)),
    };
  }

  async listMediaAssets(
    userId: string,
    brandId: string,
    input?: { type?: string; limit?: string | number },
  ) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const type = this.normalizeMediaAssetFilterType(input?.type);
    const limit = this.normalizeMediaAssetLimit(input?.limit);
    const rows = await this.mysqlService.query<MediaAssetRow[]>(
      `SELECT *
       FROM monitor_media_assets
       WHERE brand_id = ?
         AND asset_type IN ('image', 'video')
         ${type ? 'AND asset_type = ?' : ''}
       ORDER BY created_at DESC
       LIMIT ?`,
      type ? [brand.id, type, limit] : [brand.id, limit],
    );

    const assets: Array<{
      id: string;
      type: 'image' | 'video';
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      source: string;
      createdAt: number;
    }> = [];
    const seenUrls = new Set<string>();

    for (const row of rows) {
      const assetType = row.asset_type === 'video' ? 'video' : row.asset_type === 'image' ? 'image' : null;
      if (!assetType) {
        continue;
      }
      if (seenUrls.has(row.asset_url)) {
        continue;
      }
      seenUrls.add(row.asset_url);
      assets.push({
        id: row.id,
        type: assetType,
        url: this.normalizeMiaosheMediaAssetUrl(row.asset_url),
        thumbnailUrl: this.normalizeMiaosheMediaAssetUrl(row.thumbnail_url || row.asset_url),
        title: row.title || (assetType === 'video' ? '视频素材' : '图片素材'),
        mimeType: row.mime_type || (assetType === 'video' ? 'video/mp4' : 'image/png'),
        source: row.source || '素材库',
        createdAt: Date.parse(this.toIso(row.created_at)),
      });
    }

    if (assets.length >= limit) {
      return { assets: assets.slice(0, limit) };
    }

    const legacyRows = await this.mysqlService.query<MiaosheChatUploadRow[]>(
      `SELECT * FROM monitor_miaoshe_chat_uploads
       WHERE brand_id = ?
       ORDER BY created_at DESC
       LIMIT 400`,
      [brand.id],
    );

    for (const row of legacyRows) {
      const attachments = this.parseMiaosheAttachments(row.attachments_json);
      const createdAt = Date.parse(this.toIso(row.created_at));
      for (const attachment of attachments) {
        const assetType = this.detectMediaAssetType(attachment.mimeType, attachment.type, attachment.url);
        if (!assetType) {
          continue;
        }
        if (type && assetType !== type) {
          continue;
        }
        if (seenUrls.has(attachment.url)) {
          continue;
        }
        seenUrls.add(attachment.url);
        assets.push({
          id: `${row.id}:${attachment.url}`,
          type: assetType,
          url: attachment.url,
          thumbnailUrl: attachment.thumbnailUrl || attachment.url,
          title: attachment.title || (assetType === 'video' ? '视频素材' : '图片素材'),
          mimeType: attachment.mimeType || (assetType === 'video' ? 'video/mp4' : 'image/png'),
          source: '素材库',
          createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        });
        if (assets.length >= limit) {
          return { assets };
        }
      }
    }

    return { assets };
  }

  async uploadMediaAssets(
    userId: string,
    brandId: string,
    files?: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }>,
  ) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const selectedFiles = Array.isArray(files) ? files.filter((file) => file?.buffer?.length > 0) : [];

    if (!selectedFiles.length) {
      throw new BadRequestException('请选择要上传的图片或文件');
    }

    const assets = [];
    for (const file of selectedFiles.slice(0, 50)) {
      assets.push(await this.persistMiaosheMediaAsset(userId, brand.id, file));
    }

    return { assets };
  }

  async getPlatformDataStatus(userId: string, brandId: string) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const session = await this.getOrCreateWechatSyncBridgeSession(userId, brand.organization_id);
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    const connections = await this.syncCreatorPlatformConnectionsFromBridge(brand, userId, {
      session,
      sessionStatus,
      forceRefresh: false,
    });

    return {
      bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
      connections,
    };
  }

  async refreshPlatformData(
    userId: string,
    brandId: string,
    input?: { platforms?: string[]; forceRefresh?: boolean },
  ) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const normalizedPlatforms = this.normalizeRequestedPlatforms(input?.platforms);
    const session = await this.getOrCreateWechatSyncBridgeSession(userId, brand.organization_id);
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    const job = await this.createCreatorPlatformJob({
      organizationId: brand.organization_id,
      userId,
      brandId: brand.id,
      bridgeSessionPublicId: session.public_id,
      requestedPlatforms: normalizedPlatforms,
    });

    if (!sessionStatus.connected) {
      const summary = '发布扩展当前未连接，后端暂时不能代你进入创作者后台抓取数据。';
      await this.finishCreatorPlatformJob(job.id, {
        status: 'needs_connection',
        summary,
        errorMessage: sessionStatus.error || 'Extension not connected',
        result: {
          bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
          connections: [],
          snapshots: [],
        },
      });

      return {
        ok: false,
        jobId: job.id,
        message: summary,
        bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
        connections: [],
        snapshots: [],
      };
    }

    const connections = await this.syncCreatorPlatformConnectionsFromBridge(brand, userId, {
      session,
      sessionStatus,
      forceRefresh: input?.forceRefresh !== false,
    });
    const targetConnections = this.filterCreatorPlatformConnections(connections, normalizedPlatforms);
    const snapshots: Array<Record<string, unknown>> = [];

    for (const connection of targetConnections) {
      const snapshot = await this.captureCreatorPlatformSnapshot({
        brand,
        userId,
        connection,
        session,
      });
      snapshots.push(snapshot);
    }

    const summary = this.buildCreatorPlatformRefreshSummary(snapshots);
    await this.finishCreatorPlatformJob(job.id, {
      status: snapshots.some((item) => item.status === 'success') ? 'completed' : 'failed',
      summary,
      result: {
        bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
        connections,
        snapshots,
      },
    });

    return {
      ok: snapshots.some((item) => item.status === 'success'),
      jobId: job.id,
      summary,
      bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
      connections,
      snapshots,
    };
  }

  async getPlatformDataReport(
    userId: string,
    brandId: string,
    input?: { platforms?: string[]; days?: string | number },
  ) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const days = this.normalizeToolDays(input?.days, 30);
    const normalizedPlatforms = this.normalizeRequestedPlatforms(input?.platforms);
    const [connections, snapshots] = await Promise.all([
      this.findCreatorPlatformConnections(brand.id, userId, normalizedPlatforms),
      this.findLatestCreatorPlatformSnapshots(brand.id, userId, normalizedPlatforms, days),
    ]);

    return {
      ok: true,
      brandId: brand.id,
      brandName: brand.name,
      periodDays: days,
      connectionCount: connections.length,
      snapshotCount: snapshots.length,
      connections,
      snapshots,
      summary: this.buildCreatorPlatformReportSummary(connections, snapshots, days),
    };
  }

  async layoutMiaosheMarkdown(
    userId: string,
    brandId: string,
    input: { title?: string; markdown?: string; targetPlatform?: string },
  ) {
    const brand = await this.assertBrandAccess(brandId, userId);
    const domains = await this.findBrandDomains(brandId);
    const title = String(input.title || '').trim();
    const markdown = String(input.markdown || '');
    const targetPlatform = String(input.targetPlatform || 'generic-article').trim() || 'generic-article';

    if (!title && !markdown.trim()) {
      throw new BadRequestException('请先填写标题或正文，再执行智能排版');
    }

    const raw = await this.requestMiaosheLayoutAssistant({
      brand,
      domains,
      title,
      markdown,
      targetPlatform,
    });

    const parsed = this.extractStructuredLayoutResult(raw);
    const nextTitle = this.normalizeTitle(parsed?.title || title);
    const nextMarkdown = this.normalizePublishMarkdown(parsed?.markdown || markdown || raw);

    if (!nextMarkdown.trim()) {
      throw new BadGatewayException('智能排版暂时没有返回可用正文，请稍后重试');
    }

    return {
      title: nextTitle,
      markdown: nextMarkdown,
      targetPlatform,
    };
  }

  private async requestAssistant(input: {
    brand: BrandRow;
    domains: BrandDomainRow[];
    draftTitle: string;
    draftContent: string;
    customContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const apiKey = this.configService.get<string>('VECTORENGINE_API_KEY');
    if (!apiKey) {
      throw new BadGatewayException('内容生成模型未配置，请先配置 VECTORENGINE_API_KEY');
    }

    const model = this.configService.get<string>('CONTENT_STUDIO_MODEL', 'deepseek-v4-flash');
    const baseUrl = this.normalizeBaseUrl(
      this.configService.get<string>('VECTORENGINE_BASE_URL', 'https://api.vectorengine.ai/v1'),
    );
    const history = [...input.history];
    if (input.customContext) {
      history.push({
        role: 'user',
        content: `执行要求：\n${input.customContext}`,
      });
    }

    return this.requestMiaosheTextWithTools({
      systemPrompt:
        '你是妙设AIO的中文内容协同写作助手。你的任务是帮助品牌团队写出可直接发布的高质量内容。' +
        '回答必须使用中文，结构清晰、业务导向、避免空话。' +
        '当你给出“可直接应用到正文”的完整稿件、段落、大纲、标题方案时，请务必把主要结果放进 ```markdown 代码块```，方便前端一键应用。' +
        '如果用户只是咨询思路，可先正常回答，再按需要补充代码块。',
      brandContext: await this.buildBrandContext(
        input.brand,
        input.domains,
        input.draftTitle,
        input.draftContent,
      ),
      brand: input.brand,
      domains: input.domains,
      history,
      protocol: 'openai',
      apiKey,
      model,
      baseUrl,
      temperature: 0.7,
      maxTokens: 1800,
    });
  }

  private async requestMiaosheLayoutAssistant(input: {
    brand: BrandRow;
    domains: BrandDomainRow[];
    title: string;
    markdown: string;
    targetPlatform: string;
  }) {
    const platformLabel = this.describeLayoutTargetPlatform(input.targetPlatform);
    const systemPrompt = [
      '你是妙设AIO的中文内容发布排版助手。',
      '你的任务是把用户提供的 Markdown 草稿整理成适合正式发布的内容稿。',
      '你只能优化结构、层级、段落、列表、强调、导语和结尾，不能编造事实，不能改变核心观点，不能加入不存在的数据、案例、引述或承诺。',
      '默认面向中文图文平台发布场景，重点兼顾公众号、头条、知乎等内容平台的可读性。',
      '输出必须是合法 JSON，对象结构固定为 {"title":"...","markdown":"..."}。',
      '不要输出 Markdown 代码块，不要输出解释，不要输出前后缀。',
      'markdown 字段必须是完整正文，保留 Markdown 语法。',
      '如果原文正文已经包含与标题重复的顶级 H1，请在排版结果中去掉重复标题，避免发布时标题重复。',
      '优先做到：短段落、明确小标题、自然导语、重点句适度加粗、并列信息列表化、结尾收束清晰。',
      `本次目标发布场景：${platformLabel}。`,
    ].join('');

    const brandContext = await this.buildMiaosheBrandContext(input.brand, input.domains, '');
    const userPrompt = [
      '请对下面这篇文章做“可直接发布”的智能排版。',
      '排版要求：',
      '1. 保持原始事实与观点，不扩写虚构信息。',
      '2. 优化标题层级，必要时补充二级/三级标题。',
      '3. 将过长段落拆成更适合阅读的短段。',
      '4. 将并列信息改写为项目符号或编号列表（确有必要时）。',
      '5. 在不花哨、不堆砌 emoji 的前提下，提升发布可读性和节奏感。',
      '6. 不要输出 HTML，只输出最终 JSON。',
      `文章标题：${input.title || '未命名文章'}`,
      `文章正文：\n${input.markdown || '（当前正文为空）'}`,
    ].join('\n');

    return this.requestMiaosheText({
      systemPrompt,
      brandContext,
      history: [{ role: 'user', content: userPrompt }],
      temperature: 0.35,
      maxTokens: 2600,
    });
  }

  private async requestMiaosheAssistant(input: {
    userId: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    workspaceContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const config = await this.buildMiaosheAssistantConfig(input);
    const maxTokens = this.getMiaosheMaxOutputTokens(input.mode);

    return this.requestMiaosheTextWithTools({
      mode: input.mode,
      systemPrompt: config.systemPrompt,
      brandContext: config.brandContext,
      userId: input.userId,
      brand: input.brand,
      domains: input.domains,
      history: input.history,
      protocol: config.protocol,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      temperature: 0.7,
      maxTokens,
      timeoutMs: this.getMiaosheRequestTimeoutMs(input.mode),
    });
  }

  private async requestMiaosheTextWithTools(input: {
    mode?: 'chat' | 'agent';
    systemPrompt: string;
    brandContext: string;
    userId?: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    protocol?: 'openai' | 'anthropic';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }) {
    const protocol =
      input.protocol ||
      this.normalizeChatProtocol(this.configService.get<string>('MIAOSHE_CHAT_PROTOCOL') || 'openai');
    const maxTokens = input.maxTokens || this.getMiaosheMaxOutputTokens(input.mode);
    const history = this.fitMiaosheHistoryWithinContext({
      history: input.history,
      mode: input.mode,
      reservedOutputTokens: maxTokens,
      contextParts: [
        input.systemPrompt,
        input.brandContext,
        this.buildMiaosheToolUsagePrompt(),
      ],
    });
    const nextInput = {
      ...input,
      history,
      maxTokens,
    };

    try {
      if (protocol === 'anthropic') {
        return await this.requestMiaosheAnthropicWithTools(nextInput);
      }
      return await this.requestMiaosheOpenAiWithTools(nextInput);
    } catch (error) {
      const message =
        error instanceof BadGatewayException
          ? String((error as any)?.message || '')
          : String((error as Error)?.message || '');
      if (this.shouldFallbackToPlainMiaosheResponse(message)) {
        return this.requestMiaosheText({
          systemPrompt: nextInput.systemPrompt,
          brandContext: nextInput.brandContext,
          history: nextInput.history,
          protocol: nextInput.protocol,
          apiKey: nextInput.apiKey,
          model: nextInput.model,
          baseUrl: nextInput.baseUrl,
          temperature: nextInput.temperature,
          maxTokens: nextInput.maxTokens,
          timeoutMs: nextInput.timeoutMs,
        });
      }
      throw error;
    }
  }

  private async requestMiaosheText(input: {
    systemPrompt: string;
    brandContext: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    protocol?: 'openai' | 'anthropic';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }) {
    const apiKey =
      input.apiKey ||
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      this.configService.get<string>('VECTORENGINE_API_KEY');
    if (!apiKey) {
      throw new BadGatewayException('MiaoSheChat 模型未配置，请先配置 API Key');
    }

    const model = input.model || this.configService.get<string>('MIAOSHE_CHAT_MODEL') || 'claude-sonnet-4-6';
    const baseUrl = this.normalizeBaseUrl(
      input.baseUrl ||
        this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
        this.configService.get<string>('VECTORENGINE_BASE_URL') ||
        'https://api.vectorengine.ai/v1',
    );
    const protocol =
      input.protocol ||
      this.normalizeChatProtocol(this.configService.get<string>('MIAOSHE_CHAT_PROTOCOL') || 'openai');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? this.getMiaosheRequestTimeoutMs(),
    );

    try {
      if (protocol === 'anthropic') {
        const anthropicMessages: AnthropicMessage[] = [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: input.brandContext,
              },
            ],
          },
          ...input.history.map((item) => ({
            role: item.role,
            content: [
              {
                type: 'text' as const,
                text: item.content,
              },
            ],
          })),
        ];

        const response = await fetch(`${baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: input.maxTokens || 1400,
            temperature: input.temperature ?? 0.7,
            system: input.systemPrompt,
            messages: anthropicMessages,
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        const content = this.extractAnthropicContent(payload);

        if (!response.ok || !content) {
          throw new BadGatewayException(
            payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
          );
        }

        return content;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: input.temperature ?? 0.7,
          max_tokens: input.maxTokens || this.getMiaosheMaxOutputTokens(),
          messages: [
            {
              role: 'system',
              content: `${input.systemPrompt}\n\n${input.brandContext}`,
            },
            ...input.history,
          ],
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      const content =
        payload?.choices?.[0]?.message?.content ||
        payload?.choices?.[0]?.text ||
        payload?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part?.text || '')
          .join('') ||
        '';

      if (!response.ok || !content.trim()) {
        throw new BadGatewayException(
          payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
        );
      }

      return content.trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestMiaosheOpenAiWithTools(input: {
    mode?: 'chat' | 'agent';
    systemPrompt: string;
    brandContext: string;
    userId?: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    protocol?: 'openai' | 'anthropic';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }) {
    const apiKey =
      input.apiKey ||
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      this.configService.get<string>('VECTORENGINE_API_KEY');
    if (!apiKey) {
      throw new BadGatewayException('MiaoSheChat 模型未配置，请先配置 API Key');
    }

    const model = input.model || this.configService.get<string>('MIAOSHE_CHAT_MODEL') || 'claude-sonnet-4-6';
    const baseUrl = this.normalizeBaseUrl(
      input.baseUrl ||
        this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
        this.configService.get<string>('VECTORENGINE_BASE_URL') ||
        'https://api.vectorengine.ai/v1',
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? this.getMiaosheRequestTimeoutMs(input.mode),
    );
    const messages: Array<Record<string, unknown>> = [
      {
        role: 'system',
        content: `${input.systemPrompt}\n\n${input.brandContext}\n\n${this.buildMiaosheToolUsagePrompt()}`,
      },
      ...input.history.map((item) => ({
        role: item.role,
        content: item.content,
      })),
    ];

    try {
      for (let iteration = 0; iteration < 4; iteration += 1) {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: input.temperature ?? 0.7,
            max_tokens: input.maxTokens || 1400,
            messages,
            tools: this.buildOpenAiBrandIntelligenceTools(),
            tool_choice: 'auto',
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        const message = payload?.choices?.[0]?.message;
        if (!response.ok || !message) {
          throw new BadGatewayException(
            payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
          );
        }

        const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
        const assistantContent = this.extractOpenAiMessageText(message);

        if (toolCalls.length === 0) {
          if (assistantContent) {
            return assistantContent;
          }
          throw new BadGatewayException('MiaoSheChat 暂时没有返回可用内容');
        }

        messages.push({
          role: 'assistant',
          content: assistantContent || '',
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const toolName = String(toolCall?.function?.name || '').trim() as BrandIntelligenceToolName;
          const rawArguments = String(toolCall?.function?.arguments || '{}');
          const toolResult = await this.executeBrandIntelligenceTool(
            input.brand,
            input.domains,
            toolName,
            rawArguments,
            input.userId,
          );

          messages.push({
            role: 'tool',
            tool_call_id: String(toolCall?.id || randomUUID()),
            content: JSON.stringify(toolResult),
          });
        }
      }

      throw new BadGatewayException('MiaoSheChat 工具调用轮次超限，请稍后重试');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestMiaosheAnthropicWithTools(input: {
    mode?: 'chat' | 'agent';
    systemPrompt: string;
    brandContext: string;
    userId?: string;
    brand: BrandRow;
    domains: BrandDomainRow[];
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    protocol?: 'openai' | 'anthropic';
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }) {
    const apiKey =
      input.apiKey ||
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      this.configService.get<string>('VECTORENGINE_API_KEY');
    if (!apiKey) {
      throw new BadGatewayException('MiaoSheChat 模型未配置，请先配置 API Key');
    }

    const model = input.model || this.configService.get<string>('MIAOSHE_CHAT_MODEL') || 'claude-sonnet-4-6';
    const baseUrl = this.normalizeBaseUrl(
      input.baseUrl ||
        this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
        this.configService.get<string>('VECTORENGINE_BASE_URL') ||
        'https://api.vectorengine.ai/v1',
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? this.getMiaosheRequestTimeoutMs(input.mode),
    );
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: input.brandContext,
          },
        ],
      },
      ...input.history.map((item) => ({
        role: item.role,
        content: [
          {
            type: 'text' as const,
            text: item.content,
          },
        ],
      })),
    ];

    try {
      for (let iteration = 0; iteration < 4; iteration += 1) {
        const response = await fetch(`${baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: input.maxTokens || 1400,
            temperature: input.temperature ?? 0.7,
            system: `${input.systemPrompt}\n\n${this.buildMiaosheToolUsagePrompt()}`,
            messages,
            tools: this.buildAnthropicBrandIntelligenceTools(),
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({}));
        const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
        if (!response.ok || contentBlocks.length === 0) {
          throw new BadGatewayException(
            payload?.error?.message || payload?.message || 'MiaoSheChat 调用失败，请稍后重试',
          );
        }

        const normalizedBlocks = this.normalizeAnthropicContentBlocks(contentBlocks);
        const toolUses = normalizedBlocks.filter(
          (block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use',
        );
        const textContent = normalizedBlocks
          .filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text')
          .map((block) => block.text)
          .join('')
          .trim();

        messages.push({
          role: 'assistant',
          content: normalizedBlocks,
        });

        if (toolUses.length === 0) {
          if (textContent) {
            return textContent;
          }
          throw new BadGatewayException('MiaoSheChat 暂时没有返回可用内容');
        }

        const toolResults: AnthropicContentBlock[] = [];
        for (const toolUse of toolUses) {
          const toolResult = await this.executeBrandIntelligenceTool(
            input.brand,
            input.domains,
            toolUse.name as BrandIntelligenceToolName,
            toolUse.input || {},
            input.userId,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(toolResult),
          });
        }

        messages.push({
          role: 'user',
          content: toolResults,
        });
      }

      throw new BadGatewayException('MiaoSheChat 工具调用轮次超限，请稍后重试');
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildMiaosheToolUsagePrompt() {
    return [
      '你可以调用内部品牌情报工具查询实时数据库、品牌监测数据和已连接创作者平台数据。',
      '你可以帮助用户查看和分析已支持平台的数据。平台数据不是由你直接打开网页读取，而是通过当前用户已连接的发布扩展、浏览器登录态和后端内部工具完成查询、刷新与入库。',
      '当前平台数据能力支持/可识别的平台包括：微信公众号、知乎、微博、小红书、头条号、抖音、B站、掘金、CSDN、简书、百家号、豆瓣、X。如果工具结果返回其他已连接平台，也可以基于工具结果回答。',
      '当用户的问题涉及答案引擎洞察、主题、提示词、引用、AI 流量、竞争对手、竞品页面、内容优先级或增长判断时，优先调用工具，不要只依赖已有上下文猜测。',
      '当用户的问题涉及创作者后台数据、账号表现、作品数据、播放量、阅读量、曝光、互动、点赞、评论、收藏、转发、粉丝、爆文、内容复盘、平台诊断或数据报告时，应调用平台数据工具，而不是回答“我无法查看后台”。',
      '如果用户问“能不能看/帮我看某个平台数据”，先调用 get_brand_creator_platform_status 确认桥接扩展和账号连接状态；如果用户要看最新数据或做分析，调用 refresh_brand_creator_platform_data 刷新数据，再基于返回结果回答。',
      '如果工具返回桥接未连接、平台未登录、未抓到数据或数据库暂无足够数据，要明确说明具体状态和下一步动作，不要编造，也不要让用户先截图或手动导出，除非工具结果明确表示当前链路无法自动读取。',
      '回答时尽量引用工具结果里的时间范围、数量、比例、页面或平台名称。',
    ].join('\n');
  }

  private buildMiaosheConversationSkillPrompt() {
    return [
      '你现在处在 MiaoShe Chat / Agent 的统一主会话里。',
      '你可以按需调用内部技能列表，但不要为调用而调用。',
      '普通闲聊、思路讨论、写作建议、文章草稿、内容改写、结构化排版，直接回答即可，不需要调用技能。',
      'MiaoShe Chat 现在既支持图片生成，也支持视频生成。用户如果问“你能不能生成图片/视频”时，要明确回答可以，不要再说自己不能直接生成视频。',
      '如果用户想生成图片、做图、参考图生图，但信息还不够，不要急着执行；先像设计师一样继续追问，把内容主体、风格、用途、投放平台、尺寸比例、参考图这些关键信息问清楚。',
      '图片生成和参考图生图都按同一条技能链路处理：先自然追问补齐信息，信息足够后再进入真正的生图技能。',
      '如果用户明确要求多张、多版、多套、多方案或九宫格，回复和触发图片技能时不要丢掉这个数量信息。',
      '图片需求补问时，直接自然地追问即可，不要说“我识别到你的意图”或“进入图片生成工作流”。',
      '如果用户明确就是要开始生图，而且信息已经足够，不要继续追问；先用自然中文简短确认一下，然后在回复最后追加一个独立代码块，格式必须是 ```miaoshe-workflow {"intent":"image_generate"} ``` 或 ```miaoshe-workflow {"intent":"media_edit"} ```。',
      '如果用户想生成视频、文生视频、图生视频、参考图生视频，但信息还不够，也不要急着执行；先自然追问这些关键信息：1. 有没有参考图，或者是否直接使用素材库里的某张图片做参考首帧/主体图；2. 目标时长；3. 清晰度；4. 画幅比例；5. 是否需要音频或口播参考；6. 是否要自己指定视频模型。',
      '视频补问时要主动给用户明确选择：HappyHorse 支持 3 到 15 秒；Wan 2.6 只支持 5 秒、10 秒、15 秒。清晰度优先问 720P 还是 1080P；如果用户还没指定视频模型，除非他明确说“你来定”，否则要主动给出模型选项和推荐。',
      '视频模型说明要说清楚：happyhorse-1.0-t2v 用于文生视频；happyhorse-1.0-i2v 适合单张参考图、首帧和主体更稳；happyhorse-1.0-r2v 适合最多 9 张参考图、强调主体与场景一致性；wan2.6-i2v 适合图生视频和可选音频；wan2.6-i2v-flash 适合更快出结果。',
      '如果用户提到“素材库那张图”“用刚才上传的图”“用某张参考图来做视频”，要把它理解为可以读取上传附件或素材库中的参考图来做图生视频/参考图生视频。',
      '在视频语境里，参考图只是视频生成的输入素材，不等于要先生图。除非用户明确说“先帮我生成一张图/参考图再做视频”，否则不要把视频任务改判成图片生成，也不要主动建议先生图。',
      '如果用户没有指定视频模型但其他信息已经足够，你可以先用一句自然中文把可选模型和默认推荐说出来；如果用户明确说“你决定”或“按推荐来”，再继续生成。',
      '如果用户明确就是要开始生成视频，而且信息已经足够，不要继续追问；先用自然中文简短确认一下，然后在回复最后追加一个独立代码块，格式必须是 ```miaoshe-workflow {"intent":"video_generate"} ```。如果用户明确是先要整理分镜脚本，再考虑生成视频，可以使用 ```miaoshe-workflow {"intent":"video_storyboard"} ```。',
      '只要你在正文里表达“我现在开始生成 / 我马上启动制作 / 请稍等片刻 / 完成后通知你”这类已经进入执行的话术，同一条回复末尾就必须追加对应的 miaoshe-workflow 代码块；如果没有输出代码块，就不要假装已经开始执行。',
      '这个 miaoshe-workflow 代码块用于触发图片或视频技能，不要在正文里解释它，也不要用于文章、数据查询、登录检查或普通问答。',
      '只要问题涉及实时数据、平台状态、扩展连接、账号登录、创作者后台抓数或文章发稿，就优先调用技能，不要凭空猜测。',
      '可调用的品牌洞察技能包括：get_brand_answer_engine_overview、get_brand_topics、get_brand_prompts、get_brand_citations、get_brand_ai_traffic、get_brand_competitors、get_brand_creator_platform_status、refresh_brand_creator_platform_data、get_brand_creator_platform_report。',
      '可调用的平台执行技能包括：ensure_bridge_connection、list_platforms、check_auth、refresh_platform_data、sync_article。',
      '技能规则：检查扩展和桥接是否连通先用 ensure_bridge_connection；同步已登录平台账号用 list_platforms；校验目标平台是否已登录用 check_auth；抓取创作者后台数据用 refresh_platform_data；真正创建平台草稿或发布文章用 sync_article。',
      '如果用户要求发布文章，sync_article 必须拿到 title、markdown 和 platforms，缺一不可。',
      '如果技能返回桥接未连接、平台未登录、缺少参数或执行失败，你要明确说明当前状态和下一步动作，不要编造成功结果。',
      '如果用户只是想写文章、起草内容、做策略分析，不要误用发布技能。',
      '只有当你明确要返回“文章编辑产物”时，才允许在回复最后追加一个独立代码块，格式必须是 ```miaoshe-article {"title":"文章标题","markdown":"Markdown 正文"} ```。',
      '这个 miaoshe-article 代码块只用于文章写作、改写、润色、起标题、结构化排版、内容策划这类任务；普通问答、身份介绍、登录检查、平台诊断、发布反馈时绝对不要输出它。',
      '如果你输出了 miaoshe-article 代码块，正文说明保持简短，真正可编辑的全文放在 markdown 字段里。',
    ].join('\n');
  }

  private buildMiaosheLatestArticleContext(article: {
    title: string;
    markdown: string;
    format: string;
  } | null) {
    if (!article?.title || !article?.markdown) {
      return '';
    }

    return [
      '当前会话最近一篇可直接使用的文章草稿如下。',
      '如果用户说“这篇”“刚才那篇”“用这篇发公众号”，默认就是指这篇文章。',
      `标题：${article.title}`,
      '正文：',
      article.markdown,
    ].join('\n\n');
  }

  private buildOpenAiBrandIntelligenceTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'get_brand_answer_engine_overview',
          description: '查询品牌在答案引擎中的整体表现，包括可见度、提及、引用、推荐率和表现较好的平台。',
          parameters: {
            type: 'object',
            properties: {
              days: {
                type: 'integer',
                description: '统计时间范围，单位天，默认 30 天。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_brand_topics',
          description: '查询品牌当前表现较好的主题，适合做选题、优先级和内容策略判断。',
          parameters: {
            type: 'object',
            properties: {
              days: {
                type: 'integer',
                description: '统计时间范围，单位天，默认 30 天。',
              },
              limit: {
                type: 'integer',
                description: '返回主题数量，默认 5，最大 10。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_brand_prompts',
          description: '查询品牌的核心提示词、机会分、热度和近期开启监测后的表现。',
          parameters: {
            type: 'object',
            properties: {
              limit: {
                type: 'integer',
                description: '返回提示词数量，默认 8，最大 12。',
              },
              days: {
                type: 'integer',
                description: '提示词结果统计时间范围，单位天，默认 30 天。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_brand_citations',
          description: '查询品牌近期被哪些来源和页面引用，包含自有域名页面的引用情况。',
          parameters: {
            type: 'object',
            properties: {
              days: {
                type: 'integer',
                description: '统计时间范围，单位天，默认 30 天。',
              },
              limit: {
                type: 'integer',
                description: '返回页面数量，默认 10，最大 20。',
              },
              ownedOnly: {
                type: 'boolean',
                description: '是否只返回品牌自有域名页面。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_brand_ai_traffic',
          description: '查询品牌来自 AI 搜索或答案引擎的引荐流量，包括来源平台和承接页面。',
          parameters: {
            type: 'object',
            properties: {
              days: {
                type: 'integer',
                description: '统计时间范围，单位天，默认 30 天。',
              },
              limit: {
                type: 'integer',
                description: '返回平台和页面数量，默认 5，最大 10。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_brand_competitors',
          description: '查询品牌的主要竞争对手、被提及与被引用情况，以及竞品被引用较多的页面。',
          parameters: {
            type: 'object',
            properties: {
              days: {
                type: 'integer',
                description: '统计时间范围，单位天，默认 30 天。',
              },
              limit: {
                type: 'integer',
                description: '返回竞品数量，默认 5，最大 10。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_brand_creator_platform_status',
          description:
            '查询当前用户的发布扩展桥接状态、已登录/已连接的创作者平台账号和最近一次同步状态。当用户问能否查看某个平台数据、平台是否已连接、为什么看不了数据时，应先调用此工具。',
          parameters: {
            type: 'object',
            properties: {
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '可选，平台列表，例如 wechat_official_account、zhihu、xiaohongshu、weibo、toutiao、douyin、bilibili、juejin、csdn、jianshu、baijiahao、douban、x。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'refresh_brand_creator_platform_data',
          description:
            '通过当前用户已连接的发布扩展和浏览器登录态，打开/读取对应创作者平台后台，刷新账号、作品、流量、互动、粉丝等平台数据并写入数据库。当用户请求查看最新作品数据、后台数据、账号表现、播放/阅读/互动、爆文复盘或平台数据分析时，应调用此工具。',
          parameters: {
            type: 'object',
            properties: {
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '可选，指定要抓取的平台列表，例如 douyin、wechat_official_account、xiaohongshu、toutiao、bilibili 等。不确定平台时可留空，让后端按已连接账号处理。',
              },
              forceRefresh: {
                type: 'boolean',
                description: '是否强制刷新平台连接状态后再抓取数据。用户要看最新数据时通常设为 true。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_brand_creator_platform_report',
          description:
            '读取数据库中已经抓取的创作者平台快照，返回适合复盘、诊断和报告生成的结构化数据。当用户要看历史平台数据、已同步数据报告、近几天表现或刷新失败后需要查看已有数据时调用。',
          parameters: {
            type: 'object',
            properties: {
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '可选，指定要查看的平台列表，例如 douyin、wechat_official_account、xiaohongshu、toutiao、bilibili 等。',
              },
              days: {
                type: 'integer',
                description: '统计时间范围，单位天，默认 30 天。',
              },
            },
          },
        },
      },
    ];
  }

  private buildOpenAiMiaosheConversationTools() {
    return [
      ...this.buildOpenAiBrandIntelligenceTools(),
      {
        type: 'function',
        function: {
          name: 'ensure_bridge_connection',
          description: '检查当前发布扩展与桥接服务是否已经连接成功，适合在发布、同步、登录诊断和抓取平台数据前先调用。',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_platforms',
          description: '同步并列出当前浏览器扩展里已经登录的平台账号列表。',
          parameters: {
            type: 'object',
            properties: {
              forceRefresh: {
                type: 'boolean',
                description: '是否强制刷新扩展侧的平台登录状态，默认 true。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_auth',
          description: '检查目标平台是否已经登录，适合发布前或平台连接诊断时调用。',
          parameters: {
            type: 'object',
            properties: {
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '目标平台 id 列表，例如 wechat_official_account、zhihu、xiaohongshu、weibo、toutiao、douyin、bilibili、juejin、csdn、jianshu、baijiahao、douban、x。',
              },
            },
            required: ['platforms'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'refresh_platform_data',
          description: '抓取创作者后台数据并刷新入库，适合查看最新作品数据、账号数据、播放、阅读、互动等场景。',
          parameters: {
            type: 'object',
            properties: {
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '可选，指定要抓取的平台列表，例如 douyin、wechat_official_account、xiaohongshu、toutiao、bilibili 等。',
              },
              forceRefresh: {
                type: 'boolean',
                description: '是否强制刷新平台连接状态后再抓取数据，默认 true。',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'sync_article',
          description: '把文章标题和正文同步到目标平台，在平台侧创建草稿或继续发稿流程。',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: '文章标题。',
              },
              markdown: {
                type: 'string',
                description: '文章正文 Markdown。',
              },
              platforms: {
                type: 'array',
                items: { type: 'string' },
                description:
                  '目标平台 id 列表，例如 wechat_official_account、zhihu、xiaohongshu、weibo、toutiao、douyin、bilibili、juejin、csdn、jianshu、baijiahao、douban、x。',
              },
            },
            required: ['title', 'markdown', 'platforms'],
          },
        },
      },
    ];
  }

  private buildAnthropicBrandIntelligenceTools() {
    return this.buildOpenAiBrandIntelligenceTools().map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }

  private buildAnthropicMiaosheConversationTools() {
    return this.buildOpenAiMiaosheConversationTools().map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }

  private shouldFallbackToPlainMiaosheResponse(message: string) {
    const normalized = String(message || '').toLowerCase();
    return (
      normalized.includes('tool') ||
      normalized.includes('function') ||
      normalized.includes('unsupported') ||
      normalized.includes('not supported') ||
      normalized.includes('invalid parameter') ||
      normalized.includes('unknown parameter')
    );
  }

  private async executeBrandIntelligenceTool(
    brand: BrandRow,
    domains: BrandDomainRow[],
    toolName: BrandIntelligenceToolName,
    rawArguments: string | Record<string, unknown>,
    userId?: string,
  ) {
    const args = this.parseToolArguments(rawArguments);
    switch (toolName) {
      case 'get_brand_answer_engine_overview':
        return this.getBrandAnswerEngineOverviewTool(brand, args);
      case 'get_brand_topics':
        return this.getBrandTopicsTool(brand, args);
      case 'get_brand_prompts':
        return this.getBrandPromptsTool(brand, args);
      case 'get_brand_citations':
        return this.getBrandCitationsTool(brand, domains, args);
      case 'get_brand_ai_traffic':
        return this.getBrandAiTrafficTool(brand, args);
      case 'get_brand_competitors':
        return this.getBrandCompetitorsTool(brand, args);
      case 'get_brand_creator_platform_status':
        return this.getBrandCreatorPlatformStatusTool(brand, args, userId);
      case 'refresh_brand_creator_platform_data':
        return this.refreshBrandCreatorPlatformDataTool(brand, args, userId);
      case 'get_brand_creator_platform_report':
        return this.getBrandCreatorPlatformReportTool(brand, args, userId);
      default:
        return {
          ok: false,
          tool: toolName,
          error: 'unknown_tool',
          message: '未定义的品牌情报工具',
        };
    }
  }

  private parseToolArguments(value: string | Record<string, unknown>) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private normalizeToolDays(value: unknown, fallback = 30) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.round(parsed), 1), 180);
  }

  private normalizeToolLimit(value: unknown, fallback: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.round(parsed), 1), max);
  }

  private async getBrandAnswerEngineOverviewTool(
    brand: BrandRow,
    args: Record<string, unknown>,
  ) {
    const days = this.normalizeToolDays(args.days, 30);
    const [summaryRows, platformRows] = await Promise.all([
      this.mysqlService.query<
        Array<{
          result_count: number;
          avg_visibility: number;
          mention_count: number;
          citation_count: number;
          recommended_count: number;
          avg_recommendation_score: number;
          latest_result_at: string | null;
        }>
      >(
        `SELECT
           COUNT(*) AS result_count,
           COALESCE(ROUND(AVG(visibility_score)), 0) AS avg_visibility,
           COALESCE(SUM(mention_count), 0) AS mention_count,
           COALESCE(SUM(citation_count), 0) AS citation_count,
           COALESCE(SUM(is_recommended), 0) AS recommended_count,
           COALESCE(ROUND(AVG(recommendation_score)), 0) AS avg_recommendation_score,
           MAX(created_at) AS latest_result_at
         FROM monitor_prompt_results
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
        [brand.id, days],
      ),
      this.mysqlService.query<
        Array<{
          platform: string | null;
          result_count: number;
          avg_visibility: number;
          recommended_count: number;
          avg_recommendation_score: number;
        }>
      >(
        `SELECT
           platform,
           COUNT(*) AS result_count,
           COALESCE(ROUND(AVG(visibility_score)), 0) AS avg_visibility,
           COALESCE(SUM(is_recommended), 0) AS recommended_count,
           COALESCE(ROUND(AVG(recommendation_score)), 0) AS avg_recommendation_score
         FROM monitor_prompt_results
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         GROUP BY platform
         ORDER BY avg_visibility DESC, recommended_count DESC, result_count DESC
         LIMIT 5`,
        [brand.id, days],
      ),
    ]);

    const summary = summaryRows[0];
    const resultCount = Number(summary?.result_count ?? 0);
    return {
      ok: true,
      tool: 'get_brand_answer_engine_overview',
      brandId: brand.id,
      brandName: brand.name,
      periodDays: days,
      metrics: {
        resultCount,
        avgVisibility: Number(summary?.avg_visibility ?? 0),
        mentionCount: Number(summary?.mention_count ?? 0),
        citationCount: Number(summary?.citation_count ?? 0),
        recommendedCount: Number(summary?.recommended_count ?? 0),
        recommendedRate:
          resultCount > 0
            ? Math.round((Number(summary?.recommended_count ?? 0) / resultCount) * 100)
            : 0,
        avgRecommendationScore: Number(summary?.avg_recommendation_score ?? 0),
        latestResultAt: summary?.latest_result_at ? this.toIso(summary.latest_result_at) : null,
      },
      topPlatforms: platformRows.map((row) => ({
        platform: String(row.platform || 'unknown'),
        label: this.formatAiPlatformLabel(row.platform),
        resultCount: Number(row.result_count ?? 0),
        avgVisibility: Number(row.avg_visibility ?? 0),
        recommendedCount: Number(row.recommended_count ?? 0),
        recommendedRate:
          Number(row.result_count ?? 0) > 0
            ? Math.round((Number(row.recommended_count ?? 0) / Number(row.result_count ?? 0)) * 100)
            : 0,
        avgRecommendationScore: Number(row.avg_recommendation_score ?? 0),
      })),
    };
  }

  private async getBrandTopicsTool(brand: BrandRow, args: Record<string, unknown>) {
    const days = this.normalizeToolDays(args.days, 30);
    const limit = this.normalizeToolLimit(args.limit, 5, 10);
    const rows = await this.mysqlService.query<
      Array<{
        topic_name: string | null;
        result_count: number;
        avg_visibility: number;
        recommended_count: number;
        prompt_count: number;
      }>
    >(
      `SELECT
         COALESCE(NULLIF(t.name, ''), NULLIF(p.category, ''), '未分类') AS topic_name,
         COUNT(pr.id) AS result_count,
         COALESCE(ROUND(AVG(pr.visibility_score)), 0) AS avg_visibility,
         COALESCE(SUM(pr.is_recommended), 0) AS recommended_count,
         COUNT(DISTINCT p.id) AS prompt_count
       FROM monitor_prompt_results pr
       INNER JOIN monitor_prompts p ON p.id = pr.prompt_id
       LEFT JOIN monitor_topics t ON t.id = p.topic_id
       WHERE pr.brand_id = ?
         AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
       GROUP BY COALESCE(NULLIF(t.name, ''), NULLIF(p.category, ''), '未分类')
       ORDER BY result_count DESC, avg_visibility DESC
       LIMIT ?`,
      [brand.id, days, limit],
    );

    return {
      ok: true,
      tool: 'get_brand_topics',
      brandId: brand.id,
      brandName: brand.name,
      periodDays: days,
      items: rows.map((row) => ({
        topic: String(row.topic_name || '未分类').trim(),
        resultCount: Number(row.result_count ?? 0),
        avgVisibility: Number(row.avg_visibility ?? 0),
        recommendedCount: Number(row.recommended_count ?? 0),
        recommendedRate:
          Number(row.result_count ?? 0) > 0
            ? Math.round((Number(row.recommended_count ?? 0) / Number(row.result_count ?? 0)) * 100)
            : 0,
        promptCount: Number(row.prompt_count ?? 0),
      })),
    };
  }

  private async getBrandPromptsTool(brand: BrandRow, args: Record<string, unknown>) {
    const days = this.normalizeToolDays(args.days, 30);
    const limit = this.normalizeToolLimit(args.limit, 8, 12);
    const rows = await this.mysqlService.query<
      Array<{
        prompt_id: string;
        prompt_text: string;
        topic_name: string | null;
        opportunity_score: number;
        heat_score: number;
        competition: string | null;
        result_count: number;
        avg_visibility: number;
        recommended_count: number;
      }>
    >(
      `SELECT
         p.id AS prompt_id,
         p.text AS prompt_text,
         COALESCE(NULLIF(t.name, ''), NULLIF(p.category, ''), '未分类') AS topic_name,
         COALESCE(MAX(pph.opportunity_score), 0) AS opportunity_score,
         COALESCE(MAX(pph.total_heat_score), 0) AS heat_score,
         MAX(pph.competition) AS competition,
         COUNT(pr.id) AS result_count,
         COALESCE(ROUND(AVG(pr.visibility_score)), 0) AS avg_visibility,
         COALESCE(SUM(pr.is_recommended), 0) AS recommended_count
       FROM monitor_prompts p
       INNER JOIN monitor_prompt_sets ps ON ps.id = p.prompt_set_id
       LEFT JOIN monitor_topics t ON t.id = p.topic_id
       LEFT JOIN monitor_prompt_public_heat pph ON pph.prompt_id = p.id
       LEFT JOIN monitor_prompt_results pr
         ON pr.prompt_id = p.id
        AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
       WHERE ps.brand_id = ?
         AND p.is_active = 1
       GROUP BY p.id, p.text, t.name, p.category
       ORDER BY opportunity_score DESC, heat_score DESC, result_count DESC, avg_visibility DESC, p.created_at DESC
       LIMIT ?`,
      [days, brand.id, limit],
    );

    return {
      ok: true,
      tool: 'get_brand_prompts',
      brandId: brand.id,
      brandName: brand.name,
      periodDays: days,
      items: rows.map((row) => ({
        promptId: row.prompt_id,
        promptText: row.prompt_text,
        topic: String(row.topic_name || '未分类').trim(),
        opportunityScore: Number(row.opportunity_score ?? 0),
        heatScore: Number(row.heat_score ?? 0),
        competition: row.competition ? String(row.competition) : null,
        resultCount: Number(row.result_count ?? 0),
        avgVisibility: Number(row.avg_visibility ?? 0),
        recommendedCount: Number(row.recommended_count ?? 0),
        recommendedRate:
          Number(row.result_count ?? 0) > 0
            ? Math.round((Number(row.recommended_count ?? 0) / Number(row.result_count ?? 0)) * 100)
            : 0,
      })),
    };
  }

  private async getBrandCitationsTool(
    brand: BrandRow,
    domains: BrandDomainRow[],
    args: Record<string, unknown>,
  ) {
    const days = this.normalizeToolDays(args.days, 30);
    const limit = this.normalizeToolLimit(args.limit, 10, 20);
    const ownedOnly = Boolean(args.ownedOnly);
    const ownDomains = domains
      .map((domain) => this.normalizeDomain(domain.domain))
      .filter(Boolean);
    const rows = await this.mysqlService.query<Array<{ url: string; title: string | null; count: number }>>(
      `SELECT
         rc.url AS url,
         MAX(NULLIF(rc.title, '')) AS title,
         COUNT(*) AS count
       FROM monitor_result_citations rc
       INNER JOIN monitor_prompt_results pr ON pr.id = rc.result_id
       WHERE pr.brand_id = ?
         AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
       GROUP BY rc.url
       ORDER BY count DESC, MAX(rc.created_at) DESC
       LIMIT ?`,
      [brand.id, days, limit * 3],
    );

    const items = rows
      .map((row) => {
        const parsed = this.extractUrlSummary(row.url);
        if (!parsed) return null;
        const isOwned = ownDomains.some((domain) => this.domainMatches(parsed.host, domain));
        if (ownedOnly && !isOwned) return null;
        return {
          title: row.title?.trim() || '',
          url: row.url,
          domain: parsed.host,
          path: parsed.path,
          count: Number(row.count ?? 0),
          isOwned,
        };
      })
      .filter((item): item is { title: string; url: string; domain: string; path: string; count: number; isOwned: boolean } => Boolean(item))
      .slice(0, limit);

    const topDomains = Array.from(
      items.reduce((map, item) => {
        map.set(item.domain, (map.get(item.domain) ?? 0) + item.count);
        return map;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1])
      .map(([domain, count]) => ({ domain, count }));

    return {
      ok: true,
      tool: 'get_brand_citations',
      brandId: brand.id,
      brandName: brand.name,
      periodDays: days,
      ownedDomains: ownDomains,
      items,
      topDomains,
    };
  }

  private async getBrandAiTrafficTool(brand: BrandRow, args: Record<string, unknown>) {
    const days = this.normalizeToolDays(args.days, 30);
    const limit = this.normalizeToolLimit(args.limit, 5, 10);
    const [summaryRows, platformRows, pathRows] = await Promise.all([
      this.mysqlService.query<Array<{ visit_count: number; session_count: number }>>(
        `SELECT
           COUNT(*) AS visit_count,
           COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id)) AS session_count
         FROM monitor_ai_traffic_logs
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
        [brand.id, days],
      ),
      this.mysqlService.query<Array<{ source_platform: string | null; visit_count: number }>>(
        `SELECT
           source_platform,
           COUNT(*) AS visit_count
         FROM monitor_ai_traffic_logs
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         GROUP BY source_platform
         ORDER BY visit_count DESC
         LIMIT ?`,
        [brand.id, days, limit],
      ),
      this.mysqlService.query<Array<{ path: string | null; visit_count: number }>>(
        `SELECT
           path,
           COUNT(*) AS visit_count
         FROM monitor_ai_traffic_logs
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         GROUP BY path
         ORDER BY visit_count DESC
         LIMIT ?`,
        [brand.id, days, limit],
      ),
    ]);

    const summary = summaryRows[0];
    return {
      ok: true,
      tool: 'get_brand_ai_traffic',
      brandId: brand.id,
      brandName: brand.name,
      periodDays: days,
      metrics: {
        visitCount: Number(summary?.visit_count ?? 0),
        sessionCount: Number(summary?.session_count ?? 0),
      },
      topPlatforms: platformRows.map((row) => ({
        platform: String(row.source_platform || 'unknown'),
        label: this.formatAiPlatformLabel(row.source_platform),
        visitCount: Number(row.visit_count ?? 0),
      })),
      topPaths: pathRows.map((row) => ({
        path: String(row.path || '/'),
        visitCount: Number(row.visit_count ?? 0),
      })),
    };
  }

  private async getBrandCompetitorsTool(brand: BrandRow, args: Record<string, unknown>) {
    const days = this.normalizeToolDays(args.days, 30);
    const limit = this.normalizeToolLimit(args.limit, 5, 10);
    const [competitorRows, pageRows, configuredCompetitorRows] = await Promise.all([
      this.mysqlService.query<
        Array<{
          name: string;
          domain: string | null;
          mention_count: number;
          citation_count: number;
          avg_visibility: number;
        }>
      >(
        `SELECT
           rc.name AS name,
           rc.domain AS domain,
           COALESCE(SUM(rc.mention_count), 0) AS mention_count,
           COALESCE(SUM(rc.citation_count), 0) AS citation_count,
           COALESCE(ROUND(AVG(rc.visibility_score)), 0) AS avg_visibility
         FROM monitor_result_competitors rc
         INNER JOIN monitor_prompt_results pr ON pr.id = rc.result_id
         WHERE pr.brand_id = ?
           AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         GROUP BY rc.name, rc.domain
         ORDER BY citation_count DESC, mention_count DESC, avg_visibility DESC
         LIMIT ?`,
        [brand.id, days, limit],
      ),
      this.mysqlService.query<Array<{ url: string; title: string | null; count: number }>>(
        `SELECT
           rc.url AS url,
           MAX(NULLIF(rc.title, '')) AS title,
           COUNT(*) AS count
         FROM monitor_result_citations rc
         INNER JOIN monitor_prompt_results pr ON pr.id = rc.result_id
         WHERE pr.brand_id = ?
           AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         GROUP BY rc.url
         ORDER BY count DESC, MAX(rc.created_at) DESC
         LIMIT ?`,
        [brand.id, days, limit * 4],
      ),
      this.mysqlService.query<Array<{ name: string; domain: string | null }>>(
        `SELECT name, domain
         FROM monitor_competitors
         WHERE brand_id = ?
         ORDER BY created_at ASC`,
        [brand.id],
      ),
    ]);

    const configuredCompetitors = configuredCompetitorRows
      .map((row) => ({
        name: row.name,
        domain: this.normalizeDomain(row.domain),
      }))
      .filter((row) => row.domain);
    const topPages = pageRows
      .map((row) => {
        const parsed = this.extractUrlSummary(row.url);
        if (!parsed) return null;
        const competitor = configuredCompetitors.find((item) => this.domainMatches(parsed.host, item.domain));
        if (!competitor) return null;
        return {
          competitorName: competitor.name,
          title: row.title?.trim() || '',
          url: row.url,
          domain: parsed.host,
          path: parsed.path,
          count: Number(row.count ?? 0),
        };
      })
      .filter((item): item is { competitorName: string; title: string; url: string; domain: string; path: string; count: number } => Boolean(item))
      .slice(0, limit);

    return {
      ok: true,
      tool: 'get_brand_competitors',
      brandId: brand.id,
      brandName: brand.name,
      periodDays: days,
      competitors: competitorRows.map((row) => ({
        name: row.name,
        domain: this.normalizeDomain(row.domain),
        mentionCount: Number(row.mention_count ?? 0),
        citationCount: Number(row.citation_count ?? 0),
        avgVisibility: Number(row.avg_visibility ?? 0),
      })),
      topPages,
      configuredCompetitors: configuredCompetitorRows.map((row) => ({
        name: row.name,
        domain: this.normalizeDomain(row.domain),
      })),
    };
  }

  private async getBrandCreatorPlatformStatusTool(
    brand: BrandRow,
    args: Record<string, unknown>,
    userId?: string,
  ) {
    if (!userId) {
      return {
        ok: false,
        tool: 'get_brand_creator_platform_status',
        message: '当前会话缺少用户身份，暂时无法查询创作者平台连接状态。',
      };
    }

    const platforms = this.normalizeRequestedPlatforms(args.platforms);
    const session = await this.getOrCreateWechatSyncBridgeSession(userId, brand.organization_id);
    const sessionStatus = await this.fetchWechatSyncBridgeSessionStatus(session.public_id);
    const connections = await this.syncCreatorPlatformConnectionsFromBridge(brand, userId, {
      session,
      sessionStatus,
      forceRefresh: false,
    });

    return {
      ok: true,
      tool: 'get_brand_creator_platform_status',
      brandId: brand.id,
      brandName: brand.name,
      bridge: this.mapWechatSyncBridgeSession(session, sessionStatus),
      connections: this.filterCreatorPlatformConnections(connections, platforms),
    };
  }

  private async refreshBrandCreatorPlatformDataTool(
    brand: BrandRow,
    args: Record<string, unknown>,
    userId?: string,
  ) {
    if (!userId) {
      return {
        ok: false,
        tool: 'refresh_brand_creator_platform_data',
        message: '当前会话缺少用户身份，暂时无法刷新创作者平台数据。',
      };
    }

    const result = await this.refreshPlatformData(userId, brand.id, {
      platforms: this.normalizeRequestedPlatforms(args.platforms),
      forceRefresh: args.forceRefresh !== false,
    });

    return {
      ...result,
      tool: 'refresh_brand_creator_platform_data',
    };
  }

  private async getBrandCreatorPlatformReportTool(
    brand: BrandRow,
    args: Record<string, unknown>,
    userId?: string,
  ) {
    if (!userId) {
      return {
        ok: false,
        tool: 'get_brand_creator_platform_report',
        message: '当前会话缺少用户身份，暂时无法读取创作者平台报告。',
      };
    }

    const report = await this.getPlatformDataReport(userId, brand.id, {
      platforms: this.normalizeRequestedPlatforms(args.platforms),
      days:
        typeof args.days === 'string' || typeof args.days === 'number' ? args.days : undefined,
    });

    return {
      ...report,
      tool: 'get_brand_creator_platform_report',
    };
  }

  private getWechatSyncBridgeBaseUrl() {
    const value = this.configService.get<string>('WECHATSYNC_BRIDGE_BASE_URL') || '';
    const normalized = value.trim().replace(/\/+$/, '');
    if (!normalized) return '';
    return normalized.startsWith('http://') || normalized.startsWith('https://')
      ? normalized
      : `http://${normalized}`;
  }

  private getWechatSyncBridgePublicWsBaseUrl() {
    const value =
      this.configService.get<string>('WECHATSYNC_BRIDGE_PUBLIC_WS_BASE_URL') ||
      'wss://miaosheai.com/ws/wechatsync';
    return value.trim().replace(/\/+$/, '');
  }

  private getAppOrigin() {
    const value = (this.configService.get<string>('APP_ORIGIN') || 'https://miaosheai.com').trim();
    return value.replace(/\/+$/, '');
  }

  private buildWechatSyncExtensionDownloadUrl() {
    return `${this.getAppOrigin()}/downloads/wechatsync-2.0.9.zip`;
  }

  private async fetchWechatSyncBridgeSessionStatus(publicId: string) {
    const baseUrl = this.getWechatSyncBridgeBaseUrl();
    if (!baseUrl) {
      return {
        reachable: false,
        connected: false,
        mode: '',
        error: '服务器侧还没有配置 WechatSync 桥接地址。',
        sessionStatus: 'missing_config',
        lastError: null as string | null,
        connectedAt: null as string | null,
        lastSeenAt: null as string | null,
        disconnectedAt: null as string | null,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(`${baseUrl}/status?session=${encodeURIComponent(publicId)}`, {
        method: 'GET',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({} as Record<string, any>));
      if (!response.ok) {
        return {
          reachable: false,
          connected: false,
          mode: '',
          error: '桥接服务返回异常，请检查服务是否正常运行。',
          sessionStatus: 'error',
          lastError: String(payload?.session?.lastError || ''),
          connectedAt: payload?.session?.connectedAt || null,
          lastSeenAt: payload?.session?.lastSeenAt || null,
          disconnectedAt: payload?.session?.disconnectedAt || null,
        };
      }

      return {
        reachable: true,
        connected: Boolean(payload?.connected),
        mode: String(payload?.mode || ''),
        error: '',
        sessionStatus: String(payload?.session?.status || 'pending'),
        lastError: payload?.session?.lastError || null,
        connectedAt: payload?.session?.connectedAt || null,
        lastSeenAt: payload?.session?.lastSeenAt || null,
        disconnectedAt: payload?.session?.disconnectedAt || null,
      };
    } catch (error) {
      return {
        reachable: false,
        connected: false,
        mode: '',
        error:
          error instanceof Error ? `无法连接桥接服务：${error.message}` : '无法连接桥接服务，请稍后重试。',
        sessionStatus: 'error',
        lastError: error instanceof Error ? error.message : null,
        connectedAt: null,
        lastSeenAt: null,
        disconnectedAt: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestWechatSyncBridge(
    baseUrl: string,
    sessionPublicId: string,
    method: string,
    params?: Record<string, unknown>,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`${baseUrl}/request`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          session: sessionPublicId,
          method,
          params,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({} as Record<string, any>));
      if (!response.ok || payload?.error) {
        throw new Error(String(payload?.error || '桥接调用失败'));
      }
      return payload?.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getOrCreateWechatSyncBridgeSession(userId: string, organizationId: string) {
    const existing = await this.findActiveWechatSyncBridgeSession(userId, organizationId);
    if (existing) return existing;

    const now = this.nowSql();
    const session: WechatSyncBridgeSessionRow = {
      id: randomUUID(),
      organization_id: organizationId,
      user_id: userId,
      public_id: randomUUID(),
      session_token: randomBytes(24).toString('hex'),
      status: 'pending',
      last_error: null,
      connected_at: null,
      last_seen_at: null,
      disconnected_at: null,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    };

    await this.mysqlService.query(
      `INSERT INTO monitor_wechatsync_bridge_sessions
       (id, organization_id, user_id, public_id, session_token, status, last_error, connected_at, last_seen_at, disconnected_at, revoked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.organization_id,
        session.user_id,
        session.public_id,
        session.session_token,
        session.status,
        session.last_error,
        session.connected_at,
        session.last_seen_at,
        session.disconnected_at,
        session.revoked_at,
        session.created_at,
        session.updated_at,
      ],
    );

    return session;
  }

  private async findActiveWechatSyncBridgeSession(userId: string, organizationId: string) {
    const rows = await this.mysqlService.query<WechatSyncBridgeSessionRow[]>(
      `SELECT *
       FROM monitor_wechatsync_bridge_sessions
       WHERE user_id = ?
         AND organization_id = ?
         AND revoked_at IS NULL
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [userId, organizationId],
    );
    return rows[0] || null;
  }

  private mapWechatSyncBridgeSession(
    session: WechatSyncBridgeSessionRow,
    status: {
      reachable: boolean;
      connected: boolean;
      mode: string;
      error: string;
      sessionStatus: string;
      lastError: string | null;
      connectedAt: string | null;
      lastSeenAt: string | null;
      disconnectedAt: string | null;
    },
  ) {
    const wsBaseUrl = this.getWechatSyncBridgePublicWsBaseUrl();
    return {
      id: session.id,
      publicId: session.public_id,
      token: session.session_token,
      wsUrl: `${wsBaseUrl}/${encodeURIComponent(session.public_id)}?token=${encodeURIComponent(session.session_token)}`,
      installUrl: this.buildWechatSyncExtensionDownloadUrl(),
      reachable: status.reachable,
      connected: status.connected,
      status: status.sessionStatus || session.status,
      error: status.error || status.lastError || session.last_error || '',
      connectedAt: status.connectedAt || session.connected_at,
      lastSeenAt: status.lastSeenAt || session.last_seen_at,
      disconnectedAt: status.disconnectedAt || session.disconnected_at,
    };
  }

  private async syncCreatorPlatformConnectionsFromBridge(
    brand: BrandRow,
    userId: string,
    input: {
      session: WechatSyncBridgeSessionRow;
      sessionStatus: {
        reachable: boolean;
        connected: boolean;
        mode: string;
        error: string;
      };
      forceRefresh: boolean;
    },
  ) {
    const existing = await this.findCreatorPlatformConnections(brand.id, userId, []);
    if (!input.sessionStatus.connected) {
      return existing;
    }

    const bridgeBaseUrl = this.getWechatSyncBridgeBaseUrl();
    if (!bridgeBaseUrl) {
      return existing;
    }

    const accounts = await this.fetchCreatorPlatformAccountsFromBridge(
      bridgeBaseUrl,
      input.session.public_id,
      input.forceRefresh,
    );
    if (accounts.length === 0) {
      return existing;
    }

    for (const account of accounts) {
      await this.upsertCreatorPlatformConnection({
        organizationId: brand.organization_id,
        userId,
        brandId: brand.id,
        bridgeSessionPublicId: input.session.public_id,
        account,
      });
    }

    return this.findCreatorPlatformConnections(brand.id, userId, []);
  }

  private async fetchCreatorPlatformAccountsFromBridge(
    bridgeBaseUrl: string,
    sessionPublicId: string,
    forceRefresh: boolean,
  ) {
    const candidates: Array<{ method: string; params: Record<string, unknown> }> = [
      { method: 'listPlatforms', params: { forceRefresh } },
      { method: 'getAccounts', params: {} },
    ];

    for (const candidate of candidates) {
      try {
        const result = await this.requestWechatSyncBridge(
          bridgeBaseUrl,
          sessionPublicId,
          candidate.method,
          candidate.params,
        );
        const accounts = this.normalizeCreatorPlatformAccounts(result);
        if (accounts.length > 0) {
          return accounts;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to sync creator platform accounts via ${candidate.method}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return [];
  }

  private normalizeCreatorPlatformAccounts(result: unknown): CreatorPlatformAccount[] {
    const items = this.extractBridgeItems(result);
    return items
      .map((item) => this.normalizeCreatorPlatformAccount(item))
      .filter((item): item is CreatorPlatformAccount => Boolean(item));
  }

  private extractBridgeItems(result: unknown) {
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      if (Array.isArray(record.platforms)) return record.platforms;
      if (Array.isArray(record.accounts)) return record.accounts;
      if (Array.isArray(record.items)) return record.items;
      if (Array.isArray(record.result)) return record.result;
    }
    return [];
  }

  private normalizeCreatorPlatformAccount(value: unknown): CreatorPlatformAccount | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const platform = this.normalizeCreatorPlatformKey(
      this.readPlatformField(record.platform) ||
        this.readPlatformField(record.type) ||
        this.readPlatformField(record.id) ||
        this.readPlatformField(record.title),
    );
    if (!platform) return null;

    const isAuthenticated =
      record.isAuthenticated === undefined ? true : Boolean(record.isAuthenticated);
    if (!isAuthenticated) return null;

    const accountName =
      this.readPlatformField(record.accountName) ||
      this.readPlatformField(record.displayName) ||
      this.readPlatformField(record.username) ||
      this.readPlatformField(record.nickname) ||
      this.readPlatformField(record.name) ||
      this.formatCreatorPlatformLabel(platform);
    const externalAccountId =
      this.readPlatformField(record.uid) ||
      this.readPlatformField(record.userId) ||
      this.readPlatformField(record.openId) ||
      this.readPlatformField(record.externalAccountId) ||
      null;
    const creatorUrl =
      this.readPlatformField(record.creatorUrl) ||
      this.readPlatformField(record.dashboardUrl) ||
      this.readPlatformField(record.homepage) ||
      this.readPlatformField(record.url) ||
      null;

    return {
      platform,
      platformLabel: this.formatCreatorPlatformLabel(platform),
      accountKey: this.normalizeCreatorAccountKey(externalAccountId || accountName),
      externalAccountId,
      accountName,
      creatorUrl,
      dashboardUrl:
        this.readPlatformField(record.dashboardUrl) ||
        this.buildCreatorPlatformDashboardUrl(platform, creatorUrl),
      homepage: this.readPlatformField(record.homepage) || creatorUrl,
      metadata: record,
    };
  }

  private async upsertCreatorPlatformConnection(input: {
    organizationId: string;
    userId: string;
    brandId: string;
    bridgeSessionPublicId: string;
    account: CreatorPlatformAccount;
  }) {
    const now = this.nowSql();
    await this.mysqlService.query(
      `INSERT INTO monitor_creator_platform_connections
       (id, organization_id, user_id, brand_id, bridge_session_public_id, platform, platform_label, account_key, external_account_id, account_name, creator_url, dashboard_url, status, metadata_json, last_seen_at, last_crawled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         bridge_session_public_id = VALUES(bridge_session_public_id),
         platform_label = VALUES(platform_label),
         external_account_id = VALUES(external_account_id),
         account_name = VALUES(account_name),
         creator_url = VALUES(creator_url),
         dashboard_url = VALUES(dashboard_url),
         status = VALUES(status),
         metadata_json = VALUES(metadata_json),
         last_seen_at = VALUES(last_seen_at),
         updated_at = VALUES(updated_at)`,
      [
        randomUUID(),
        input.organizationId,
        input.userId,
        input.brandId,
        input.bridgeSessionPublicId,
        input.account.platform,
        input.account.platformLabel,
        input.account.accountKey,
        input.account.externalAccountId,
        input.account.accountName,
        input.account.creatorUrl,
        input.account.dashboardUrl,
        'connected',
        JSON.stringify(input.account.metadata || {}),
        now,
        null,
        now,
        now,
      ],
    );
  }

  private async findCreatorPlatformConnections(
    brandId: string,
    userId: string,
    platforms: string[],
  ) {
    const params: unknown[] = [brandId, userId];
    const normalized = this.normalizeRequestedPlatforms(platforms);
    const platformClause = normalized.length
      ? ` AND platform IN (${normalized.map(() => '?').join(', ')})`
      : '';
    params.push(...normalized);
    const rows = await this.mysqlService.query<CreatorPlatformConnectionRow[]>(
      `SELECT *
       FROM monitor_creator_platform_connections
       WHERE brand_id = ?
         AND user_id = ?${platformClause}
       ORDER BY updated_at DESC, created_at DESC`,
      params,
    );

    return rows.map((row) => this.mapCreatorPlatformConnection(row));
  }

  private mapCreatorPlatformConnection(row: CreatorPlatformConnectionRow) {
    return {
      id: row.id,
      brandId: row.brand_id,
      platform: row.platform,
      platformLabel: row.platform_label,
      accountKey: row.account_key,
      externalAccountId: row.external_account_id,
      accountName: row.account_name || row.platform_label,
      creatorUrl: row.creator_url,
      dashboardUrl: row.dashboard_url,
      status: row.status,
      metadata: this.parseJsonRecord(row.metadata_json),
      lastSeenAt: row.last_seen_at ? this.toIso(row.last_seen_at) : null,
      lastCrawledAt: row.last_crawled_at ? this.toIso(row.last_crawled_at) : null,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private filterCreatorPlatformConnections(
    connections: Array<Record<string, any>>,
    platforms: string[],
  ) {
    const normalized = this.normalizeRequestedPlatforms(platforms);
    if (normalized.length === 0) return connections;
    const lookup = new Set(normalized);
    return connections.filter((item) => lookup.has(this.normalizeCreatorPlatformKey(item.platform)));
  }

  private async captureCreatorPlatformSnapshot(input: {
    brand: BrandRow;
    userId: string;
    connection: Record<string, any>;
    session: WechatSyncBridgeSessionRow;
  }) {
    const baseUrl = this.getWechatSyncBridgeBaseUrl();
    if (!baseUrl) {
      return this.storeFailedCreatorPlatformSnapshot(input, '服务器侧还没有配置桥接服务地址。');
    }

    const candidates: Array<{ method: string; params: Record<string, unknown> }> = [
      {
        method: 'extractPlatformAnalytics',
        params: {
          platform: input.connection.platform,
          accountName: input.connection.accountName,
          creatorUrl: input.connection.creatorUrl,
          dashboardUrl: input.connection.dashboardUrl,
        },
      },
      {
        method: 'getCreatorAnalytics',
        params: {
          platform: input.connection.platform,
          accountName: input.connection.accountName,
        },
      },
      {
        method: 'magicCall',
        params: {
          methodName: 'extractPlatformAnalytics',
          platform: input.connection.platform,
          accountName: input.connection.accountName,
          creatorUrl: input.connection.creatorUrl,
          dashboardUrl: input.connection.dashboardUrl,
        },
      },
      {
        method: 'magicCall',
        params: {
          methodName: 'getCreatorAnalytics',
          platform: input.connection.platform,
          accountName: input.connection.accountName,
        },
      },
    ];

    let lastError = '';
    for (const candidate of candidates) {
      try {
        const raw = await this.requestWechatSyncBridge(
          baseUrl,
          input.session.public_id,
          candidate.method,
          candidate.params,
        );
        const normalized = this.normalizeCreatorPlatformSnapshot(raw, input.connection);
        if (!normalized) continue;
        await this.updateCreatorPlatformConnectionCrawledAt(input.connection.id);
        return this.storeCreatorPlatformSnapshot(input, normalized, raw);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'unknown error';
      }
    }

    return this.storeFailedCreatorPlatformSnapshot(
      input,
      lastError || '当前扩展还没有返回可用的创作者平台数据。',
    );
  }

  private normalizeCreatorPlatformSnapshot(
    raw: unknown,
    connection: Record<string, any>,
  ): { metricDate: string | null; summary: string; metrics: Record<string, unknown> } | null {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    const metrics =
      (record.metrics && typeof record.metrics === 'object' ? (record.metrics as Record<string, unknown>) : null) ||
      (record.stats && typeof record.stats === 'object' ? (record.stats as Record<string, unknown>) : null) ||
      (record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null) ||
      record;
    const metricKeys = Object.keys(metrics || {});
    if (metricKeys.length === 0) return null;

    const summary =
      this.readPlatformField(record.summary) ||
      this.readPlatformField(record.summaryText) ||
      this.summarizeCreatorMetrics(metrics, connection.platformLabel, connection.accountName);

    return {
      metricDate: this.normalizeMetricDate(
        this.readPlatformField(record.metricDate) ||
          this.readPlatformField(record.reportDate) ||
          this.readPlatformField(record.date),
      ),
      summary,
      metrics,
    };
  }

  private async storeCreatorPlatformSnapshot(
    input: {
      brand: BrandRow;
      userId: string;
      connection: Record<string, any>;
    },
    snapshot: { metricDate: string | null; summary: string; metrics: Record<string, unknown> },
    raw: unknown,
  ) {
    const now = this.nowSql();
    const id = randomUUID();
    await this.mysqlService.query(
      `INSERT INTO monitor_creator_platform_snapshots
       (id, connection_id, organization_id, user_id, brand_id, platform, platform_label, account_key, account_name, snapshot_kind, source, status, metric_date, summary_text, metrics_json, raw_json, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.connection.id || null,
        input.brand.organization_id,
        input.userId,
        input.brand.id,
        input.connection.platform,
        input.connection.platformLabel,
        input.connection.accountKey,
        input.connection.accountName,
        'creator_overview',
        'bridge',
        'success',
        snapshot.metricDate,
        snapshot.summary,
        JSON.stringify(snapshot.metrics || {}),
        JSON.stringify(raw ?? {}),
        null,
        now,
        now,
      ],
    );

    return {
      id,
      platform: input.connection.platform,
      platformLabel: input.connection.platformLabel,
      accountName: input.connection.accountName,
      status: 'success',
      metricDate: snapshot.metricDate,
      summary: snapshot.summary,
      metrics: snapshot.metrics,
      createdAt: this.toIso(now),
    };
  }

  private async storeFailedCreatorPlatformSnapshot(
    input: {
      brand: BrandRow;
      userId: string;
      connection: Record<string, any>;
    },
    errorMessage: string,
  ) {
    const now = this.nowSql();
    const id = randomUUID();
    await this.mysqlService.query(
      `INSERT INTO monitor_creator_platform_snapshots
       (id, connection_id, organization_id, user_id, brand_id, platform, platform_label, account_key, account_name, snapshot_kind, source, status, metric_date, summary_text, metrics_json, raw_json, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.connection.id || null,
        input.brand.organization_id,
        input.userId,
        input.brand.id,
        input.connection.platform,
        input.connection.platformLabel,
        input.connection.accountKey,
        input.connection.accountName,
        'creator_overview',
        'bridge',
        'failed',
        null,
        '',
        JSON.stringify({}),
        null,
        errorMessage.slice(0, 500),
        now,
        now,
      ],
    );

    return {
      id,
      platform: input.connection.platform,
      platformLabel: input.connection.platformLabel,
      accountName: input.connection.accountName,
      status: 'failed',
      metricDate: null,
      summary: '',
      errorMessage,
      metrics: {},
      createdAt: this.toIso(now),
    };
  }

  private async updateCreatorPlatformConnectionCrawledAt(connectionId: string) {
    const now = this.nowSql();
    await this.mysqlService.query(
      `UPDATE monitor_creator_platform_connections
       SET last_crawled_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, now, connectionId],
    );
  }

  private async createCreatorPlatformJob(input: {
    organizationId: string;
    userId: string;
    brandId: string;
    bridgeSessionPublicId: string | null;
    requestedPlatforms: string[];
  }) {
    const now = this.nowSql();
    const row: CreatorPlatformJobRow = {
      id: randomUUID(),
      organization_id: input.organizationId,
      user_id: input.userId,
      brand_id: input.brandId,
      bridge_session_public_id: input.bridgeSessionPublicId,
      requested_platforms_json: JSON.stringify(input.requestedPlatforms || []),
      status: 'running',
      summary_text: null,
      result_json: null,
      error_message: null,
      started_at: now,
      finished_at: null,
      created_at: now,
      updated_at: now,
    };

    await this.mysqlService.query(
      `INSERT INTO monitor_creator_platform_jobs
       (id, organization_id, user_id, brand_id, bridge_session_public_id, requested_platforms_json, status, summary_text, result_json, error_message, started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.organization_id,
        row.user_id,
        row.brand_id,
        row.bridge_session_public_id,
        row.requested_platforms_json,
        row.status,
        row.summary_text,
        row.result_json,
        row.error_message,
        row.started_at,
        row.finished_at,
        row.created_at,
        row.updated_at,
      ],
    );

    return row;
  }

  private async finishCreatorPlatformJob(
    jobId: string,
    input: {
      status: string;
      summary: string;
      errorMessage?: string;
      result?: Record<string, unknown>;
    },
  ) {
    const now = this.nowSql();
    await this.mysqlService.query(
      `UPDATE monitor_creator_platform_jobs
       SET status = ?, summary_text = ?, result_json = ?, error_message = ?, finished_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.status,
        input.summary,
        input.result ? JSON.stringify(input.result) : null,
        input.errorMessage || null,
        now,
        now,
        jobId,
      ],
    );
  }

  private async findLatestCreatorPlatformSnapshots(
    brandId: string,
    userId: string,
    platforms: string[],
    days: number,
  ) {
    const normalized = this.normalizeRequestedPlatforms(platforms);
    const params: unknown[] = [brandId, userId, days];
    const platformClause = normalized.length
      ? ` AND platform IN (${normalized.map(() => '?').join(', ')})`
      : '';
    params.push(...normalized);
    const rows = await this.mysqlService.query<CreatorPlatformSnapshotRow[]>(
      `SELECT *
       FROM monitor_creator_platform_snapshots
       WHERE brand_id = ?
         AND user_id = ?
         AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)${platformClause}
       ORDER BY created_at DESC`,
      params,
    );

    const seen = new Set<string>();
    const items = [];
    for (const row of rows) {
      const key = `${row.platform}:${row.account_key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(this.mapCreatorPlatformSnapshot(row));
    }
    return items;
  }

  private mapCreatorPlatformSnapshot(row: CreatorPlatformSnapshotRow) {
    return {
      id: row.id,
      platform: row.platform,
      platformLabel: row.platform_label,
      accountKey: row.account_key,
      accountName: row.account_name || row.platform_label,
      snapshotKind: row.snapshot_kind,
      source: row.source,
      status: row.status,
      metricDate: row.metric_date || null,
      summary: row.summary_text || '',
      metrics: this.parseJsonRecord(row.metrics_json),
      raw: this.parseJsonRecord(row.raw_json),
      errorMessage: row.error_message,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private buildCreatorPlatformRefreshSummary(snapshots: Array<Record<string, any>>) {
    if (snapshots.length === 0) {
      return '这次没有抓到任何创作者平台快照。';
    }
    const success = snapshots.filter((item) => item.status === 'success');
    const failed = snapshots.filter((item) => item.status !== 'success');
    const successPlatforms = success.map((item) => item.platformLabel || item.platform).join('、');
    if (success.length === 0) {
      return `这次抓取全部失败，共尝试 ${snapshots.length} 个平台。`;
    }
    if (failed.length === 0) {
      return `这次已成功刷新 ${success.length} 个平台的数据：${successPlatforms}。`;
    }
    return `这次成功刷新 ${success.length} 个平台的数据，失败 ${failed.length} 个。成功的平台有：${successPlatforms}。`;
  }

  private buildCreatorPlatformReportSummary(
    connections: Array<Record<string, any>>,
    snapshots: Array<Record<string, any>>,
    days: number,
  ) {
    if (connections.length === 0) {
      return `近 ${days} 天还没有识别到已连接的创作者平台账号。`;
    }
    if (snapshots.length === 0) {
      return `当前已识别 ${connections.length} 个创作者平台账号，但近 ${days} 天还没有抓到可分析的数据快照。`;
    }
    const success = snapshots.filter((item) => item.status === 'success');
    if (success.length === 0) {
      return `近 ${days} 天已有 ${snapshots.length} 条平台抓取记录，但都没有返回可用数据。`;
    }
    const summary = success
      .slice(0, 3)
      .map((item) => item.summary)
      .filter(Boolean)
      .join('；');
    return `近 ${days} 天共识别 ${connections.length} 个平台账号，最近可用快照 ${success.length} 条。${summary}`;
  }

  private summarizeCreatorMetrics(
    metrics: Record<string, unknown>,
    platformLabel: string,
    accountName: string,
  ) {
    const highlights = Object.entries(metrics)
      .filter(([, value]) => typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value)))
      .slice(0, 6)
      .map(([key, value]) => `${this.formatMetricKey(key)} ${value}`);
    if (highlights.length === 0) {
      return `${platformLabel} 账号 ${accountName} 已返回一份创作者后台数据快照。`;
    }
    return `${platformLabel} 账号 ${accountName}：${highlights.join('，')}。`;
  }

  private buildMediaPublishAssistantText(brandName: string, run: AgentRunPayload) {
    const stepsText = run.steps.length
      ? `\n\n当前进度：\n${run.steps
          .map((step, index) => `${index + 1}. ${step.title}：${step.detail}`)
          .join('\n')}`
      : '';
    const actionText = run.actions.length
      ? `\n\n下一步可直接执行：${run.actions.map((item) => item.label).join('、')}。`
      : '';

    if (run.status === 'completed') {
      return `我已经按 ${brandName} 的媒体发布流程把这次执行跑完了。${run.summary}${stepsText}${actionText}`;
    }
    if (run.status === 'failed') {
      return `我已经把媒体发布链路推进到出错点了。${run.summary}${stepsText}${actionText}`;
    }
    return `我已经开始接管这次媒体发布任务。${run.summary}${stepsText}${actionText}`;
  }

  private buildPlatformDataAssistantText(brandName: string, run: AgentRunPayload) {
    const stepsText = run.steps.length
      ? `\n\n当前进度：\n${run.steps
          .map((step, index) => `${index + 1}. ${step.title}：${step.detail}`)
          .join('\n')}`
      : '';

    if (run.status === 'completed') {
      return `我已经按 ${brandName} 的平台数据链路把这次任务跑完了。${run.summary}${stepsText}`;
    }
    if (run.status === 'failed') {
      return `我已经把平台数据链路推进到出错点了。${run.summary}${stepsText}`;
    }
    return `我已经开始处理这次平台数据任务。${run.summary}${stepsText}`;
  }

  private async resolveMiaosheRouterDecision(input: {
    brand: BrandRow;
    domains: BrandDomainRow[];
    mode: 'chat' | 'agent';
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    workspaceContext: string;
  }) {
    const fallbackDecision = this.buildMiaosheRouterDecision({
      mode: input.mode,
      message: input.message,
      history: input.history,
    });

    if (
      fallbackDecision.route === 'image_generate' ||
      fallbackDecision.route === 'media_edit' ||
      fallbackDecision.route === 'video_storyboard' ||
      fallbackDecision.route === 'video_generate'
    ) {
      return {
        decision: fallbackDecision,
        codexResult: null,
      };
    }

    try {
      const codexResult = await this.codexExecutorService.planMediaPublish({
        context: {
          brandName: input.brand.name,
          brandIndustry: input.brand.industry || '未填写',
          brandRegion: input.brand.region || '未填写',
          brandLanguage: input.brand.language || '中文',
          brandDescription: input.brand.description || '未填写',
          domains: input.domains.map((item) => item.domain),
          workspaceContext: input.workspaceContext,
        },
        history: input.history,
        message: input.message,
        supportedPlatforms: this.getSupportedMediaPlatforms().map((item) => ({
          id: item.id,
          name: item.name,
        })),
      });

      if (codexResult?.plan) {
        return {
          decision: this.buildMiaosheRouteDecisionFromPlan(input.mode, input.message, codexResult.plan),
          codexResult,
        };
      }
    } catch (error) {
      this.logger.warn(
        `miaoshechat ai route fallback: ${this.getMiaosheErrorMessage(error)}`,
      );
    }

    return {
      decision: fallbackDecision,
      codexResult: null,
    };
  }

  private resolveMiaosheAgentToolSequence(input: {
    routerDecision: MiaosheRouteDecision;
    codexPlan: MediaPublishCodexPlan | null;
    message: string;
  }) {
    const aiSequence = Array.isArray(input.codexPlan?.toolSequence)
      ? input.codexPlan!.toolSequence.filter((item) => item?.tool)
      : [];
    if (aiSequence.length > 0) {
      return aiSequence;
    }

    return this.buildFallbackMiaosheAgentToolSequence(input.routerDecision.route, input.message);
  }

  private buildFallbackMiaosheAgentToolSequence(
    route: MiaosheWorkflowRoute,
    message: string,
  ): MediaPublishCodexToolStep[] {
    const fallbackPlatforms = this.extractMediaPlatforms(message).map((item) => item.id);

    if (route === 'media_publish') {
      return [
        {
          tool: 'ensure_bridge_connection',
          reason: '需要先确认扩展桥接与浏览器连接正常。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'list_platforms',
          reason: '需要同步当前已登录的平台账号。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'check_auth',
          reason: '需要检查目标平台是否已登录。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'sync_article',
          reason: '已进入发布场景，需要创建平台草稿。',
          platformIds: fallbackPlatforms,
          forceRefresh: false,
        },
      ];
    }

    if (route === 'platform_data') {
      return [
        {
          tool: 'ensure_bridge_connection',
          reason: '抓取后台数据前需要确认扩展桥接正常。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'list_platforms',
          reason: '需要同步已登录的平台账号。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'check_auth',
          reason: '需要确认目标平台账号已登录。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'refresh_platform_data',
          reason: '需要抓取创作者后台数据。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
      ];
    }

    if (route === 'status_check' || route === 'login_help' || route === 'integration_help') {
      return [
        {
          tool: 'ensure_bridge_connection',
          reason: '需要先确认桥接与扩展连接状态。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'list_platforms',
          reason: '需要同步当前已登录的平台账号。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
        {
          tool: 'check_auth',
          reason: '需要确认目标平台账号是否已登录。',
          platformIds: fallbackPlatforms,
          forceRefresh: true,
        },
      ];
    }

    return [];
  }

  private buildMiaosheRouteDecisionFromPlan(
    mode: 'chat' | 'agent',
    message: string,
    plan: MediaPublishCodexPlan,
  ): MiaosheRouteDecision {
    const targetPlatforms = this.resolveMediaPlatformsByIds(plan.targetPlatformIds);
    const normalizedIntent = plan.shouldEnterWorkflow ? plan.intent : 'general_chat';
    let route: MiaosheWorkflowRoute = 'chat';
    let visibleReplyType: MiaosheRouteDecision['visibleReplyType'] = 'answer';

    if (normalizedIntent === 'article_draft') {
      route = 'article_draft';
      visibleReplyType = 'artifact';
    } else if (
      normalizedIntent === 'image_generate' ||
      normalizedIntent === 'video_storyboard' ||
      normalizedIntent === 'video_generate' ||
      normalizedIntent === 'media_edit'
    ) {
      route = normalizedIntent;
      visibleReplyType = 'clarification_or_artifact';
    } else if (normalizedIntent === 'media_publish') {
      route = 'media_publish';
      visibleReplyType = 'confirmation_or_result';
    } else if (
      normalizedIntent === 'platform_data' ||
      normalizedIntent === 'status_check' ||
      normalizedIntent === 'login_help' ||
      normalizedIntent === 'integration_help'
    ) {
      route = normalizedIntent;
      visibleReplyType = 'run_status';
    }

    const shouldRunWorkflow =
      route !== 'chat' &&
      route !== 'article_draft';
    const reason =
      String(plan.summary || '').trim() ||
      (shouldRunWorkflow ? `AI 已识别为 ${route} 工作流。` : 'AI 已识别为普通对话。');

    return {
      route,
      mode,
      assetType:
        plan.assetType === 'image' || plan.assetType === 'video' ? plan.assetType : 'none',
      shouldRunWorkflow,
      visibleReplyType,
      confidence: 0.94,
      reason,
      needsClarification: Boolean(plan.needsClarification),
      clarificationQuestions: Array.isArray(plan.clarificationQuestions)
        ? plan.clarificationQuestions.filter((item) => String(item || '').trim())
        : [],
      targetPlatformIds:
        targetPlatforms.length > 0 ? targetPlatforms.map((item) => item.id) : plan.targetPlatformIds,
      requiresConfirmation:
        route === 'media_publish' ||
        route === 'image_generate' ||
        route === 'media_edit' ||
        route === 'video_storyboard' ||
        route === 'video_generate' ||
        Boolean(plan.confirmationRequired),
      source: 'ai',
    };
  }

  private buildMiaosheThinkingStatus(routerDecision: MiaosheRouteDecision) {
    if (
      routerDecision.route === 'image_generate' ||
      routerDecision.route === 'media_edit' ||
      routerDecision.route === 'video_storyboard' ||
      routerDecision.route === 'video_generate'
    ) {
      return {
        label: 'miaoshechat 正在执行',
        detail:
          routerDecision.route === 'image_generate' || routerDecision.route === 'media_edit'
            ? '正在检查图片需求、参考素材和执行条件...'
            : '正在检查视频需求、参考素材和执行条件...',
      };
    }

    if (this.isMiaosheExecutionRoute(routerDecision.route)) {
      return {
        label: 'miaoshechat 正在执行',
        detail: '正在检查任务路由、平台连接和执行条件...',
      };
    }

    return {
      label: 'miaoshechat 正在思考',
      detail:
        routerDecision.route === 'article_draft'
          ? '正在理解主题并组织文章结构...'
          : '正在整理上下文并生成回复...',
    };
  }

  private isMiaosheExecutionRoute(route: MiaosheWorkflowRoute) {
    return (
      route === 'image_generate' ||
      route === 'media_edit' ||
      route === 'video_storyboard' ||
      route === 'video_generate' ||
      route === 'media_publish' ||
      route === 'platform_data' ||
      route === 'status_check' ||
      route === 'login_help' ||
      route === 'integration_help'
    );
  }

  private buildMiaosheRouterDecision(input: {
    mode: 'chat' | 'agent';
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): MiaosheRouteDecision {
    const message = String(input.message || '');
    const naturalMediaExecutionConfirmation = this.isMiaosheNaturalMediaExecutionConfirmation(
      message,
      input.history,
    );
    const historicalMediaIntent = this.inferMiaosheMediaIntentFromHistory(input.history);
    const historicalVideoIntent =
      historicalMediaIntent === 'video_storyboard' || historicalMediaIntent === 'video_generate'
        ? historicalMediaIntent
        : null;
    const targetPlatforms = this.extractMediaPlatformsFromConversation(message, input.history);
    const explicitImageGenerationRequest = this.isMiaosheExplicitImageGenerationRequest(message);
    const wantsReferenceImageEdit =
      /(参考图生图|以图生图)/.test(message) ||
      (/(垫图|基于这张图|按这张图|用这张图|参考这张图|参考上传图|根据这张图|素材库那张图|上传的图)/.test(
        message,
      ) &&
        explicitImageGenerationRequest);
    const wantsImageGeneration =
      explicitImageGenerationRequest ||
      /(生成|做|制作|创作|产出).*(图片|海报|封面|主图|宣传图|配图|场景图|效果图)|生图|文生图|图片生成/.test(
        message,
      );
    const wantsPublish = /发布|发到|发去|同步|分发|推送|投到|投递/.test(message);
    const wantsLogin = /登录|登陆|授权|账号/.test(message);
    const wantsSetup = /扩展|插件|桥接|连接|安装|mcp/i.test(message);
    const wantsPlatformData =
      /后台数据|创作者后台|作品数据|平台数据|账号数据|数据分析|查看数据|看数据|播放量|阅读量|曝光|互动|点赞|评论|收藏|转发|粉丝|爆文|复盘/.test(
        message,
      );
    const wantsStatus = /检查|检测|状态|查看|平台|已登录/.test(message);
    const wantsArticleDraft =
      /(生成|起草|撰写|写一篇|写篇|创作|产出).*(文章|文案|草稿|内容)|帮我写|写.*文章/.test(
        message,
      );
    const wantsVideoGeneration =
      /(生成|做|制作|创作|产出).*(视频|短视频|片子|动画|分镜)|文生视频|生视频|分镜|镜头脚本|storyboard/i.test(
        message,
      );

    let route: MiaosheWorkflowRoute = 'chat';
    let assetType: 'none' | 'image' | 'video' = 'none';
    let visibleReplyType: MiaosheRouteDecision['visibleReplyType'] = 'answer';
    let reason = '普通对话，直接走助手回答流。';
    let confidence = 0.62;

    if (naturalMediaExecutionConfirmation && historicalMediaIntent) {
      route = historicalMediaIntent;
      assetType =
        historicalMediaIntent === 'video_storyboard' || historicalMediaIntent === 'video_generate'
          ? 'video'
          : 'image';
      visibleReplyType = 'clarification_or_artifact';
      reason =
        assetType === 'video'
          ? '用户已确认按当前整理好的视频需求开始执行。'
          : '用户已确认按当前整理好的图片需求开始执行。';
      confidence = 0.92;
    } else if (
      historicalVideoIntent &&
      this.isMiaosheVideoContinuationMessage(message) &&
      !explicitImageGenerationRequest
    ) {
      route = historicalVideoIntent;
      assetType = 'video';
      visibleReplyType = 'clarification_or_artifact';
      reason = '用户正在继续补充视频生成所需参数，应持续走视频链路。';
      confidence = 0.9;
    } else if (wantsImageGeneration) {
      route = wantsReferenceImageEdit ? 'media_edit' : 'image_generate';
      assetType = 'image';
      visibleReplyType = 'clarification_or_artifact';
      reason = wantsReferenceImageEdit ? '用户明确提出了参考图生图诉求。' : '用户明确提出了图片生成诉求。';
      confidence = 0.9;
    } else if (wantsSetup || wantsLogin) {
      route = wantsSetup ? 'integration_help' : 'login_help';
      visibleReplyType = 'run_status';
      reason = wantsSetup ? '用户需要扩展、插件或桥接连接帮助。' : '用户需要账号登录或授权帮助。';
      confidence = 0.88;
    } else if (wantsPlatformData && targetPlatforms.length > 0) {
      route = 'platform_data';
      visibleReplyType = 'run_status';
      reason = '用户要求查看指定平台的数据或作品表现。';
      confidence = 0.9;
    } else if (wantsPublish || (targetPlatforms.length > 0 && (wantsStatus || /草稿|正文|标题/.test(message)))) {
      route = wantsPublish ? 'media_publish' : 'status_check';
      visibleReplyType = wantsPublish ? 'confirmation_or_result' : 'run_status';
      reason = wantsPublish ? '用户表达了发布、同步或分发动作。' : '用户提到平台并要求查看状态。';
      confidence = 0.86;
    } else if (wantsStatus && targetPlatforms.length > 0) {
      route = 'status_check';
      visibleReplyType = 'run_status';
      reason = '用户要求检查指定平台状态。';
      confidence = 0.86;
    } else if (wantsStatus) {
      route = 'status_check';
      visibleReplyType = 'run_status';
      reason = '用户要求检查平台状态。';
      confidence = 0.78;
    } else if (wantsArticleDraft) {
      route = 'article_draft';
      visibleReplyType = 'artifact';
      reason = '用户要求生成文章、文案或内容草稿。';
      confidence = 0.84;
    } else if (wantsVideoGeneration) {
      route = /(分镜|镜头脚本|storyboard)/i.test(message) ? 'video_storyboard' : 'video_generate';
      assetType = 'video';
      visibleReplyType = 'clarification_or_artifact';
      reason = '用户明确提出了视频生成诉求。';
      confidence = 0.9;
    }

    return {
      route,
      mode: input.mode,
      assetType,
      shouldRunWorkflow:
        route !== 'chat' &&
        route !== 'article_draft',
      visibleReplyType,
      confidence,
      reason,
      needsClarification: false,
      clarificationQuestions: [],
      targetPlatformIds: targetPlatforms.map((item) => item.id),
      requiresConfirmation:
        route === 'media_publish' ||
        route === 'image_generate' ||
        route === 'media_edit' ||
        route === 'video_storyboard' ||
        route === 'video_generate',
      source: 'fallback',
    };
  }

  private buildMediaArtifactFromCodexPlan(
    plan: MediaPublishCodexPlan | null,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): MiaosheMediaArtifactResult {
    const inferredVideo =
      plan?.assetType === 'video' ||
      plan?.intent === 'video_storyboard' ||
      plan?.intent === 'video_generate' ||
      /(视频|短视频|分镜|镜头脚本|storyboard)/i.test(message);
    const kind: 'image' | 'video' = inferredVideo ? 'video' : 'image';
    const plannedIntent =
      plan?.intent &&
      (
        ['image_generate', 'video_storyboard', 'video_generate', 'media_edit'] as Array<
          'image_generate' | 'video_storyboard' | 'video_generate' | 'media_edit'
        >
      ).includes(plan.intent as 'image_generate' | 'video_storyboard' | 'video_generate' | 'media_edit')
        ? (plan.intent as 'image_generate' | 'video_storyboard' | 'video_generate' | 'media_edit')
        : null;
    const intent =
      kind === 'video'
        ? plannedIntent === 'media_edit'
          ? 'media_edit'
          : 'video_generate'
        : plannedIntent === 'media_edit'
          ? 'media_edit'
          : 'image_generate';
    const prompt =
      String(plan?.prompt || '').trim() ||
      this.buildMiaosheMediaPromptFromConversation({
        kind,
        intent,
        message,
        history,
      });
    const clarificationQuestions = Array.isArray(plan?.clarificationQuestions)
      ? plan!.clarificationQuestions.filter((item) => String(item || '').trim())
      : [];
    const needsClarification =
      Boolean(plan?.needsClarification) ||
      (intent === 'media_edit' && !/(图片|图像|视频|素材|链接|上传|这张|这个)/.test(message));
    const title =
      kind === 'image'
        ? '图片生成需求'
        : '视频生成需求';
    const imageCount =
      kind === 'image'
        ? this.resolveMiaosheRequestedImageCount({
            plannedCount: plan?.imageCount,
            message,
            prompt,
          })
        : undefined;

    return {
      id: randomUUID(),
      type: 'media_generation',
      kind,
      intent,
      title,
      summary: String(plan?.summary || '').trim(),
      prompt,
      aspectRatio: this.extractMiaosheAspectRatio(String(plan?.aspectRatio || ''), message, history, kind),
      duration: String(plan?.duration || '').trim(),
      style: String(plan?.style || '').trim(),
      videoModel:
        kind === 'video'
          ? this.normalizeMiaosheVideoModelName(
              String(plan?.videoModel || '').trim() ||
                this.extractMiaosheVideoModelPreference(`${message}\n${prompt}`),
            )
          : '',
      imageCount,
      needsClarification,
      confirmationRequired: Boolean(
        kind === 'video' ||
          intent === 'image_generate' ||
          intent === 'media_edit' ||
          plan?.confirmationRequired,
      ),
      clarificationQuestions,
      storyboard: Array.isArray(plan?.storyboard)
        ? plan!.storyboard
            .map((item, index) => ({
              shot: item.shot || `镜头 ${index + 1}`,
              duration: item.duration || '',
              visual: item.visual || '',
              camera: item.camera || '',
              subtitle: item.subtitle || '',
              voiceover: item.voiceover || '',
            }))
            .filter((item) => item.visual || item.voiceover || item.subtitle || item.shot)
        : [],
      images: [],
      videos: [],
    };
  }

  private normalizeMiaosheImageCount(value: number | undefined | null) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) {
      return 1;
    }
    return Math.max(1, Math.min(MIAOSHE_MAX_BATCH_IMAGE_COUNT, Math.floor(count)));
  }

  private resolveMiaosheRequestedImageCount(input: {
    plannedCount?: number;
    message: string;
    prompt: string;
  }) {
    const plannedCount = this.normalizeMiaosheImageCount(input.plannedCount);
    const fallbackCount = Math.max(
      this.extractMiaosheImageCount(input.message),
      this.extractMiaosheImageCount(input.prompt),
    );
    return input.plannedCount && input.plannedCount > 0 ? plannedCount : fallbackCount;
  }

  private extractMiaosheAspectRatio(
    preferredValue: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    kind: 'image' | 'video',
  ) {
    const normalizedPreferred = String(preferredValue || '').trim();
    if (normalizedPreferred) {
      return normalizedPreferred;
    }

    const candidates = [
      String(message || '').trim(),
      ...history
        .filter((item) => item.role === 'user')
        .map((item) => String(item.content || '').trim())
        .filter(Boolean)
        .slice(-4)
        .reverse(),
    ];

    for (const candidate of candidates) {
      const matched = candidate.match(/\b(16:9|9:16|4:3|3:4|3:2|2:3|1:1)\b/);
      if (matched?.[1]) {
        return matched[1];
      }
      if (/(横版|横构图|宽屏)/.test(candidate)) {
        return '16:9';
      }
      if (/(竖版|竖构图|竖屏)/.test(candidate)) {
        return '9:16';
      }
      if (/(方图|方形|正方形)/.test(candidate)) {
        return '1:1';
      }
    }

    return kind === 'video' ? '9:16' : '1:1';
  }

  private buildMiaosheMediaPromptFromConversation(input: {
    kind: 'image' | 'video';
    intent: 'image_generate' | 'video_storyboard' | 'video_generate' | 'media_edit';
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const normalizedHistory = input.history
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content || '').trim(),
      }))
      .filter((item) => item.content);
    const userMessages = normalizedHistory
      .filter((item) => item.role === 'user')
      .map((item) => item.content)
      .filter((content) => !this.isMiaosheBriefConfirmationMessage(content));
    const recentRequirements = userMessages.slice(-4).join('\n');
    const baseRequirement = recentRequirements || String(input.message || '').trim();

    if (input.kind === 'video') {
      return baseRequirement || '请生成一个视频。';
    }

    if (input.intent === 'media_edit') {
      return baseRequirement
        ? `请基于上传的参考图，完成以下图片编辑或参考图生成需求：${baseRequirement}`
        : '请基于上传的参考图完成图片编辑。';
    }

    return baseRequirement ? `请根据以下要求生成图片：${baseRequirement}` : '请生成一张图片。';
  }

  private buildMediaArtifactAssistantText(artifact: MiaosheMediaArtifactResult) {
    if (artifact.needsClarification) {
      const questions =
        artifact.clarificationQuestions && artifact.clarificationQuestions.length > 0
          ? artifact.clarificationQuestions
              .map((item, index) => `${index + 1}. ${item}`)
              .join('\n')
          : artifact.kind === 'video'
            ? '1. 有没有参考图，或者直接用素材库/上传图做首帧？\n2. 想生成 3、5、10 还是 15 秒？\n3. 清晰度选 720P 还是 1080P？\n4. 想自己选视频模型吗？文生视频可选 happyhorse-1.0-t2v；单图生视频可选 happyhorse-1.0-i2v、wan2.6-i2v、wan2.6-i2v-flash；多参考图强一致可选 happyhorse-1.0-r2v。'
            : '1. 图片主体是什么？\n2. 用途和比例是什么？\n3. 想要什么视觉风格？';
      return `${artifact.kind === 'video' ? '开始生成视频前' : '开始生图前'}，还差几个关键信息：\n\n${questions}`;
    }

    if (artifact.kind === 'video') {
      return '我已经整理好视频生成需求，可以按这个提示词继续生成视频。';
    }

    return '我已经整理好图片生成需求，可以按这个提示词继续生成图片。';
  }

  private buildMiaosheImageAssistantText(artifact: MiaosheMediaArtifactResult) {
    if (artifact.generationStatus === 'completed' && artifact.images.length > 0) {
      return `已经帮你生成 ${artifact.images.length} 张图片了，可以直接预览、下载，或者插入文章里继续用。`;
    }

    if (artifact.generationStatus === 'failed') {
      return `图片生成失败了：${artifact.error || '请稍后重试。'}`;
    }

    return this.buildMediaArtifactAssistantText(artifact);
  }

  private buildMiaosheVideoAssistantText(artifact: MiaosheMediaArtifactResult) {
    if (artifact.generationStatus === 'completed' && (artifact.videos?.length || 0) > 0) {
      return `已经帮你生成 ${artifact.videos?.length || 0} 条视频了，可以直接预览、下载，或者继续调整提示词重做。`;
    }

    if (artifact.generationStatus === 'failed') {
      return `视频生成失败了：${artifact.error || '请稍后重试。'}`;
    }

    return this.buildMediaArtifactAssistantText(artifact);
  }

  private shouldExposeMiaosheMediaArtifact(artifact: MiaosheMediaArtifactResult | null) {
    if (!artifact) {
      return false;
    }

    if (artifact.kind === 'video') {
      return (
        (artifact.videos?.length || 0) > 0 ||
        artifact.generationStatus === 'generating' ||
        artifact.generationStatus === 'processing' ||
        artifact.generationStatus === 'completed' ||
        artifact.generationStatus === 'failed'
      );
    }

    return true;
  }

  private ensureMiaosheAssistantContent(input: {
    content: string;
    confirmationRequest: AgentConfirmationRequest | null;
    agentRun: AgentRunPayload | null;
    articleArtifact: MiaosheArticleArtifactResult | null;
    mediaArtifact: MiaosheMediaArtifactResult | null;
  }) {
    const content = String(input.content || '').trim();
    if (content) {
      return content;
    }

    const synthesized = this.buildMiaosheProtocolAssistantText(input);
    if (synthesized) {
      this.logger.warn('MiaoSheChat returned control-only payload; synthesized assistant content.');
      return synthesized;
    }

    throw new BadGatewayException('MiaoSheChat 暂时没有返回可用内容');
  }

  private buildMiaosheProtocolAssistantText(input: {
    confirmationRequest: AgentConfirmationRequest | null;
    agentRun: AgentRunPayload | null;
    articleArtifact: MiaosheArticleArtifactResult | null;
    mediaArtifact: MiaosheMediaArtifactResult | null;
  }) {
    if (input.mediaArtifact) {
      return input.mediaArtifact.kind === 'image'
        ? this.buildMiaosheImageAssistantText(input.mediaArtifact)
        : this.buildMiaosheVideoAssistantText(input.mediaArtifact);
    }

    if (input.articleArtifact) {
      return `我已经生成了《${this.normalizeTitle(input.articleArtifact.title)}》的文章草稿，可以直接继续编辑。`;
    }

    if (input.confirmationRequest) {
      const runSummary = String(input.agentRun?.summary || '').trim();
      return runSummary
        ? `${runSummary} 请确认后我继续执行。`
        : String(input.confirmationRequest.description || '').trim();
    }

    if (input.agentRun) {
      return this.buildMiaosheAgentRunAssistantText(input.agentRun);
    }

    return '';
  }

  private buildMiaosheAgentRunAssistantText(run: AgentRunPayload) {
    const summary = String(run.summary || '').trim();
    const stepsText = run.steps.length
      ? `\n\n当前进度：\n${run.steps
          .slice(0, 4)
          .map((step, index) => `${index + 1}. ${step.title}：${step.detail}`)
          .join('\n')}`
      : '';
    const actionText = run.actions.length
      ? `\n\n下一步可直接执行：${run.actions.map((item) => item.label).join('、')}。`
      : '';

    if (run.status === 'failed') {
      return `${summary || '任务执行过程中出现了问题。'}${stepsText}${actionText}`.trim();
    }
    if (run.status === 'needs_action') {
      return `${summary || '任务已经推进到需要你配合的阶段。'}${stepsText}${actionText}`.trim();
    }
    return `${summary || '任务已经执行完成。'}${stepsText}${actionText}`.trim();
  }

  private isMiaosheBriefConfirmationMessage(message: string) {
    const normalizedMessage = String(message || '')
      .trim()
      .replace(/\s+/g, '');
    if (!normalizedMessage || normalizedMessage.length > 24) {
      return false;
    }

    return /^(确认(无误|没问题|可以|好了)?|开始(生成|生图|做图)?吧?|开始生成|开始生图|生成吧|生图吧|继续生成|继续生图|可以开始了|没问题开始吧|好的开始吧|就这样生成|按这个生成|按这个来|行|好|好的|可以)$/.test(
      normalizedMessage,
    );
  }

  private isMiaosheExplicitImageGenerationRequest(message: string) {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) {
      return false;
    }

    return (
      /(参考图生图|以图生图|先生图|先做图|先出图|先生成图|先生成一张图|先生成一张参考图)/.test(
        normalizedMessage,
      ) ||
      /(生成|做|制作|画|出).*(图片|海报|封面|主图|宣传图|配图|场景图|效果图|参考图)/.test(
        normalizedMessage,
      )
    );
  }

  private isMiaosheVideoContinuationMessage(message: string) {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) {
      return false;
    }

    return (
      /(happyhorse-1\.0-(?:t2v|i2v|r2v)|wan2\.(?:5|6)-i2v(?:-preview|-flash)?)/i.test(
        normalizedMessage,
      ) ||
      /(5秒|10秒|15秒|3秒|720p|1080p|9:16|16:9|1:1|3:4|4:3|有音频|无音频|配音|口播|首帧|主体图|参考图|素材库那张图|上传的图|抖音竖屏|竖屏|横屏)/i.test(
        normalizedMessage,
      )
    );
  }

  private isMiaosheNaturalMediaExecutionConfirmation(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    if (!this.isMiaosheBriefConfirmationMessage(message)) {
      return false;
    }

    const recentHistory = history.slice(-6);
    const hasMediaContext = recentHistory.some((item) =>
      /(图片|生图|参考图|宣传图|海报|封面|配图|主图|写实|风格|尺寸|比例|小红书|电商图|场景图|视频|短视频|镜头|分镜|图生视频|文生视频|运镜|口播)/.test(
        String(item.content || ''),
      ),
    );
    const assistantQueuedGeneration = recentHistory.some(
      (item) =>
        item.role === 'assistant' &&
        /(确认无误|如果还有其他补充|接下来我将基于这些信息|可以按这个提示词继续生成图片|可以按这个提示词继续生成视频|图片生成需求|视频生成需求|参考图生图需求|开始生图前|开始生成视频前|视频生成需求已经整理完成)/.test(
          String(item.content || ''),
        ),
    );

    return hasMediaContext && assistantQueuedGeneration;
  }

  private inferMiaosheMediaIntentFromHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate' | null {
    const recentHistory = history.slice(-8);
    const recentText = recentHistory.map((item) => String(item.content || '')).join('\n');
    if (!recentText.trim()) {
      return null;
    }

    if (
      /(开始生成视频前|开始做视频前|视频生成需求|视频生成结果|按这个提示词继续生成视频|参考图生视频|图生视频|文生视频|生成视频|做视频)/.test(
        recentText,
      )
    ) {
      return /(分镜|镜头脚本|storyboard)/i.test(recentText) ? 'video_storyboard' : 'video_generate';
    }

    if (/(参考图生图|参考图|垫图|基于这张图|按这张图|上传.*图|这张图|原图|素材图)/.test(recentText)) {
      return 'media_edit';
    }

    if (/(图片|生图|宣传图|海报|封面|配图|主图|场景图)/.test(recentText)) {
      return 'image_generate';
    }

    return null;
  }

  private isMiaosheImageSkillIntent(intent: string) {
    return intent === 'image_generate' || intent === 'media_edit';
  }

  private normalizePublicImageAccountId(input: {
    id?: string;
    accountId?: string;
    userId?: string;
  }) {
    const accountId = String(input.accountId || input.id || input.userId || '').trim();
    if (!accountId) {
      throw new BadRequestException('缺少账号 ID，请传入 id 或 accountId。');
    }
    if (accountId.length > 128 || !/^[a-zA-Z0-9:_@.+-]+$/.test(accountId)) {
      throw new BadRequestException('账号 ID 格式不正确。');
    }
    return accountId;
  }

  private normalizePublicImagePrompt(prompt?: string) {
    const normalized = String(prompt || '').trim();
    if (normalized.length < 4) {
      throw new BadRequestException('请提供至少 4 个字符的生图提示词。');
    }
    if (normalized.length > 2000) {
      throw new BadRequestException('生图提示词不能超过 2000 个字符。');
    }
    return normalized;
  }

  private normalizePublicImageSize(size?: string) {
    const normalized = String(size || '1024x1024').trim().toLowerCase();
    const allowed = new Set(['1024x1024', '1024x1536', '1536x1024']);
    if (!allowed.has(normalized)) {
      throw new BadRequestException('size 仅支持 1024x1024、1024x1536、1536x1024。');
    }
    return normalized;
  }

  private getPublicImageQuotaDateKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  private async ensurePublicImageUsageTable() {
    if (!this.publicImageUsageTableEnsured) {
      this.publicImageUsageTableEnsured = this.mysqlService.query(`
        CREATE TABLE IF NOT EXISTS public_image_generation_daily_usage (
          account_id VARCHAR(128) NOT NULL,
          usage_date DATE NOT NULL,
          request_count INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (account_id, usage_date),
          KEY idx_public_image_generation_daily_usage_date (usage_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `).then(() => undefined);
    }
    await this.publicImageUsageTableEnsured;
  }

  private async consumePublicImageQuota(accountId: string) {
    await this.ensurePublicImageUsageTable();
    const limit = Number(this.configService.get<string>('PUBLIC_IMAGE_DAILY_LIMIT', '5'));
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
    const usageDate = this.getPublicImageQuotaDateKey();
    const connection = await this.mysqlService.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT request_count
         FROM public_image_generation_daily_usage
         WHERE account_id = ? AND usage_date = ?
         FOR UPDATE`,
        [accountId, usageDate],
      );
      const usageRows = rows as Array<{ request_count: number }>;
      const current = Number(usageRows[0]?.request_count || 0);
      if (current >= safeLimit) {
        await connection.rollback();
        throw new HttpException(
          {
            message: `今日免费生图次数已用完，每个账号每天最多 ${safeLimit} 次。`,
            code: 'PUBLIC_IMAGE_DAILY_LIMIT_EXCEEDED',
            quota: {
              accountId,
              date: usageDate,
              limit: safeLimit,
              used: current,
              remaining: 0,
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const next = current + 1;
      if (usageRows.length === 0) {
        await connection.query(
          `INSERT INTO public_image_generation_daily_usage
             (account_id, usage_date, request_count, created_at, updated_at)
           VALUES (?, ?, ?, NOW(), NOW())`,
          [accountId, usageDate, next],
        );
      } else {
        await connection.query(
          `UPDATE public_image_generation_daily_usage
           SET request_count = ?, updated_at = NOW()
           WHERE account_id = ? AND usage_date = ?`,
          [next, accountId, usageDate],
        );
      }
      await connection.commit();

      return {
        accountId,
        date: usageDate,
        limit: safeLimit,
        used: next,
        remaining: Math.max(0, safeLimit - next),
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}
      throw error;
    } finally {
      connection.release();
    }
  }

  private async refundPublicImageQuota(accountId: string) {
    try {
      await this.ensurePublicImageUsageTable();
      await this.mysqlService.query(
        `UPDATE public_image_generation_daily_usage
         SET request_count = GREATEST(request_count - 1, 0), updated_at = NOW()
         WHERE account_id = ? AND usage_date = ?`,
        [accountId, this.getPublicImageQuotaDateKey()],
      );
    } catch (error) {
      this.logger.warn(`Refund public image quota failed: ${this.getMiaosheErrorMessage(error)}`);
    }
  }

  private getMiaosheImageConfig() {
    const apiKey =
      this.configService.get<string>('MIAOSHE_IMAGE_API_KEY') ||
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      this.configService.get<string>('VECTORENGINE_API_KEY');
    if (!apiKey) {
      throw new BadGatewayException('图片生成模型未配置，请先配置图片模型 API Key。');
    }

    return {
      apiKey,
      model:
        this.configService.get<string>('MIAOSHE_IMAGE_MODEL') ||
        this.configService.get<string>('OPENAI_IMAGE_MODEL') ||
        'gpt-image-2',
      baseUrl: this.normalizeBaseUrl(
        this.configService.get<string>('MIAOSHE_IMAGE_BASE_URL') ||
          this.configService.get<string>('OPENAI_BASE_URL') ||
          this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
          this.configService.get<string>('VECTORENGINE_BASE_URL') ||
          'https://api.openai.com/v1',
      ),
    };
  }

  private mapMiaosheImageAspectRatioToSize(aspectRatio?: string) {
    const normalized = String(aspectRatio || '')
      .trim()
      .toLowerCase();
    if (normalized === '9:16' || normalized === '3:4' || normalized === '2:3') {
      return '1024x1536';
    }
    if (normalized === '16:9' || normalized === '4:3' || normalized === '3:2') {
      return '1536x1024';
    }
    return '1024x1024';
  }

  private extractMiaosheImageCount(message: string) {
    const normalized = String(message || '').trim();
    if (!normalized) {
      return 1;
    }

    const directPattern =
      /(?:一共|总共|总计|合计|共|要|来|出|做|生成|给我|帮我|先来|直接来)?\s*([零一二两三四五六七八九十百\d]{1,4})\s*(张|幅|版|个|套|组|款|稿|方案)\s*(?:图片|图|海报|封面|主图|配图|效果图|宣传图)?/g;
    const counts: number[] = [];

    for (const matched of normalized.matchAll(directPattern)) {
      const parsed = this.parseMiaosheCountValue(matched[1]);
      if (parsed > 0) {
        counts.push(parsed);
      }
    }

    const groupedPattern =
      /([零一二两三四五六七八九十百\d]{1,4})\s*(?:个方向|种方案|套图|组图|组)\D{0,12}?(?:每个|每组|每套|各)\s*([零一二两三四五六七八九十百\d]{1,4})\s*(?:张|幅|版)/;
    const groupedMatch = normalized.match(groupedPattern);
    if (groupedMatch?.[1] && groupedMatch?.[2]) {
      const groupCount = this.parseMiaosheCountValue(groupedMatch[1]);
      const perGroupCount = this.parseMiaosheCountValue(groupedMatch[2]);
      if (groupCount > 0 && perGroupCount > 0) {
        counts.push(groupCount * perGroupCount);
      }
    }

    if (/九宫格/.test(normalized)) {
      counts.push(9);
    }

    if (counts.length === 0) {
      return 1;
    }

    return this.normalizeMiaosheImageCount(
      Math.max(...counts.map((count) => Math.floor(count))),
    );
  }

  private parseMiaosheCountValue(value: string) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return 0;
    }

    const numericCount = Number(normalized);
    if (Number.isFinite(numericCount) && numericCount > 0) {
      return numericCount;
    }

    const cnMap: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    if (normalized === '十') {
      return 10;
    }
    if (normalized === '百') {
      return 100;
    }
    if (normalized.length === 2 && normalized.startsWith('十') && cnMap[normalized[1]] !== undefined) {
      return 10 + cnMap[normalized[1]];
    }
    if (normalized.length === 2 && normalized.endsWith('十') && cnMap[normalized[0]] !== undefined) {
      return cnMap[normalized[0]] * 10;
    }
    if (
      normalized.length === 3 &&
      normalized[1] === '十' &&
      cnMap[normalized[0]] !== undefined &&
      cnMap[normalized[2]] !== undefined
    ) {
      return cnMap[normalized[0]] * 10 + cnMap[normalized[2]];
    }
    if (cnMap[normalized] !== undefined) {
      return cnMap[normalized];
    }

    return 0;
  }

  private async resolveMiaosheReferenceImages(
    brandId: string,
    attachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>,
  ) {
    const imageAttachments = attachments.filter((item) => item.type === 'image').slice(0, 10);
    const resolved: string[] = [];

    for (const attachment of imageAttachments) {
      const dataUrl = await this.materializeMiaosheReferenceImage(brandId, attachment);
      if (dataUrl) {
        resolved.push(dataUrl);
      }
    }

    return resolved;
  }

  private async buildMiaosheOpenAiHistoryMessages(input: {
    brandId: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentMessage: string;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
  }) {
    const messages: Array<Record<string, unknown>> = [];
    for (let index = 0; index < input.history.length; index += 1) {
      const item = input.history[index];
      const isLatestUserTurn =
        index === input.history.length - 1 &&
        item.role === 'user' &&
        item.content === input.currentMessage;

      messages.push({
        role: item.role,
        content: isLatestUserTurn
          ? await this.buildMiaosheOpenAiUserMessageContent({
              brandId: input.brandId,
              message: item.content,
              uploadedAttachments: input.uploadedAttachments,
            })
          : item.content,
      });
    }
    return messages;
  }

  private async buildMiaosheOpenAiUserMessageContent(input: {
    brandId: string;
    message: string;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
  }) {
    const referenceImages = (
      await this.resolveMiaosheReferenceImages(input.brandId, input.uploadedAttachments)
    ).slice(0, 6);
    const text = String(input.message || '').trim() || '请结合我上传的图片回答。';

    if (referenceImages.length === 0) {
      return text;
    }

    return [
      { type: 'text' as const, text },
      ...referenceImages.map((imageUrl) => ({
        type: 'image_url' as const,
        image_url: { url: imageUrl },
      })),
    ];
  }

  private async buildMiaosheAnthropicHistoryMessages(input: {
    brandId: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentMessage: string;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
  }) {
    const messages: AnthropicMessage[] = [];
    for (let index = 0; index < input.history.length; index += 1) {
      const item = input.history[index];
      const isLatestUserTurn =
        index === input.history.length - 1 &&
        item.role === 'user' &&
        item.content === input.currentMessage;

      messages.push({
        role: item.role,
        content: isLatestUserTurn
          ? await this.buildMiaosheAnthropicUserMessageContent({
              brandId: input.brandId,
              message: item.content,
              uploadedAttachments: input.uploadedAttachments,
            })
          : [{ type: 'text' as const, text: item.content }],
      });
    }
    return messages;
  }

  private async buildMiaosheAnthropicUserMessageContent(input: {
    brandId: string;
    message: string;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
  }) {
    const content: AnthropicContentBlock[] = [
      {
        type: 'text',
        text: String(input.message || '').trim() || '请结合我上传的图片回答。',
      },
    ];

    const imageAttachments = input.uploadedAttachments.filter((item) => item.type === 'image').slice(0, 6);
    for (const attachment of imageAttachments) {
      const dataUrl = await this.materializeMiaosheVisionImageAsDataUrl(input.brandId, attachment);
      const parsedImage = this.parseMiaosheImageDataUrl(dataUrl);
      if (!parsedImage) {
        continue;
      }
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsedImage.mimeType,
          data: parsedImage.base64,
        },
      });
    }

    return content;
  }

  private async materializeMiaosheReferenceImage(
    brandId: string,
    attachment: {
      url: string;
      mimeType: string;
    },
  ) {
    const rawUrl = String(attachment.url || '').trim();
    const mimeType = String(attachment.mimeType || '').trim() || 'image/png';
    if (!rawUrl) {
      return '';
    }
    if (/^data:image\//i.test(rawUrl)) {
      return rawUrl;
    }
    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }

    const normalizedPath = rawUrl.replace(/^\/api\/backend/, '');
    if (!normalizedPath.startsWith('/uploads/')) {
      return '';
    }

    const localPath = join(process.cwd(), normalizedPath.replace(/^\//, ''));
    try {
      const file = await readFile(localPath);
      return `data:${mimeType};base64,${file.toString('base64')}`;
    } catch {
      const fallbackPath = join(process.cwd(), 'uploads', 'miaoshe-chat', brandId, normalizedPath.split('/').pop() || '');
      try {
        const file = await readFile(fallbackPath);
        return `data:${mimeType};base64,${file.toString('base64')}`;
      } catch {
        return '';
      }
    }
  }

  private async materializeMiaosheVisionImageAsDataUrl(
    brandId: string,
    attachment: {
      url: string;
      mimeType: string;
    },
  ) {
    const materialized = await this.materializeMiaosheReferenceImage(brandId, attachment);
    if (!materialized) {
      return '';
    }
    if (/^data:image\//i.test(materialized)) {
      return materialized;
    }
    if (!/^https?:\/\//i.test(materialized)) {
      return '';
    }

    try {
      const response = await fetch(materialized);
      if (!response.ok) {
        return '';
      }
      const mimeType = response.headers.get('content-type') || attachment.mimeType || 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      return '';
    }
  }

  private parseMiaosheImageDataUrl(dataUrl: string) {
    const matched = String(dataUrl || '')
      .trim()
      .match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
    if (!matched) {
      return null;
    }
    return {
      mimeType: matched[1],
      base64: matched[2].replace(/\s+/g, ''),
    };
  }

  private getMiaosheVideoConfig() {
    const apiKey =
      this.configService.get<string>('MIAOSHE_VIDEO_API_KEY') ||
      this.configService.get<string>('MIAOSHE_IMAGE_API_KEY') ||
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      this.configService.get<string>('VECTORENGINE_API_KEY');
    if (!apiKey) {
      throw new BadGatewayException('视频生成模型未配置，请先配置视频模型 API Key。');
    }

    const rawBaseUrl =
      this.configService.get<string>('MIAOSHE_VIDEO_BASE_URL') ||
      this.configService.get<string>('MIAOSHE_IMAGE_BASE_URL') ||
      this.configService.get<string>('OPENAI_BASE_URL') ||
      this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
      this.configService.get<string>('VECTORENGINE_BASE_URL') ||
      'https://api.vectorengine.ai/v1';
    const baseUrl = this.normalizeMiaosheVideoProviderBaseUrl(rawBaseUrl);

    const overrideModel = this.normalizeMiaosheVideoOverrideModel(
      this.configService.get<string>('MIAOSHE_VIDEO_MODEL') || '',
    );

    return {
      apiKey,
      baseUrl,
      textToVideoModel:
        this.configService.get<string>('MIAOSHE_VIDEO_TEXT_MODEL') || 'happyhorse-1.0-t2v',
      imageToVideoHappyhorseModel:
        this.configService.get<string>('MIAOSHE_VIDEO_HAPPYHORSE_IMAGE_MODEL') || 'happyhorse-1.0-i2v',
      referenceToVideoModel:
        this.configService.get<string>('MIAOSHE_VIDEO_REFERENCE_MODEL') || 'happyhorse-1.0-r2v',
      imageToVideoModel:
        this.configService.get<string>('MIAOSHE_VIDEO_IMAGE_MODEL') || 'wan2.6-i2v',
      imageToVideoFlashModel:
        this.configService.get<string>('MIAOSHE_VIDEO_IMAGE_FLASH_MODEL') || 'wan2.6-i2v-flash',
      overrideModel,
    };
  }

  private normalizeMiaosheVideoProviderBaseUrl(value: string) {
    return this.normalizeBaseUrl(value).replace(/\/v1$/i, '');
  }

  private normalizeMiaosheVideoOverrideModel(value: string) {
    const normalized = this.normalizeMiaosheVideoModelName(value);
    if (normalized) {
      return normalized;
    }

    const rawValue = String(value || '').trim();
    if (rawValue) {
      this.logger.warn(`Ignoring unsupported MIAOSHE_VIDEO_MODEL override: ${rawValue}`);
    }
    return '';
  }

  private normalizeMiaosheVideoModelName(value: string) {
    const normalized = String(value || '').trim();
    if (
      /^(happyhorse-1\.0-(?:t2v|i2v|r2v)|wan2\.(?:5|6)-i2v(?:-preview|-flash)?)$/i.test(
        normalized,
      )
    ) {
      return normalized;
    }
    return '';
  }

  private extractMiaosheVideoModelPreference(value: string) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return '';
    }

    if (/happyhorse-1\.0-r2v|happyhorse\s*r2v|多参考图|主体一致|场景一致/.test(normalized)) {
      return 'happyhorse-1.0-r2v';
    }
    if (/happyhorse-1\.0-t2v|happyhorse\s*t2v|文生视频/.test(normalized)) {
      return 'happyhorse-1.0-t2v';
    }
    if (/happyhorse-1\.0-i2v|happyhorse\s*i2v/.test(normalized)) {
      return 'happyhorse-1.0-i2v';
    }
    if (/wan2\.(?:5|6)-i2v-flash|wan\s*flash|万相.*flash|flash版/.test(normalized)) {
      return 'wan2.6-i2v-flash';
    }
    if (/wan2\.(?:5|6)-i2v|万相|wan2\.6/.test(normalized)) {
      return 'wan2.6-i2v';
    }

    return '';
  }

  private shouldUseMiaosheFlashVideoModel(message: string, prompt: string) {
    return /(flash|更快|快速|高性价比|低成本|草稿版|先出个快版)/i.test(
      `${message}\n${prompt}`,
    );
  }

  private chooseMiaosheVideoModel(input: {
    config: ReturnType<ContentStudioService['getMiaosheVideoConfig']>;
    sourceMessage: string;
    artifact: MiaosheMediaArtifactResult;
    referenceImages: string[];
  }) {
    if (input.artifact.videoModel?.trim()) {
      return input.artifact.videoModel.trim();
    }
    if (input.config.overrideModel.trim()) {
      return input.config.overrideModel.trim();
    }
    if (input.referenceImages.length > 1) {
      return input.config.referenceToVideoModel;
    }
    if (input.referenceImages.length === 1) {
      if (/(happyhorse|主体更稳|首帧一致|参考主体|更稳定)/i.test(`${input.sourceMessage}\n${input.artifact.prompt}`)) {
        return input.config.imageToVideoHappyhorseModel;
      }
      return this.shouldUseMiaosheFlashVideoModel(input.sourceMessage, input.artifact.prompt)
        ? input.config.imageToVideoFlashModel
        : input.config.imageToVideoModel;
    }
    return input.config.textToVideoModel;
  }

  private parseMiaosheVideoDurationSeconds(value: string) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return 0;
    }
    const matched = normalized.match(/(\d{1,2})(?:\s*(?:秒|s|sec|secs|seconds))/i);
    if (matched?.[1]) {
      return Number(matched[1]);
    }
    const numericCount = Number(normalized.replace(/[^\d.]/g, ''));
    if (Number.isFinite(numericCount) && numericCount > 0) {
      return numericCount;
    }
    return 0;
  }

  private resolveMiaosheVideoDurationSeconds(input: {
    artifact: MiaosheMediaArtifactResult;
    message: string;
    model: string;
  }) {
    const parsed =
      this.parseMiaosheVideoDurationSeconds(input.artifact.duration || '') ||
      this.parseMiaosheVideoDurationSeconds(input.message);
    const isWanModel = /wan2\.(?:5|6)-i2v(?:-preview|-flash)?/i.test(input.model);
    const defaultDuration = /storyboard/i.test(input.artifact.intent) ? 8 : 5;
    const duration = parsed > 0 ? parsed : defaultDuration;

    if (isWanModel) {
      const supportedDurations = [5, 10, 15];
      const normalizedDuration = Math.max(5, Math.min(15, Math.round(duration)));
      return supportedDurations.reduce((best, current) =>
        Math.abs(current - normalizedDuration) < Math.abs(best - normalizedDuration)
          ? current
          : best,
      );
    }

    return Math.max(3, Math.min(15, Math.round(duration)));
  }

  private buildMiaosheVideoPrompt(input: {
    artifact: MiaosheMediaArtifactResult;
    sourceMessage: string;
    referenceImageCount: number;
    model: string;
  }) {
    const promptParts = [String(input.artifact.prompt || '').trim() || String(input.sourceMessage || '').trim()];

    if (input.artifact.style) {
      promptParts.push(`风格要求：${input.artifact.style}`);
    }
    if (input.artifact.aspectRatio) {
      promptParts.push(`画幅比例：${input.artifact.aspectRatio}`);
    }
    if (input.artifact.duration) {
      promptParts.push(`目标时长：${input.artifact.duration}`);
    }
    if (Array.isArray(input.artifact.storyboard) && input.artifact.storyboard.length > 0) {
      promptParts.push(
        `分镜要求：\n${input.artifact.storyboard
          .slice(0, 6)
          .map(
            (item, index) =>
              `${index + 1}. ${item.shot || `镜头${index + 1}`}；画面=${item.visual || '未指定'}；运镜=${item.camera || '未指定'}；字幕=${item.subtitle || '无'}；旁白=${item.voiceover || '无'}`,
          )
          .join('\n')}`,
      );
    }
    if (/happyhorse-1\.0-r2v/i.test(input.model) && input.referenceImageCount > 0) {
      const referenceLabels = Array.from({ length: input.referenceImageCount }, (_, index) => `[Image ${index + 1}]`);
      promptParts.push(`请综合参考 ${referenceLabels.join('、')}，保持主体与场景一致性。`);
    }

    return promptParts.filter(Boolean).join('\n');
  }

  private buildMiaosheVideoTaskSubmitUrl(baseUrl: string) {
    return `${baseUrl}/alibailian/api/v1/services/aigc/video-generation/video-synthesis`;
  }

  private buildMiaosheVideoTaskStatusUrl(baseUrl: string, taskId: string) {
    return `${baseUrl}/alibailian/api/v1/tasks/${taskId}`;
  }

  private normalizeMiaoshePublicAssetUrl(rawUrl: string) {
    const normalizedUrl = String(rawUrl || '').trim();
    if (!normalizedUrl) {
      return '';
    }
    if (/^https?:\/\//i.test(normalizedUrl) || /^data:/i.test(normalizedUrl)) {
      return normalizedUrl;
    }

    const publicBaseUrl =
      this.configService.get<string>('MIAOSHE_PUBLIC_BASE_URL') ||
      this.configService.get<string>('APP_ORIGIN') ||
      '';
    if (!publicBaseUrl) {
      return '';
    }

    const normalizedPath = normalizedUrl.replace(/^\/api\/backend/, '');
    if (!normalizedPath.startsWith('/')) {
      return '';
    }

    return `${publicBaseUrl.replace(/\/+$/, '')}${normalizedPath}`;
  }

  private normalizeMiaosheMediaAssetUrl(rawUrl: string) {
    const normalizedUrl = String(rawUrl || '').trim();
    if (!normalizedUrl || /^data:/i.test(normalizedUrl)) {
      return normalizedUrl;
    }

    const proxyUrl = this.buildMiaosheMediaProxyUrlFromAnyUrl(normalizedUrl);
    return proxyUrl || normalizedUrl;
  }

  private buildMiaosheMediaProxyUrlFromAnyUrl(rawUrl: string) {
    const objectKey = this.extractMiaosheMediaObjectKey(rawUrl);
    if (!objectKey) {
      return null;
    }

    return this.buildMiaosheMediaProxyUrlFromObjectKey(objectKey);
  }

  private buildMiaosheMediaProxyUrlFromObjectKey(objectKey: string) {
    const mediaPrefix = (this.configService.get<string>('OSS_MEDIA_PREFIX') || 'miaoshe/media')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    const normalizedKey = String(objectKey || '').trim().replace(/^\/+/, '');
    const expectedPrefix = `${mediaPrefix}/`;
    if (!normalizedKey.startsWith(expectedPrefix)) {
      return null;
    }

    const relativePath = normalizedKey.slice(expectedPrefix.length);
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    const [brandId, ...fileParts] = parts;
    const fileName = fileParts.join('/');
    return `${this.getAppOrigin()}/monitor/public-media/${encodeURIComponent(brandId)}/${fileName
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
  }

  private extractMiaosheMediaObjectKey(rawUrl: string) {
    const normalizedUrl = String(rawUrl || '').trim();
    if (!normalizedUrl) {
      return null;
    }

    const mediaPrefix = (this.configService.get<string>('OSS_MEDIA_PREFIX') || 'miaoshe/media')
      .trim()
      .replace(/^\/+|\/+$/g, '');

    if (normalizedUrl.startsWith('/uploads/miaoshe-chat/')) {
      const relativePath = normalizedUrl.replace(/^\/uploads\/miaoshe-chat\//, '');
      return `${mediaPrefix}/${relativePath.replace(/^\/+/, '')}`;
    }

    const appOrigin = this.getAppOrigin();
    const publicRoutePrefix = `${appOrigin}/monitor/public-media/`;
    if (normalizedUrl.startsWith(publicRoutePrefix)) {
      const relativePath = decodeURIComponent(normalizedUrl.slice(publicRoutePrefix.length));
      return `${mediaPrefix}/${relativePath.replace(/^\/+/, '')}`;
    }

    if (/^https?:\/\//i.test(normalizedUrl)) {
      try {
        const parsed = new URL(normalizedUrl);
        const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
        if (pathname.startsWith(`${mediaPrefix}/`)) {
          return pathname;
        }

        const publicBaseUrl =
          this.configService.get<string>('OSS_PUBLIC_BASE_URL') ||
          `https://${this.configService.get<string>('OSS_BUCKET')}.${this.configService.get<string>('OSS_REGION')}.aliyuncs.com`;
        const normalizedBase = String(publicBaseUrl || '').trim().replace(/\/+$/, '');
        if (normalizedBase && normalizedUrl.startsWith(`${normalizedBase}/`)) {
          return decodeURIComponent(normalizedUrl.slice(normalizedBase.length + 1));
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  private inferMimeTypeFromFilename(fileName: string) {
    const normalized = String(fileName || '').trim().toLowerCase();
    if (normalized.endsWith('.png')) return 'image/png';
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
    if (normalized.endsWith('.gif')) return 'image/gif';
    if (normalized.endsWith('.webp')) return 'image/webp';
    if (normalized.endsWith('.svg')) return 'image/svg+xml';
    if (normalized.endsWith('.bmp')) return 'image/bmp';
    if (normalized.endsWith('.avif')) return 'image/avif';
    if (normalized.endsWith('.mp4')) return 'video/mp4';
    if (normalized.endsWith('.mov')) return 'video/quicktime';
    if (normalized.endsWith('.m4v')) return 'video/x-m4v';
    if (normalized.endsWith('.webm')) return 'video/webm';
    if (normalized.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }

  async streamPublicMiaosheMedia(
    brandId: string,
    fileName: string,
    response: Response,
  ) {
    const normalizedBrandId = String(brandId || '').trim();
    const normalizedFileName = String(fileName || '')
      .trim()
      .replace(/^\/+/, '');
    if (!normalizedBrandId || !normalizedFileName || normalizedFileName.includes('..')) {
      throw new NotFoundException('素材不存在');
    }

    const mediaPrefix = (this.configService.get<string>('OSS_MEDIA_PREFIX') || 'miaoshe/media')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    const objectKey = `${mediaPrefix}/${normalizedBrandId}/${normalizedFileName}`;
    const client = this.getOssClient();

    if (client) {
      try {
        const requestRange = response.req?.headers.range;
        const streamResult = await client.getStream(
          objectKey,
          requestRange ? { headers: { Range: requestRange } } : undefined,
        );
        const ossHeaders = Object.fromEntries(
          Object.entries(streamResult.res.headers || {}).map(([key, value]) => [
            String(key).toLowerCase(),
            value,
          ]),
        );
        const mimeType =
          String(ossHeaders['content-type'] || '').trim() ||
          this.inferMimeTypeFromFilename(normalizedFileName);

        if (typeof ossHeaders['content-length'] === 'string') {
          response.setHeader('Content-Length', ossHeaders['content-length']);
        }
        if (typeof ossHeaders['content-range'] === 'string') {
          response.setHeader('Content-Range', ossHeaders['content-range']);
        }
        if (typeof ossHeaders['accept-ranges'] === 'string') {
          response.setHeader('Accept-Ranges', ossHeaders['accept-ranges']);
        }
        response.setHeader('Content-Type', mimeType);
        response.setHeader('Content-Disposition', 'inline');
        response.status(streamResult.res.status || 200);

        await new Promise<void>((resolve, reject) => {
          streamResult.stream.on('error', reject);
          streamResult.stream.on('end', () => resolve());
          streamResult.stream.pipe(response);
        });
        return;
      } catch {}
    }

    try {
      const localPath = join(process.cwd(), 'uploads', 'miaoshe-chat', normalizedBrandId, normalizedFileName);
      const buffer = await readFile(localPath);
      response.setHeader('Content-Type', this.inferMimeTypeFromFilename(normalizedFileName));
      response.setHeader('Content-Disposition', 'inline');
      response.send(buffer);
      return;
    } catch {
      throw new NotFoundException('素材不存在');
    }
  }

  private resolveMiaosheReferenceAudioUrl(
    attachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>,
  ) {
    const audioAttachment = attachments.find((item) => {
      const mimeType = String(item.mimeType || '').trim().toLowerCase();
      const title = String(item.title || '').trim().toLowerCase();
      return (
        mimeType.startsWith('audio/') ||
        /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(item.url) ||
        /\.(mp3|wav|m4a|aac|ogg)$/i.test(title)
      );
    });

    if (!audioAttachment) {
      return '';
    }

    return this.normalizeMiaoshePublicAssetUrl(audioAttachment.url);
  }

  private buildMiaosheVideoSynthesisPayload(input: {
    model: string;
    prompt: string;
    durationSeconds: number;
    artifact: MiaosheMediaArtifactResult;
    referenceImages: string[];
    audioUrl: string;
  }) {
    const resolution = /1080/i.test(`${input.artifact.summary}\n${input.prompt}`) ? '1080P' : '720P';
    const parameters: Record<string, unknown> = {
      resolution,
      duration: input.durationSeconds,
      watermark: false,
    };
    const ratio = this.normalizeMiaosheVideoRatio(input.artifact.aspectRatio);

    if (/wan2\.6-i2v/i.test(input.model)) {
      parameters.prompt_extend = true;
      parameters.audio = false;
    }

    if (/happyhorse-1\.0-r2v/i.test(input.model)) {
      if (ratio) {
        parameters.ratio = ratio;
      }
      return {
        model: input.model,
        input: {
          prompt: input.prompt,
          media: input.referenceImages
            .slice(0, MIAOSHE_MAX_REFERENCE_VIDEO_IMAGE_COUNT)
            .map((url) => ({ type: 'reference_image', url })),
        },
        parameters,
      };
    }

    if (/happyhorse-1\.0-i2v/i.test(input.model)) {
      if (ratio) {
        parameters.ratio = ratio;
      }
      return {
        model: input.model,
        input: {
          prompt: input.prompt,
          media: input.referenceImages.slice(0, 1).map((url) => ({ type: 'first_frame', url })),
        },
        parameters,
      };
    }

    if (/happyhorse-1\.0-t2v/i.test(input.model)) {
      if (ratio) {
        parameters.ratio = ratio;
      }
      return {
        model: input.model,
        input: {
          prompt: input.prompt,
        },
        parameters,
      };
    }

    if (/wan2\.6-i2v/i.test(input.model)) {
      const payload: Record<string, unknown> = {
        model: input.model,
        input: {
          prompt: input.prompt,
          img_url: input.referenceImages[0] || '',
        },
        parameters,
      };
      if (input.audioUrl && /wan2\.6-i2v/i.test(input.model)) {
        (payload.input as Record<string, unknown>).audio_url = input.audioUrl;
        (payload.parameters as Record<string, unknown>).audio = true;
      }
      return payload;
    }

    return {
      model: input.model,
      input: {
        prompt: input.prompt,
      },
      parameters,
    };
  }

  private normalizeMiaosheVideoRatio(value?: string) {
    const normalized = String(value || '').trim();
    if (['16:9', '9:16', '1:1', '4:3', '3:4'].includes(normalized)) {
      return normalized;
    }
    return '';
  }

  private extractMiaosheVideoTaskId(payload: any) {
    return String(
      payload?.output?.task_id ||
        payload?.output?.taskId ||
        payload?.task_id ||
        payload?.taskId ||
        '',
    ).trim();
  }

  private extractMiaosheVideoTaskStatus(payload: any) {
    return String(
      payload?.output?.task_status ||
        payload?.output?.taskStatus ||
        payload?.task_status ||
        payload?.taskStatus ||
        '',
    )
      .trim()
      .toUpperCase();
  }

  private extractMiaosheVideoTaskError(payload: any) {
    return String(
      payload?.output?.message ||
        payload?.output?.error_message ||
        payload?.output?.errorMessage ||
        payload?.error?.message ||
        payload?.message ||
        '',
    ).trim();
  }

  private extractMiaosheVideoUrls(payload: any) {
    const directUrls = [
      payload?.output?.video_url,
      payload?.output?.videoUrl,
      payload?.output?.result_url,
      payload?.output?.resultUrl,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const listUrls = Array.isArray(payload?.output?.video_urls)
      ? payload.output.video_urls
      : Array.isArray(payload?.output?.results)
        ? payload.output.results
        : [];
    const nestedUrls = listUrls
      .map((item: any) => String(item?.video_url || item?.videoUrl || item?.url || '').trim())
      .filter(Boolean);

    return Array.from(new Set([...directUrls, ...nestedUrls]));
  }

  private async materializeMiaosheGeneratedVideo(
    userId: string,
    brandId: string,
    remoteUrl: string,
    index: number,
  ) {
    const normalizedUrl = String(remoteUrl || '').trim();
    if (!normalizedUrl) {
      return null;
    }

    try {
      const upstream = await fetch(normalizedUrl);
      if (upstream.ok) {
        const mimeType = upstream.headers.get('content-type') || 'video/mp4';
        const buffer = Buffer.from(await upstream.arrayBuffer());
        const saved = await this.persistMiaosheMediaAsset(userId, brandId, {
          originalname: `miaoshe-generated-video-${index}${this.extensionFromMimeType(mimeType) || '.mp4'}`,
          mimetype: mimeType,
          size: buffer.length,
          buffer,
        }, {
          source: 'MiaoShe Chat',
          title: `生成视频 ${index}`,
        });
        return {
          ...saved,
          source: 'MiaoShe Chat',
        };
      }
    } catch {}

    return {
      id: `miaoshe-video-remote-${Date.now()}-${index}`,
      type: 'video' as const,
      url: normalizedUrl,
      thumbnailUrl: '',
      title: `生成视频 ${index}`,
      mimeType: 'video/mp4',
      source: 'MiaoShe Chat',
      size: 0,
      createdAt: Date.now(),
    };
  }

  private async generateMiaosheVideos(input: {
    userId: string;
    brand: BrandRow;
    brandId: string;
    threadId: string;
    artifact: MiaosheMediaArtifactResult;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
    sourceMessage: string;
    onProgress?: (artifact: MiaosheMediaArtifactResult) => Promise<void> | void;
  }): Promise<MiaosheMediaArtifactResult> {
    const config = this.getMiaosheVideoConfig();
    const referenceImages = (
      await this.resolveMiaosheReferenceImages(input.brandId, input.uploadedAttachments)
    ).slice(0, MIAOSHE_MAX_REFERENCE_VIDEO_IMAGE_COUNT);
    const model = this.chooseMiaosheVideoModel({
      config,
      sourceMessage: input.sourceMessage,
      artifact: input.artifact,
      referenceImages,
    });
    const prompt = this.buildMiaosheVideoPrompt({
      artifact: input.artifact,
      sourceMessage: input.sourceMessage,
      referenceImageCount: referenceImages.length,
      model,
    });

    if (!prompt) {
      return {
        ...input.artifact,
        title: '视频生成结果',
        generationStatus: 'failed',
        error: '缺少视频提示词，暂时无法生成。',
      };
    }

    const durationSeconds = this.resolveMiaosheVideoDurationSeconds({
      artifact: input.artifact,
      message: input.sourceMessage,
      model,
    });
    const audioUrl = this.resolveMiaosheReferenceAudioUrl(input.uploadedAttachments);
    const payload = this.buildMiaosheVideoSynthesisPayload({
      model,
      prompt,
      durationSeconds,
      artifact: input.artifact,
      referenceImages,
      audioUrl,
    });
    const controller = new AbortController();
    const timeoutMs = this.getMiaosheRequestTimeoutMs('agent', 900_000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.buildMiaosheVideoTaskSubmitUrl(config.baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const taskPayload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new BadGatewayException(
          this.extractMiaosheVideoTaskError(taskPayload) || '视频生成失败，请稍后重试。',
        );
      }

      const taskId = this.extractMiaosheVideoTaskId(taskPayload);
      if (!taskId) {
        throw new BadGatewayException('视频生成接口没有返回任务 ID。');
      }

      await input.onProgress?.({
        ...input.artifact,
        taskId,
        title: '视频生成结果',
        prompt,
        generationStatus: 'processing',
        summary: `视频生成任务已创建，正在排队处理中。${referenceImages.length > 0 ? ` 已附带 ${referenceImages.length} 张参考图。` : ''}`.trim(),
        error: undefined,
        videos: [],
      });

      const startedAt = Date.now();
      let latestStatus = 'PENDING';
      let latestPayload: any = null;
      while (Date.now() - startedAt < timeoutMs) {
        await this.sleep(8_000);
        const statusResponse = await fetch(
          this.buildMiaosheVideoTaskStatusUrl(config.baseUrl, taskId),
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
            signal: controller.signal,
          },
        );
        latestPayload = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) {
          throw new BadGatewayException(
            this.extractMiaosheVideoTaskError(latestPayload) || '查询视频任务状态失败，请稍后重试。',
          );
        }

        latestStatus = this.extractMiaosheVideoTaskStatus(latestPayload) || latestStatus;
        if (latestStatus === 'SUCCEEDED' || latestStatus === 'SUCCESS') {
          break;
        }
        if (latestStatus === 'FAILED' || latestStatus === 'CANCELED' || latestStatus === 'CANCELLED') {
          throw new BadGatewayException(
            this.extractMiaosheVideoTaskError(latestPayload) || '视频生成失败，请稍后重试。',
          );
        }

        await input.onProgress?.({
          ...input.artifact,
          taskId,
          title: '视频生成结果',
          prompt,
          generationStatus: 'processing',
          summary: `视频生成中，当前状态：${latestStatus || 'PROCESSING'}。`,
          error: undefined,
          videos: [],
        });
      }

      const videoUrls = this.extractMiaosheVideoUrls(latestPayload);
      if (videoUrls.length === 0) {
        throw new BadGatewayException('视频生成完成，但没有返回可用视频地址。');
      }

      const materialized = await Promise.all(
        videoUrls.slice(0, 4).map((videoUrl, index) =>
          this.materializeMiaosheGeneratedVideo(input.userId, input.brandId, videoUrl, index + 1),
        ),
      );
      const videos = materialized.filter(
        (
          item,
        ): item is {
          id: string;
          type: 'video';
          url: string;
          thumbnailUrl: string;
          title: string;
          mimeType: string;
          source: string;
          size: number;
          createdAt: number;
        } => item !== null,
      );

      if (videos.length === 0) {
        throw new BadGatewayException('视频生成完成，但没有返回可用视频文件。');
      }

      await this.saveMiaosheChatUploads(
        input.userId,
        input.brandId,
        input.threadId || 'default',
        this.normalizeClientMessageId(`generated-video:${input.artifact.id}`),
        `视频生成：${prompt}`,
        videos.map((item) => ({
          url: item.url,
          thumbnailUrl: item.thumbnailUrl || item.url,
          title: item.title,
          mimeType: item.mimeType,
          type: 'file' as const,
        })),
      );

      return {
        ...input.artifact,
        taskId,
        title: '视频生成结果',
        prompt,
        generationStatus: 'completed',
        error: undefined,
        summary: `已生成 ${videos.length} 条视频。${referenceImages.length > 0 ? ` 参考了 ${referenceImages.length} 张图片。` : ''}`.trim(),
        images: [],
        videos: videos.map((item) => ({
          url: item.url,
        })),
      };
    } catch (error) {
      return {
        ...input.artifact,
        prompt,
        title: '视频生成结果',
        generationStatus: 'failed',
        error: this.getMiaosheErrorMessage(error),
        summary: input.artifact.summary || '视频生成失败，请稍后重试。',
        images: [],
        videos: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async generateMiaosheImages(input: {
    userId: string;
    brand: BrandRow;
    brandId: string;
    threadId: string;
    artifact: MiaosheMediaArtifactResult;
    uploadedAttachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>;
    sourceMessage: string;
    onProgress?: (artifact: MiaosheMediaArtifactResult) => Promise<void> | void;
  }): Promise<MiaosheMediaArtifactResult> {
    const prompt = String(input.artifact.prompt || '').trim();
    if (!prompt) {
      return {
        ...input.artifact,
        generationStatus: 'failed',
        error: '缺少图片提示词，暂时无法生成。',
      };
    }

    const config = this.getMiaosheImageConfig();
    const requestedCount = this.resolveMiaosheRequestedImageCount({
      plannedCount: input.artifact.imageCount,
      message: input.sourceMessage,
      prompt,
    });
    const referenceImages = await this.resolveMiaosheReferenceImages(
      input.brandId,
      input.uploadedAttachments,
    );
    const useImageEdit = referenceImages.length > 0;
    const imageSize = this.mapMiaosheImageAspectRatioToSize(input.artifact.aspectRatio);
    const imageTimeoutMs = Math.min(
      900_000,
      this.getMiaosheRequestTimeoutMs('agent', 180_000) + Math.max(0, requestedCount - 1) * 90_000,
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      imageTimeoutMs,
    );
    const partialAssets: Array<{
      id: string;
      type: 'image';
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      source: string;
      size: number;
      createdAt: number;
    }> = [];
    let revisedPrompt = prompt;
    const resultTitle = useImageEdit ? '参考图生成结果' : '图片生成结果';
    const referenceSuffix = useImageEdit ? ` 参考了 ${referenceImages.length} 张上传图片。` : '';
    const singleImagePrompt = this.buildMiaosheSingleImagePrompt(prompt, requestedCount);

    try {
      for (let index = 0; index < requestedCount; index += 1) {
        const payloadResult = await this.requestSingleMiaosheImagePayload({
          config,
          prompt: singleImagePrompt,
          size: imageSize,
          requestedCount: 1,
          useImageEdit,
          referenceImages,
          signal: controller.signal,
        });

        if (!payloadResult.ok) {
          throw new BadGatewayException(
            payloadResult.payload?.error?.message ||
              payloadResult.payload?.message ||
              '图片生成失败，请稍后重试。',
          );
        }

        const responseItems = Array.isArray(payloadResult.payload?.data)
          ? payloadResult.payload.data
          : [];
        if (responseItems.length === 0) {
          throw new BadGatewayException('图片生成接口没有返回可用图片。');
        }

        const materialized = await Promise.all(
          responseItems
            .slice(0, 1)
            .map((item, itemIndex) =>
              this.materializeMiaosheGeneratedImage(
                input.userId,
                input.brandId,
                item,
                partialAssets.length + itemIndex + 1,
              ),
            ),
        );
        const nextAssets = materialized.filter(
          (
            item,
          ): item is {
            id: string;
            type: 'image';
            url: string;
            thumbnailUrl: string;
            title: string;
            mimeType: string;
            source: string;
            size: number;
            createdAt: number;
          } => item !== null,
        );

        if (nextAssets.length === 0) {
          throw new BadGatewayException('图片生成接口没有返回可用图片。');
        }

        partialAssets.push(...nextAssets);
        revisedPrompt =
          String(
            payloadResult.payload?.data?.[0]?.revised_prompt ||
              payloadResult.payload?.data?.[0]?.revisedPrompt ||
              revisedPrompt,
          ).trim() || revisedPrompt;

        await input.onProgress?.({
          ...input.artifact,
          title: resultTitle,
          summary: `已生成 ${partialAssets.length} / ${requestedCount} 张图片。${referenceSuffix}`.trim(),
          prompt: revisedPrompt,
          generationStatus: partialAssets.length >= requestedCount ? 'completed' : 'processing',
          error: undefined,
          images: partialAssets.map((item) => ({
            url: item.url,
            mimeType: item.mimeType,
            storage: 'local',
            createdAt: item.createdAt,
          })),
        });
      }

      await this.saveMiaosheChatUploads(
        input.userId,
        input.brandId,
        input.threadId || 'default',
        this.normalizeClientMessageId(`generated:${input.artifact.id}`),
        `图片生成：${prompt}`,
        partialAssets.map((item) => ({
          url: item.url,
          thumbnailUrl: item.thumbnailUrl || item.url,
          title: item.title,
          mimeType: item.mimeType,
          type: 'image' as const,
        })),
      );

      return {
        ...input.artifact,
        title: resultTitle,
        summary: `已生成 ${partialAssets.length} 张图片。${referenceSuffix}`.trim(),
        prompt: revisedPrompt,
        generationStatus: 'completed',
        error: undefined,
        images: partialAssets.map((item) => ({
          url: item.url,
          mimeType: item.mimeType,
          storage: 'local',
          createdAt: item.createdAt,
        })),
      };
    } catch (error) {
      return {
        ...input.artifact,
        title: resultTitle,
        generationStatus: 'failed',
        error: this.getMiaosheErrorMessage(error),
        summary:
          partialAssets.length > 0
            ? `已生成 ${partialAssets.length} 张图片，但后续生成中断。`
            : input.artifact.summary,
        prompt: revisedPrompt,
        images: partialAssets.map((item) => ({
          url: item.url,
          mimeType: item.mimeType,
          storage: 'local',
          createdAt: item.createdAt,
        })),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildMiaosheSingleImagePrompt(prompt: string, requestedCount: number) {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
      return '';
    }

    if (requestedCount <= 1) {
      return normalizedPrompt;
    }

    if (/(多宫格|九宫格|四宫格|拼图|拼版|合集图|分屏|collage|grid layout|contact sheet)/i.test(normalizedPrompt)) {
      return normalizedPrompt;
    }

    return [
      normalizedPrompt,
      '额外要求：本次虽然需要生成多张候选图，但当前这一张必须是一张完整的独立图片。',
      '禁止输出多宫格、四宫格、九宫格、拼图、分屏、合集排版，禁止把多张方案拼在同一张图里。',
    ].join('\n');
  }

  private async requestSingleMiaosheImagePayload(input: {
    config: { apiKey: string; model: string; baseUrl: string };
    prompt: string;
    size: string;
    requestedCount: number;
    useImageEdit: boolean;
    referenceImages: string[];
    signal: AbortSignal;
  }) {
    const response = input.useImageEdit
      ? await fetch(`${input.config.baseUrl}/images/edits`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${input.config.apiKey}`,
          },
          body: JSON.stringify({
            model: input.config.model,
            prompt: input.prompt,
            size: input.size,
            n: input.requestedCount,
            input_fidelity: 'high',
            images: input.referenceImages.map((imageUrl) => ({ image_url: imageUrl })),
          }),
          signal: input.signal,
        })
      : await fetch(`${input.config.baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${input.config.apiKey}`,
          },
          body: JSON.stringify({
            model: input.config.model,
            prompt: input.prompt,
            size: input.size,
            n: input.requestedCount,
          }),
          signal: input.signal,
        });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: Array<{
        url?: string;
        b64_json?: string;
        b64Json?: string;
        revised_prompt?: string;
        revisedPrompt?: string;
        mime_type?: string;
        mimeType?: string;
      }>;
      error?: { message?: string };
      message?: string;
    };

    return {
      ok: response.ok,
      payload,
    };
  }

  private async materializeMiaosheGeneratedImage(
    userId: string,
    brandId: string,
    item: {
      url?: string;
      b64_json?: string;
      b64Json?: string;
      mime_type?: string;
      mimeType?: string;
    },
    index: number,
  ) {
    const rawMimeType = String(item?.mime_type || item?.mimeType || 'image/png').trim() || 'image/png';
    const base64 = String(item?.b64_json || item?.b64Json || '').trim();
    const remoteUrl = String(item?.url || '').trim();

    if (base64) {
      const saved = await this.persistMiaosheMediaAsset(userId, brandId, {
        originalname: `miaoshe-generated-${index}${this.extensionFromMimeType(rawMimeType) || '.png'}`,
        mimetype: rawMimeType,
        size: Buffer.byteLength(base64, 'base64'),
        buffer: Buffer.from(base64, 'base64'),
      }, {
        source: 'MiaoShe Chat',
        title: `生成图片 ${index}`,
      });
      return {
        ...saved,
        source: 'MiaoShe Chat',
      };
    }

    if (!remoteUrl) {
      return null;
    }

    try {
      const upstream = await fetch(remoteUrl);
      if (upstream.ok) {
        const mimeType = upstream.headers.get('content-type') || rawMimeType;
        const buffer = Buffer.from(await upstream.arrayBuffer());
        const saved = await this.persistMiaosheMediaAsset(userId, brandId, {
          originalname: `miaoshe-generated-${index}${this.extensionFromMimeType(mimeType) || '.png'}`,
          mimetype: mimeType,
          size: buffer.length,
          buffer,
        }, {
          source: 'MiaoShe Chat',
          title: `生成图片 ${index}`,
        });
        return {
          ...saved,
          source: 'MiaoShe Chat',
        };
      }
    } catch {}

    return {
      id: `miaoshe-remote-${Date.now()}-${index}`,
      type: 'image' as const,
      url: remoteUrl,
      thumbnailUrl: remoteUrl,
      title: `生成图片 ${index}`,
      mimeType: rawMimeType,
      source: 'MiaoShe Chat',
      size: 0,
      createdAt: Date.now(),
    };
  }

  private getSupportedMediaPlatforms(): MediaPlatformTarget[] {
    return [
      { id: 'wechat_official_account', name: '微信公众号', patterns: ['微信', '公众号', '微信公众号', 'wechat'] },
      { id: 'zhihu', name: '知乎', patterns: ['知乎', 'zhihu'] },
      { id: 'weibo', name: '微博', patterns: ['微博', 'weibo'] },
      { id: 'xiaohongshu', name: '小红书', patterns: ['小红书', 'xiaohongshu', 'xhs'] },
      { id: 'toutiao', name: '头条号', patterns: ['头条', '头条号', 'toutiao'] },
      { id: 'douyin', name: '抖音', patterns: ['抖音', 'douyin'] },
      { id: 'bilibili', name: 'B站', patterns: ['b站', 'B站', 'bilibili', '哔哩哔哩'] },
      { id: 'juejin', name: '掘金', patterns: ['掘金', 'juejin', '稀土掘金'] },
      { id: 'csdn', name: 'CSDN', patterns: ['csdn', 'CSDN'] },
      { id: 'jianshu', name: '简书', patterns: ['简书', 'jianshu'] },
      { id: 'baijiahao', name: '百家号', patterns: ['百家号', 'baijiahao'] },
      { id: 'douban', name: '豆瓣', patterns: ['豆瓣', 'douban'] },
      { id: 'x', name: 'X', patterns: ['x', 'twitter', '推特'] },
    ];
  }

  private extractMediaPlatforms(message: string) {
    const normalized = this.extractPublishDirectiveText(message).toLowerCase();
    return this.getSupportedMediaPlatforms().filter((platform) =>
      platform.patterns.some((pattern) => normalized.includes(pattern.toLowerCase())),
    );
  }

  private extractPublishDirectiveText(message: string) {
    const text = String(message || '').trim();
    if (!text) {
      return '';
    }
    const markerIndex = text.indexOf('当前文章草稿：');
    if (markerIndex > 0) {
      return text.slice(0, markerIndex).trim();
    }
    return text;
  }

  private extractMediaPlatformsFromConversation(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    const fromMessage = this.extractMediaPlatforms(message);
    if (fromMessage.length > 0) {
      return fromMessage;
    }
    if (this.messageMentionsKnownPlatformAlias(message)) {
      return [];
    }
    if (!/继续|它|这个平台|该平台|登录|登陆|授权|状态|检查|发布|发到|同步|投递/.test(message)) {
      return [];
    }

    for (let index = history.length - 1; index >= Math.max(0, history.length - 6); index -= 1) {
      const item = history[index];
      if (item?.role !== 'user') {
        continue;
      }
      const fromHistory = this.extractMediaPlatforms(item.content || '');
      if (fromHistory.length > 0) {
        return fromHistory;
      }
    }

    return [];
  }

  private messageMentionsKnownPlatformAlias(message: string) {
    const normalized = this.extractPublishDirectiveText(message).toLowerCase();
    return this.getSupportedMediaPlatforms().some((platform) =>
      platform.patterns.some((pattern) => normalized.includes(pattern.toLowerCase())),
    );
  }

  private resolveMediaPlatformsByIds(platformIds: string[]) {
    const lookup = new Map(this.getSupportedMediaPlatforms().map((item) => [item.id, item]));
    return platformIds
      .map((platformId) => lookup.get(this.normalizeCreatorPlatformKey(platformId)))
      .filter((item): item is MediaPlatformTarget => Boolean(item));
  }

  private mergeMediaPlatforms(current: MediaPlatformTarget[], nextItems: MediaPlatformTarget[]) {
    const merged = new Map<string, MediaPlatformTarget>();
    for (const item of [...current, ...nextItems]) {
      merged.set(item.id, item);
    }
    return [...merged.values()];
  }

  private extractArticleFromConversation(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    const fromMessage = this.extractArticleFromText(message);
    if (fromMessage) {
      return fromMessage;
    }

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (item?.role !== 'user') {
        continue;
      }
      const article = this.extractArticleFromText(item.content);
      if (article) {
        return article;
      }
    }

    return null;
  }

  private extractArticleFromCodexPlan(plan: MediaPublishCodexPlan | null) {
    if (!plan?.articleTitle || !plan.articleMarkdown) {
      return null;
    }

    return {
      title: plan.articleTitle,
      markdown: plan.articleMarkdown,
    };
  }

  private extractArticleFromText(text: string) {
    const titleMatch = text.match(/(?:^|\n)\s*标题[:：]\s*(.+)/);
    const bodyMatch = text.match(
      /(?:^|\n)\s*(?:Markdown\s*)?(?:文章)?正文(?:内容|如下)?[:：]\s*([\s\S]+)/,
    );
    if (!titleMatch?.[1] || !bodyMatch?.[1]) {
      return null;
    }

    const title = titleMatch[1].split('\n')[0]?.trim() || '';
    const markdown = bodyMatch[1].trim();
    if (!title || !markdown) {
      return null;
    }

    return {
      title,
      markdown,
    };
  }

  private getPlatformHomepage(platformId: string) {
    return (
      this.buildCreatorPlatformDashboardUrl(this.normalizeCreatorPlatformKey(platformId)) ||
      'https://www.wechatsync.com'
    );
  }

  private getPlatformLabel(platformId: string) {
    return this.formatCreatorPlatformLabel(this.normalizeCreatorPlatformKey(platformId));
  }

  private normalizeRequestedPlatforms(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.normalizeCreatorPlatformKey(String(item || '')))
      .filter(Boolean);
  }

  private normalizeCreatorPlatformKey(value: string) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    const aliases: Record<string, string> = {
      '微信': 'wechat_official_account',
      wechat: 'wechat_official_account',
      weixin: 'wechat_official_account',
      wechat_official_account: 'wechat_official_account',
      mpwechat: 'wechat_official_account',
      zhihu: 'zhihu',
      '知 乎': 'zhihu',
      '知乎': 'zhihu',
      weibo: 'weibo',
      '微博': 'weibo',
      xiaohongshu: 'xiaohongshu',
      xhs: 'xiaohongshu',
      '小红书': 'xiaohongshu',
      toutiao: 'toutiao',
      '头条': 'toutiao',
      '头条号': 'toutiao',
      douyin: 'douyin',
      '抖音': 'douyin',
      bilibili: 'bilibili',
      'b站': 'bilibili',
      'b 站': 'bilibili',
      juejin: 'juejin',
      '掘金': 'juejin',
      csdn: 'csdn',
      jianshu: 'jianshu',
      '简书': 'jianshu',
      baijiahao: 'baijiahao',
      '百家号': 'baijiahao',
      douban: 'douban',
      '豆瓣': 'douban',
      twitter: 'x',
      x: 'x',
    };
    return aliases[normalized] || normalized;
  }

  private formatCreatorPlatformLabel(value: string) {
    const labels: Record<string, string> = {
      wechat_official_account: '微信公众号',
      zhihu: '知乎',
      weibo: '微博',
      xiaohongshu: '小红书',
      toutiao: '头条号',
      douyin: '抖音',
      bilibili: 'B站',
      juejin: '掘金',
      csdn: 'CSDN',
      jianshu: '简书',
      baijiahao: '百家号',
      douban: '豆瓣',
      x: 'X',
    };
    return labels[value] || value || '未知平台';
  }

  private normalizeCreatorAccountKey(value: string) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_\-:@.\u4e00-\u9fa5]/g, '')
      .slice(0, 255);
  }

  private buildCreatorPlatformDashboardUrl(platform: string, fallback?: string | null) {
    if (fallback) return fallback;
    const map: Record<string, string> = {
      wechat_official_account: 'https://mp.weixin.qq.com/',
      zhihu: 'https://www.zhihu.com/creator',
      weibo: 'https://weibo.com/',
      xiaohongshu: 'https://creator.xiaohongshu.com/',
      toutiao: 'https://mp.toutiao.com/',
      douyin: 'https://creator.douyin.com/',
      bilibili: 'https://member.bilibili.com/',
      juejin: 'https://juejin.cn/',
      csdn: 'https://mp.csdn.net/',
      jianshu: 'https://www.jianshu.com/',
      baijiahao: 'https://baijiahao.baidu.com/',
    };
    return map[platform] || null;
  }

  private readPlatformField(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  private parseJsonRecord(value: string | null | undefined) {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private normalizeMetricDate(value: string) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  private formatMetricKey(value: string) {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();
  }

  private extractOpenAiMessageText(message: any) {
    const content = message?.content;
    if (typeof content === 'string') {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part?.type === 'text') return String(part.text || '');
          return '';
        })
        .join('')
        .trim();
    }
    return '';
  }

  private normalizeAnthropicContentBlocks(value: any[]): AnthropicContentBlock[] {
    const normalized = value
      .map((block) => {
        if (block?.type === 'text') {
          return {
            type: 'text' as const,
            text: String(block.text || ''),
          };
        }
        if (block?.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: String(block.id || ''),
            name: String(block.name || ''),
            input:
              block.input && typeof block.input === 'object'
                ? (block.input as Record<string, unknown>)
                : {},
          };
        }
        return null;
      });

    return normalized.filter(Boolean) as AnthropicContentBlock[];
  }

  private async buildBrandContext(
    brand: BrandRow,
    domains: BrandDomainRow[],
    draftTitle: string,
    draftContent: string,
  ) {
    const domainText = domains.length
      ? domains
          .map((domain) => `${domain.domain}${domain.is_primary ? '（主域名）' : ''}`)
          .join('、')
      : '未配置';

    const intelligenceSummary = await this.buildBrandIntelligenceContext(brand.id, domains);

    return [
      `品牌名称：${brand.name}`,
      `品牌行业：${brand.industry || '未填写'}`,
      `品牌地区：${brand.region || '未填写'}`,
      `品牌语言：${brand.language || '中文'}`,
      `品牌简介：${brand.description || '未填写'}`,
      `品牌域名：${domainText}`,
      intelligenceSummary ? `品牌监测与答案引擎数据：\n${intelligenceSummary}` : '',
      `当前文章标题：${draftTitle || '未命名草稿'}`,
      `当前文章正文：\n${draftContent || '（当前还没有正文内容）'}`,
      '请优先结合以上品牌监测数据、文章上下文进行协同写作；如果某类数据为空，不要自行编造。',
    ].join('\n');
  }

  private async buildMiaosheBrandContext(
    brand: BrandRow,
    domains: BrandDomainRow[],
    workspaceContext: string,
  ) {
    const domainText = domains.length
      ? domains
          .map((domain) => `${domain.domain}${domain.is_primary ? '（主域名）' : ''}`)
          .join('、')
      : '未配置';

    return [
      '以下是当前用户所在品牌的工作上下文，请基于这些信息给出建议。',
      `品牌名称：${brand.name}`,
      `品牌行业：${brand.industry || '未填写'}`,
      `品牌地区：${brand.region || '未填写'}`,
      `品牌语言：${brand.language || '中文'}`,
      `品牌简介：${brand.description || '未填写'}`,
      `品牌域名：${domainText}`,
      workspaceContext ? `工作台上下文：\n${workspaceContext}` : '',
      '如果用户在问内容排期、选题、分发、平台接入、任务推进，请尽量回答得可直接执行。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async buildBrandIntelligenceContext(brandId: string, domains: BrandDomainRow[]) {
    const [answerEngineSummary, topicSummary, promptSummary, citationSummary, trafficSummary, competitorSummary] =
      await Promise.all([
        this.buildAnswerEngineInsightSummary(brandId),
        this.buildTopicInsightSummary(brandId),
        this.buildPromptInsightSummary(brandId),
        this.buildCitationInsightSummary(brandId, domains),
        this.buildTrafficInsightSummary(brandId),
        this.buildCompetitorInsightSummary(brandId),
      ]);

    const sections = [
      answerEngineSummary ? `回答引擎洞察：${answerEngineSummary}` : '',
      topicSummary ? `主题：${topicSummary}` : '',
      promptSummary ? `提示词：${promptSummary}` : '',
      citationSummary ? `引用：${citationSummary}` : '',
      trafficSummary ? `AI 流量分析：${trafficSummary}` : '',
      competitorSummary ? `竞争对手页面数据：${competitorSummary}` : '',
    ].filter(Boolean);

    return sections.join('\n');
  }

  private async buildAnswerEngineInsightSummary(brandId: string) {
    const [summaryRows, platformRows] = await Promise.all([
      this.mysqlService.query<
        Array<{
          result_count: number;
          avg_visibility: number;
          mention_count: number;
          citation_count: number;
          recommended_count: number;
        }>
      >(
        `SELECT
           COUNT(*) AS result_count,
           COALESCE(ROUND(AVG(visibility_score)), 0) AS avg_visibility,
           COALESCE(SUM(mention_count), 0) AS mention_count,
           COALESCE(SUM(citation_count), 0) AS citation_count,
           COALESCE(SUM(is_recommended), 0) AS recommended_count
         FROM monitor_prompt_results
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`,
        [brandId],
      ),
      this.mysqlService.query<
        Array<{
          platform: string | null;
          result_count: number;
          avg_visibility: number;
          recommended_count: number;
        }>
      >(
        `SELECT
           platform,
           COUNT(*) AS result_count,
           COALESCE(ROUND(AVG(visibility_score)), 0) AS avg_visibility,
           COALESCE(SUM(is_recommended), 0) AS recommended_count
         FROM monitor_prompt_results
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
         GROUP BY platform
         ORDER BY avg_visibility DESC, recommended_count DESC, result_count DESC
         LIMIT 3`,
        [brandId],
      ),
    ]);

    const summary = summaryRows[0];
    const resultCount = Number(summary?.result_count ?? 0);
    if (resultCount === 0) {
      return '近 30 天暂无答案引擎监测结果。';
    }

    const recommendedCount = Number(summary?.recommended_count ?? 0);
    const recommendedRate = resultCount > 0 ? Math.round((recommendedCount / resultCount) * 100) : 0;
    const topPlatforms = platformRows
      .map((row) => {
        const label = this.formatAiPlatformLabel(row.platform);
        const visibility = Number(row.avg_visibility ?? 0);
        const rate =
          Number(row.result_count ?? 0) > 0
            ? Math.round((Number(row.recommended_count ?? 0) / Number(row.result_count ?? 0)) * 100)
            : 0;
        return `${label}(可见度${visibility}，推荐率${rate}%)`;
      })
      .filter(Boolean)
      .join('、');

    return [
      `近 30 天共监测 ${resultCount} 条回答，平均可见度 ${Number(summary?.avg_visibility ?? 0)}，品牌被提及 ${Number(summary?.mention_count ?? 0)} 次，被引用 ${Number(summary?.citation_count ?? 0)} 次，被推荐率 ${recommendedRate}%。`,
      topPlatforms ? `当前表现较好的答案引擎：${topPlatforms}。` : '',
    ]
      .filter(Boolean)
      .join('');
  }

  private async buildTopicInsightSummary(brandId: string) {
    const rows = await this.mysqlService.query<
      Array<{
        topic_name: string | null;
        result_count: number;
        avg_visibility: number;
        recommended_count: number;
      }>
    >(
      `SELECT
         COALESCE(NULLIF(t.name, ''), NULLIF(p.category, ''), '未分类') AS topic_name,
         COUNT(*) AS result_count,
         COALESCE(ROUND(AVG(pr.visibility_score)), 0) AS avg_visibility,
         COALESCE(SUM(pr.is_recommended), 0) AS recommended_count
       FROM monitor_prompt_results pr
       INNER JOIN monitor_prompts p ON p.id = pr.prompt_id
       LEFT JOIN monitor_topics t ON t.id = p.topic_id
       WHERE pr.brand_id = ?
         AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
       GROUP BY COALESCE(NULLIF(t.name, ''), NULLIF(p.category, ''), '未分类')
       ORDER BY result_count DESC, avg_visibility DESC
       LIMIT 5`,
      [brandId],
    );

    if (rows.length > 0) {
      return rows
        .map((row) => {
          const topic = String(row.topic_name || '未分类').trim();
          const resultCount = Number(row.result_count ?? 0);
          const recommendedRate =
            resultCount > 0
              ? Math.round((Number(row.recommended_count ?? 0) / resultCount) * 100)
              : 0;
          return `${topic}(结果${resultCount}，可见度${Number(row.avg_visibility ?? 0)}，推荐率${recommendedRate}%)`;
        })
        .join('、');
    }

    const fallbackRows = await this.mysqlService.query<Array<{ name: string }>>(
      `SELECT name
       FROM monitor_topics
       WHERE brand_id = ? AND is_active = 1
       ORDER BY created_at ASC
       LIMIT 5`,
      [brandId],
    );
    if (fallbackRows.length === 0) {
      return '暂无主题监测数据。';
    }

    return `已配置主题：${fallbackRows.map((row) => row.name).join('、')}。`;
  }

  private async buildPromptInsightSummary(brandId: string) {
    const rows = await this.mysqlService.query<
      Array<{
        prompt_text: string;
        topic_name: string | null;
        opportunity_score: number;
        heat_score: number;
        result_count: number;
        avg_visibility: number;
      }>
    >(
      `SELECT
         p.text AS prompt_text,
         COALESCE(NULLIF(t.name, ''), NULLIF(p.category, ''), '未分类') AS topic_name,
         COALESCE(MAX(pph.opportunity_score), 0) AS opportunity_score,
         COALESCE(MAX(pph.total_heat_score), 0) AS heat_score,
         COUNT(pr.id) AS result_count,
         COALESCE(ROUND(AVG(pr.visibility_score)), 0) AS avg_visibility
       FROM monitor_prompts p
       INNER JOIN monitor_prompt_sets ps ON ps.id = p.prompt_set_id
       LEFT JOIN monitor_topics t ON t.id = p.topic_id
       LEFT JOIN monitor_prompt_public_heat pph ON pph.prompt_id = p.id
       LEFT JOIN monitor_prompt_results pr
         ON pr.prompt_id = p.id
        AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
       WHERE ps.brand_id = ?
         AND p.is_active = 1
       GROUP BY p.id, p.text, t.name, p.category
       ORDER BY opportunity_score DESC, heat_score DESC, result_count DESC, avg_visibility DESC, p.created_at DESC
       LIMIT 8`,
      [brandId],
    );

    if (rows.length === 0) {
      return '暂无活跃提示词数据。';
    }

    return rows
      .map((row) => {
        const prompt = this.truncateText(row.prompt_text, 36);
        const parts = [
          row.topic_name ? `主题${row.topic_name}` : '',
          Number(row.opportunity_score ?? 0) > 0 ? `机会分${Number(row.opportunity_score ?? 0)}` : '',
          Number(row.heat_score ?? 0) > 0 ? `热度${Number(row.heat_score ?? 0)}` : '',
          Number(row.result_count ?? 0) > 0 ? `结果${Number(row.result_count ?? 0)}` : '',
          Number(row.avg_visibility ?? 0) > 0 ? `可见度${Number(row.avg_visibility ?? 0)}` : '',
        ].filter(Boolean);
        return `${prompt}${parts.length ? `(${parts.join('，')})` : ''}`;
      })
      .join('、');
  }

  private async buildCitationInsightSummary(brandId: string, domains: BrandDomainRow[]) {
    const rows = await this.mysqlService.query<Array<{ url: string; title: string | null; count: number }>>(
      `SELECT
         rc.url AS url,
         MAX(NULLIF(rc.title, '')) AS title,
         COUNT(*) AS count
       FROM monitor_result_citations rc
       INNER JOIN monitor_prompt_results pr ON pr.id = rc.result_id
       WHERE pr.brand_id = ?
         AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
       GROUP BY rc.url
       ORDER BY count DESC, MAX(rc.created_at) DESC`,
      [brandId],
    );

    if (rows.length === 0) {
      return '近 30 天暂无引用数据。';
    }

    const ownDomains = domains
      .map((domain) => this.normalizeDomain(domain.domain))
      .filter(Boolean);
    const domainCounts = new Map<string, number>();
    const ownPageCounts: Array<{ label: string; count: number }> = [];
    let ownedCitationCount = 0;

    for (const row of rows) {
      const count = Number(row.count ?? 0);
      const parsed = this.extractUrlSummary(row.url);
      if (!parsed) continue;

      domainCounts.set(parsed.host, (domainCounts.get(parsed.host) ?? 0) + count);
      if (ownDomains.some((domain) => this.domainMatches(parsed.host, domain))) {
        ownedCitationCount += count;
        ownPageCounts.push({
          label: row.title?.trim() || parsed.display,
          count,
        });
      }
    }

    const topDomains = Array.from(domainCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([host, count]) => `${host}(${count})`)
      .join('、');
    const topOwnPages = ownPageCounts
      .sort((left, right) => right.count - left.count)
      .slice(0, 3)
      .map((item) => `${this.truncateText(item.label, 28)}(${item.count})`)
      .join('、');

    return [
      `近 30 天共有 ${rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0)} 次引用，其中品牌自有域名被引用 ${ownedCitationCount} 次。`,
      topDomains ? `高频引用来源：${topDomains}。` : '',
      topOwnPages ? `被引用较多的自有页面：${topOwnPages}。` : '',
    ]
      .filter(Boolean)
      .join('');
  }

  private async buildTrafficInsightSummary(brandId: string) {
    const [summaryRows, platformRows, pathRows] = await Promise.all([
      this.mysqlService.query<Array<{ visit_count: number; session_count: number }>>(
        `SELECT
           COUNT(*) AS visit_count,
           COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id)) AS session_count
         FROM monitor_ai_traffic_logs
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`,
        [brandId],
      ),
      this.mysqlService.query<Array<{ source_platform: string | null; visit_count: number }>>(
        `SELECT
           source_platform,
           COUNT(*) AS visit_count
         FROM monitor_ai_traffic_logs
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
         GROUP BY source_platform
         ORDER BY visit_count DESC
         LIMIT 5`,
        [brandId],
      ),
      this.mysqlService.query<Array<{ path: string | null; visit_count: number }>>(
        `SELECT
           path,
           COUNT(*) AS visit_count
         FROM monitor_ai_traffic_logs
         WHERE brand_id = ?
           AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
         GROUP BY path
         ORDER BY visit_count DESC
         LIMIT 5`,
        [brandId],
      ),
    ]);

    const summary = summaryRows[0];
    const visitCount = Number(summary?.visit_count ?? 0);
    if (visitCount === 0) {
      return '近 30 天暂无 AI 引荐流量。';
    }

    const topPlatforms = platformRows
      .map((row) => `${this.formatAiPlatformLabel(row.source_platform)}(${Number(row.visit_count ?? 0)})`)
      .join('、');
    const topPaths = pathRows
      .map((row) => `${this.truncateText(String(row.path || '/'), 24)}(${Number(row.visit_count ?? 0)})`)
      .join('、');

    return [
      `近 30 天 AI 引荐访问 ${visitCount} 次，独立会话 ${Number(summary?.session_count ?? 0)} 个。`,
      topPlatforms ? `主要来源平台：${topPlatforms}。` : '',
      topPaths ? `主要承接页面：${topPaths}。` : '',
    ]
      .filter(Boolean)
      .join('');
  }

  private async buildCompetitorInsightSummary(brandId: string) {
    const [competitorRows, citationRows, configuredCompetitorRows] = await Promise.all([
      this.mysqlService.query<
        Array<{
          name: string;
          domain: string | null;
          mention_count: number;
          citation_count: number;
          avg_visibility: number;
        }>
      >(
        `SELECT
           rc.name AS name,
           rc.domain AS domain,
           COALESCE(SUM(rc.mention_count), 0) AS mention_count,
           COALESCE(SUM(rc.citation_count), 0) AS citation_count,
           COALESCE(ROUND(AVG(rc.visibility_score)), 0) AS avg_visibility
         FROM monitor_result_competitors rc
         INNER JOIN monitor_prompt_results pr ON pr.id = rc.result_id
         WHERE pr.brand_id = ?
           AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
         GROUP BY rc.name, rc.domain
         ORDER BY citation_count DESC, mention_count DESC, avg_visibility DESC
         LIMIT 5`,
        [brandId],
      ),
      this.mysqlService.query<Array<{ url: string; title: string | null; count: number }>>(
        `SELECT
           rc.url AS url,
           MAX(NULLIF(rc.title, '')) AS title,
           COUNT(*) AS count
         FROM monitor_result_citations rc
         INNER JOIN monitor_prompt_results pr ON pr.id = rc.result_id
         WHERE pr.brand_id = ?
           AND pr.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
         GROUP BY rc.url
         ORDER BY count DESC, MAX(rc.created_at) DESC`,
        [brandId],
      ),
      this.mysqlService.query<Array<{ name: string; domain: string | null }>>(
        `SELECT name, domain
         FROM monitor_competitors
         WHERE brand_id = ?
         ORDER BY created_at ASC`,
        [brandId],
      ),
    ]);

    if (competitorRows.length === 0 && configuredCompetitorRows.length === 0) {
      return '暂无竞品监测数据。';
    }

    const knownCompetitors = configuredCompetitorRows
      .map((row) => ({
        name: row.name,
        domain: this.normalizeDomain(row.domain),
      }))
      .filter((row) => row.domain);
    const topCompetitors = competitorRows
      .map((row) => {
        const domain = this.normalizeDomain(row.domain);
        const label = domain ? `${row.name}(${domain})` : row.name;
        return `${label}(提及${Number(row.mention_count ?? 0)}，引用${Number(row.citation_count ?? 0)}，可见度${Number(row.avg_visibility ?? 0)})`;
      })
      .join('、');
    const competitorPages = citationRows
      .map((row) => {
        const parsed = this.extractUrlSummary(row.url);
        if (!parsed) return null;
        const matchedCompetitor = knownCompetitors.find((competitor) =>
          this.domainMatches(parsed.host, competitor.domain),
        );
        if (!matchedCompetitor) return null;
        return {
          label: row.title?.trim() || `${matchedCompetitor.name} / ${parsed.display}`,
          count: Number(row.count ?? 0),
        };
      })
      .filter((item): item is { label: string; count: number } => Boolean(item))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5)
      .map((item) => `${this.truncateText(item.label, 30)}(${item.count})`)
      .join('、');

    return [
      topCompetitors ? `主要竞品：${topCompetitors}。` : '',
      competitorPages ? `竞品被引用较多的页面：${competitorPages}。` : '',
      !topCompetitors && configuredCompetitorRows.length > 0
        ? `已配置竞品：${configuredCompetitorRows.map((row) => row.name).join('、')}。`
        : '',
    ]
      .filter(Boolean)
      .join('');
  }

  private describeLayoutTargetPlatform(value: string) {
    switch (String(value || '').trim()) {
      case 'wechat-article':
        return '微信公众号图文文章';
      case 'zhihu-article':
        return '知乎文章';
      case 'toutiao-article':
        return '今日头条文章';
      default:
        return '通用中文图文平台文章';
    }
  }

  private async assertBrandAccess(brandId: string, userId: string) {
    const brand = await this.findBrandRow(brandId);
    const membership = await this.organizationStore.findMembership(brand.organization_id, userId);
    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException('无权访问该品牌内容');
    }
    return brand;
  }

  private async findBrandRow(brandId: string) {
    const rows = await this.mysqlService.query<BrandRow[]>(
      `SELECT id, organization_id, name, slug, industry, description, region, language
       FROM monitor_brands
       WHERE id = ?
       LIMIT 1`,
      [brandId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('品牌不存在');
    }
    return row;
  }

  private async findBrandDomains(brandId: string) {
    return await this.mysqlService.query<BrandDomainRow[]>(
      `SELECT id, brand_id, domain, country, is_primary
       FROM monitor_brand_domains
       WHERE brand_id = ?
       ORDER BY is_primary DESC, created_at ASC`,
      [brandId],
    );
  }

  private async findContentWebhookConfigRowByBrandId(brandId: string) {
    const rows = await this.mysqlService.query<ContentWebhookConfigRow[]>(
      `SELECT *
       FROM monitor_content_webhook_configs
       WHERE brand_id = ?
       ORDER BY created_at ASC
       LIMIT 1`,
      [brandId],
    );
    return rows[0] ?? null;
  }

  private async findDraftRow(draftId: string) {
    const rows = await this.mysqlService.query<DraftRow[]>(
      `SELECT * FROM monitor_content_drafts WHERE id = ? LIMIT 1`,
      [draftId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('文稿不存在');
    }
    return row;
  }

  private mapDraft(row: DraftRow) {
    const stats = this.countStats(row.content || '');
    return {
      id: row.id,
      title: row.title,
      content: row.content || '',
      createdAt: Date.parse(this.toIso(row.created_at)),
      updatedAt: Date.parse(this.toIso(row.updated_at)),
      wordCount: stats.words,
      charCount: stats.chars,
      brandId: row.brand_id,
    };
  }

  private mapMessage(row: MessageRow) {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: Date.parse(this.toIso(row.created_at)),
    };
  }

  private mapContentWebhookConfig(row: ContentWebhookConfigRow) {
    return {
      id: row.id,
      brandId: row.brand_id,
      name: row.name,
      webhookUrl: row.webhook_url,
      webhookSecret: row.webhook_secret ?? undefined,
      events: this.parseJsonArray(row.events_json),
      isActive: row.is_active === 1,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapMiaosheChatUpload(row: MiaosheChatUploadRow) {
    return {
      id: row.id,
      threadId: row.thread_id,
      clientMessageId: String(row.client_message_id || '').trim(),
      messageText: row.message_text,
      attachments: this.parseMiaosheAttachments(row.attachments_json),
      createdAt: Date.parse(this.toIso(row.created_at)),
    };
  }

  private normalizeClientMessageId(value?: string) {
    const normalized = String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9:_-]/g, '')
      .slice(0, 64);
    return normalized;
  }

  private normalizeMiaosheUploadedAttachments(
    value?: Array<{
      url?: string;
      thumbnailUrl?: string;
      title?: string;
      mimeType?: string;
      type?: 'image' | 'file';
    }>,
  ) {
    return Array.isArray(value)
      ? value
          .map((item) => ({
            url: this.normalizeMiaosheMediaAssetUrl(String(item?.url || '').trim()),
            thumbnailUrl: this.normalizeMiaosheMediaAssetUrl(
              String(item?.thumbnailUrl || item?.url || '').trim(),
            ),
            title: String(item?.title || '上传图片').trim(),
            mimeType: String(item?.mimeType || '').trim(),
            type: item?.type === 'file' ? ('file' as const) : ('image' as const),
          }))
          .filter((item) => item.url)
          .slice(0, 12)
      : [];
  }

  private normalizeMiaosheArticleArtifact(value?: {
    title?: string;
    markdown?: string;
    format?: string;
  }) {
    const title = String(value?.title || '').trim();
    const markdown = String(value?.markdown || '').trim();
    const format = String(value?.format || '').trim().toLowerCase() || 'markdown';

    if (!title || !markdown) {
      return null;
    }

    return {
      title,
      markdown,
      format,
    };
  }

  private parseMiaosheAttachments(value?: string) {
    let attachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }> = [];
    try {
      const parsed = JSON.parse(value || '[]');
      attachments = Array.isArray(parsed)
        ? parsed
            .map((item) => ({
              url: this.normalizeMiaosheMediaAssetUrl(String(item?.url || '').trim()),
              thumbnailUrl: this.normalizeMiaosheMediaAssetUrl(
                String(item?.thumbnailUrl || item?.url || '').trim(),
              ),
              title: String(item?.title || '上传图片').trim(),
              mimeType: String(item?.mimeType || '').trim(),
              type: item?.type === 'file' ? ('file' as const) : ('image' as const),
            }))
            .filter((item) => item.url)
        : [];
    } catch {}
    return attachments;
  }

  private normalizeMediaAssetFilterType(value?: string) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'image' || normalized === 'video') {
      return normalized;
    }
    return '';
  }

  private normalizeMediaAssetLimit(value?: string | number) {
    const limit = Number(value);
    if (!Number.isFinite(limit)) {
      return 200;
    }
    return Math.max(1, Math.min(500, Math.floor(limit)));
  }

  private detectMediaAssetType(
    mimeType?: string,
    attachmentType?: 'image' | 'file',
    url?: string,
  ): 'image' | 'video' | null {
    const normalizedMimeType = String(mimeType || '')
      .trim()
      .toLowerCase();
    if (normalizedMimeType.startsWith('image/')) {
      return 'image';
    }
    if (normalizedMimeType.startsWith('video/')) {
      return 'video';
    }
    const normalizedUrl = String(url || '')
      .trim()
      .toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(normalizedUrl)) {
      return 'image';
    }
    if (/\.(mp4|mov|m4v|webm)(\?|$)/.test(normalizedUrl)) {
      return 'video';
    }
    return attachmentType === 'image' ? 'image' : null;
  }

  private ossClient: OSS | null | undefined;

  private getOssClient(): OSS | null {
    if (this.ossClient !== undefined) return this.ossClient;
    const accessKeyId = this.configService.get<string>('OSS_ACCESS_KEY_ID');
    const accessKeySecret = this.configService.get<string>('OSS_ACCESS_KEY_SECRET');
    const bucket = this.configService.get<string>('OSS_BUCKET');
    const region = this.configService.get<string>('OSS_REGION');
    if (!accessKeyId || !accessKeySecret || !bucket || !region) {
      this.ossClient = null;
      return null;
    }
    const endpoint = this.configService.get<string>('OSS_ENDPOINT');
    this.ossClient = new OSS({
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
      ...(endpoint ? { endpoint } : {}),
    });
    return this.ossClient;
  }

  private async uploadToOss(
    objectKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string | null> {
    const client = this.getOssClient();
    if (!client) return null;
    const acl = this.configService.get<string>('OSS_OBJECT_ACL') || 'public-read';
    try {
      await client.put(objectKey, buffer, {
        headers: buildOssUploadHeaders(mimeType, acl),
      });
      const publicBase =
        this.configService.get<string>('OSS_PUBLIC_BASE_URL') ||
        `https://${this.configService.get<string>('OSS_BUCKET')}.${this.configService.get<string>('OSS_REGION')}.aliyuncs.com`;
      return `${publicBase.replace(/\/+$/, '')}/${objectKey}`;
    } catch (err) {
      this.logger.warn(`OSS upload failed for ${objectKey}, falling back to local storage`, err);
      return null;
    }
  }

  private async persistMiaosheMediaAsset(
    userId: string,
    brandId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    options?: {
      source?: string;
      title?: string;
    },
  ) {
    const fallbackExtension = this.extensionFromMimeType(file.mimetype);
    const extension = extname(file.originalname || '').toLowerCase() || fallbackExtension;
    const safeName = `${Date.now()}-${randomUUID()}${extension}`;
    const mimeType = String(file.mimetype || '').trim() || 'application/octet-stream';
    const type = this.detectUploadAssetType(file.mimetype);

    const mediaPrefix = this.configService.get<string>('OSS_MEDIA_PREFIX') || 'miaoshe/media';
    const objectKey = `${mediaPrefix}/${brandId}/${safeName}`;
    const ossUrl = await this.uploadToOss(objectKey, file.buffer, mimeType);

    const url = ossUrl ?? await (async () => {
      const uploadDir = join(process.cwd(), 'uploads', 'miaoshe-chat', brandId);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(join(uploadDir, safeName), file.buffer);
      return `/uploads/miaoshe-chat/${brandId}/${safeName}`;
    })();
    const publicUrl = this.normalizeMiaosheMediaAssetUrl(url);
    const title = String(
      options?.title || file.originalname || (type === 'file' ? '上传文件' : '上传图片'),
    ).trim();
    const source = String(options?.source || '用户上传').trim() || '用户上传';
    const now = this.nowSql();

    await this.mysqlService.query(
      `INSERT IGNORE INTO monitor_media_assets (
        id, user_id, brand_id, asset_type, title, asset_url, thumbnail_url, mime_type,
        provider, model, source, prompt, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        userId,
        brandId,
        type,
        title,
        url,
        type === 'image' ? url : null,
        mimeType,
        null,
        null,
        source,
        null,
        JSON.stringify({ size: Number(file.size || file.buffer.length || 0) }),
        now,
        now,
      ],
    );

    return {
      id: safeName,
      type,
      url: publicUrl,
      thumbnailUrl: type === 'image' ? publicUrl : '',
      title,
      mimeType,
      source,
      size: Number(file.size || file.buffer.length || 0),
      createdAt: Date.now(),
    };
  }

  private detectUploadAssetType(mimeType?: string): 'image' | 'video' | 'file' {
    const normalizedMimeType = String(mimeType || '')
      .trim()
      .toLowerCase();
    if (normalizedMimeType.startsWith('image/')) {
      return 'image';
    }
    if (normalizedMimeType.startsWith('video/')) {
      return 'video';
    }
    return 'file';
  }

  private extensionFromMimeType(mimeType?: string) {
    const normalizedMimeType = String(mimeType || '')
      .trim()
      .toLowerCase();
    if (normalizedMimeType === 'image/png') return '.png';
    if (normalizedMimeType === 'image/jpeg') return '.jpg';
    if (normalizedMimeType === 'image/webp') return '.webp';
    if (normalizedMimeType === 'image/gif') return '.gif';
    if (normalizedMimeType === 'video/mp4') return '.mp4';
    if (normalizedMimeType === 'video/webm') return '.webm';
    return '';
  }

  private async saveMiaosheChatUploads(
    userId: string,
    brandId: string,
    threadId: string,
    clientMessageId: string,
    messageText: string,
    attachments: Array<{
      url: string;
      thumbnailUrl: string;
      title: string;
      mimeType: string;
      type: 'image' | 'file';
    }>,
  ) {
    const normalizedThreadId = this.normalizeMiaosheUploadThreadId(threadId);
    const normalizedClientMessageId = this.normalizeClientMessageId(clientMessageId);
    const now = this.nowSql();
    const attachmentsJson = JSON.stringify(attachments);

    if (normalizedClientMessageId) {
      const existingRows = await this.mysqlService.query<MiaosheChatUploadRow[]>(
        `SELECT *
         FROM monitor_miaoshe_chat_uploads
         WHERE brand_id = ? AND thread_id = ? AND client_message_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [brandId, normalizedThreadId, normalizedClientMessageId],
      );
      const existing = existingRows[0];
      if (existing) {
        await this.mysqlService.query(
          `UPDATE monitor_miaoshe_chat_uploads
           SET message_text = ?, attachments_json = ?, updated_at = ?
           WHERE id = ?`,
          [
            messageText,
            attachments.length > 0 ? attachmentsJson : existing.attachments_json,
            now,
            existing.id,
          ],
        );
        return;
      }
    }

    await this.mysqlService.query(
      `INSERT INTO monitor_miaoshe_chat_uploads (id, user_id, brand_id, thread_id, client_message_id, message_text, attachments_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        userId,
        brandId,
        normalizedThreadId,
        normalizedClientMessageId || null,
        messageText,
        attachmentsJson,
        now,
        now,
      ],
    );
  }

  private normalizeMiaosheUploadThreadId(threadId?: string) {
    const normalized = String(threadId || '').trim();
    return normalized || '__pending__';
  }

  private async hasExistingMiaosheUserMessageLog(
    brandId: string,
    threadId: string,
    clientMessageId: string,
  ) {
    if (!clientMessageId) {
      return false;
    }
    const normalizedThreadId = this.normalizeMiaosheUploadThreadId(threadId);
    const rows = await this.mysqlService.query<Array<{ id: string }>>(
      `SELECT id
       FROM monitor_miaoshe_chat_uploads
       WHERE brand_id = ? AND thread_id = ? AND client_message_id = ?
       LIMIT 1`,
      [brandId, normalizedThreadId, clientMessageId],
    );
    return rows.length > 0;
  }

  private async getUsageQuotaRulesForOrganization(organizationId: string) {
    if (!isApiCloudMode()) {
      return CONTENT_STUDIO_USAGE_QUOTA_RULES.self_hosted;
    }

    const organization = await this.organizationStore.findOrganizationById(organizationId);
    if (!organization) {
      throw new NotFoundException('组织不存在');
    }

    const effectivePlanId = this.resolveContentStudioEffectivePlanId(
      organization.plan,
      organization.subscriptionStatus,
    );
    const baseRules = CONTENT_STUDIO_USAGE_QUOTA_RULES[effectivePlanId];

    const numericOverride = (key: 'maxImages' | 'maxVideos' | 'maxMessages') =>
      typeof organization.planOverrides?.[key] === 'number' &&
      Number.isFinite(Number(organization.planOverrides[key]))
        ? Number(organization.planOverrides[key])
        : null;

    return {
      maxImages: numericOverride('maxImages') ?? baseRules.maxImages,
      maxVideos: numericOverride('maxVideos') ?? baseRules.maxVideos,
      maxMessages: numericOverride('maxMessages') ?? baseRules.maxMessages,
    };
  }

  private resolveContentStudioEffectivePlanId(
    plan: string | null | undefined,
    subscriptionStatus: string | null | undefined,
  ): ContentStudioEffectivePlanId {
    if (!this.isContentStudioPaidSubscription(subscriptionStatus)) {
      return 'free';
    }

    if (plan === 'growth' || plan === 'enterprise') {
      return plan;
    }

    return 'starter';
  }

  private isContentStudioPaidSubscription(subscriptionStatus: string | null | undefined) {
    return subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  }

  private async countOrganizationStoredMediaAssets(organizationId: string) {
    const assetRows = await this.mysqlService.query<MediaAssetRow[]>(
      `SELECT ma.*
       FROM monitor_media_assets ma
       INNER JOIN monitor_brands b ON b.id = ma.brand_id
       WHERE b.organization_id = ?
         AND ma.asset_type IN ('image', 'video')`,
      [organizationId],
    );

    const legacyRows = await this.mysqlService.query<MiaosheChatUploadRow[]>(
      `SELECT u.*
       FROM monitor_miaoshe_chat_uploads u
       INNER JOIN monitor_brands b ON b.id = u.brand_id
       WHERE b.organization_id = ?`,
      [organizationId],
    );

    const usage = { images: 0, videos: 0 };
    const seenKeys = new Set<string>();

    for (const row of assetRows) {
      if (row.asset_type !== 'image' && row.asset_type !== 'video') {
        continue;
      }
      const key = String(row.asset_url || '').trim() || `media:${row.id}`;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      if (row.asset_type === 'image') {
        usage.images += 1;
      } else {
        usage.videos += 1;
      }
    }

    for (const row of legacyRows) {
      const attachments = this.parseMiaosheAttachments(row.attachments_json);
      for (const attachment of attachments) {
        const assetType = this.detectMediaAssetType(
          attachment.mimeType,
          attachment.type,
          attachment.url,
        );
        if (!assetType) {
          continue;
        }
        const key = attachment.url || `legacy:${row.id}:${attachment.title}:${assetType}`;
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        if (assetType === 'image') {
          usage.images += 1;
        } else {
          usage.videos += 1;
        }
      }
    }

    return usage;
  }

  private async countOrganizationStoredMediaAssetsForBrand(brandId: string) {
    const brand = await this.findBrandRow(brandId);
    return this.countOrganizationStoredMediaAssets(brand.organization_id);
  }

  private async countOrganizationConversationMessages(organizationId: string) {
    const contentMessageRows = await this.mysqlService.query<Array<{ count: number }>>(
      `SELECT COUNT(*) AS count
       FROM monitor_content_messages m
       INNER JOIN monitor_brands b ON b.id = m.brand_id
       WHERE b.organization_id = ?
         AND m.role = 'user'`,
      [organizationId],
    );

    const miaosheRows = await this.mysqlService.query<
      Array<{
        id: string;
        brand_id: string;
        thread_id: string;
        client_message_id: string | null;
        message_text: string;
      }>
    >(
      `SELECT u.id, u.brand_id, u.thread_id, u.client_message_id, u.message_text
       FROM monitor_miaoshe_chat_uploads u
       INNER JOIN monitor_brands b ON b.id = u.brand_id
       WHERE b.organization_id = ?`,
      [organizationId],
    );

    const miaosheMessageKeys = new Set<string>();
    for (const row of miaosheRows) {
      const clientMessageId = String(row.client_message_id || '').trim();
      const messageText = String(row.message_text || '').trim();
      if (
        clientMessageId.startsWith('generated:') ||
        clientMessageId.startsWith('generated-video:') ||
        /^图片生成：|^视频生成：/.test(messageText)
      ) {
        continue;
      }

      const key = clientMessageId
        ? `${row.brand_id}:${row.thread_id}:${clientMessageId}`
        : `${row.id}`;
      miaosheMessageKeys.add(key);
    }

    return Number(contentMessageRows[0]?.count ?? 0) + miaosheMessageKeys.size;
  }

  private async assertConversationMessageQuota(organizationId: string, increment: number) {
    if (increment <= 0) {
      return;
    }
    const usageQuota = await this.getUsageQuotaRulesForOrganization(organizationId);
    const currentCount = await this.countOrganizationConversationMessages(organizationId);
    this.assertQuotaIncrementWithinLimit({
      limit: usageQuota.maxMessages,
      currentCount,
      increment,
      label: '对话消息',
      unit: '条',
    });
  }

  private async assertMediaQuotaCapacity(
    organizationId: string,
    usageQuota: ContentStudioUsageQuotaRules,
    pending: { images: number; videos: number },
  ) {
    if (pending.images <= 0 && pending.videos <= 0) {
      return;
    }

    const currentUsage = await this.countOrganizationStoredMediaAssets(organizationId);
    if (pending.images > 0) {
      this.assertQuotaIncrementWithinLimit({
        limit: usageQuota.maxImages,
        currentCount: currentUsage.images,
        increment: pending.images,
        label: '图片',
        unit: '张',
      });
    }
    if (pending.videos > 0) {
      this.assertQuotaIncrementWithinLimit({
        limit: usageQuota.maxVideos,
        currentCount: currentUsage.videos,
        increment: pending.videos,
        label: '视频',
        unit: '条',
      });
    }
  }

  private assertQuotaIncrementWithinLimit(input: {
    limit: number;
    currentCount: number;
    increment: number;
    label: string;
    unit: string;
  }) {
    if (input.limit === -1 || input.increment <= 0) {
      return;
    }

    if (input.currentCount + input.increment <= input.limit) {
      return;
    }

    const remaining = Math.max(0, input.limit - input.currentCount);
    if (remaining <= 0) {
      throw new BadRequestException(`当前套餐${input.label}配额已用完（最多 ${input.limit} ${input.unit}）`);
    }

    throw new BadRequestException(
      `当前套餐${input.label}配额不足，本次需要 ${input.increment} ${input.unit}，还可用 ${remaining} ${input.unit}`,
    );
  }

  private normalizeTitle(value?: string) {
    const title = (value || '').trim();
    return title || '未命名草稿';
  }

  private normalizeContent(value?: string) {
    return value ?? '';
  }

  private extractStructuredLayoutResult(value: string) {
    const text = String(value || '').trim();
    if (!text) return null;

    const candidates = [text];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) candidates.push(fenced[1].trim());

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') {
          return {
            title: String((parsed as any).title || '').trim(),
            markdown: String(
              (parsed as any).markdown || (parsed as any).content || (parsed as any).body || '',
            ),
          };
        }
      } catch {}
    }

    const markdownBlock = text.match(/```markdown\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
    if (markdownBlock?.[1]) {
      return {
        title: '',
        markdown: markdownBlock[1].trim(),
      };
    }

    return {
      title: '',
      markdown: text,
    };
  }

  private normalizePublishMarkdown(value: string) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
      .replace(/^(\-|\*|\+)([^\s])/gm, '$1 $2')
      .replace(/^(\d+)\.([^\s])/gm, '$1. $2')
      .trim();
  }

  private extractExplicitMiaosheArticleArtifact(assistantContent: string) {
    const rawContent = String(assistantContent || '').trim();
    if (!rawContent) {
      return {
        content: '',
        articleArtifact: null as MiaosheArticleArtifactResult | null,
      };
    }

    const artifactMatch = rawContent.match(/```miaoshe-article\s*([\s\S]*?)```/i);
    if (!artifactMatch?.[1]) {
      return {
        content: rawContent,
        articleArtifact: null as MiaosheArticleArtifactResult | null,
      };
    }

    const parsed = this.extractStructuredLayoutResult(artifactMatch[1].trim());
    const markdown = this.normalizePublishMarkdown(String(parsed?.markdown || ''));
    if (!markdown || markdown.length < 80) {
      return {
        content: rawContent.replace(artifactMatch[0], '').trim(),
        articleArtifact: null as MiaosheArticleArtifactResult | null,
      };
    }

    const extractedTitle = this.extractArticleTitleFromMarkdown(markdown);
    return {
      content: rawContent.replace(artifactMatch[0], '').trim(),
      articleArtifact: {
        title: this.normalizeTitle(parsed?.title || extractedTitle),
        markdown,
        format: 'markdown',
      } satisfies MiaosheArticleArtifactResult,
    };
  }

  private extractExplicitMiaosheWorkflowTrigger(assistantContent: string): {
    content: string;
    trigger: { intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate' } | null;
  } {
    const rawContent = String(assistantContent || '').trim();
    if (!rawContent) {
      return {
        content: '',
        trigger: null as {
          intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate';
        } | null,
      };
    }

    const triggerMatch = rawContent.match(/```miaoshe-workflow\s*([\s\S]*?)```/i);
    if (!triggerMatch?.[1]) {
      return {
        content: rawContent,
        trigger: null as {
          intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate';
        } | null,
      };
    }

    const normalizedContent = rawContent.replace(triggerMatch[0], '').trim();

    try {
      const parsed = JSON.parse(triggerMatch[1].trim()) as { intent?: string } | null;
      const intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate' | null =
        parsed?.intent === 'image_generate' ||
        parsed?.intent === 'media_edit' ||
        parsed?.intent === 'video_storyboard' ||
        parsed?.intent === 'video_generate'
          ? parsed.intent
          : null;
      if (!intent) {
        return {
          content: normalizedContent,
          trigger: null as {
            intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate';
          } | null,
        };
      }
      return {
        content: normalizedContent,
        trigger: { intent },
      };
    } catch {
      return {
        content: normalizedContent,
        trigger: null as {
          intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate';
        } | null,
      };
    }
  }

  private inferImplicitMiaosheWorkflowTrigger(input: {
    assistantContent: string;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): { intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate' } | null {
    const assistantContent = String(input.assistantContent || '').trim();
    if (!assistantContent) {
      return null;
    }

    if (
      /(切换到\s*Agent|点击下方按钮|请确认后|确认后我继续|需要你确认|等待切换到\s*Agent)/i.test(
        assistantContent,
      )
    ) {
      return null;
    }

    const promisesExecution =
      /(我会|我将|我来|现在|马上|这就|立刻|立即).*(开始|启动|制作|生成|生图|做图|做视频|生成视频|生成图片)/.test(
        assistantContent,
      ) ||
      /(请稍等|稍等片刻|稍候|完成后.*通知你|制作完成后.*通知你|生成完成后.*通知你)/.test(
        assistantContent,
      );

    if (!promisesExecution) {
      return null;
    }

    const conversationText = [
      ...input.history.map((item) => String(item.content || '').trim()),
      String(input.message || '').trim(),
      assistantContent,
    ]
      .filter(Boolean)
      .join('\n');

    const wantsReferenceImage =
      /(参考图生图|以图生图|参考图|垫图|基于这张图|按这张图|用这张图|参考这张图|参考上传图|根据这张图|首帧|主体图|素材库那张图|上传的图)/.test(
        conversationText,
      );
    const wantsVideo =
      /(视频|短视频|片子|动画|图生视频|文生视频|口播|运镜|分镜|镜头脚本|storyboard)/i.test(
        conversationText,
      );
    const explicitImageGenerationRequest =
      this.isMiaosheExplicitImageGenerationRequest(conversationText);

    if (wantsVideo) {
      return {
        intent: explicitImageGenerationRequest ? 'image_generate' : 'video_generate',
      };
    }

    if (/(图片|海报|封面|主图|宣传图|配图|场景图|效果图|生图|文生图)/.test(conversationText)) {
      return {
        intent: wantsReferenceImage ? 'media_edit' : 'image_generate',
      };
    }

    return null;
  }

  private isMiaosheImageContinuationMessage(message: string) {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) {
      return false;
    }

    return (
      /(9:16|16:9|1:1|3:4|4:3|比例|尺寸|竖版|横版|方图|海报|封面|主图|配图|宣传图|场景图|效果图|品牌|产品|主体|人物|背景|标题|文案|无字|纯图|风格|写实|插画|卡通|3d|电商|小红书|公众号|详情页|banner|暖色|冷色|高级感|参考图|上传的图|这张图|按这张图|一张|两张|三张|四张|五张|六张|九宫格|高清)/i.test(
        normalizedMessage,
      ) ||
      /^(就按这个|按这个来|继续|继续吧|可以开始了|开始吧|就这样|可以|好的|行|嗯|没问题)$/.test(
        normalizedMessage,
      )
    );
  }

  private shouldHonorMiaosheWorkflowTrigger(input: {
    triggerIntent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate';
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) {
    const normalizedMessage = String(input.message || '').trim();
    if (!normalizedMessage) {
      return false;
    }

    if (this.isMiaosheNaturalMediaExecutionConfirmation(normalizedMessage, input.history)) {
      return true;
    }

    const wantsImage = this.isMiaosheExplicitImageGenerationRequest(normalizedMessage);
    const wantsVideo =
      /(生成|做|制作|创作|产出).*(视频|短视频|片子|动画|分镜)|文生视频|生视频|图生视频|参考图生视频|视频生成|镜头脚本|storyboard/i.test(
        normalizedMessage,
      );
    const historicalIntent = this.inferMiaosheMediaIntentFromHistory(input.history);
    const triggerIsVideo =
      input.triggerIntent === 'video_storyboard' || input.triggerIntent === 'video_generate';

    if (triggerIsVideo) {
      if (wantsVideo) {
        return true;
      }
      if (historicalIntent !== 'video_storyboard' && historicalIntent !== 'video_generate') {
        return false;
      }
      return this.isMiaosheVideoContinuationMessage(normalizedMessage);
    }

    if (wantsImage) {
      return true;
    }
    if (historicalIntent !== 'image_generate' && historicalIntent !== 'media_edit') {
      return false;
    }
    return this.isMiaosheImageContinuationMessage(normalizedMessage);
  }

  private resolveMiaosheWorkflowTriggerFromAssistant(input: {
    assistantContent: string;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): {
    content: string;
    trigger: { intent: 'image_generate' | 'media_edit' | 'video_storyboard' | 'video_generate' } | null;
  } {
    const explicit = this.extractExplicitMiaosheWorkflowTrigger(input.assistantContent);
    if (explicit.trigger) {
      return explicit;
    }

    return {
      content: explicit.content,
      trigger: this.inferImplicitMiaosheWorkflowTrigger({
        assistantContent: explicit.content,
        message: input.message,
        history: input.history,
      }),
    };
  }

  private extractArticleTitleFromMarkdown(markdown: string) {
    const headingMatch = String(markdown || '')
      .trim()
      .match(/^#\s+(.+)$/m);
    if (headingMatch?.[1]) {
      return headingMatch[1].trim();
    }

    const firstLine = String(markdown || '')
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    if (!firstLine) {
      return '';
    }

    return firstLine.length <= 40 ? firstLine : firstLine.slice(0, 40);
  }

  private countStats(text: string) {
    const cnChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    const enText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
    const enWords = enText.trim().split(/\s+/).filter(Boolean);
    return {
      words: cnChars.length + enWords.length,
      chars: text.length,
    };
  }

  private normalizeBaseUrl(baseUrl: string) {
    const normalized = (baseUrl || '').trim().replace(/\/+$/, '');
    return normalized || 'https://api.vectorengine.ai/v1';
  }

  private formatAiPlatformLabel(value: string | null | undefined) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    const labels: Record<string, string> = {
      chatgpt: 'ChatGPT',
      openai: 'ChatGPT',
      claude: 'Claude',
      gemini: 'Gemini',
      perplexity: 'Perplexity',
      copilot: 'Copilot',
      grok: 'Grok',
      deepseek: 'DeepSeek',
      kimi: 'Kimi',
      moonshot: 'Kimi',
      qwen: '通义千问',
      tongyi: '通义千问',
      doubao: '豆包',
      yuanbao: '元宝',
      hy3: '元宝',
      'hy3-preview': '元宝',
      wenxin: '文心一言',
      yiyan: '文心一言',
      ernie: '文心一言',
      wechat: '微信公众号',
      unknown: '未知来源',
    };
    return labels[normalized] || value || '未知来源';
  }

  private normalizeDomain(value: string | null | undefined) {
    const raw = String(value || '')
      .trim()
      .toLowerCase();
    if (!raw) return '';

    const withProtocol = raw.includes('://') ? raw : `https://${raw}`;
    try {
      return new URL(withProtocol).hostname.replace(/^www\./, '');
    } catch {
      return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '';
    }
  }

  private domainMatches(host: string, domain: string) {
    const normalizedHost = this.normalizeDomain(host);
    const normalizedDomain = this.normalizeDomain(domain);
    if (!normalizedHost || !normalizedDomain) return false;
    return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
  }

  private extractUrlSummary(value: string | null | undefined) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const withProtocol = raw.includes('://') ? raw : `https://${raw}`;
    try {
      const url = new URL(withProtocol);
      const host = url.hostname.replace(/^www\./, '');
      const path = `${url.pathname || '/'}${url.search || ''}` || '/';
      return {
        host,
        path,
        display: `${host}${path === '/' ? '' : path}`.slice(0, 120),
      };
    } catch {
      return null;
    }
  }

  private truncateText(value: string, maxLength: number) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  private normalizeMiaosheConversationTitle(
    rawTitle: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    artifactTitle?: string,
  ) {
    const candidate = String(rawTitle || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.replace(/^(标题|会话标题|title)\s*[:：-]\s*/i, '')
      .replace(/[""'`]/g, '')
      .replace(/[。！？：；、]+$/g, '')
      .trim();

    if (candidate && candidate !== '新对话' && candidate !== '未命名') {
      return this.truncateText(candidate, 24);
    }

    const fallback =
      String(artifactTitle || '').trim() ||
      history.find((item) => item.role === 'user' && item.content)?.content ||
      history[history.length - 1]?.content ||
      '新对话';

    return this.truncateText(fallback.replace(/\s+/g, ' '), 24);
  }

  private parsePositiveIntegerConfig(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private getMiaosheClientHistoryTokenBudget() {
    return this.parsePositiveIntegerConfig(
      this.configService.get<string>('MIAOSHE_CLIENT_HISTORY_TOKEN_BUDGET'),
      960_000,
    );
  }

  private getMiaosheContextWindowTokens(mode?: 'chat' | 'agent') {
    const modeKey =
      mode === 'agent'
        ? 'MIAOSHE_AGENT_CONTEXT_WINDOW_TOKENS'
        : 'MIAOSHE_CHAT_CONTEXT_WINDOW_TOKENS';
    return this.parsePositiveIntegerConfig(
      this.configService.get<string>(modeKey) ||
        this.configService.get<string>('MIAOSHE_CONTEXT_WINDOW_TOKENS'),
      1_000_000,
    );
  }

  private getMiaosheMaxOutputTokens(mode?: 'chat' | 'agent', fallback = 8_192) {
    const modeKey =
      mode === 'agent' ? 'MIAOSHE_AGENT_MAX_OUTPUT_TOKENS' : 'MIAOSHE_CHAT_MAX_OUTPUT_TOKENS';
    return this.parsePositiveIntegerConfig(
      this.configService.get<string>(modeKey) ||
        this.configService.get<string>('MIAOSHE_MAX_OUTPUT_TOKENS'),
      fallback,
    );
  }

  private getMiaosheRequestTimeoutMs(mode?: 'chat' | 'agent', fallback = 300_000) {
    const modeKey =
      mode === 'agent' ? 'MIAOSHE_AGENT_TIMEOUT_MS' : 'MIAOSHE_CHAT_TIMEOUT_MS';
    return this.parsePositiveIntegerConfig(
      this.configService.get<string>(modeKey) ||
        this.configService.get<string>('MIAOSHE_TIMEOUT_MS'),
      fallback,
    );
  }

  private estimateMiaosheTextTokens(value: string) {
    let total = 0;

    for (const char of String(value || '')) {
      const codePoint = char.codePointAt(0) || 0;
      if (char === '\n') {
        total += 0.2;
        continue;
      }
      if (/\s/.test(char)) {
        total += 0.1;
        continue;
      }
      if (this.isCjkCodePoint(codePoint)) {
        total += 1;
        continue;
      }
      total += codePoint <= 0x7f ? 0.25 : 0.7;
    }

    return Math.max(1, Math.ceil(total));
  }

  private isCjkCodePoint(codePoint: number) {
    return (
      (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2ceaf)
    );
  }

  private estimateMiaosheHistoryMessageTokens(message: {
    role: 'user' | 'assistant';
    content: string;
  }) {
    return this.estimateMiaosheTextTokens(message.content) + 8;
  }

  private pruneMiaosheHistoryByTokenBudget(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    tokenBudget: number,
  ) {
    const normalized = history
      .map((item) => ({
        role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(item.content || '').trim(),
      }))
      .filter((item) => item.content);

    if (!normalized.length) {
      return [] as Array<{ role: 'user' | 'assistant'; content: string }>;
    }

    const selected: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let usedTokens = 0;

    for (let index = normalized.length - 1; index >= 0; index -= 1) {
      const candidate = normalized[index];
      const candidateTokens = this.estimateMiaosheHistoryMessageTokens(candidate);
      if (selected.length > 0 && usedTokens + candidateTokens > tokenBudget) {
        break;
      }
      selected.unshift(candidate);
      usedTokens += candidateTokens;
    }

    return selected;
  }

  private fitMiaosheHistoryWithinContext(input: {
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    contextParts: Array<string | null | undefined>;
    mode?: 'chat' | 'agent';
    reservedOutputTokens?: number;
  }) {
    const contextWindow = this.getMiaosheContextWindowTokens(input.mode);
    const reservedOutputTokens =
      input.reservedOutputTokens || this.getMiaosheMaxOutputTokens(input.mode);
    const staticTokens =
      input.contextParts.reduce(
        (sum, part) => sum + this.estimateMiaosheTextTokens(String(part || '')),
        0,
      ) + 256;
    const historyBudget = Math.max(0, contextWindow - reservedOutputTokens - staticTokens);

    return this.pruneMiaosheHistoryByTokenBudget(input.history, historyBudget);
  }

  private parseJsonArray(value: unknown) {
    if (!value) return [] as string[];
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }
    if (typeof value !== 'string') {
      return [] as string[];
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [] as string[];
    }
  }

  private nullableTrim(value?: string | null) {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }

  private normalizeChatProtocol(value: string) {
    return value.trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'openai';
  }

  private extractAnthropicContent(payload: any) {
    const contentBlocks = Array.isArray(payload?.content) ? payload.content : [];
    const text = contentBlocks
      .map((block: { type?: string; text?: string }) =>
        block?.type === 'text' ? block.text || '' : '',
      )
      .join('')
      .trim();

    return text;
  }

  private nowSql() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  private toIso(value: string) {
    return value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  }
}
