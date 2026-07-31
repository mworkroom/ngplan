import type { Half } from '../engine';
import type { ManualPlanDraft } from '../application/manual-plan';
import { deriveDefaultProjectTitle } from '../application/project-setup';
import type { CloudPlanDocumentV1 } from './cloud-plan-document';
import {
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../ui/workspace-session-storage';

export interface PlanningPeriod {
  readonly year: number;
  readonly month: number;
  readonly half: Half;
}

export interface PlanCopyIds {
  readonly projectId: string;
  readonly organizationSnapshotId: string;
}

function saoPauloDateParts(date: Date): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

export function deriveRecommendedPlanningPeriod(date: Date): PlanningPeriod {
  const current = saoPauloDateParts(date);
  if (current.day <= 15) {
    return {
      year: current.year,
      month: current.month,
      half: 'SECOND_HALF',
    };
  }
  if (current.month === 12) {
    return { year: current.year + 1, month: 1, half: 'FIRST_HALF' };
  }
  return {
    year: current.year,
    month: current.month + 1,
    half: 'FIRST_HALF',
  };
}

export function isValidPlanningPeriod(period: PlanningPeriod): boolean {
  return (
    Number.isSafeInteger(period.year) &&
    period.year >= 2000 &&
    period.year <= 2200 &&
    Number.isSafeInteger(period.month) &&
    period.month >= 1 &&
    period.month <= 12
  );
}

export function formatPlanningPeriodRange(period: PlanningPeriod): string {
  const startDay = period.half === 'FIRST_HALF' ? 1 : 16;
  const endDay =
    period.half === 'FIRST_HALF'
      ? 15
      : new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  return `${period.year}년 ${period.month}월 ${startDay}일–${endDay}일`;
}

export function manualPlanDraftHasEnteredValues(
  draft: ManualPlanDraft | null,
): boolean {
  if (draft === null) return false;
  return draft.cells.some((cell) =>
    [cell.pvp, cell.selfLeft, cell.selfRight].some((value) => {
      const normalized = value?.trim() ?? '';
      if (normalized === '') return false;
      const numeric = Number(normalized);
      return !Number.isFinite(numeric) || numeric !== 0;
    }),
  );
}

export function createPeriodCopySession(
  source: WorkspaceSessionSnapshot,
  period: PlanningPeriod,
  ids: PlanCopyIds,
): WorkspaceSessionSnapshot {
  const year = String(period.year);
  const month = String(period.month);
  const derivedTitle = deriveDefaultProjectTitle(year, month, period.half);
  const sourceTitle = source.draft.title.trim();
  const title =
    source.draft.titleSource === 'DERIVED' || sourceTitle === ''
      ? derivedTitle
      : `${sourceTitle} · ${derivedTitle}`;
  return {
    version: WORKSPACE_SESSION_VERSION,
    draft: {
      ...source.draft,
      projectId: ids.projectId,
      organizationSnapshotId: ids.organizationSnapshotId,
      year,
      month,
      half: period.half,
      title,
      titleSource:
        source.draft.titleSource === 'DERIVED' || sourceTitle === ''
          ? 'DERIVED'
          : 'MANUAL',
      activeBundle: null,
    },
    manualPlanDraft: null,
    screen: 'SETUP',
    organizationScale: source.organizationScale,
    automaticPlanCheckpoint: null,
  };
}

export function createRecoveryCopySession(
  document: CloudPlanDocumentV1,
  ids: PlanCopyIds,
): WorkspaceSessionSnapshot {
  const sourceTitle = document.draft.title.trim() || '이름 없는 계획';
  return {
    version: WORKSPACE_SESSION_VERSION,
    draft: {
      ...document.draft,
      projectId: ids.projectId,
      organizationSnapshotId: ids.organizationSnapshotId,
      title: `${sourceTitle} · 복구본`,
      titleSource: 'MANUAL',
      activeBundle: null,
    },
    manualPlanDraft: document.manualPlanDraft,
    screen: 'SETUP',
    organizationScale: 1,
    automaticPlanCheckpoint: null,
  };
}
