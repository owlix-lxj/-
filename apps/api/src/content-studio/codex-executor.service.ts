import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessAuthorizationService } from '../auth/business-authorization.service';

type MediaPublishCodexContext = {
  brandName: string;
  brandIndustry: string;
  brandRegion: string;
  brandLanguage: string;
  brandDescription: string;
  domains: string[];
  workspaceContext: string;
};

type MediaPublishSupportedPlatform = {
  id: string;
  name: string;
};

type MiaosheConversationInput = {
  mode: 'chat' | 'agent';
  brandContext: string;
  workspaceContext: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  threadId?: string;
  uploadedAttachments?: Array<{
    title?: string;
    type?: string;
    mimeType?: string;
    url?: string;
  }>;
};

type IdeConversationInput = {
  userId?: string | null;
  sceneType: string;
  skillName: string;
  mode?: 'default' | 'plan';
  workspaceContext: string;
  contextSummary: string;
  selectedFilePaths: string[];
  history: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
  message: string;
  modelProvider?: string | null;
  modelName?: string | null;
  threadId?: string;
  signal?: AbortSignal;
};

type IdeConversationTitleInput = {
  userId?: string | null;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspaceContext?: string;
  modelProvider?: string | null;
  modelName?: string | null;
};

type IdeTaskMemorySummaryInput = {
  userId?: string | null;
  digest: string;
  previousSummary?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
};

type IdePlanWorkflowInput = {
  userId?: string | null;
  contextSummary: string;
  workspaceContext: string;
  selectedFilePaths: string[];
  history: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
  message: string;
  answers: Array<{ content: string; createdAt: string }>;
  previousPlanMarkdown?: string | null;
  feedback?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
};

export type IdePlanWorkflowResult = {
  stage: 'clarifying' | 'plan_ready';
  summary: string;
  replyMarkdown: string;
  questions: Array<{
    prompt: string;
    description?: string | null;
    placeholder?: string | null;
    type: 'single_choice' | 'multi_choice' | 'text';
    choices: Array<{
      label: string;
      description?: string | null;
    }>;
  }>;
  planMarkdown: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
  } | null;
};

type IdeIntentRouteInput = {
  userId?: string | null;
  sceneType: string;
  skillName: string;
  toolChoice: 'auto' | 'none' | 'required';
  contextSummary: string;
  workspaceContext: string;
  selectedFilePaths: string[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  availableTools: Array<{
    name: string;
    riskLevel: 'low' | 'medium' | 'high';
    requiresConfirmation: boolean;
  }>;
  modelProvider?: string | null;
  modelName?: string | null;
};

export type IdeIntentRouteToolCall = {
  toolName: string;
  reason: string;
  inputJson: Record<string, unknown> | null;
};

export type IdeIntentRouteResult = {
  action: 'respond' | 'request_tools';
  sceneType: string;
  skillName: string;
  summary: string;
  responseMarkdown: string;
  requiredTools: IdeIntentRouteToolCall[];
};

type CodexExecutionConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model?: string;
};

type CodexExecutionProtocol = 'openai_responses' | 'openai_chat_completions';

type CodexProviderCapability = {
  id: string;
  requestValue: string;
  label: string;
  configured: boolean;
  enabled: boolean;
  baseUrl: string | null;
  defaultModel: string | null;
};

type CodexModelEndpointCapability = {
  method: 'POST';
  path: string;
  apiStyle:
    | 'openai-chat-completions'
    | 'openai-responses'
    | 'anthropic-messages'
    | 'gemini-generate-content';
};

type CodexModelCapability = {
  id: string;
  modelName: string;
  label: string;
  family: string;
  modality: 'text' | 'image';
  provider: string;
  providerLabel: string;
  baseUrl: string | null;
  enabled: boolean;
  recommendedTransport: 'responses' | 'chat_completions';
  supportedEndpoints: CodexModelEndpointCapability[];
};

const DEFAULT_CODEX_EXECUTION_MODEL = 'gpt-5.4';

const CODEX_MODEL_CATALOG: Array<{
  modelName: string;
  label: string;
  family: string;
  modality: 'text' | 'image';
  supportedEndpoints: CodexModelEndpointCapability[];
}> = [
  {
    modelName: 'gpt-5.3-codex',
    label: 'gpt-5.3-codex',
    family: 'gpt-5',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
      {
        method: 'POST',
        path: '/openai-response/v1/responses',
        apiStyle: 'openai-responses',
      },
    ],
  },
  {
    modelName: 'gpt-5.5',
    label: 'gpt-5.5',
    family: 'gpt-5',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
      {
        method: 'POST',
        path: '/openai-response/v1/responses',
        apiStyle: 'openai-responses',
      },
    ],
  },
  {
    modelName: 'gpt-5.4-mini',
    label: 'gpt-5.4-mini',
    family: 'gpt-5',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai-response/v1/responses',
        apiStyle: 'openai-responses',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'gpt-5.4',
    label: 'gpt-5.4',
    family: 'gpt-5',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai-response/v1/responses',
        apiStyle: 'openai-responses',
      },
    ],
  },
  {
    modelName: 'gemini-3.5-flash',
    label: 'gemini-3.5-flash',
    family: 'gemini',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/v1beta/models/gemini-3.5-flash:generateContent',
        apiStyle: 'gemini-generate-content',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'claude-sonnet-5',
    label: 'claude-sonnet-5',
    family: 'claude',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'claude-fable-5',
    label: 'claude-fable-5',
    family: 'claude',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'claude-opus-4-8',
    label: 'claude-opus-4-8',
    family: 'claude',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'claude-opus-4-7',
    label: 'claude-opus-4-7',
    family: 'claude',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'claude-sonnet-4-6',
    label: 'claude-sonnet-4-6',
    family: 'claude',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'grok-4.5',
    label: 'grok-4.5',
    family: 'grok',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'kimi-k3',
    label: 'kimi-k3',
    family: 'kimi',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'kimi-k2.7-code',
    label: 'kimi-k2.7-code',
    family: 'kimi',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'glm-5.2',
    label: 'glm-5.2',
    family: 'glm',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'qwen3.8-max-preview',
    label: 'qwen3.8-max-preview',
    family: 'qwen',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
    ],
  },
  {
    modelName: 'qwen3.7-max',
    label: 'qwen3.7-max',
    family: 'qwen',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
    ],
  },
  {
    modelName: 'qwen3.7-plus',
    label: 'qwen3.7-plus',
    family: 'qwen',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/anthropic/v1/messages',
        apiStyle: 'anthropic-messages',
      },
    ],
  },
  {
    modelName: 'deepseek-v4-flash',
    label: 'deepseek-v4-flash',
    family: 'deepseek',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
  {
    modelName: 'deepseek-v4-pro',
    label: 'deepseek-v4-pro',
    family: 'deepseek',
    modality: 'text',
    supportedEndpoints: [
      {
        method: 'POST',
        path: '/openai/v1/chat/completions',
        apiStyle: 'openai-chat-completions',
      },
    ],
  },
];

const OFFICIAL_CODEX_PROVIDER_CONFIGS: Record<
  string,
  {
    keyEnvPrefixes: string[];
    baseUrlEnvPrefixes: string[];
    modelEnvPrefixes: string[];
    defaultBaseUrl: string;
    defaultModel: string;
  }
> = {
  hunyuan: {
    keyEnvPrefixes: ['HUNYUAN', 'YUANBAO'],
    baseUrlEnvPrefixes: ['HUNYUAN'],
    modelEnvPrefixes: ['HUNYUAN', 'YUANBAO'],
    defaultBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hy3',
  },
  yuanbao: {
    keyEnvPrefixes: ['HUNYUAN', 'YUANBAO'],
    baseUrlEnvPrefixes: ['HUNYUAN'],
    modelEnvPrefixes: ['HUNYUAN', 'YUANBAO'],
    defaultBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hy3',
  },
  kimi: {
    keyEnvPrefixes: ['KIMI', 'MOONSHOT'],
    baseUrlEnvPrefixes: ['KIMI', 'MOONSHOT'],
    modelEnvPrefixes: ['KIMI', 'MOONSHOT'],
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3',
  },
  moonshot: {
    keyEnvPrefixes: ['KIMI', 'MOONSHOT'],
    baseUrlEnvPrefixes: ['KIMI', 'MOONSHOT'],
    modelEnvPrefixes: ['KIMI', 'MOONSHOT'],
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k3',
  },
  deepseek: {
    keyEnvPrefixes: ['DEEPSEEK'],
    baseUrlEnvPrefixes: ['DEEPSEEK'],
    modelEnvPrefixes: ['DEEPSEEK'],
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-pro',
  },
  qwen: {
    keyEnvPrefixes: ['QWEN', 'DASHSCOPE'],
    baseUrlEnvPrefixes: ['QWEN', 'DASHSCOPE'],
    modelEnvPrefixes: ['QWEN', 'DASHSCOPE'],
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    defaultModel: 'qwen3.7-max',
  },
  tongyi: {
    keyEnvPrefixes: ['QWEN', 'DASHSCOPE'],
    baseUrlEnvPrefixes: ['QWEN', 'DASHSCOPE'],
    modelEnvPrefixes: ['QWEN', 'DASHSCOPE'],
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    defaultModel: 'qwen3.7-max',
  },
  qwen_token_plan: {
    keyEnvPrefixes: ['QWEN_TOKEN_PLAN', 'TOKEN_PLAN', 'QWEN', 'DASHSCOPE'],
    baseUrlEnvPrefixes: ['QWEN_TOKEN_PLAN', 'TOKEN_PLAN'],
    modelEnvPrefixes: ['QWEN_TOKEN_PLAN', 'TOKEN_PLAN'],
    defaultBaseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic',
    defaultModel: 'qwen3.8-max-preview',
  },
  token_plan: {
    keyEnvPrefixes: ['QWEN_TOKEN_PLAN', 'TOKEN_PLAN', 'QWEN', 'DASHSCOPE'],
    baseUrlEnvPrefixes: ['QWEN_TOKEN_PLAN', 'TOKEN_PLAN'],
    modelEnvPrefixes: ['QWEN_TOKEN_PLAN', 'TOKEN_PLAN'],
    defaultBaseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic',
    defaultModel: 'qwen3.8-max-preview',
  },
  glm: {
    keyEnvPrefixes: ['GLM', 'ZHIPU', 'ZAI'],
    baseUrlEnvPrefixes: ['GLM', 'ZHIPU', 'ZAI'],
    modelEnvPrefixes: ['GLM', 'ZHIPU', 'ZAI'],
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.2',
  },
  zhipu: {
    keyEnvPrefixes: ['GLM', 'ZHIPU', 'ZAI'],
    baseUrlEnvPrefixes: ['GLM', 'ZHIPU', 'ZAI'],
    modelEnvPrefixes: ['GLM', 'ZHIPU', 'ZAI'],
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.2',
  },
};

