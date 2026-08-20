import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MysqlService } from '../database/mysql.service';
import type {
  CopilotEntityBlueprint,
  CopilotMessageBlueprint,
  CopilotRunBlueprint,
  CopilotRunStatusUpdateInput,
  CopilotSessionBlueprint,
  CopilotSessionContextUpdateInput,
  CopilotSessionDetails,
  CopilotSessionListFilters,
  CopilotToolCallDraftInput,
  CopilotToolCallBlueprint,
} from '../copilot-core/copilot-core.types';

interface CopilotSessionRow {
  id: string;
  product_type: string;
  scene_type: string;
  scope_type: string;
  scope_id: string | null;
  organization_id: string | null;
  user_id: string;
  title: string;
  status: string;
  client_context_json: string | Record<string, unknown> | null;
  context_summary: string | null;
  context_json: string | Record<string, unknown> | null;
  message_count: number;
  run_count: number;
  created_at: string;
  updated_at: string;
}

interface CopilotMessageRow {
  id: string;
  session_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  content_json: string | Record<string, unknown> | null;
  source: string | null;
  client_message_id: string | null;
  created_at: string;
}

interface CopilotRunRow {
  id: string;
  session_id: string;
  message_id: string | null;
  product_type: string;
  scene_type: string;
  skill_name: string;
  execution_mode: 'auto' | 'chat' | 'plan';
  tool_choice: 'auto' | 'none' | 'required';
  streamed: number;
  model_provider: string;
  model_name: string;
  status: 'queued' | 'routing' | 'running' | 'waiting_tool' | 'cancelled' | 'completed' | 'failed';
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CopilotToolCallRow {
  id: string;
  run_id: string;
  tool_name: string;
  risk_level: 'low' | 'medium' | 'high';
  input_json: string | Record<string, unknown> | null;
  output_json: string | Record<string, unknown> | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  requires_confirmation: number;
  confirmed_by_user: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CopilotSessionStoreService {
  constructor(private readonly mysqlService: MysqlService) {}

  getEntityBlueprint(): CopilotEntityBlueprint[] {
    return [
      {
        table: 'copilot_sessions',
        purpose: 'Copilot 会话主表，隔离产品、场景、范围与客户端上下文',
        fields: [
          { name: 'id', type: 'varchar(64)', required: true },
          { name: 'product_type', type: 'varchar(32)', required: true },
          { name: 'scene_type', type: 'varchar(64)', required: true },
          { name: 'scope_type', type: 'varchar(32)', required: true },
          { name: 'scope_id', type: 'varchar(128)', required: false },
          { name: 'organization_id', type: 'varchar(36)', required: false },
          { name: 'user_id', type: 'varchar(36)', required: true },
          { name: 'title', type: 'varchar(255)', required: true },
          { name: 'status', type: 'varchar(32)', required: true },
          { name: 'client_context_json', type: 'json', required: true },
          { name: 'context_summary', type: 'text', required: false },
          { name: 'context_json', type: 'json', required: false },
          { name: 'message_count', type: 'int', required: true },
          { name: 'run_count', type: 'int', required: true },
          { name: 'created_at', type: 'datetime', required: true },
          { name: 'updated_at', type: 'datetime', required: true },
        ],
      },
      {
        table: 'copilot_messages',
        purpose: '会话消息表，统一保存 user / assistant / tool 消息',
        fields: [
          { name: 'id', type: 'varchar(64)', required: true },
          { name: 'session_id', type: 'varchar(64)', required: true },
          { name: 'role', type: 'varchar(16)', required: true },
          { name: 'content', type: 'longtext', required: true },
          { name: 'content_json', type: 'json', required: false },
          { name: 'source', type: 'varchar(64)', required: false },
          { name: 'client_message_id', type: 'varchar(128)', required: false },
          { name: 'created_at', type: 'datetime', required: true },
        ],
      },
      {
        table: 'copilot_runs',
        purpose: '一次 AI 运行记录，关联技能、模型、状态与报错',
        fields: [
          { name: 'id', type: 'varchar(64)', required: true },
          { name: 'session_id', type: 'varchar(64)', required: true },
          { name: 'message_id', type: 'varchar(64)', required: false },
          { name: 'product_type', type: 'varchar(32)', required: true },
          { name: 'scene_type', type: 'varchar(64)', required: true },
          { name: 'skill_name', type: 'varchar(128)', required: true },
          { name: 'execution_mode', type: 'varchar(32)', required: true },
          { name: 'tool_choice', type: 'varchar(32)', required: true },
          { name: 'streamed', type: 'tinyint(1)', required: true },
          { name: 'model_provider', type: 'varchar(64)', required: true },
          { name: 'model_name', type: 'varchar(128)', required: true },
          { name: 'status', type: 'varchar(32)', required: true },
          { name: 'error_message', type: 'text', required: false },
          { name: 'started_at', type: 'datetime', required: false },
          { name: 'finished_at', type: 'datetime', required: false },
          { name: 'created_at', type: 'datetime', required: true },
          { name: 'updated_at', type: 'datetime', required: true },
        ],
      },
      {
        table: 'copilot_tool_calls',
        purpose: '工具调用记录，支持桌面端本地执行与确认审计',
        fields: [
          { name: 'id', type: 'varchar(64)', required: true },
          { name: 'run_id', type: 'varchar(64)', required: true },
          { name: 'tool_name', type: 'varchar(128)', required: true },
          { name: 'risk_level', type: 'varchar(16)', required: true },
          { name: 'input_json', type: 'json', required: false },
          { name: 'output_json', type: 'json', required: false },
          { name: 'status', type: 'varchar(32)', required: true },
          { name: 'requires_confirmation', type: 'tinyint(1)', required: true },
          { name: 'confirmed_by_user', type: 'tinyint(1)', required: false },
          { name: 'error_message', type: 'text', required: false },
          { name: 'started_at', type: 'datetime', required: false },
          { name: 'finished_at', type: 'datetime', required: false },
          { name: 'created_at', type: 'datetime', required: true },
          { name: 'updated_at', type: 'datetime', required: true },
        ],
      },
      {
        table: 'copilot_artifacts',
        purpose: '产物表，保存补丁、测试报告、文档、图片等输出',
        fields: [
          { name: 'id', type: 'varchar(64)', required: true },
          { name: 'run_id', type: 'varchar(64)', required: true },
          { name: 'artifact_type', type: 'varchar(64)', required: true },
          { name: 'storage_type', type: 'varchar(32)', required: true },
          { name: 'storage_path', type: 'varchar(512)', required: true },
          { name: 'metadata_json', type: 'json', required: false },
          { name: 'created_at', type: 'datetime', required: true },
        ],
      },
      {
        table: 'copilot_usage_logs',
        purpose: '模型与工具使用量日志，支撑计费、配额和审计',
        fields: [
          { name: 'id', type: 'varchar(64)', required: true },
          { name: 'product_type', type: 'varchar(32)', required: true },
          { name: 'organization_id', type: 'varchar(36)', required: false },
          { name: 'user_id', type: 'varchar(36)', required: true },
          { name: 'run_id', type: 'varchar(64)', required: true },
          { name: 'model_provider', type: 'varchar(64)', required: true },
          { name: 'input_tokens', type: 'int', required: true },
          { name: 'output_tokens', type: 'int', required: true },
          { name: 'tool_call_count', type: 'int', required: true },
          { name: 'duration_ms', type: 'int', required: true },
          { name: 'created_at', type: 'datetime', required: true },
        ],
      },
    ];
  }

  async createSession(userId: string, session: CopilotSessionBlueprint) {
    const now = this.toSqlDate(new Date());
    await this.mysqlService.query(
      `INSERT INTO copilot_sessions
       (id, product_type, scene_type, scope_type, scope_id, organization_id, user_id, title, status,
        client_context_json, context_summary, context_json, message_count, run_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.productType,
        session.sceneType,
        session.scopeType,
        session.scopeId,
        session.organizationId,
        userId,
        session.title,
        session.status,
        JSON.stringify(session.clientContext),
        session.contextSummary,
        session.contextJson ? JSON.stringify(session.contextJson) : null,
        session.messageCount,
        session.runCount,
        now,
        now,
      ],
    );

    return this.findSessionByIdForUser(session.id, userId);
  }

  async listSessionsByUser(userId: string, filters: CopilotSessionListFilters) {
    const where = [
      'user_id = ?',
      'product_type = ?',
    ];
    const params: unknown[] = [userId, filters.productType];

    if (filters.sceneType?.trim()) {
      where.push('scene_type = ?');
      params.push(filters.sceneType.trim());
    }
    if (filters.scopeType) {
      where.push('scope_type = ?');
      params.push(filters.scopeType);
    }
    if (filters.scopeId?.trim()) {
      where.push('scope_id = ?');
      params.push(filters.scopeId.trim());
    }

    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const rows = await this.mysqlService.query<CopilotSessionRow[]>(
      `SELECT *
       FROM copilot_sessions
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT ${limit}`,
      params,
    );

    return rows.map((row) => this.mapSession(row));
  }

  async findSessionByIdForUser(sessionId: string, userId: string) {
    const rows = await this.mysqlService.query<CopilotSessionRow[]>(
      `SELECT *
       FROM copilot_sessions
       WHERE id = ?
         AND user_id = ?
       LIMIT 1`,
      [sessionId, userId],
    );
    return rows[0] ? this.mapSession(rows[0]) : null;
  }

  async getSessionDetailsForUser(sessionId: string, userId: string): Promise<CopilotSessionDetails | null> {
    const session = await this.findSessionByIdForUser(sessionId, userId);
    if (!session) return null;

    const [messages, runs, toolCalls] = await Promise.all([
      this.listMessagesBySessionId(sessionId),
      this.listRunsBySessionId(sessionId),
      this.listToolCallsBySessionId(sessionId),
    ]);

    return {
      session,
      messages,
      runs: runs.map((run) => ({
        ...run,
        toolCalls: toolCalls.filter((toolCall) => toolCall.runId === run.id),
      })),
    };
  }

  async updateSessionContextForUser(
    sessionId: string,
    userId: string,
    input: CopilotSessionContextUpdateInput,
  ) {
    const session = await this.findSessionByIdForUser(sessionId, userId);
    if (!session) {
      return null;
    }

    const fields = ['updated_at = ?'];
    const params: unknown[] = [this.toSqlDate(new Date())];

    if ('contextSummary' in input) {
      fields.push('context_summary = ?');
      params.push(input.contextSummary ?? null);
    }

    if ('contextJson' in input) {
      fields.push('context_json = ?');
      params.push(input.contextJson ? JSON.stringify(input.contextJson) : null);
    }

    params.push(sessionId, userId);

    await this.mysqlService.query(
      `UPDATE copilot_sessions
       SET ${fields.join(', ')}
       WHERE id = ? AND user_id = ?`,
      params,
    );

    return this.findSessionByIdForUser(sessionId, userId);
  }

  async updateSessionTitleForUser(sessionId: string, userId: string, title: string) {
    const session = await this.findSessionByIdForUser(sessionId, userId);
    if (!session) return null;
    await this.mysqlService.query(
      `UPDATE copilot_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [title, this.toSqlDate(new Date()), sessionId, userId],
    );
    return this.findSessionByIdForUser(sessionId, userId);
  }

  async createMessageForUser(userId: string, message: CopilotMessageBlueprint) {
    const session = await this.findSessionByIdForUser(message.sessionId, userId);
    if (!session) {
      return null;
    }

    const connection = await this.mysqlService.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO copilot_messages
         (id, session_id, role, content, content_json, source, client_message_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          message.id,
          message.sessionId,
          message.role,
          message.content,
          JSON.stringify({
            actorUserId: userId,
            selectedFilePaths: message.selectedFilePaths,
            referencedUris: message.referencedUris,
            workingDirectory: message.workingDirectory,
            language: message.language,
          }),
          message.source ?? null,
          message.clientMessageId,
          this.toSqlDate(new Date(message.createdAt)),
        ],
      );
      await connection.query(
        `UPDATE copilot_sessions
         SET message_count = message_count + 1, updated_at = ?
         WHERE id = ?`,
        [this.toSqlDate(new Date()), message.sessionId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.findMessageById(message.id);
  }

  async createRunForUser(userId: string, run: CopilotRunBlueprint, messageId?: string | null) {
    const session = await this.findSessionByIdForUser(run.sessionId, userId);
    if (!session) {
      return null;
    }

    const connection = await this.mysqlService.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(
        `INSERT INTO copilot_runs
         (id, session_id, message_id, product_type, scene_type, skill_name, execution_mode,
          tool_choice, streamed, model_provider, model_name, status, error_message,
          started_at, finished_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
        [
          run.id,
          run.sessionId,
          messageId ?? null,
          run.productType,
          run.sceneType,
          run.skillName,
          run.executionMode,
          run.toolChoice,
          run.streamed ? 1 : 0,
          run.modelProvider,
          run.modelName,
          run.status,
          this.toSqlDate(new Date(run.createdAt)),
          this.toSqlDate(new Date()),
        ],
      );
      await connection.query(
        `UPDATE copilot_sessions
         SET run_count = run_count + 1, updated_at = ?
         WHERE id = ?`,
        [this.toSqlDate(new Date()), run.sessionId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.findRunByIdForUser(run.id, userId);
  }

  async updateRunStatusForUser(userId: string, runId: string, input: CopilotRunStatusUpdateInput) {
    const run = await this.findRunByIdForUser(runId, userId);
    if (!run) {
      return null;
    }

    const fields = ['r.status = ?', 'r.updated_at = ?'];
    const params: unknown[] = [input.status, this.toSqlDate(new Date())];

    if ('errorMessage' in input) {
      fields.push('r.error_message = ?');
      params.push(input.errorMessage ?? null);
    }
    if ('startedAt' in input) {
      fields.push('r.started_at = ?');
      params.push(input.startedAt ? this.toSqlDate(new Date(input.startedAt)) : null);
    }
    if ('finishedAt' in input) {
      fields.push('r.finished_at = ?');
      params.push(input.finishedAt ? this.toSqlDate(new Date(input.finishedAt)) : null);
    }
    if ('sceneType' in input && input.sceneType?.trim()) {
      fields.push('r.scene_type = ?');
      params.push(input.sceneType.trim());
    }
    if ('skillName' in input && input.skillName?.trim()) {
      fields.push('r.skill_name = ?');
      params.push(input.skillName.trim());
    }

    params.push(runId, userId);

    await this.mysqlService.query(
      `UPDATE copilot_runs r
       INNER JOIN copilot_sessions s ON s.id = r.session_id
       SET ${fields.join(', ')}
       WHERE r.id = ?
         AND s.user_id = ?`,
      params,
    );

    return this.findRunByIdForUser(runId, userId);
  }

  async cancelActiveToolCallsForRunForUser(userId: string, runId: string) {
    const run = await this.findRunByIdForUser(runId, userId);
    if (!run) {
      return null;
    }

    const now = this.toSqlDate(new Date());
    await this.mysqlService.query(
      `UPDATE copilot_tool_calls tc
       INNER JOIN copilot_runs r ON r.id = tc.run_id
       INNER JOIN copilot_sessions s ON s.id = r.session_id
       SET tc.status = 'cancelled',
           tc.error_message = COALESCE(tc.error_message, '用户主动停止本轮任务'),
           tc.finished_at = COALESCE(tc.finished_at, ?),
           tc.updated_at = ?
       WHERE tc.run_id = ?
         AND s.user_id = ?
         AND tc.status IN ('pending', 'running')`,
      [now, now, runId, userId],
    );

    return this.listToolCallsByRunIdForUser(runId, userId);
  }

  async upsertToolResultForUser(
    userId: string,
    result: CopilotToolCallBlueprint,
    rawOutputJson?: Record<string, unknown> | null,
  ) {
    const run = await this.findRunByIdForUser(result.runId, userId);
    if (!run) {
      return null;
    }

    const now = this.toSqlDate(new Date());
    await this.mysqlService.query(
      `INSERT INTO copilot_tool_calls
       (id, run_id, tool_name, risk_level, input_json, output_json, status, requires_confirmation,
        confirmed_by_user, error_message, started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tool_name = VALUES(tool_name),
         risk_level = VALUES(risk_level),
         output_json = VALUES(output_json),
         status = VALUES(status),
         requires_confirmation = VALUES(requires_confirmation),
         confirmed_by_user = VALUES(confirmed_by_user),
         error_message = VALUES(error_message),
         finished_at = VALUES(finished_at),
         updated_at = VALUES(updated_at)`,
      [
        result.id,
        result.runId,
        result.toolName,
        result.riskLevel,
        rawOutputJson ? JSON.stringify(rawOutputJson) : null,
        result.status,
        result.requiresConfirmation ? 1 : 0,
        result.confirmedByUser ? 1 : 0,
        result.errorMessage ?? null,
        now,
        now,
        now,
      ],
    );

    return this.findToolCallById(result.id);
  }

  async createPendingToolCallForUser(userId: string, input: CopilotToolCallDraftInput) {
    const run = await this.findRunByIdForUser(input.runId, userId);
    if (!run) {
      return null;
    }

    const now = this.toSqlDate(new Date());
    const id = `cop_tool_${randomUUID()}`;
    await this.mysqlService.query(
      `INSERT INTO copilot_tool_calls
       (id, run_id, tool_name, risk_level, input_json, output_json, status, requires_confirmation,
        confirmed_by_user, error_message, started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'pending', ?, 0, NULL, NULL, NULL, ?, ?)`,
      [
        id,
        input.runId,
        input.toolName,
        input.riskLevel,
        input.inputJson ? JSON.stringify(input.inputJson) : null,
        input.requiresConfirmation ? 1 : 0,
        now,
        now,
      ],
    );

    return this.findToolCallById(id);
  }

  async listToolCallsByRunIdForUser(runId: string, userId: string) {
    const rows = await this.mysqlService.query<CopilotToolCallRow[]>(
      `SELECT tc.*
       FROM copilot_tool_calls tc
       INNER JOIN copilot_runs r ON r.id = tc.run_id
       INNER JOIN copilot_sessions s ON s.id = r.session_id
       WHERE tc.run_id = ?
         AND s.user_id = ?
       ORDER BY tc.created_at ASC`,
      [runId, userId],
    );

    return rows.map((row) => this.mapToolCall(row));
  }

  async findToolCallByIdForRunForUser(toolCallId: string, runId: string, userId: string) {
    const rows = await this.mysqlService.query<CopilotToolCallRow[]>(
      `SELECT tc.*
       FROM copilot_tool_calls tc
       INNER JOIN copilot_runs r ON r.id = tc.run_id
       INNER JOIN copilot_sessions s ON s.id = r.session_id
       WHERE tc.id = ?
         AND tc.run_id = ?
         AND s.user_id = ?
       LIMIT 1`,
      [toolCallId, runId, userId],
    );

    return rows[0] ? this.mapToolCall(rows[0]) : null;
  }

  private async listMessagesBySessionId(sessionId: string) {
    const rows = await this.mysqlService.query<CopilotMessageRow[]>(
      `SELECT *
       FROM copilot_messages
       WHERE session_id = ?
       ORDER BY created_at ASC`,
      [sessionId],
    );
    return rows.map((row) => this.mapMessage(row));
  }

  private async listRunsBySessionId(sessionId: string) {
    const rows = await this.mysqlService.query<CopilotRunRow[]>(
      `SELECT *
       FROM copilot_runs
       WHERE session_id = ?
       ORDER BY created_at ASC`,
      [sessionId],
    );
    return rows.map((row) => this.mapRun(row));
  }

  private async listToolCallsBySessionId(sessionId: string) {
    const rows = await this.mysqlService.query<CopilotToolCallRow[]>(
      `SELECT tc.*
       FROM copilot_tool_calls tc
       INNER JOIN copilot_runs r ON r.id = tc.run_id
       WHERE r.session_id = ?
       ORDER BY tc.created_at ASC`,
      [sessionId],
    );
    return rows.map((row) => this.mapToolCall(row));
  }

  private async findMessageById(messageId: string) {
    const rows = await this.mysqlService.query<CopilotMessageRow[]>(
      'SELECT * FROM copilot_messages WHERE id = ? LIMIT 1',
      [messageId],
    );
    return rows[0] ? this.mapMessage(rows[0]) : null;
  }

  async findRunByIdForUser(runId: string, userId: string) {
    const rows = await this.mysqlService.query<CopilotRunRow[]>(
      `SELECT r.*
       FROM copilot_runs r
       INNER JOIN copilot_sessions s ON s.id = r.session_id
       WHERE r.id = ?
         AND s.user_id = ?
       LIMIT 1`,
      [runId, userId],
    );
    return rows[0] ? this.mapRun(rows[0]) : null;
  }

  private async findToolCallById(toolCallId: string) {
    const rows = await this.mysqlService.query<CopilotToolCallRow[]>(
      'SELECT * FROM copilot_tool_calls WHERE id = ? LIMIT 1',
      [toolCallId],
    );
    return rows[0] ? this.mapToolCall(rows[0]) : null;
  }

  private mapSession(row: CopilotSessionRow): CopilotSessionBlueprint {
    return {
      id: row.id,
      title: row.title,
      productType: row.product_type as CopilotSessionBlueprint['productType'],
      sceneType: row.scene_type,
      scopeType: row.scope_type as CopilotSessionBlueprint['scopeType'],
      scopeId: row.scope_id,
      organizationId: row.organization_id,
      status: row.status as CopilotSessionBlueprint['status'],
      clientContext: ((this.parseJson(row.client_context_json) ?? {}) as unknown) as
        CopilotSessionBlueprint['clientContext'],
      contextSummary: row.context_summary,
      contextJson: this.parseJson(row.context_json),
      messageCount: Number(row.message_count ?? 0),
      runCount: Number(row.run_count ?? 0),
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapMessage(row: CopilotMessageRow): CopilotMessageBlueprint {
    const contentJson = this.parseJson(row.content_json) ?? {};
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      source: row.source,
      clientMessageId: row.client_message_id,
      actorUserId: typeof contentJson.actorUserId === 'string' ? contentJson.actorUserId : null,
      selectedFilePaths: Array.isArray(contentJson.selectedFilePaths)
        ? (contentJson.selectedFilePaths as string[])
        : [],
      referencedUris: Array.isArray(contentJson.referencedUris)
        ? (contentJson.referencedUris as string[])
        : [],
      workingDirectory:
        typeof contentJson.workingDirectory === 'string' ? contentJson.workingDirectory : null,
      language: typeof contentJson.language === 'string' ? contentJson.language : null,
      createdAt: this.toIso(row.created_at),
    };
  }

  private mapRun(row: CopilotRunRow): CopilotRunBlueprint {
    return {
      id: row.id,
      sessionId: row.session_id,
      productType: row.product_type as CopilotRunBlueprint['productType'],
      sceneType: row.scene_type,
      skillName: row.skill_name,
      executionMode: row.execution_mode,
      toolChoice: row.tool_choice,
      streamed: Boolean(row.streamed),
      status: row.status,
      modelProvider: row.model_provider,
      modelName: row.model_name,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
      finishedAt: row.finished_at ? this.toIso(row.finished_at) : null,
    };
  }

  private mapToolCall(row: CopilotToolCallRow): CopilotToolCallBlueprint {
    const outputJson = this.parseJson(row.output_json);
    const outputText =
      typeof outputJson?.outputText === 'string'
        ? outputJson.outputText
        : typeof outputJson?.errorMessage === 'string'
          ? outputJson.errorMessage
          : null;

    return {
      id: row.id,
      runId: row.run_id,
      toolName: row.tool_name,
      status: row.status,
      riskLevel: row.risk_level,
      requiresConfirmation: Boolean(row.requires_confirmation),
      confirmedByUser: Boolean(row.confirmed_by_user),
      inputJson: this.parseJson(row.input_json),
      outputText,
      durationMs:
        typeof outputJson?.durationMs === 'number' ? outputJson.durationMs : null,
      errorMessage: row.error_message,
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private parseJson(value: string | Record<string, unknown> | null) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private toSqlDate(date: Date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private toIso(value: string) {
    return new Date(value.replace(' ', 'T') + 'Z').toISOString();
  }
}
