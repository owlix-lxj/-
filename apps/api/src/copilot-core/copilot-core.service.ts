import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CopilotSessionStoreService } from '../copilot-session-store/copilot-session-store.service';
import { CopilotSkillRegistryService } from '../copilot-skill-registry/copilot-skill-registry.service';
import { CopilotToolRegistryService } from '../copilot-tool-registry/copilot-tool-registry.service';
import type {
  CopilotMessageBlueprint,
  CopilotMessageDraftInput,
  CopilotProductType,
  CopilotRunBlueprint,
  CopilotRunDraftInput,
  CopilotSessionContextUpdateInput,
  CopilotRunStatusUpdateInput,
  CopilotSessionBlueprint,
  CopilotSessionDetails,
  CopilotSessionDraftInput,
  CopilotSessionListFilters,
  CopilotToolCallDraftInput,
  CopilotToolCallBlueprint,
  CopilotToolResultDraftInput,
} from './copilot-core.types';
import {
  COPILOT_CLIENT_PLATFORMS,
  COPILOT_CLIENT_RUNTIMES,
  COPILOT_MESSAGE_ROLES,
  COPILOT_PRODUCT_TYPES,
  COPILOT_RUN_EXECUTION_MODES,
  COPILOT_RUN_STATUSES,
  COPILOT_SCOPE_TYPES,
  COPILOT_SESSION_STATUSES,
  COPILOT_TOOL_CALL_STATUSES,
  COPILOT_TOOL_CHOICES,
} from './copilot-core.types';

@Injectable()
export class CopilotCoreService {
  constructor(
    private readonly sessionStore: CopilotSessionStoreService,
    private readonly skillRegistry: CopilotSkillRegistryService,
    private readonly toolRegistry: CopilotToolRegistryService,
  ) {}

  getPlatformBlueprint() {
    return {
      productTypes: [...COPILOT_PRODUCT_TYPES],
      scopeTypes: [...COPILOT_SCOPE_TYPES],
      sessionStatuses: [...COPILOT_SESSION_STATUSES],
      runStatuses: [...COPILOT_RUN_STATUSES],
      toolCallStatuses: [...COPILOT_TOOL_CALL_STATUSES],
      messageRoles: [...COPILOT_MESSAGE_ROLES],
      clientPlatforms: [...COPILOT_CLIENT_PLATFORMS],
      clientRuntimes: [...COPILOT_CLIENT_RUNTIMES],
      runExecutionModes: [...COPILOT_RUN_EXECUTION_MODES],
      toolChoices: [...COPILOT_TOOL_CHOICES],
      responsibilities: [
        'session-management',
        'message-normalization',
        'run-orchestration',
        'streaming',
        'tool-dispatch',
        'usage-audit',
      ],
      entities: this.sessionStore.getEntityBlueprint(),
    };
  }

  listToolsForProduct(productType: CopilotProductType) {
    return this.toolRegistry
      .listBlueprintTools()
      .filter((tool) => tool.allowedProducts.includes(productType));
  }

  listSkillsForProduct(productType: CopilotProductType) {
    return this.skillRegistry
      .listBlueprintSkills()
      .filter((skill) => skill.allowedProducts.includes(productType));
  }

