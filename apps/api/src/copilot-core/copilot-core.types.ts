export const COPILOT_PRODUCT_TYPES = ['miaoshechat', 'ide', 'datasheet'] as const;
export type CopilotProductType = (typeof COPILOT_PRODUCT_TYPES)[number];

export const COPILOT_SCOPE_TYPES = ['brand', 'workspace', 'project', 'repository'] as const;
export type CopilotScopeType = (typeof COPILOT_SCOPE_TYPES)[number];

export const COPILOT_CLIENT_PLATFORMS = ['web', 'desktop'] as const;
export type CopilotClientPlatform = (typeof COPILOT_CLIENT_PLATFORMS)[number];

export const COPILOT_CLIENT_RUNTIMES = ['browser', 'electron', 'embedded-webview'] as const;
export type CopilotClientRuntime = (typeof COPILOT_CLIENT_RUNTIMES)[number];

export const COPILOT_SESSION_STATUSES = ['draft', 'active', 'archived'] as const;
export type CopilotSessionStatus = (typeof COPILOT_SESSION_STATUSES)[number];

export const COPILOT_MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;
export type CopilotMessageRole = (typeof COPILOT_MESSAGE_ROLES)[number];

export const COPILOT_RUN_STATUSES = [
  'queued',
  'routing',
  'running',
  'waiting_tool',
  'cancelled',
  'completed',
  'failed',
] as const;
export type CopilotRunStatus = (typeof COPILOT_RUN_STATUSES)[number];

export const COPILOT_RUN_EXECUTION_MODES = ['auto', 'chat', 'plan'] as const;
export type CopilotRunExecutionMode = (typeof COPILOT_RUN_EXECUTION_MODES)[number];

export const COPILOT_TOOL_CHOICES = ['auto', 'none', 'required'] as const;
export type CopilotToolChoice = (typeof COPILOT_TOOL_CHOICES)[number];

export const COPILOT_TOOL_CALL_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type CopilotToolCallStatus = (typeof COPILOT_TOOL_CALL_STATUSES)[number];

export interface CopilotEntityFieldBlueprint {
  name: string;
  type: string;
  required: boolean;
  notes?: string;
}

export interface CopilotEntityBlueprint {
  table: string;
  purpose: string;
  fields: CopilotEntityFieldBlueprint[];
}

export interface CopilotClientContext {
  platform: CopilotClientPlatform;
  runtime: CopilotClientRuntime;
  desktopCallback?: string | null;
  sessionSource?: string | null;
}

export interface CopilotSessionListFilters {
  productType: CopilotProductType;
  sceneType?: string | null;
  scopeType?: CopilotScopeType | null;
  scopeId?: string | null;
  limit?: number;
}

export interface CopilotSessionBlueprint {
  id: string;
  title: string;
  productType: CopilotProductType;
  sceneType: string;
  scopeType: CopilotScopeType;
  scopeId: string | null;
  organizationId: string | null;
  status: CopilotSessionStatus;
  clientContext: CopilotClientContext;
  contextSummary: string | null;
  contextJson?: Record<string, unknown> | null;
  messageCount: number;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotMessageBlueprint {
  id: string;
  sessionId: string;
  role: CopilotMessageRole;
  content: string;
  source?: string | null;
  clientMessageId: string | null;
  actorUserId?: string | null;
  selectedFilePaths: string[];
  referencedUris: string[];
  workingDirectory: string | null;
  language: string | null;
  createdAt: string;
}

export interface CopilotRunBlueprint {
  id: string;
  sessionId: string;
  productType: CopilotProductType;
  sceneType: string;
  skillName: string;
  executionMode: CopilotRunExecutionMode;
  toolChoice: CopilotToolChoice;
  streamed: boolean;
  status: CopilotRunStatus;
  modelProvider: string;
  modelName: string;
  createdAt: string;
  updatedAt?: string;
  finishedAt?: string | null;
}

export interface CopilotToolCallBlueprint {
  id: string;
  runId: string;
  toolName: string;
  status: CopilotToolCallStatus;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  confirmedByUser: boolean;
  inputJson?: Record<string, unknown> | null;
  outputText: string | null;
  durationMs: number | null;
  errorMessage?: string | null;
  updatedAt: string;
}

export interface CopilotSessionDetails {
  session: CopilotSessionBlueprint;
  messages: CopilotMessageBlueprint[];
  runs: Array<
    CopilotRunBlueprint & {
      toolCalls: CopilotToolCallBlueprint[];
    }
  >;
}

export interface CopilotSessionDraftInput {
  productType: CopilotProductType;
  title?: string | null;
  sceneType: string;
  scopeType: CopilotScopeType;
  scopeId?: string | null;
  organizationId?: string | null;
  contextSummary?: string | null;
  contextJson?: Record<string, unknown> | null;
  clientContext: CopilotClientContext;
}

export interface CopilotMessageDraftInput {
  sessionId: string;
  content: string;
  role?: CopilotMessageRole;
  source?: string | null;
  clientMessageId?: string | null;
  selectedFilePaths?: string[];
  referencedUris?: string[];
  workingDirectory?: string | null;
  language?: string | null;
}

export interface CopilotRunDraftInput {
  sessionId: string;
  productType: CopilotProductType;
  sceneType: string;
  skillName: string;
  executionMode: CopilotRunExecutionMode;
  toolChoice: CopilotToolChoice;
  streamed: boolean;
  modelProvider?: string | null;
  modelName?: string | null;
}

export interface CopilotToolResultDraftInput {
  runId: string;
  toolCallId: string;
  toolName: string;
  status: CopilotToolCallStatus;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  confirmedByUser: boolean;
  outputText?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export interface CopilotToolCallDraftInput {
  runId: string;
  toolName: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  inputJson?: Record<string, unknown> | null;
}

export interface CopilotRunStatusUpdateInput {
  status: CopilotRunStatus;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  sceneType?: string;
  skillName?: string;
}

export interface CopilotSessionContextUpdateInput {
  contextSummary?: string | null;
  contextJson?: Record<string, unknown> | null;
}