type MiaosheConversationStreamEvent =
  | {
      type: 'status';
      phase: 'thinking' | 'completed';
      label: string;
      detail: string;
      threadId?: string | null;
    }
  | {
      type: 'text_delta';
      delta: string;
      content: string;
      threadId?: string | null;
    }
  | {
      type: 'done';
      content: string;
      threadId: string | null;
      usage: {
        inputTokens?: number;
        outputTokens?: number;
        reasoningOutputTokens?: number;
      } | null;
    };

type IdeConversationStreamEvent =
  | {
      type: 'status';
      phase: 'thinking' | 'completed';
      label: string;
      detail: string;
      threadId?: string | null;
    }
  | {
      type: 'text_delta';
      delta: string;
      content: string;
      threadId?: string | null;
    }
  | {
      type: 'done';
      content: string;
      threadId: string | null;
      usage: {
        inputTokens?: number;
        outputTokens?: number;
        reasoningOutputTokens?: number;
      } | null;
    };

export type MediaPublishCodexIntent =
  | 'article_draft'
  | 'image_generate'
  | 'video_storyboard'
  | 'video_generate'
  | 'media_edit'
  | 'media_publish'
  | 'login_help'
  | 'integration_help'
  | 'platform_data'
  | 'status_check'
  | 'general_chat';

export type MediaPublishCodexToolName =
  | 'ensure_bridge_connection'
  | 'list_platforms'
  | 'check_auth'
  | 'refresh_platform_data'
  | 'sync_article';

export type MediaPublishCodexToolStep = {
  tool: MediaPublishCodexToolName;
  reason: string;
  platformIds: string[];
  forceRefresh: boolean;
};

export type MediaPublishCodexPlan = {
  shouldEnterWorkflow: boolean;
  intent: MediaPublishCodexIntent;
  summary: string;
  targetPlatformIds: string[];
  articleTitle: string;
  articleMarkdown: string;
  missingFields: string[];
  suggestedSteps: string[];
  assetType: 'none' | 'image' | 'video';
  needsClarification: boolean;
  clarificationQuestions: string[];
  imageCount: number;
  style: string;
  aspectRatio: string;
  duration: string;
  videoModel: string;
  prompt: string;
  negativePrompt: string;
  storyboard: Array<{
    shot: string;
    duration: string;
    visual: string;
    camera: string;
    subtitle: string;
    voiceover: string;
    transition: string;
  }>;
  toolSequence: MediaPublishCodexToolStep[];
  confirmationRequired: boolean;
  confirmationNote: string;
};

type MediaPublishCodexInput = {
  context: MediaPublishCodexContext;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  supportedPlatforms: MediaPublishSupportedPlatform[];
};

export type MediaPublishCodexResult = {
  plan: MediaPublishCodexPlan;
  threadId: string | null;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
  } | null;
};

type MiaosheConversationResult = {
  content: string;
  threadId: string | null;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningOutputTokens?: number;
  } | null;
};