  createDraftSession(input: CopilotSessionDraftInput): CopilotSessionBlueprint {
    const now = new Date().toISOString();
    return {
      id: `cop_sess_${randomUUID()}`,
      title: input.title?.trim() || this.defaultSessionTitle(input.sceneType),
      productType: input.productType,
      sceneType: input.sceneType,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      organizationId: input.organizationId ?? null,
      status: 'draft',
      clientContext: input.clientContext,
      contextSummary: input.contextSummary?.trim() || null,
      contextJson: input.contextJson ?? null,
      messageCount: 0,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  createDraftMessage(input: CopilotMessageDraftInput): CopilotMessageBlueprint {
    return {
      id: `cop_msg_${randomUUID()}`,
      sessionId: input.sessionId,
      role: input.role ?? 'user',
      content: input.content.trim(),
      source: input.source?.trim() || null,
      clientMessageId: input.clientMessageId?.trim() || null,
      selectedFilePaths: input.selectedFilePaths ?? [],
      referencedUris: input.referencedUris ?? [],
      workingDirectory: input.workingDirectory?.trim() || null,
      language: input.language?.trim() || null,
      createdAt: new Date().toISOString(),
    };
  }

  createDraftRun(input: CopilotRunDraftInput): CopilotRunBlueprint {
    return {
      id: `cop_run_${randomUUID()}`,
      sessionId: input.sessionId,
      productType: input.productType,
      sceneType: input.sceneType,
      skillName: input.skillName,
      executionMode: input.executionMode,
      toolChoice: input.toolChoice,
      streamed: input.streamed,
      status: 'queued',
      modelProvider: input.modelProvider?.trim() || 'openai',
      modelName: input.modelName?.trim() || 'gpt-5-codex',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: null,
    };
  }

  createToolResultReceipt(input: CopilotToolResultDraftInput): CopilotToolCallBlueprint {
    return {
      id: input.toolCallId,
      runId: input.runId,
      toolName: input.toolName,
      status: input.status,
      riskLevel: input.riskLevel,
      requiresConfirmation: input.requiresConfirmation,
      confirmedByUser: input.confirmedByUser,
      outputText: input.outputText?.trim() || null,
      errorMessage: input.errorMessage?.trim() || null,
      durationMs: input.durationMs ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  async createSessionForUser(userId: string, input: CopilotSessionDraftInput) {
    const session = this.createDraftSession(input);
    return this.sessionStore.createSession(userId, session);
  }

  async listSessionsForUser(userId: string, filters: CopilotSessionListFilters) {
    return this.sessionStore.listSessionsByUser(userId, filters);
  }

  async getSessionDetailsForUser(userId: string, sessionId: string): Promise<CopilotSessionDetails | null> {
    return this.sessionStore.getSessionDetailsForUser(sessionId, userId);
  }

  async createMessageForUser(userId: string, input: CopilotMessageDraftInput) {
    const message = this.createDraftMessage(input);
    return this.sessionStore.createMessageForUser(userId, message);
  }

  async createRunForUser(userId: string, input: CopilotRunDraftInput, messageId?: string | null) {
    const run = this.createDraftRun(input);
    return this.sessionStore.createRunForUser(userId, run, messageId ?? null);
  }

  async recordToolResultForUser(
    userId: string,
    input: CopilotToolResultDraftInput,
    rawOutputJson?: Record<string, unknown> | null,
  ) {
    const toolCall = this.createToolResultReceipt(input);
    return this.sessionStore.upsertToolResultForUser(userId, toolCall, rawOutputJson ?? null);
  }

  async getRunByIdForUser(userId: string, runId: string) {
    return this.sessionStore.findRunByIdForUser(runId, userId);
  }

  async listToolCallsForRunForUser(userId: string, runId: string) {
    return this.sessionStore.listToolCallsByRunIdForUser(runId, userId);
  }

  async getToolCallByIdForRunForUser(userId: string, runId: string, toolCallId: string) {
    return this.sessionStore.findToolCallByIdForRunForUser(toolCallId, runId, userId);
  }

  async createPendingToolCallForUser(userId: string, input: CopilotToolCallDraftInput) {
    return this.sessionStore.createPendingToolCallForUser(userId, input);
  }

  async updateSessionContextForUser(
    userId: string,
    sessionId: string,
    input: CopilotSessionContextUpdateInput,
  ) {
    return this.sessionStore.updateSessionContextForUser(sessionId, userId, input);
  }

  async updateSessionTitleForUser(userId: string, sessionId: string, title: string) {
    return this.sessionStore.updateSessionTitleForUser(sessionId, userId, title);
  }

  async updateRunStatusForUser(userId: string, runId: string, input: CopilotRunStatusUpdateInput) {
    return this.sessionStore.updateRunStatusForUser(userId, runId, input);
  }

  async cancelActiveToolCallsForRunForUser(userId: string, runId: string) {
    return this.sessionStore.cancelActiveToolCallsForRunForUser(userId, runId);
  }

  private defaultSessionTitle(sceneType: string) {
    return `IDE Copilot · ${sceneType}`;
  }
}
