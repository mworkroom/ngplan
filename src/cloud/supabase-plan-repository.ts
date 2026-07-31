import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeCloudPlanDocument,
  type CloudPlanDocumentV2,
} from './cloud-plan-document';
import type {
  CloudProjectRecord,
  CloudProjectSummary,
  CloudWorkspace,
  PlanRepository,
  RecoveryPointSummary,
  SafetyBackupReason,
  SaveProjectResult,
} from './types';

interface ProjectRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly period_year: number | null;
  readonly period_month: number | null;
  readonly period_half: 'FIRST_HALF' | 'SECOND_HALF';
  readonly revision: number;
  readonly hidden_at: string | null;
  readonly updated_at: string;
  readonly last_saved_at: string;
  readonly current_document?: unknown;
}

interface RecoveryRow {
  readonly id: string;
  readonly kind: 'ROLLING' | 'SAFETY';
  readonly reason:
    | 'AUTO_15_MIN'
    | 'BEFORE_PERIOD_CHANGE'
    | 'BEFORE_AUTOMATIC_PLAN_APPLY'
    | 'BEFORE_MEMBER_EXCLUSION';
  readonly captured_at: string;
  readonly source_revision: number;
}

interface DailyBackupRow {
  readonly business_date: string;
  readonly saved_at: string;
  readonly source_revision: number;
}

const PROJECT_SUMMARY_COLUMNS =
  'id,workspace_id,title,period_year,period_month,period_half,revision,hidden_at,updated_at,last_saved_at';

function fail(context: string, error: { readonly message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeProjectRow(value: unknown): ProjectRow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.workspace_id !== 'string' ||
    typeof value.title !== 'string' ||
    (value.period_year !== null && !Number.isSafeInteger(value.period_year)) ||
    (value.period_month !== null && !Number.isSafeInteger(value.period_month)) ||
    (value.period_half !== 'FIRST_HALF' &&
      value.period_half !== 'SECOND_HALF') ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    (value.hidden_at !== null && typeof value.hidden_at !== 'string') ||
    typeof value.updated_at !== 'string' ||
    typeof value.last_saved_at !== 'string'
  ) {
    return null;
  }
  return value as unknown as ProjectRow;
}

function projectSummaryFromRow(row: ProjectRow): CloudProjectSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    periodHalf: row.period_half,
    revision: row.revision,
    hiddenAt: row.hidden_at,
    updatedAt: row.updated_at,
    lastSavedAt: row.last_saved_at,
    localOnly: false,
    pendingRemote: false,
  };
}

function safeMetadataInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function safeMetadataTitle(document: CloudPlanDocumentV2): string {
  const title = document.draft.title.trim();
  const fallback = `${document.draft.year || '계획'}-${document.draft.month || '?'}`;
  return Array.from(title || fallback).slice(0, 200).join('');
}

function normalizePositiveRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

function normalizeRecoveryRow(value: unknown): RecoveryRow | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.kind !== 'ROLLING' && value.kind !== 'SAFETY') ||
    ![
      'AUTO_15_MIN',
      'BEFORE_PERIOD_CHANGE',
      'BEFORE_AUTOMATIC_PLAN_APPLY',
      'BEFORE_MEMBER_EXCLUSION',
    ].includes(String(value.reason)) ||
    typeof value.captured_at !== 'string'
  ) {
    return null;
  }
  const revision = normalizePositiveRevision(value.source_revision);
  return revision === null
    ? null
    : ({ ...value, source_revision: revision } as unknown as RecoveryRow);
}

function normalizeDailyBackupRow(value: unknown): DailyBackupRow | null {
  if (
    !isRecord(value) ||
    typeof value.business_date !== 'string' ||
    typeof value.saved_at !== 'string'
  ) {
    return null;
  }
  const revision = normalizePositiveRevision(value.source_revision);
  return revision === null
    ? null
    : ({ ...value, source_revision: revision } as unknown as DailyBackupRow);
}