@Injectable()
export class CodexExecutorService {
  private readonly logger = new Logger(CodexExecutorService.name);
  private readonly codexClientPromises = new Map<string, Promise<any | null>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly businessAuthorizationService: BusinessAuthorizationService,
  ) {}

  getExecutionCapabilities() {
    const defaultConfig = this.resolveExecutionConfig();
    const providerCandidates = [
      this.buildProviderCapability('default', 'default', 'server-default'),
      this.buildProviderCapability(
        'codex_executor',
        'codex_executor',
        'codex-executor',
      ),
      this.buildProviderCapability('openai', 'openai', 'openai'),
      this.buildProviderCapability(
        'miaoshe_chat',
        'miaoshe_chat',
        'miaoshe-chat',
      ),
    ];

    const availableProviders = providerCandidates.filter(
      (provider, index, items) =>
        provider.enabled &&
        items.findIndex(
          (item) => item.requestValue === provider.requestValue,
        ) === index,
    );
    const availableModels = this.buildAvailableModelCapabilities(
      availableProviders,
      defaultConfig,
    );

    return {
      enabled: this.isEnabled(defaultConfig),
      supportsPerRunOverride: true,
      defaultProvider: defaultConfig.provider,
      defaultModel: defaultConfig.model || null,
      defaultBaseUrl: defaultConfig.baseUrl || null,
      availableProviders,
      availableModels,
    };
  }

  resolveGatewayExecutionConfig(input?: {
    modelProvider?: string | null;
    modelName?: string | null;
  }) {
    return this.resolveExecutionConfig(input);
  }

  private async resolveExecutionConfigForUser(input?: {
    userId?: string | null;
    modelProvider?: string | null;
    modelName?: string | null;
  }) {
    const config = this.resolveExecutionConfig(input);
    const userId = input?.userId?.trim();
    if (!userId) {
      return config;
    }

    if (this.isOfficialCodexProvider(config.provider)) {
      const providerKey = await this.getOfficialProviderKeyForUser(
        userId,
        config.provider,
      )
        .catch((error) => {
          this.logger.warn(
            `读取官方模型授权码失败，将使用系统 key：${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
          return null;
        });

      if (!providerKey?.key) {
        return config;
      }

      this.logger.log(
        `IDE 官方模型调用使用用户授权码：user=${userId} provider=${providerKey.provider} key=${providerKey.keyPrefix}`,
      );

      return {
        ...config,
        apiKey: providerKey.key,
      };
    }

    let providerKey = await this.businessAuthorizationService
      .getProviderKeyForModel(userId, config.provider || 'vectorengine')
      .catch((error) => {
        this.logger.warn(
          `读取用户模型授权码失败，将回退系统 key：${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        return null;
      });

    if (!providerKey?.key) {
      providerKey =
        await this.businessAuthorizationService.ensureProviderKeyForUser({
          userId,
          provider: config.provider || 'vectorengine',
        });
    }

    this.logger.log(
      `IDE 模型调用使用用户授权码：user=${userId} provider=${providerKey.provider} key=${providerKey.keyPrefix}`,
    );

    return {
      ...config,
      apiKey: providerKey.key,
    };
  }

  getGatewayRequestTimeoutMs() {
    const raw = (
      this.configService.get<string>('CODEX_EXECUTOR_TIMEOUT_MS') ||
      this.configService.get<string>('OPENAI_TIMEOUT_MS') ||
      ''
    ).trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 180_000;
  }

  getGatewayEmbeddingModel(requestedModel?: string | null) {
    const explicit = String(requestedModel || '').trim();
    if (explicit) {
      return explicit;
    }

    return (
      this.configService.get<string>('CODEX_EXECUTOR_EMBEDDING_MODEL') ||
      this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ||
      'text-embedding-3-small'
    ).trim();
  }

  async planMediaPublish(
    input: MediaPublishCodexInput,
  ): Promise<MediaPublishCodexResult | null> {
    const executionConfig = this.resolveExecutionConfig();
    if (!this.isEnabled(executionConfig)) {
      return null;
    }

    const client = await this.getClient(executionConfig);
    if (!client) {
      return null;
    }

    const thread = client.startThread({
      model: executionConfig.model,
      approvalPolicy: 'never',
      sandboxMode: 'read-only',
      networkAccessEnabled: false,
      skipGitRepoCheck: true,
      workingDirectory: this.getWorkingDirectory(),
    });

    const prompt = this.buildMediaPublishPrompt(input);
    const turn = await thread.run(prompt, {
      outputSchema: this.getMediaPublishSchema(),
    });

    return {
      plan: this.parseMediaPublishPlan(turn.finalResponse),
      threadId: thread.id || null,
      usage: turn.usage
        ? {
            inputTokens: turn.usage.input_tokens,
            outputTokens: turn.usage.output_tokens,
            reasoningOutputTokens: turn.usage.reasoning_output_tokens,
          }
        : null,
    };
  }

  async routeIdeConversation(
    input: IdeIntentRouteInput,
  ): Promise<IdeIntentRouteResult> {
    const executionConfig = await this.resolveExecutionConfigForUser({
      userId: input.userId,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
    });
    const client = await this.getClient(executionConfig);
    if (!this.isEnabled(executionConfig) || !client) {
      throw new Error(
        'IDE Copilot 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const thread = client.startThread({
      model: executionConfig.model,
      approvalPolicy: 'never',
      sandboxMode: 'read-only',
      networkAccessEnabled: false,
      skipGitRepoCheck: true,
      workingDirectory: this.getWorkingDirectory(),
    });

    const turn = await thread.run(this.buildIdeIntentRoutingPrompt(input), {
      outputSchema: this.getIdeIntentRouteSchema(),
    });

    return this.parseIdeIntentRoute(turn.finalResponse);
  }

  async runMiaosheConversation(
    input: MiaosheConversationInput,
  ): Promise<MiaosheConversationResult> {
    const executionConfig = this.resolveExecutionConfig();
    const client = await this.getClient(executionConfig);
    if (!this.isEnabled(executionConfig) || !client) {
      throw new Error(
        'miaoshechat 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const thread = this.createThread(client, executionConfig, input.threadId);

    const turn = await thread.run(this.buildMiaosheConversationPrompt(input));
    const content = String(turn?.finalResponse || '').trim();
    if (!content) {
      throw new Error('miaoshechat 没有返回可用内容。');
    }

    return {
      content,
      threadId: thread.id || null,
      usage: turn.usage
        ? {
            inputTokens: turn.usage.input_tokens,
            outputTokens: turn.usage.output_tokens,
            reasoningOutputTokens: turn.usage.reasoning_output_tokens,
          }
        : null,
    };
  }

  async *runMiaosheConversationStream(
    input: MiaosheConversationInput,
  ): AsyncGenerator<MiaosheConversationStreamEvent> {
    const executionConfig = this.resolveExecutionConfig();
    const client = await this.getClient(executionConfig);
    if (!this.isEnabled(executionConfig) || !client) {
      throw new Error(
        'miaoshechat 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const thread = this.createThread(client, executionConfig, input.threadId);
    const streamedTurn = await thread.runStreamed(
      this.buildMiaosheConversationPrompt(input),
    );
    const agentMessageCache = new Map<string, string>();
    let finalContent = '';
    let usage: MiaosheConversationResult['usage'] = null;
    let lastRecoverableError: string | null = null;

    yield {
      type: 'status',
      phase: 'thinking',
      label: 'miaoshechat 正在推理',
      detail:
        input.mode === 'agent'
          ? '正在规划任务执行路径...'
          : '正在整理上下文并生成回复...',
      threadId: thread.id,
    };

    for await (const event of streamedTurn.events) {
      if (event.type === 'turn.completed') {
        usage = {
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
          reasoningOutputTokens: event.usage.reasoning_output_tokens,
        };
        continue;
      }

      if (event.type === 'turn.failed') {
        throw new Error(event.error?.message || 'miaoshechat 运行失败。');
      }

      if (event.type === 'error') {
        lastRecoverableError = event.message || 'miaoshechat 流式响应中断。';
        this.logger.warn(`miaoshechat stream warning: ${lastRecoverableError}`);
        continue;
      }

      if (
        (event.type === 'item.updated' || event.type === 'item.completed') &&
        event.item.type === 'agent_message'
      ) {
        const previousText = agentMessageCache.get(event.item.id) || '';
        const nextText = String(event.item.text || '');
        if (nextText.length > previousText.length) {
          const delta = nextText.slice(previousText.length);
          agentMessageCache.set(event.item.id, nextText);
          finalContent = nextText;
          yield {
            type: 'text_delta',
            delta,
            content: nextText,
            threadId: thread.id,
          };
        }
      }
    }

    const content = finalContent.trim();
    if (!content) {
      throw new Error(lastRecoverableError || 'miaoshechat 没有返回可用内容。');
    }

    yield {
      type: 'status',
      phase: 'completed',
      label: 'miaoshechat 已完成',
      detail: '回复已经返回。',
      threadId: thread.id,
    };

    yield {
      type: 'done',
      content,
      threadId: thread.id,
      usage,
    };
  }

  async summarizeIdeConversationTitle(
    input: IdeConversationTitleInput,
  ): Promise<string> {
    const executionConfig = await this.resolveExecutionConfigForUser({
      userId: input.userId,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
    });
    const client = await this.getClient(executionConfig);
    if (!this.isEnabled(executionConfig) || !client) {
      throw new Error(
        'IDE Copilot 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const history = input.history
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content || '').trim(),
      }))
      .filter((item) => item.content);

    if (history.length === 0) {
      throw new Error('缺少可用于生成标题的对话内容。');
    }

    const prompt = [
      '你是 Beacon IDE Copilot 的任务标题生成助手。',
      '请根据下面这段对话生成一个简短、自然、准确的中文任务标题。',
      '要求：',
      '1. 聚焦当前任务目标，忽略寒暄。',
      '2. 长度控制在 6 到 16 个汉字或等价短语。',
      '3. 不要输出引号、句号、冒号、编号、emoji。',
      '4. 不要输出“新任务”“新对话”“未命名”等空泛标题。',
      '5. 只返回标题本身，不要解释。',
      input.workspaceContext?.trim()
        ? `工作区：${input.workspaceContext.trim()}`
        : '',
      '',
      '对话：',
      ...history.map(
        (item) =>
          `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`,
      ),
    ]
      .filter(Boolean)
      .join('\n');

    const thread = client.startThread({
      model: executionConfig.model,
      approvalPolicy: 'never',
      sandboxMode: 'read-only',
      networkAccessEnabled: false,
      skipGitRepoCheck: true,
      workingDirectory: this.getWorkingDirectory(),
    });

    const turn = await thread.run(prompt);
    const rawTitle = String(turn?.finalResponse || '').trim();
    const cleaned = rawTitle
      .replace(/```[\s\S]*?```/g, ' ')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.replace(/^(标题|会话标题|任务标题|title)\s*[:：-]\s*/i, '')
      .replace(/[""'`]/g, '')
      .replace(/[。！？：；、]+$/g, '')
      .trim();

    if (
      cleaned &&
      cleaned !== '新任务' &&
      cleaned !== '新对话' &&
      cleaned !== '未命名'
    ) {
      return cleaned.slice(0, 24);
    }

    const fallback =
      history.find((item) => item.role === 'user')?.content ||
      history[history.length - 1]?.content ||
      '新任务';

    return fallback.replace(/\s+/g, ' ').slice(0, 24);
  }

  async summarizeIdeTaskMemory(
    input: IdeTaskMemorySummaryInput,
  ): Promise<string> {
    const executionConfig = await this.resolveExecutionConfigForUser({
      userId: input.userId,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
    });
    if (!this.isEnabled(executionConfig)) {
      throw new Error(
        'IDE Copilot 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const prompt = this.buildIdeTaskMemoryPrompt(input);
    const protocol = this.resolveExecutionProtocol(input.modelProvider);
    if (protocol === 'openai_chat_completions') {
      const response = await fetch(
        `${executionConfig.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: `Bearer ${executionConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: executionConfig.model,
            stream: false,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          this.extractOpenAiCompatibleErrorMessage(detail) ||
            '单任务记忆压缩失败。',
        );
      }

      const payload = await response.json().catch(() => null);
      const content = this.extractOpenAiChatCompletionContent(payload).trim();
      if (!content) {
        throw new Error('单任务记忆压缩没有返回可用内容。');
      }
      return content;
    }

    const client = await this.getClient(executionConfig);
    if (!client) {
      throw new Error('IDE Copilot 当前不可用，请先检查 CODEX SDK 配置。');
    }

    const thread = client.startThread({
      model: executionConfig.model,
      approvalPolicy: 'never',
      sandboxMode: 'read-only',
      networkAccessEnabled: false,
      skipGitRepoCheck: true,
      workingDirectory: this.getWorkingDirectory(),
    });
    const turn = await thread.run(prompt);
    const summary = String(turn?.finalResponse || '').trim();
    if (!summary) {
      throw new Error('单任务记忆压缩没有返回可用内容。');
    }

    return summary;
  }

  async generateIdePlanWorkflow(
    input: IdePlanWorkflowInput,
  ): Promise<IdePlanWorkflowResult> {
    const executionConfig = await this.resolveExecutionConfigForUser({
      userId: input.userId,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
    });
    const client = await this.getClient(executionConfig);
    if (!this.isEnabled(executionConfig) || !client) {
      throw new Error(
        'IDE Copilot 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const thread = client.startThread({
      model: executionConfig.model,
      approvalPolicy: 'never',
      sandboxMode: 'read-only',
      networkAccessEnabled: false,
      skipGitRepoCheck: true,
      workingDirectory: this.getWorkingDirectory(),
    });

    const turn = await thread.run(this.buildIdePlanWorkflowPrompt(input), {
      outputSchema: this.getIdePlanWorkflowSchema(),
    });
    const parsed = this.parseIdePlanWorkflow(turn.finalResponse);

    return {
      ...parsed,
      usage: turn.usage
        ? {
            inputTokens: turn.usage.input_tokens,
            outputTokens: turn.usage.output_tokens,
            reasoningOutputTokens: turn.usage.reasoning_output_tokens,
          }
        : null,
    };
  }

  async *runIdeConversationStream(
    input: IdeConversationInput,
  ): AsyncGenerator<IdeConversationStreamEvent> {
    const executionConfig = await this.resolveExecutionConfigForUser({
      userId: input.userId,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
    });
    const protocol = this.resolveExecutionProtocol(input.modelProvider);
    if (protocol === 'openai_chat_completions') {
      yield* this.runIdeConversationOpenAiChatCompletionsStream(
        input,
        executionConfig,
      );
      return;
    }
    const client = await this.getClient(executionConfig);
    if (!this.isEnabled(executionConfig) || !client) {
      throw new Error(
        'IDE Copilot 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const thread = this.createThread(client, executionConfig, input.threadId);
    const streamedTurn = await thread.runStreamed(
      this.buildIdeConversationPrompt(input),
      {
        signal: input.signal,
      },
    );
    const agentMessageCache = new Map<string, string>();
    let finalContent = '';
    let usage: MiaosheConversationResult['usage'] = null;
    let lastRecoverableError: string | null = null;

    yield {
      type: 'status',
      phase: 'thinking',
      label: 'IDE Copilot 正在推理',
      detail: `正在处理 ${input.sceneType} 场景...`,
      threadId: thread.id,
    };

    for await (const event of streamedTurn.events) {
      if (event.type === 'turn.completed') {
        usage = {
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
          reasoningOutputTokens: event.usage.reasoning_output_tokens,
        };
        continue;
      }

      if (event.type === 'turn.failed') {
        throw new Error(event.error?.message || 'IDE Copilot 运行失败。');
      }

      if (event.type === 'error') {
        lastRecoverableError = event.message || 'IDE Copilot 流式响应中断。';
        this.logger.warn(`IDE Copilot stream warning: ${lastRecoverableError}`);
        continue;
      }

      if (
        (event.type === 'item.updated' || event.type === 'item.completed') &&
        event.item.type === 'agent_message'
      ) {
        const previousText = agentMessageCache.get(event.item.id) || '';
        const nextText = String(event.item.text || '');
        if (nextText.length > previousText.length) {
          const delta = nextText.slice(previousText.length);
          agentMessageCache.set(event.item.id, nextText);
          finalContent = nextText;
          yield {
            type: 'text_delta',
            delta,
            content: nextText,
            threadId: thread.id,
          };
        }
      }
    }

    const content = finalContent.trim();
    if (!content) {
      throw new Error(lastRecoverableError || 'IDE Copilot 没有返回可用内容。');
    }

    yield {
      type: 'status',
      phase: 'completed',
      label: 'IDE Copilot 已完成',
      detail: '本轮回复已经生成。',
      threadId: thread.id,
    };

    yield {
      type: 'done',
      content,
      threadId: thread.id,
      usage,
    };
  }

  private async *runIdeConversationOpenAiChatCompletionsStream(
    input: IdeConversationInput,
    executionConfig: CodexExecutionConfig,
  ): AsyncGenerator<IdeConversationStreamEvent> {
    if (!this.isEnabled(executionConfig)) {
      throw new Error(
        'IDE Copilot 当前不可用，请先检查 CODEX / OPENAI 相关配置。',
      );
    }

    const threadId = String(input.threadId || '').trim() || null;
    const prompt = this.buildIdeConversationPrompt(input);
    const response = await fetch(
      `${executionConfig.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream, application/json',
          authorization: `Bearer ${executionConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: executionConfig.model,
          stream: true,
          stream_options: {
            include_usage: true,
          },
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal: input.signal,
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        this.extractOpenAiCompatibleErrorMessage(detail) ||
          'IDE Copilot 运行失败。',
      );
    }

    if (!response.body) {
      throw new Error('IDE Copilot 流式响应为空。');
    }

    yield {
      type: 'status',
      phase: 'thinking',
      label: 'IDE Copilot 正在推理',
      detail: `正在处理 ${input.sceneType} 场景...`,
      threadId,
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let finalContent = '';
    let usage: MiaosheConversationResult['usage'] = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.length) {
        continue;
      }

      sseBuffer += decoder.decode(value, { stream: true });
      let boundaryIndex = sseBuffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const rawEvent = sseBuffer.slice(0, boundaryIndex);
        sseBuffer = sseBuffer.slice(boundaryIndex + 2);
        boundaryIndex = sseBuffer.indexOf('\n\n');

        const data = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trim())
          .join('\n');

        if (!data || data === '[DONE]') {
          continue;
        }

        const payload = this.safeJsonParse(data);
        if (!payload) {
          continue;
        }

        const delta = this.extractOpenAiChatCompletionsDelta(payload);
        if (delta) {
          finalContent += delta;
          yield {
            type: 'text_delta',
            delta,
            content: finalContent,
            threadId,
          };
        }

        const providerUsage = payload?.usage;
        if (providerUsage && typeof providerUsage === 'object') {
          usage = {
            inputTokens:
              typeof providerUsage.prompt_tokens === 'number'
                ? providerUsage.prompt_tokens
                : undefined,
            outputTokens:
              typeof providerUsage.completion_tokens === 'number'
                ? providerUsage.completion_tokens
                : undefined,
            reasoningOutputTokens:
              typeof providerUsage.reasoning_tokens === 'number'
                ? providerUsage.reasoning_tokens
                : undefined,
          };
        }
      }
    }

    const content = finalContent.trim();
    if (!content) {
      throw new Error('IDE Copilot 没有返回可用内容。');
    }

    yield {
      type: 'status',
      phase: 'completed',
      label: 'IDE Copilot 已完成',
      detail: '本轮回复已经生成。',
      threadId,
    };

    yield {
      type: 'done',
      content,
      threadId,
      usage,
    };
  }

  private async getClient(config: CodexExecutionConfig) {
    const cacheKey = this.getClientCacheKey(config);
    if (!this.codexClientPromises.has(cacheKey)) {
      this.codexClientPromises.set(cacheKey, this.createClient(config));
    }
    return this.codexClientPromises.get(cacheKey) ?? null;
  }

  private async createClient(config: CodexExecutionConfig) {
    try {
      const module = await import('@openai/codex-sdk');
      const codexPathOverride =
        this.configService.get<string>('CODEX_EXECUTOR_PATH')?.trim() ||
        undefined;

      return new module.Codex({
        apiKey: config.apiKey || undefined,
        baseUrl: config.baseUrl || undefined,
        codexPathOverride,
        env: {
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          OPENAI_API_KEY: config.apiKey || process.env.OPENAI_API_KEY || '',
          CODEX_API_KEY: config.apiKey || process.env.CODEX_API_KEY || '',
          OPENAI_BASE_URL: config.baseUrl || process.env.OPENAI_BASE_URL || '',
          OPENAI_MODEL: config.model || process.env.OPENAI_MODEL || '',
        },
      });
    } catch (error) {
      this.logger.warn(
        `Codex SDK unavailable, fallback to heuristic workflow: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  private isEnabled(
    config: CodexExecutionConfig = this.resolveExecutionConfig(),
  ) {
    const toggle = this.configService.get<string>('CODEX_EXECUTOR_ENABLED');
    if (toggle?.trim().toLowerCase() === 'false') {
      return false;
    }
    return Boolean(
      config.apiKey || process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY,
    );
  }

  private getApiKey() {
    return (
      this.configService.get<string>('CODEX_EXECUTOR_API_KEY') ||
      this.configService.get<string>('OPENAI_API_KEY') ||
      this.configService.get<string>('CODEX_API_KEY') ||
      this.configService.get<string>('MIAOSHE_CHAT_API_KEY') ||
      ''
    ).trim();
  }

  private getBaseUrl() {
    return (
      this.configService.get<string>('CODEX_EXECUTOR_BASE_URL') ||
      this.configService.get<string>('OPENAI_BASE_URL') ||
      this.configService.get<string>('MIAOSHE_CHAT_BASE_URL') ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');
  }

  private getModel() {
    const value = (
      this.configService.get<string>('CODEX_EXECUTOR_MODEL') || ''
    ).trim();
    return value || DEFAULT_CODEX_EXECUTION_MODEL;
  }

  private resolveExecutionProtocol(
    provider?: string | null,
  ): CodexExecutionProtocol {
    const normalizedProvider = this.normalizeProvider(provider);
    const providerEnvPrefix = this.toEnvPrefix(normalizedProvider);
    const raw =
      (
        (providerEnvPrefix
          ? this.configService.get<string>(`${providerEnvPrefix}_PROTOCOL`)
          : '') ||
        this.configService.get<string>('CODEX_EXECUTOR_PROTOCOL') ||
        this.configService.get<string>('OPENAI_PROTOCOL') ||
        this.configService.get<string>('MIAOSHE_CHAT_PROTOCOL') ||
        ''
      )
        .trim()
        .toLowerCase() || 'openai_responses';

    if (
      raw === 'openai' ||
      raw === 'chat_completions' ||
      raw === 'openai_chat_completions'
    ) {
      return 'openai_chat_completions';
    }

    return 'openai_responses';
  }

  private getWorkingDirectory() {
    const value = (
      this.configService.get<string>('CODEX_EXECUTOR_WORKDIR') || ''
    ).trim();
    return value || process.cwd();
  }

  private createThread(
    client: any,
    config: CodexExecutionConfig,
    threadId?: string,
  ) {
    const options = {
      model: config.model,
      approvalPolicy: 'never' as const,
      sandboxMode: 'read-only' as const,
      networkAccessEnabled: false,
      skipGitRepoCheck: true,
      workingDirectory: this.getWorkingDirectory(),
    };
    const normalizedThreadId = String(threadId || '').trim();
    if (!normalizedThreadId || normalizedThreadId === 'default') {
      return client.startThread(options);
    }
    return client.resumeThread(normalizedThreadId, options);
  }

  private resolveExecutionConfig(input?: {
    modelProvider?: string | null;
    modelName?: string | null;
  }) {
    const provider = this.normalizeProvider(input?.modelProvider);
    const officialConfig = this.getOfficialCodexProviderConfig(provider);

    if (officialConfig) {
      const providerApiKey = this.readFirstProviderEnv(
        officialConfig.keyEnvPrefixes,
        'API_KEY',
      );
      const providerBaseUrl = this.readFirstProviderEnv(
        officialConfig.baseUrlEnvPrefixes,
        'BASE_URL',
      );
      const providerModel = this.readFirstProviderEnv(
        officialConfig.modelEnvPrefixes,
        'MODEL',
      );

      return {
        provider,
        apiKey: providerApiKey.trim(),
        baseUrl: this.normalizeOfficialProviderBaseUrl(
          provider,
          providerBaseUrl || officialConfig.defaultBaseUrl,
        ),
        model:
          (
            input?.modelName?.trim() ||
            providerModel.trim() ||
            officialConfig.defaultModel ||
            ''
          ).trim() || officialConfig.defaultModel,
      } satisfies CodexExecutionConfig;
    }

    const providerEnvPrefix = this.toEnvPrefix(provider);
    const providerApiKey = providerEnvPrefix
      ? this.configService.get<string>(`${providerEnvPrefix}_API_KEY`) || ''
      : '';
    const providerBaseUrl = providerEnvPrefix
      ? this.configService.get<string>(`${providerEnvPrefix}_BASE_URL`) || ''
      : '';
    const providerModel = providerEnvPrefix
      ? this.configService.get<string>(`${providerEnvPrefix}_MODEL`) || ''
      : '';

    return {
      provider,
      apiKey: (providerApiKey || this.getApiKey()).trim(),
      baseUrl: this.normalizeBaseUrl(providerBaseUrl || this.getBaseUrl()),
      model:
        (
          input?.modelName?.trim() ||
          providerModel.trim() ||
          this.getModel() ||
          ''
        ).trim() || DEFAULT_CODEX_EXECUTION_MODEL,
    } satisfies CodexExecutionConfig;
  }

  private buildProviderCapability(
    id: string,
    requestValue: string,
    label: string,
  ): CodexProviderCapability {
    const config =
      id === 'default'
        ? this.resolveExecutionConfig()
        : this.resolveExecutionConfig({
            modelProvider: requestValue,
          });
    const envPrefix = id === 'default' ? '' : this.toEnvPrefix(requestValue);
    const configured =
      id === 'default'
        ? this.isEnabled(config)
        : this.hasProviderSpecificConfig(envPrefix);

    return {
      id,
      requestValue,
      label,
      configured,
      enabled:
        id === 'default'
          ? this.isEnabled(config)
          : configured && this.isEnabled(config),
      baseUrl: config.baseUrl || null,
      defaultModel: config.model || null,
    };
  }

  private buildAvailableModelCapabilities(
    availableProviders: CodexProviderCapability[],
    defaultConfig: CodexExecutionConfig,
  ): CodexModelCapability[] {
    const providersForCatalog = availableProviders.some(
      (provider) => provider.requestValue !== 'default',
    )
      ? availableProviders.filter(
          (provider) => provider.requestValue !== 'default',
        )
      : availableProviders;
    const catalogProvider =
      providersForCatalog.find(
        (provider) => provider.requestValue === defaultConfig.provider,
      ) ??
      providersForCatalog[0] ??
      null;

    if (!catalogProvider) {
      return [];
    }

    const models = CODEX_MODEL_CATALOG.map((entry) =>
      this.buildModelCapability(entry, {
        provider: catalogProvider.requestValue,
        providerLabel: catalogProvider.label,
        baseUrl: catalogProvider.baseUrl,
      }),
    );

    const defaultModelName = defaultConfig.model?.trim();
    if (
      defaultModelName &&
      !models.some((item) => item.modelName === defaultModelName)
    ) {
      models.unshift(
        this.buildModelCapability(
          {
            modelName: defaultModelName,
            label: defaultModelName,
            family: 'custom',
            modality: 'text',
            supportedEndpoints: [
              {
                method: 'POST',
                path: '/openai-response/v1/responses',
                apiStyle: 'openai-responses',
              },
            ],
          },
          {
            provider: catalogProvider.requestValue,
            providerLabel: catalogProvider.label,
            baseUrl: catalogProvider.baseUrl,
          },
        ),
      );
    }

    return models;
  }

  private buildModelCapability(
    entry: {
      modelName: string;
      label: string;
      family: string;
      modality: 'text' | 'image';
      supportedEndpoints: CodexModelEndpointCapability[];
    },
    providerInfo: {
      provider: string;
      providerLabel: string;
      baseUrl: string | null;
    },
  ): CodexModelCapability {
    return {
      id: `${providerInfo.provider}-${entry.modelName}`,
      modelName: entry.modelName,
      label: entry.label,
      family: entry.family,
      modality: entry.modality,
      provider: providerInfo.provider,
      providerLabel: providerInfo.providerLabel,
      baseUrl: providerInfo.baseUrl,
      enabled: true,
      recommendedTransport: entry.supportedEndpoints.some(
        (endpoint) => endpoint.apiStyle === 'openai-responses',
      )
        ? 'responses'
        : 'chat_completions',
      supportedEndpoints: entry.supportedEndpoints,
    };
  }

  private hasProviderSpecificConfig(envPrefix: string) {
    if (!envPrefix) {
      return false;
    }

    return [
      `${envPrefix}_API_KEY`,
      `${envPrefix}_BASE_URL`,
      `${envPrefix}_MODEL`,
    ].some((key) => Boolean(this.configService.get<string>(key)?.trim()));
  }

  private getOfficialCodexProviderConfig(provider: string) {
    return OFFICIAL_CODEX_PROVIDER_CONFIGS[provider] ?? null;
  }

  private async getOfficialProviderKeyForUser(userId: string, provider: string) {
    const candidates = this.getOfficialProviderKeyCandidates(provider);
    for (const candidate of candidates) {
      const providerKey = await this.businessAuthorizationService.getProviderKey(
        userId,
        candidate,
      );
      if (providerKey?.key) {
        return providerKey;
      }
    }
    return null;
  }

  private getOfficialProviderKeyCandidates(provider: string) {
    const normalized = this.normalizeProvider(provider);
    const fallbackMap: Record<string, string[]> = {
      qwen_token_plan: ['qwen-token-plan', 'qwen', 'tongyi', 'dashscope'],
      token_plan: ['token-plan', 'qwen', 'tongyi', 'dashscope'],
      qwen: ['tongyi', 'dashscope'],
      tongyi: ['qwen', 'dashscope'],
      dashscope: ['qwen', 'tongyi'],
    };
    return [normalized, normalized.replace(/_/g, '-'), ...(fallbackMap[normalized] || [])].filter(
      (item, index, items) => item && items.indexOf(item) === index,
    );
  }

  isOfficialCodexProvider(provider?: string | null) {
    return Boolean(
      this.getOfficialCodexProviderConfig(this.normalizeProvider(provider)),
    );
  }

  private readFirstProviderEnv(prefixes: string[], suffix: string) {
    for (const prefix of prefixes) {
      const value = this.configService.get<string>(`${prefix}_${suffix}`);
      if (value?.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private normalizeOfficialProviderBaseUrl(provider: string, baseUrl: string) {
    const normalized = this.normalizeBaseUrl(baseUrl);
    try {
      const url = new URL(normalized);
      const host = url.host.toLowerCase();
      const pathname = url.pathname.replace(/\/+$/, '');

      if (
        (provider === 'kimi' || provider === 'moonshot') &&
        (host === 'api.moonshot.cn' || host === 'api.moonshot.ai') &&
        (!pathname || pathname === '')
      ) {
        url.pathname = '/v1';
        return this.normalizeBaseUrl(url.toString());
      }

      if (
        (provider === 'hunyuan' || provider === 'yuanbao') &&
        host === 'api.hunyuan.cloud.tencent.com' &&
        (!pathname || pathname === '')
      ) {
        url.pathname = '/v1';
        return this.normalizeBaseUrl(url.toString());
      }

      if (
        (provider === 'glm' || provider === 'zhipu') &&
        host === 'open.bigmodel.cn' &&
        (!pathname || pathname === '')
      ) {
        url.pathname = '/api/paas/v4';
        return this.normalizeBaseUrl(url.toString());
      }

      if (
        (provider === 'qwen' || provider === 'tongyi') &&
        host === 'dashscope.aliyuncs.com' &&
        (!pathname || pathname === '' || pathname === '/compatible-mode/v1')
      ) {
        url.pathname = '/apps/anthropic';
        return this.normalizeBaseUrl(url.toString());
      }

      if (
        (provider === 'qwen_token_plan' || provider === 'token_plan') &&
        host === 'token-plan.cn-beijing.maas.aliyuncs.com' &&
        (!pathname || pathname === '')
      ) {
        url.pathname = '/apps/anthropic';
        return this.normalizeBaseUrl(url.toString());
      }

      return normalized;
    } catch {
      return normalized;
    }
  }

  private getClientCacheKey(config: CodexExecutionConfig) {
    return [
      config.provider,
      config.baseUrl,
      config.model || '',
      config.apiKey,
    ].join('::');
  }

  private normalizeProvider(provider?: string | null) {
    const value = String(provider || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return value || 'default';
  }

  private toEnvPrefix(provider: string) {
    if (!provider || provider === 'default') {
      return '';
    }
    return provider.toUpperCase();
  }

  private normalizeBaseUrl(baseUrl: string) {
    return (baseUrl || '').trim().replace(/\/+$/, '');
  }

  private extractOpenAiChatCompletionsDelta(payload: any) {
    return (
      (typeof payload?.choices?.[0]?.delta?.content === 'string'
        ? payload.choices[0].delta.content
        : Array.isArray(payload?.choices?.[0]?.delta?.content)
          ? payload.choices[0].delta.content
              .map((item: any) =>
                typeof item?.text === 'string' ? item.text : '',
              )
              .join('')
          : typeof payload?.choices?.[0]?.text === 'string'
            ? payload.choices[0].text
            : '') || ''
    );
  }

  private extractOpenAiChatCompletionContent(payload: any) {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((item: any) =>
          typeof item?.text === 'string'
            ? item.text
            : typeof item?.content === 'string'
              ? item.content
              : '',
        )
        .join('');
    }
    return typeof payload?.output_text === 'string' ? payload.output_text : '';
  }

  private extractOpenAiCompatibleErrorMessage(detail: string) {
    const payload = this.safeJsonParse(detail);
    const errorMessage =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : typeof payload?.message === 'string'
          ? payload.message
          : '';
    return errorMessage || detail.trim();
  }

  private safeJsonParse(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private buildMediaPublishPrompt(input: MediaPublishCodexInput) {
    const historyText = input.history.length
      ? input.history
          .map(
            (item) =>
              `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`,
          )
          .join('\n')
      : '无历史对话';
    const supportedPlatforms = input.supportedPlatforms
      .map((item) => `${item.id}=${item.name}`)
      .join('、');

    return [
      '你是妙设AIO的内容工作流编排器。',
      '你的职责不是自由聊天，而是把当前消息规范化成结构化执行单。',
      '只有在用户明确表达“生成文章、起草文章、撰写文案、生成图片、做图、画一张、发布、同步、分发、发到某平台、检查平台登录、查看平台数据、查看创作者后台数据、分析作品数据、安装扩展、连接桥接”这类内容生产或媒体发布相关诉求时，shouldEnterWorkflow 才能为 true。',
      '如果用户只是在讨论想法、询问策略、做内容规划，没有明确进入媒体发布动作，就返回 shouldEnterWorkflow=false。',
      'intent 选择规则：生成文章、起草文章、撰写文案但未要求发布用 article_draft；生成图片、封面图、海报、插画、配图用 image_generate；生成视频需求用 video_storyboard 或 video_generate；修改图片/视频/素材用 media_edit；查看创作者后台数据、查看作品数据、分析播放/阅读/曝光/互动/粉丝数据用 platform_data；只检查平台、检测登录、查看登录状态用 status_check；协助登录、授权、账号接入用 login_help；安装扩展、连接桥接、排查扩展连通性用 integration_help；创建平台草稿或发布内容用 media_publish；其他闲聊才用 general_chat。',
      'platform_data 表示用户要看平台后台数据、账号表现、作品数据，不要误判成普通 chat。',
      'article_draft 需要根据用户要求和品牌上下文生成 articleTitle 与 articleMarkdown，targetPlatformIds 可以为空。',
      'image_generate 需要返回 assetType=image、imageCount、style、aspectRatio、prompt、negativePrompt；如果用户明确说生成几张，就把 imageCount 准确写出来；信息不够时 needsClarification=true，并把问题放到 clarificationQuestions；单次最多批量生成 6 张图片，数量不足默认 1 张，超过 6 张时 imageCount 也只能返回 6。',
      'video_storyboard / video_generate 需要返回 assetType=video、duration、videoModel、prompt；如果能拆镜头，也返回 storyboard。',
      '视频模型选择规则：文生视频优先 happyhorse-1.0-t2v；单张参考图生视频可在 happyhorse-1.0-i2v、wan2.6-i2v、wan2.6-i2v-flash 中选择；多参考图且强调主体/场景一致性时优先 happyhorse-1.0-r2v。',
      '如果用户还没指定视频模型，但明显在补需求阶段，可以把“要用哪个视频模型”放进 clarificationQuestions，给出明确选项和简短推荐；如果用户明确说“你来定”或“不用选模型”，videoModel 可以留空，由系统兜底选择。',
      '在视频语境里，参考图只是视频输入素材，不等于图片生成需求。除非用户明确说“先帮我生成一张图/参考图再做视频”，否则不要把视频任务判成 image_generate 或 media_edit。',
      'media_edit 需要说明要编辑的素材、目标效果和缺失信息，不能假设用户已经提供素材。',
      'media_publish 不能虚构标题、正文和目标平台；缺失就放到 missingFields 里。',
      '你还需要决定 toolSequence，用来表示应该由 Agent 调用哪些工具以及调用顺序。',
      '可用工具只有：ensure_bridge_connection、list_platforms、check_auth、refresh_platform_data、sync_article。',
      '工具规则：检查扩展/桥接状态先用 ensure_bridge_connection；同步已登录平台账号用 list_platforms；校验目标平台是否已登录用 check_auth；抓取创作者后台数据用 refresh_platform_data；向平台创建草稿/发布文章用 sync_article。',
      '如果 intent=media_publish，通常 toolSequence 应包含 ensure_bridge_connection -> list_platforms -> check_auth -> sync_article。',
      '如果 intent=platform_data，通常 toolSequence 应包含 ensure_bridge_connection -> list_platforms -> check_auth -> refresh_platform_data。',
      '如果 intent=status_check、login_help、integration_help，通常只需要 ensure_bridge_connection、list_platforms、check_auth 中的部分或全部。',
      '如果 intent=article_draft、image_generate、video_storyboard、video_generate、media_edit、general_chat，toolSequence 通常为空数组。',
      'targetPlatformIds 只能从给定的平台 id 里选择。',
      'articleMarkdown 只放正文正文，不要重复标题。',
      `支持的平台：${supportedPlatforms}`,
      `品牌名称：${input.context.brandName}`,
      `品牌行业：${input.context.brandIndustry}`,
      `品牌地区：${input.context.brandRegion}`,
      `品牌语言：${input.context.brandLanguage}`,
      `品牌简介：${input.context.brandDescription}`,
      `品牌域名：${input.context.domains.length ? input.context.domains.join('、') : '未配置'}`,
      input.context.workspaceContext
        ? `工作台上下文：\n${input.context.workspaceContext}`
        : '',
      `历史对话：\n${historyText}`,
      `当前用户消息：\n${input.message}`,
      '请直接输出符合 schema 的 JSON，不要输出额外说明。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildMiaosheConversationPrompt(input: MiaosheConversationInput) {
    const historyText = input.history.length
      ? input.history
          .map(
            (item) =>
              `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`,
          )
          .join('\n')
      : '无历史对话';
    const attachmentText =
      Array.isArray(input.uploadedAttachments) &&
      input.uploadedAttachments.length > 0
        ? input.uploadedAttachments
            .map((item, index) =>
              [
                `附件 ${index + 1}`,
                item.title ? `标题=${item.title}` : '',
                item.type ? `类型=${item.type}` : '',
                item.mimeType ? `MIME=${item.mimeType}` : '',
                item.url ? `URL=${item.url}` : '',
              ]
                .filter(Boolean)
                .join('，'),
            )
            .join('\n')
        : '无附件';

    const systemPrompt =
      input.mode === 'agent'
        ? [
            '你是妙设AIO中的 miaoshechat Agent。',
            '你需要像一个可靠的中文运营总控一样工作：直接、可执行、少空话、能推进。',
            '如果用户只是讨论策略、写作、规划、复盘，你就直接给出高质量回复。',
            '如果用户消息看起来像平台发布、登录检测、扩展连接、后台抓数等执行型任务，也要先把用户意图整理清楚，不要虚构执行结果。',
            '如果用户提供了标题、正文、平台、目标受众、风格等信息，就直接整理成清晰执行方案或成稿。',
            '输出使用中文，可用 Markdown，但不要输出 JSON，不要输出系统说明。',
          ].join('\n')
        : [
            '你是妙设AIO中的 miaoshechat。',
            '你是一个可靠、专业、节奏感强的中文营销与内容运营搭档。',
            '如果用户只是在聊天、策划、改稿、排期、复盘，你就直接给出高质量中文回复。',
            '如果用户消息涉及平台发布、扩展连接、创作者后台数据等执行动作，也先把用户目标和约束讲清楚，不要虚构执行结果。',
            '优先给出清晰建议、可直接使用的文案、提纲、发布策略、排期方案和下一步动作。',
            '输出使用中文，可用 Markdown，但不要输出 JSON，不要输出系统说明。',
          ].join('\n');

    return [
      systemPrompt,
      `品牌上下文：\n${input.brandContext}`,
      input.workspaceContext ? `工作台上下文：\n${input.workspaceContext}` : '',
      `历史对话：\n${historyText}`,
      `附件信息：\n${attachmentText}`,
      `当前用户消息：\n${input.message}`,
      '请直接输出给用户的最终回复。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildIdeConversationPrompt(input: IdeConversationInput) {
    const dialogueHistory = input.history.filter(
      (item) => item.role === 'user' || item.role === 'assistant',
    );
    const toolHistory = input.history.filter((item) => item.role === 'tool');
    const historyText = dialogueHistory.length
      ? dialogueHistory
          .map(
            (item) =>
              `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`,
          )
          .join('\n')
      : '无历史对话';
    const toolHistoryText = toolHistory.length
      ? toolHistory
          .map((item, index) => `工具结果 ${index + 1}：${item.content}`)
          .join('\n\n')
      : '无工具结果';
    const selectedFiles = input.selectedFilePaths.length
      ? input.selectedFilePaths.join('\n')
      : '当前没有选中文件';

    const capabilityInstructions =
      input.mode === 'plan'
        ? [
            '你正在生成执行前的计划，可以规划本地文件修改和终端验证，但不要声称已经执行；真正执行必须等用户确认计划后再通过工具完成。',
            '如果需要读取或修改本地工作区，应在后续执行阶段请求工具；只有工具结果证明后，才能说已经读取、修改、创建或验证。',
          ]
        : [
            '你可以通过桌面端本地工具桥请求读取、修改工作区文件或执行终端命令；不要声称无法操作本地文件。',
            '只有工具执行记录明确给出了文件内容、目录结构、diagnostics 或终端输出后，才能说自己已经读取、修改、创建或验证。',
            '如果当前轮没有真实工具结果，就先基于已有上下文判断下一步，并在需要时请求工具，不要虚构“已经执行成功”。',
          ];

    const planModeInstructions =
      input.mode === 'plan'
        ? [
            '当前处于计划模式。你的核心产物是可确认的 Markdown 执行计划，而不是泛泛的方案、建议或“接下来我会做”的说明。',
            '你必须像 agent 一样自主判断下一步：只有目标、范围或验收方式完全无法从上下文推断时，才先输出正文回复再提出问题；信息足够或可以合理假设时，直接输出 Markdown 执行计划。',
            '不要声称已经修改、创建、删除文件，除非工具结果里已经证明。不要开始执行实现，执行必须等用户确认计划。',
            '需要提问时，先输出一小段正文回复，然后使用“## 需要确认的问题”列出 1 到 3 个问题。',
            '问题格式必须是“问题 1：...”；如果适合选择题，在问题下方用“- 选项：标签 — 简短说明”列出 2 到 3 个选项；需要自由输入时不要列选项。',
            '问题不要写进正文段落里，正文和问题分开。不要输出 JSON。',
            '如果用户表示“跳过”“退出卡片”“由 AI 自主选择”“AI_AUTONOMOUS_DECISION”或“请你自主判断下一步”，不要终止任务，也不要重复原问题；你需要结合上下文自行选择合理答案并继续推理。',
            '如果用户说“开始执行”“可以执行”“继续”“按你的方案来”，但当前还没有已经确认的计划，你必须先输出以“# 执行计划”开头的 Markdown 计划，等待用户确认；不要直接说进入执行阶段，也不要再次问泛泛的问题。',
            '信息足够时，输出必须以“# 执行计划”开头，并至少包含二级标题：目标、范围、实施步骤、涉及文件、验证方式、风险与回滚。',
          ]
        : [];

    return [
      '你是桌面端 IDE Copilot。',
      '你是一个可靠、克制、结果导向的中文编程助手。',
      ...capabilityInstructions,
      '优先给出：问题定位、修复思路、可直接复制的代码片段、测试建议、风险提醒。',
      '输出使用中文，可用 Markdown，但不要输出 JSON，不要输出系统提示语。',
      ...planModeInstructions,
      `当前场景：${input.sceneType}`,
      `当前技能：${input.skillName}`,
      input.contextSummary ? `会话摘要：\n${input.contextSummary}` : '',
      input.workspaceContext ? `工作区上下文：\n${input.workspaceContext}` : '',
      `当前选中文件：\n${selectedFiles}`,
      `工具执行记录：\n${toolHistoryText}`,
      `历史对话：\n${historyText}`,
      `当前用户消息：\n${input.message}`,
      input.mode === 'plan'
        ? '请直接输出给用户看的正文、问题或执行计划；如果输出计划，第一行必须是“# 执行计划”。'
        : '请直接输出给用户的最终回复。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildIdePlanWorkflowPrompt(input: IdePlanWorkflowInput) {
    const historyText = input.history.length
      ? input.history
          .map((item) => {
            const role =
              item.role === 'assistant'
                ? '助手'
                : item.role === 'tool'
                  ? '工具结果'
                  : '用户';
            return `${role}：${item.content}`;
          })
          .join('\n\n')
      : '无历史对话';
    const answersText = input.answers.length
      ? input.answers
          .map((answer, index) => `${index + 1}. ${answer.content}`)
          .join('\n')
      : '暂无已记录回答';
    const selectedFiles = input.selectedFilePaths.length
      ? input.selectedFilePaths.join('\n')
      : '当前没有选中文件';

    return [
      '你是 Owlix IDE 的计划模式编排器。',
      '你的职责只有两个：在信息不足时提出必要问题，或者在信息足够时生成可执行的 Markdown 计划。',
      '禁止声称已经修改、创建、删除文件，禁止声称已经执行命令或完成实现。',
      '如果目标、范围、交互、技术约束、验收标准中仍有会显著影响实现方案的信息缺失，stage=clarifying。',
      'clarifying 时必须先用 replyMarkdown 输出一段给用户看的正文回复：说明你正在先澄清关键信息，语气自然简短；正文里不要列出问题。',
      'clarifying 时 questions 返回 1 到 3 个结构化问题；每个问题要简短、互不重复、用户容易回答。',
      'clarifying 时优先把问题设计为选择题：type=single_choice 或 multi_choice，并给出 2 到 3 个可选项；确实无法枚举时才用 type=text。',
      '每个问题都要提供 placeholder，方便前端输入框显示提示；planMarkdown 必须为空。',
      '如果用户回答“由 AI 自主选择”或答案标记为 AI_AUTONOMOUS_DECISION，必须结合当前任务上下文和最佳实践自行作出合理决定，不要重复追问同一个问题。',
      '信息足够时 stage=plan_ready，questions 必须为空，并生成完整 planMarkdown。',
      'plan_ready 时 replyMarkdown 留空或用一句简短说明，不要重复完整计划内容。',
      'planMarkdown 必须以“# 执行计划”开头，并至少包含：目标、范围、实施步骤、涉及文件、验证方式、风险与回滚。',
      '计划必须基于真实工作区上下文和工具结果；不知道的文件名要明确标记为待定位，不要虚构。',
      '不要在计划里要求用户再次确认；确认由 Owlix UI 单独处理。',
      input.contextSummary ? `会话摘要：\n${input.contextSummary}` : '',
      input.workspaceContext ? `工作区上下文：\n${input.workspaceContext}` : '',
      `当前选中文件：\n${selectedFiles}`,
      `已记录回答：\n${answersText}`,
      input.previousPlanMarkdown?.trim()
        ? `上一版计划：\n${input.previousPlanMarkdown.trim()}`
        : '',
      input.feedback?.trim()
        ? `用户对上一版计划的反馈：\n${input.feedback.trim()}`
        : '',
      `历史对话与工具结果：\n${historyText}`,
      `当前用户消息：\n${input.message}`,
      '请直接输出符合 schema 的 JSON，不要输出额外说明。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildIdeTaskMemoryPrompt(input: IdeTaskMemorySummaryInput) {
    return [
      '你是 Beacon IDE Copilot 的单任务记忆压缩器。',
      '目标：把同一个对话任务中较早的对话、工具结果和代码库线索压缩为后续模型可直接继承的任务记忆。',
      '重要规则：',
      '1. 这不是给用户看的最终回复，不要寒暄，不要说“我会”。',
      '2. 不要删除关键约束、用户偏好、已做决定、已定位文件、错误信息、命令结果、待办事项。',
      '3. 可丢弃重复寒暄、过时尝试、无关 UI 细枝末节，但保留会影响后续代码修改的事实。',
      '4. 如果已有任务记忆，要合并去重，不要简单追加。',
      '5. 输出中文 Markdown，控制在 1200 到 3000 字之间，使用以下固定结构：',
      '   - 当前目标',
      '   - 已确认事实与约束',
      '   - 关键代码/文件/接口线索',
      '   - 已完成动作与结果',
      '   - 后续待办与风险',
      input.previousSummary?.trim()
        ? `已有任务记忆：\n${input.previousSummary.trim()}`
        : '',
      `待压缩材料：\n${input.digest}`,
      '请只输出压缩后的任务记忆 Markdown。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildIdeIntentRoutingPrompt(input: IdeIntentRouteInput) {
    const historyText = input.history.length
      ? input.history
          .map(
            (item) =>
              `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`,
          )
          .join('\n')
      : '无历史对话';
    const selectedFiles = input.selectedFilePaths.length
      ? input.selectedFilePaths.join('\n')
      : '当前没有选中文件';
    const toolCatalog = input.availableTools.length
      ? input.availableTools
          .map(
            (tool) =>
              `- ${tool.name} | risk=${tool.riskLevel} | confirmation=${tool.requiresConfirmation ? 'required' : 'not_required'}`,
          )
          .join('\n')
      : '当前没有可用工具';

    return [
      '你是桌面端 IDE Copilot 的意图路由器。',
      '你的任务不是直接长篇回答，而是先判断这一条用户消息应该：1）直接回复，还是 2）先请求本地工具。',
      '正确原则：应该由 AI 先判断意图，再决定是否调用工具。',
      '如果用户问题是通用解释、方案比较、代码思路、概念问答，且不依赖当前工作区真实状态，请选择 respond。',
      '如果用户问题依赖当前项目结构、诊断报错、文件真实内容、符号引用、测试现状或其他本地上下文，请选择 request_tools。',
      '优先使用低风险只读工具；除非非常明确，否则不要在第一轮请求 fs.applyPatch 这类高风险工具。',
      '如果用户希望你直接处理整个项目、排查工作区问题、定位要修改的文件，优先先请求 workspace.getTree、fs.searchText、codebase.searchSymbols、codebase.searchSemantic、codebase.findReferences、codebase.getFileContext、codebase.getSymbolGraph、codebase.getIndexStats、diagnostics.getProblems、fs.readFile 等只读工具，再决定最终修改哪些文件。',
      '当没有明确给出单一文件时，不要假设只能改一个文件；你可以先浏览工作区，再自己决定读取哪些文件，必要时分多轮继续请求更多只读工具。',
      '如果 sceneType 或 skillName 属于 fix_error / refactor_symbol，并且用户目标是“直接修复、直接修改、直接完成变更”，那么在还没有足够上下文形成可执行修改前，不要过早选择 respond；应继续 request_tools 直到能够定位目标文件并给出补丁，或确认当前确实无需修改。',
      '如果 toolChoice=none，必须选择 respond，并且 requiredTools 为空数组。',
      '如果 toolChoice=required，并且存在合理工具可以帮助判断或执行，应优先选择 request_tools。',
      'sceneType 只能从以下集合中选择：code_assistant, codebase_qa, explain_error, fix_error, refactor_symbol, generate_tests, terminal_assistant。',
      'skillName 只能从以下集合中选择：intent_router, direct_answer, explain_error, fix_error, refactor_symbol, generate_tests, codebase_qa, terminal_assistant。',
      '如果 action=respond，responseMarkdown 必须直接填写给用户的最终回复，内容要自然、完整、可直接展示。',
      '如果 action=request_tools，responseMarkdown 置为空字符串。',
      'requiredTools 最多返回 3 个，并且 toolName 必须来自可用工具清单。',
      '如果请求 fs.applyPatch，inputJson.patch 必须是可直接应用的 unified diff 文本，使用标准 --- / +++ / @@ 格式，并且路径必须是工作区内相对路径。',
      'inputJson 只填本轮真正需要的参数，不要虚构不存在的路径。',
      `场景提示：${input.sceneType}`,
      `当前技能：${input.skillName}`,
      `工具策略：${input.toolChoice}`,
      input.contextSummary ? `会话摘要：\n${input.contextSummary}` : '',
      input.workspaceContext
        ? `当前工作区上下文：\n${input.workspaceContext}`
        : '',
      `当前选中文件：\n${selectedFiles}`,
      `可用工具清单：\n${toolCatalog}`,
      `历史对话：\n${historyText}`,
      `当前用户消息：\n${input.message}`,
      '请直接输出符合 schema 的 JSON，不要输出额外说明。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private getIdeIntentRouteSchema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['respond', 'request_tools'],
        },
        sceneType: {
          type: 'string',
          enum: [
            'code_assistant',
            'codebase_qa',
            'explain_error',
            'fix_error',
            'refactor_symbol',
            'generate_tests',
            'terminal_assistant',
          ],
        },
        skillName: {
          type: 'string',
          enum: [
            'intent_router',
            'direct_answer',
            'explain_error',
            'fix_error',
            'refactor_symbol',
            'generate_tests',
            'codebase_qa',
            'terminal_assistant',
          ],
        },
        summary: { type: 'string' },
        responseMarkdown: { type: 'string' },
        requiredTools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              toolName: {
                type: 'string',
                enum: [
                  'workspace.getTree',
                  'diagnostics.getProblems',
                  'fs.readFile',
                  'fs.searchText',
                  'codebase.searchSymbols',
                  'codebase.searchSemantic',
                  'codebase.findReferences',
                  'codebase.getFileContext',
                  'codebase.getSymbolGraph',
                  'codebase.getIndexStats',
                  'editor.getActiveFile',
                  'fs.applyPatch',
                ],
              },
              reason: { type: 'string' },
              inputJson: {
                type: 'object',
                additionalProperties: true,
              },
            },
            required: ['toolName', 'reason', 'inputJson'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'action',
        'sceneType',
        'skillName',
        'summary',
        'responseMarkdown',
        'requiredTools',
      ],
      additionalProperties: false,
    };
  }

  private getIdePlanWorkflowSchema() {
    return {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          enum: ['clarifying', 'plan_ready'],
        },
        summary: { type: 'string' },
        replyMarkdown: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              description: { type: 'string' },
              placeholder: { type: 'string' },
              type: {
                type: 'string',
                enum: ['single_choice', 'multi_choice', 'text'],
              },
              choices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['label', 'description'],
                  additionalProperties: false,
                },
              },
            },
            required: [
              'prompt',
              'description',
              'placeholder',
              'type',
              'choices',
            ],
            additionalProperties: false,
          },
        },
        planMarkdown: { type: 'string' },
      },
      required: [
        'stage',
        'summary',
        'replyMarkdown',
        'questions',
        'planMarkdown',
      ],
      additionalProperties: false,
    };
  }

  private getMediaPublishSchema() {
    return {
      type: 'object',
      properties: {
        shouldEnterWorkflow: { type: 'boolean' },
        intent: {
          type: 'string',
          enum: [
            'article_draft',
            'image_generate',
            'video_storyboard',
            'video_generate',
            'media_edit',
            'media_publish',
            'login_help',
            'integration_help',
            'platform_data',
            'status_check',
            'general_chat',
          ],
        },
        summary: { type: 'string' },
        targetPlatformIds: {
          type: 'array',
          items: { type: 'string' },
        },
        articleTitle: { type: 'string' },
        articleMarkdown: { type: 'string' },
        missingFields: {
          type: 'array',
          items: { type: 'string' },
        },
        suggestedSteps: {
          type: 'array',
          items: { type: 'string' },
        },
        assetType: {
          type: 'string',
          enum: ['none', 'image', 'video'],
        },
        needsClarification: { type: 'boolean' },
        clarificationQuestions: {
          type: 'array',
          items: { type: 'string' },
        },
        imageCount: { type: 'number' },
        style: { type: 'string' },
        aspectRatio: { type: 'string' },
        duration: { type: 'string' },
        videoModel: { type: 'string' },
        prompt: { type: 'string' },
        negativePrompt: { type: 'string' },
        storyboard: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              shot: { type: 'string' },
              duration: { type: 'string' },
              visual: { type: 'string' },
              camera: { type: 'string' },
              subtitle: { type: 'string' },
              voiceover: { type: 'string' },
              transition: { type: 'string' },
            },
            required: [
              'shot',
              'duration',
              'visual',
              'camera',
              'subtitle',
              'voiceover',
              'transition',
            ],
            additionalProperties: false,
          },
        },
        toolSequence: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                enum: [
                  'ensure_bridge_connection',
                  'list_platforms',
                  'check_auth',
                  'refresh_platform_data',
                  'sync_article',
                ],
              },
              reason: { type: 'string' },
              platformIds: {
                type: 'array',
                items: { type: 'string' },
              },
              forceRefresh: { type: 'boolean' },
            },
            required: ['tool', 'reason', 'platformIds', 'forceRefresh'],
            additionalProperties: false,
          },
        },
        confirmationRequired: { type: 'boolean' },
        confirmationNote: { type: 'string' },
      },
      required: [
        'shouldEnterWorkflow',
        'intent',
        'summary',
        'targetPlatformIds',
        'articleTitle',
        'articleMarkdown',
        'missingFields',
        'suggestedSteps',
        'assetType',
        'needsClarification',
        'clarificationQuestions',
        'imageCount',
        'style',
        'aspectRatio',
        'duration',
        'videoModel',
        'prompt',
        'negativePrompt',
        'storyboard',
        'toolSequence',
        'confirmationRequired',
        'confirmationNote',
      ],
      additionalProperties: false,
    };
  }

  private parseIdeIntentRoute(value: string): IdeIntentRouteResult {
    const payload = JSON.parse(value);
    const normalizedAction =
      payload?.action === 'request_tools' || payload?.action === 'respond'
        ? payload.action
        : 'respond';
    const normalizedSceneType =
      typeof payload?.sceneType === 'string' && payload.sceneType.trim()
        ? payload.sceneType.trim()
        : 'code_assistant';
    const normalizedSkillName =
      typeof payload?.skillName === 'string' && payload.skillName.trim()
        ? payload.skillName.trim()
        : normalizedAction === 'respond'
          ? 'direct_answer'
          : 'intent_router';

    return {
      action: normalizedAction,
      sceneType: normalizedSceneType,
      skillName: normalizedSkillName,
      summary:
        typeof payload?.summary === 'string' ? payload.summary.trim() : '',
      responseMarkdown:
        normalizedAction === 'respond' &&
        typeof payload?.responseMarkdown === 'string'
          ? payload.responseMarkdown.trim()
          : '',
      requiredTools: Array.isArray(payload?.requiredTools)
        ? (payload.requiredTools as Array<Record<string, unknown>>)
            .map((item: Record<string, unknown>) => ({
              toolName:
                typeof item?.toolName === 'string' ? item.toolName.trim() : '',
              reason:
                typeof item?.reason === 'string' ? item.reason.trim() : '',
              inputJson:
                item?.inputJson &&
                typeof item.inputJson === 'object' &&
                !Array.isArray(item.inputJson)
                  ? (item.inputJson as Record<string, unknown>)
                  : {},
            }))
            .filter((item: IdeIntentRouteToolCall) => Boolean(item.toolName))
        : [],
    };
  }

  private parseIdePlanWorkflow(value: string) {
    const payload = JSON.parse(value);
    const questions = Array.isArray(payload?.questions)
      ? payload.questions
          .map((item: unknown) => this.normalizeIdePlanQuestionDraft(item))
          .filter(
            (
              item: ReturnType<
                CodexExecutorService['normalizeIdePlanQuestionDraft']
              >,
            ): item is NonNullable<
              ReturnType<CodexExecutorService['normalizeIdePlanQuestionDraft']>
            > => Boolean(item),
          )
          .slice(0, 5)
      : [];
    const planMarkdown =
      typeof payload?.planMarkdown === 'string'
        ? payload.planMarkdown.trim()
        : '';
    const stage =
      payload?.stage === 'plan_ready' && planMarkdown
        ? ('plan_ready' as const)
        : ('clarifying' as const);

    return {
      stage,
      summary:
        typeof payload?.summary === 'string' ? payload.summary.trim() : '',
      replyMarkdown:
        typeof payload?.replyMarkdown === 'string'
          ? payload.replyMarkdown.trim()
          : '',
      questions:
        stage === 'clarifying'
          ? questions.length > 0
            ? questions
            : [
                {
                  prompt: '你希望这次计划最终解决什么问题，验收标准是什么？',
                  description: '补充目标和验收方式后，我会生成可执行计划。',
                  placeholder:
                    '例如：实现登录功能，支持手机号验证码登录，并通过手动验收…',
                  type: 'text' as const,
                  choices: [],
                },
              ]
          : [],
      planMarkdown: stage === 'plan_ready' ? planMarkdown : '',
    };
  }

  private normalizeIdePlanQuestionDraft(item: unknown) {
    if (typeof item === 'string') {
      const prompt = item.trim();
      if (!prompt) return null;
      return {
        prompt,
        description: '',
        placeholder: '请补充你的答案…',
        type: 'text' as const,
        choices: [],
      };
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, unknown>;
    const prompt =
      typeof record.prompt === 'string' ? record.prompt.trim() : '';
    if (!prompt) return null;

    const rawChoices = Array.isArray(record.choices) ? record.choices : [];
    const choices = rawChoices
      .map((choice) => {
        if (typeof choice === 'string') {
          const label = choice.trim();
          return label ? { label, description: '' } : null;
        }
        if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
          return null;
        }
        const choiceRecord = choice as Record<string, unknown>;
        const label =
          typeof choiceRecord.label === 'string'
            ? choiceRecord.label.trim()
            : '';
        if (!label) return null;
        return {
          label,
          description:
            typeof choiceRecord.description === 'string'
              ? choiceRecord.description.trim()
              : '',
        };
      })
      .filter((choice): choice is { label: string; description: string } =>
        Boolean(choice),
      )
      .slice(0, 4);
    const requestedType =
      record.type === 'single_choice' ||
      record.type === 'multi_choice' ||
      record.type === 'text'
        ? record.type
        : choices.length > 0
          ? 'single_choice'
          : 'text';

    return {
      prompt,
      description:
        typeof record.description === 'string' ? record.description.trim() : '',
      placeholder:
        typeof record.placeholder === 'string' && record.placeholder.trim()
          ? record.placeholder.trim()
          : '请补充你的答案…',
      type: choices.length > 0 ? requestedType : 'text',
      choices,
    };
  }

  private parseMediaPublishPlan(value: string): MediaPublishCodexPlan {
    const payload = JSON.parse(value);

    return {
      shouldEnterWorkflow: Boolean(payload.shouldEnterWorkflow),
      intent:
        payload.intent === 'article_draft' ||
        payload.intent === 'image_generate' ||
        payload.intent === 'video_storyboard' ||
        payload.intent === 'video_generate' ||
        payload.intent === 'media_edit' ||
        payload.intent === 'media_publish' ||
        payload.intent === 'login_help' ||
        payload.intent === 'integration_help' ||
        payload.intent === 'platform_data' ||
        payload.intent === 'status_check'
          ? payload.intent
          : 'general_chat',
      summary:
        typeof payload.summary === 'string' ? payload.summary.trim() : '',
      targetPlatformIds: Array.isArray(payload.targetPlatformIds)
        ? payload.targetPlatformIds
            .filter(
              (item: unknown) =>
                typeof item === 'string' && item.trim().length > 0,
            )
            .map((item: string) => item.trim())
        : [],
      articleTitle:
        typeof payload.articleTitle === 'string'
          ? payload.articleTitle.trim()
          : '',
      articleMarkdown:
        typeof payload.articleMarkdown === 'string'
          ? payload.articleMarkdown.trim()
          : '',
      missingFields: Array.isArray(payload.missingFields)
        ? payload.missingFields.filter(
            (item: unknown) =>
              typeof item === 'string' && item.trim().length > 0,
          )
        : [],
      suggestedSteps: Array.isArray(payload.suggestedSteps)
        ? payload.suggestedSteps.filter(
            (item: unknown) =>
              typeof item === 'string' && item.trim().length > 0,
          )
        : [],
      assetType:
        payload.assetType === 'image' || payload.assetType === 'video'
          ? payload.assetType
          : 'none',
      needsClarification: Boolean(payload.needsClarification),
      clarificationQuestions: Array.isArray(payload.clarificationQuestions)
        ? payload.clarificationQuestions.filter(
            (item: unknown) =>
              typeof item === 'string' && item.trim().length > 0,
          )
        : [],
      imageCount:
        Number.isFinite(payload.imageCount) && Number(payload.imageCount) > 0
          ? Math.max(1, Math.min(6, Math.floor(Number(payload.imageCount))))
          : 1,
      style: typeof payload.style === 'string' ? payload.style.trim() : '',
      aspectRatio:
        typeof payload.aspectRatio === 'string'
          ? payload.aspectRatio.trim()
          : '',
      duration:
        typeof payload.duration === 'string' ? payload.duration.trim() : '',
      videoModel:
        typeof payload.videoModel === 'string' ? payload.videoModel.trim() : '',
      prompt: typeof payload.prompt === 'string' ? payload.prompt.trim() : '',
      negativePrompt:
        typeof payload.negativePrompt === 'string'
          ? payload.negativePrompt.trim()
          : '',
      storyboard: Array.isArray(payload.storyboard)
        ? payload.storyboard
            .filter((item: unknown) => item && typeof item === 'object')
            .map((item: any) => ({
              shot: typeof item.shot === 'string' ? item.shot.trim() : '',
              duration:
                typeof item.duration === 'string' ? item.duration.trim() : '',
              visual: typeof item.visual === 'string' ? item.visual.trim() : '',
              camera: typeof item.camera === 'string' ? item.camera.trim() : '',
              subtitle:
                typeof item.subtitle === 'string' ? item.subtitle.trim() : '',
              voiceover:
                typeof item.voiceover === 'string' ? item.voiceover.trim() : '',
              transition:
                typeof item.transition === 'string'
                  ? item.transition.trim()
                  : '',
            }))
        : [],
      toolSequence: Array.isArray(payload.toolSequence)
        ? payload.toolSequence
            .filter((item: unknown) => item && typeof item === 'object')
            .map((item: any) => ({
              tool:
                item.tool === 'ensure_bridge_connection' ||
                item.tool === 'list_platforms' ||
                item.tool === 'check_auth' ||
                item.tool === 'refresh_platform_data' ||
                item.tool === 'sync_article'
                  ? item.tool
                  : 'list_platforms',
              reason: typeof item.reason === 'string' ? item.reason.trim() : '',
              platformIds: Array.isArray(item.platformIds)
                ? item.platformIds
                    .filter(
                      (value: unknown) =>
                        typeof value === 'string' && value.trim(),
                    )
                    .map((value: string) => value.trim())
                : [],
              forceRefresh: Boolean(item.forceRefresh),
            }))
        : [],
      confirmationRequired: Boolean(payload.confirmationRequired),
      confirmationNote:
        typeof payload.confirmationNote === 'string'
          ? payload.confirmationNote.trim()
          : '',
    };
  }
}
