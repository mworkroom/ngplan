import type { ManualPlanDraft } from '../application/manual-plan';
import type { ProjectSetupDraft } from '../application/project-setup';
import {
  normalizeWorkspaceSessionSnapshot,
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../ui/workspace-session-storage';

export const CLOUD_PLAN_DOCUMENT_VERSION = 1 as const;

export interface CloudPlanDocumentV1 {
  readonly version: typeof CLOUD_PLAN_DOCUMENT_VERSION;
  readonly draft: ProjectSetupDraft;
  readonly manualPlanDraft: ManualPlanDraft | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloudDocumentFromWorkspaceSession(
  snapshot: WorkspaceSessionSnapshot,
): CloudPlanDocumentV1 {
  return {
    version: CLOUD_PLAN_DOCUMENT_VERSION,
    draft: snapshot.draft,
    manualPlanDraft: snapshot.manualPlanDraft,
  };
}

export function normalizeCloudPlanDocument(
  value: unknown,
): CloudPlanDocumentV1 | null {
  if (!isRecord(value) || value.version !== CLOUD_PLAN_DOCUMENT_VERSION) {
    return null;
  }
  const normalized = normalizeWorkspaceSessionSnapshot({
    version: WORKSPACE_SESSION_VERSION,
    draft: value.draft,
    manualPlanDraft: value.manualPlanDraft,
    screen: 'SETUP',
    organizationScale: 1,
    automaticPlanCheckpoint: null,
  });
  if (normalized === null) {
    return null;
  }
  return {
    version: CLOUD_PLAN_DOCUMENT_VERSION,
    draft: normalized.draft,
    manualPlanDraft: normalized.manualPlanDraft,
  };
}

export function workspaceSessionFromCloudDocument(
  document: CloudPlanDocumentV1,
  localSession?: WorkspaceSessionSnapshot | null,
): WorkspaceSessionSnapshot {
  const canOpenManualPlan =
    document.draft.activeBundle !== null && document.manualPlanDraft !== null;
  const normalized = normalizeWorkspaceSessionSnapshot({
    version: WORKSPACE_SESSION_VERSION,
    draft: document.draft,
    manualPlanDraft: document.manualPlanDraft,
    screen:
      localSession?.screen === 'MANUAL_PLAN' && canOpenManualPlan
        ? 'MANUAL_PLAN'
        : canOpenManualPlan
          ? 'MANUAL_PLAN'
          : 'SETUP',
    organizationScale: localSession?.organizationScale ?? 1,
    automaticPlanCheckpoint:
      localSession?.draft.projectId === document.draft.projectId
        ? localSession.automaticPlanCheckpoint
        : null,
  });
  if (normalized === null) {
    throw new Error('저장된 계획 문서 형식이 현재 앱과 맞지 않습니다.');
  }
  return normalized;
}

export function serializeCloudPlanDocument(
  document: CloudPlanDocumentV1,
): string {
  return JSON.stringify(document);
}