export class SupabasePlanRepository implements PlanRepository {
  readonly #client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.#client = client;
  }

  async findWorkspace(): Promise<CloudWorkspace> {
    const { data, error } = await this.#client
      .from('workspaces')
      .select('id,name')
      .eq('name', 'ngplan')
      .limit(2);
    if (error !== null) fail('ngplan 작업공간을 불러오지 못했습니다', error);
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error(
        data?.length === 0
          ? '이 계정에는 ngplan 작업공간 접근 권한이 없습니다.'
          : 'ngplan 작업공간이 중복되어 관리 확인이 필요합니다.',
      );
    }
    const row = data[0];
    if (!isRecord(row) || typeof row.id !== 'string' || row.name !== 'ngplan') {
      throw new Error('ngplan 작업공간 응답 형식이 올바르지 않습니다.');
    }
    return { id: row.id, name: 'ngplan' };
  }

  async listProjects(
    workspaceId: string,
    visibility: 'VISIBLE' | 'HIDDEN',
  ): Promise<readonly CloudProjectSummary[]> {
    let query = this.#client
      .from('ngplan_projects')
      .select(PROJECT_SUMMARY_COLUMNS)
      .eq('workspace_id', workspaceId);
    query =
      visibility === 'VISIBLE'
        ? query.is('hidden_at', null)
        : query.not('hidden_at', 'is', null);
    const { data, error } = await query.order('updated_at', {
      ascending: false,
    });
    if (error !== null) fail('계획 목록을 불러오지 못했습니다', error);
    if (!Array.isArray(data)) {
      throw new Error('계획 목록 응답 형식이 올바르지 않습니다.');
    }
    return data.map((value) => {
      const row = normalizeProjectRow(value);
      if (row === null) {
        throw new Error('저장된 계획 목록에 읽을 수 없는 항목이 있습니다.');
      }
      return projectSummaryFromRow(row);
    });
  }

  async loadProject(
    workspaceId: string,
    projectId: string,
  ): Promise<CloudProjectRecord> {
    const { data, error } = await this.#client
      .from('ngplan_projects')
      .select(`${PROJECT_SUMMARY_COLUMNS},current_document`)
      .eq('workspace_id', workspaceId)
      .eq('id', projectId)
      .maybeSingle();
    if (error !== null) fail('계획을 불러오지 못했습니다', error);
    if (data === null) {
      throw new Error('계획을 찾지 못했거나 접근 권한이 없습니다.');
    }
    const row = normalizeProjectRow(data);
    const document =
      row === null ? null : normalizeCloudPlanDocument(row.current_document);
    if (row === null || document === null || document.draft.projectId !== projectId) {
      throw new Error('저장된 계획 문서 형식이 현재 앱과 맞지 않습니다.');
    }
    return { ...projectSummaryFromRow(row), document };
  }

  async saveProject(
    workspaceId: string,
    document: CloudPlanDocumentV2,
  ): Promise<SaveProjectResult> {
    const payload = {
      id: document.draft.projectId,
      workspace_id: workspaceId,
      title: safeMetadataTitle(document),
      period_year: safeMetadataInteger(document.draft.year, 2000, 2200),
      period_month: safeMetadataInteger(document.draft.month, 1, 12),
      period_half: document.draft.half,
      timezone: 'America/Sao_Paulo',
      document_schema_version: document.version,
      current_document: document,
    };
    const { data, error } = await this.#client
      .from('ngplan_projects')
      .upsert(payload, { onConflict: 'id' })
      .select('revision,updated_at,last_saved_at')
      .single();
    if (error !== null) fail('계획을 저장하지 못했습니다', error);
    if (
      !isRecord(data) ||
      typeof data.revision !== 'number' ||
      !Number.isSafeInteger(data.revision) ||
      data.revision < 1 ||
      typeof data.updated_at !== 'string' ||
      typeof data.last_saved_at !== 'string'
    ) {
      throw new Error('계획 저장 응답 형식이 올바르지 않습니다.');
    }
    return {
      revision: data.revision,
      updatedAt: data.updated_at,
      lastSavedAt: data.last_saved_at,
    };
  }

  async setProjectHidden(
    workspaceId: string,
    projectId: string,
    hidden: boolean,
  ): Promise<void> {
    const { data, error } = await this.#client
      .from('ngplan_projects')
      .update({ hidden_at: hidden ? new Date().toISOString() : null })
      .eq('workspace_id', workspaceId)
      .eq('id', projectId)
      .select('id')
      .maybeSingle();
    if (error !== null) {
      fail(hidden ? '계획을 숨기지 못했습니다' : '계획을 복원하지 못했습니다', error);
    }
    if (!isRecord(data) || data.id !== projectId) {
      throw new Error('계획을 찾지 못했거나 접근 권한이 없습니다.');
    }
  }

  async listRecoveryPoints(
    workspaceId: string,
    projectId: string,
  ): Promise<readonly RecoveryPointSummary[]> {
    const [recoveryResult, dailyResult] = await Promise.all([
      this.#client
        .from('ngplan_recovery_backups')
        .select('id,kind,reason,captured_at,source_revision')
        .eq('workspace_id', workspaceId)
        .eq('project_id', projectId)
        .order('captured_at', { ascending: false })
        .limit(722),
      this.#client
        .from('ngplan_daily_backups')
        .select('business_date,saved_at,source_revision')
        .eq('workspace_id', workspaceId)
        .eq('project_id', projectId)
        .order('business_date', { ascending: false })
        .limit(400),
    ]);
    if (recoveryResult.error !== null) {
      fail('이전 내용을 불러오지 못했습니다', recoveryResult.error);
    }
    if (dailyResult.error !== null) {
      fail('이전 내용을 불러오지 못했습니다', dailyResult.error);
    }
    if (!Array.isArray(recoveryResult.data) || !Array.isArray(dailyResult.data)) {
      throw new Error('이전 내용 목록을 읽을 수 없습니다.');
    }
    const recoveryPoints = recoveryResult.data.map((value) => {
      const row = normalizeRecoveryRow(value);
      if (row === null) {
        throw new Error('일부 이전 내용을 읽을 수 없습니다.');
      }
      return {
        key: `recovery:${row.id}`,
        kind: row.kind,
        reason: row.reason,
        capturedAt: row.captured_at,
        sourceRevision: row.source_revision,
        businessDate: null,
      } satisfies RecoveryPointSummary;
    });
    const dailyPoints = dailyResult.data.map((value) => {
      const row = normalizeDailyBackupRow(value);
      if (row === null) {
        throw new Error('일부 이전 내용을 읽을 수 없습니다.');
      }
      return {
        key: `daily:${row.business_date}`,
        kind: 'DAILY',
        reason: 'DAILY',
        capturedAt: row.saved_at,
        sourceRevision: row.source_revision,
        businessDate: row.business_date,
      } satisfies RecoveryPointSummary;
    });
    return [...recoveryPoints, ...dailyPoints].sort((left, right) =>
      right.capturedAt.localeCompare(left.capturedAt),
    );
  }

  async loadRecoveryPoint(
    workspaceId: string,
    projectId: string,
    point: RecoveryPointSummary,
  ): Promise<CloudPlanDocumentV2> {
    const query =
      point.kind === 'DAILY'
        ? this.#client
            .from('ngplan_daily_backups')
            .select('document')
            .eq('workspace_id', workspaceId)
            .eq('project_id', projectId)
            .eq('business_date', point.businessDate ?? '')
        : this.#client
            .from('ngplan_recovery_backups')
            .select('document')
            .eq('workspace_id', workspaceId)
            .eq('project_id', projectId)
            .eq('id', point.key.replace(/^recovery:/, ''));
    const { data, error } = await query.maybeSingle();
    if (error !== null) fail('선택한 이전 내용을 불러오지 못했습니다', error);
    if (!isRecord(data)) {
      throw new Error('선택한 이전 내용을 찾지 못했습니다.');
    }
    const document = normalizeCloudPlanDocument(data.document);
    if (document === null || document.draft.projectId !== projectId) {
      throw new Error('선택한 이전 내용이 현재 계획과 맞지 않습니다.');
    }
    return document;
  }

  async createSafetyBackup(
    workspaceId: string,
    projectId: string,
    reason: SafetyBackupReason,
    expectedSourceRevision: number,
  ): Promise<void> {
    const { error } = await this.#client.rpc('ngplan_create_safety_backup', {
      target_workspace_id: workspaceId,
      target_project_id: projectId,
      target_reason: reason,
      expected_source_revision: expectedSourceRevision,
    });
    if (error !== null) fail('안전 보관본을 만들지 못했습니다', error);
  }
}
