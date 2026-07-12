import type { ManualPlanDraft } from '../application/manual-plan';
import type { ProjectSetupDraft } from '../application/project-setup';

export const WORKSPACE_SESSION_STORAGE_KEY = 'ngplan.workspace-session.v1';

export interface WorkspaceSessionSnapshot {
  readonly version: 1;
  readonly draft: ProjectSetupDraft;
  readonly manualPlanDraft: ManualPlanDraft | null;
  readonly screen: 'SETUP' | 'MANUAL_PLAN';
  readonly organizationScale: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeProjectDraft(value: unknown): value is ProjectSetupDraft {
  if (!isRecord(value) || !Array.isArray(value.members)) {
    return false;
  }
  return (
    typeof value.projectId === 'string' &&
    typeof value.organizationSnapshotId === 'string' &&
    typeof value.year === 'string' &&
    typeof value.month === 'string' &&
    (value.half === 'FIRST_HALF' || value.half === 'SECOND_HALF') &&
    typeof value.title === 'string' &&
    (value.titleSource === 'DERIVED' || value.titleSource === 'MANUAL') &&
    (value.rootMemberKey === null || typeof value.rootMemberKey === 'string') &&
    (value.selectedMemberKey === null || typeof value.selectedMemberKey === 'string') &&
    value.members.every(
      (member) =>
        isRecord(member) &&
        typeof member.memberKey === 'string' &&
        typeof member.name === 'string' &&
        isRecord(member.placement) &&
        isRecord(member.openingState),
    )
  );
}

function looksLikeManualPlanDraft(value: unknown): value is ManualPlanDraft {
  return (
    isRecord(value) &&
    Array.isArray(value.cells) &&
    value.cells.every(
      (cell) =>
        isRecord(cell) &&
        typeof cell.date === 'string' &&
        typeof cell.memberKey === 'string' &&
        typeof cell.pvp === 'string',
    )
  );
}

export function readWorkspaceSession(): WorkspaceSessionSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !looksLikeProjectDraft(value.draft) ||
      (value.manualPlanDraft !== null && !looksLikeManualPlanDraft(value.manualPlanDraft)) ||
      (value.screen !== 'SETUP' && value.screen !== 'MANUAL_PLAN') ||
      typeof value.organizationScale !== 'number' ||
      !Number.isFinite(value.organizationScale) ||
      value.organizationScale < 0.25 ||
      value.organizationScale > 1.5
    ) {
      return null;
    }
    return value as unknown as WorkspaceSessionSnapshot;
  } catch {
    return null;
  }
}

export function writeWorkspaceSession(snapshot: WorkspaceSessionSnapshot): void {
  try {
    window.sessionStorage.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // 임시 저장이 차단되어도 현재 탭의 인메모리 작업은 계속할 수 있습니다.
  }
}

export function clearWorkspaceSession(): void {
  try {
    window.sessionStorage.removeItem(WORKSPACE_SESSION_STORAGE_KEY);
  } catch {
    // 저장소 삭제가 차단되어도 새 작업 상태는 정상적으로 시작합니다.
  }
}
