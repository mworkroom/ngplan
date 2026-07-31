import type { ManualPlanDraft } from '../application/manual-plan';
import type { ProjectSetupDraft } from '../application/project-setup';
import {
  migrateWorkspaceSessionV3Snapshot,
  normalizeWorkspaceSessionSnapshot,
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../ui/workspace-session-storage';

const LEGACY_CLOUD_PLAN_DOCUMENT_VERSION = 1 as const;
export const CLOUD_PLAN_DOCUMENT_VERSION = 2 as const;

export interface CloudPlanDocumentV2 {
  readonly version: typeof CLOUD_PLAN_DOCUMENT_VERSION;
  readonly draft: ProjectSetupDraft;
  readonly manualPlanDraft: ManualPlanDraft | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloudDocumentFromWorkspaceSession(
  snapshot: WorkspaceSessionSnapshot,
): CloudPlanDocumentV2 {
  return {
    version: CLOUD_PLAN_DOCUMENT_VERSION,
    draft: snapshot.draft,
    manualPlanDraft: snapshot.manualPlanDraft,
  };
}

export function normalizeCloudPlanDocument(
  value: unknown,
): CloudPlanDocumentV2 | null {
  if (!isRecord(value)) {
    return null;
  }
  const workspaceCandidate = {
    version:
      value.version === LEGACY_CLOUD_PLAN_DOCUMENT_VERSION
        ? 3
        : WORKSPACE_SESSION_VERSION,
    draft: value.draft,
    manualPlanDraft: value.manualPlanDraft,
    screen: 'SETUP',
    organizationScale: 1,
    automaticPlanCheckpoint: null,
  };
  const normalized = value.version === CLOUD_PLAN_DOCUMENT_VERSION
    ? normalizeWorkspaceSessionSnapshot(workspaceCandidate)
    : value.version === LEGACY_CLOUD_PLAN_DOCUMENT_VERSION
      ? migrateWorkspaceSessionV3Snapshot(workspaceCandidate)
      : null;
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
  document: CloudPlanDocumentV2,
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
  document: CloudPlanDocumentV2,
): string {
  return JSON.stringify(document);
}
