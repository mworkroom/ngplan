import type { ManualPlanDraft } from '../application/manual-plan';
import type { OpeningStateInput } from '../engine';
import type {
  MemberDraft,
  OpeningStateDraft,
  ProjectSetupBundle,
  ProjectSetupDraft,
} from '../application/project-setup';

export const LEGACY_WORKSPACE_SESSION_STORAGE_KEY = 'ngplan.workspace-session.v1';
export const WORKSPACE_SESSION_STORAGE_KEY = 'ngplan.workspace-session.v2';
export const WORKSPACE_SESSION_VERSION = 2 as const;

export type WorkspaceAutomaticPlanCheckpoint = Readonly<Record<string, unknown>>;

export interface WorkspaceSessionSnapshot {
  readonly version: typeof WORKSPACE_SESSION_VERSION;
  readonly draft: ProjectSetupDraft;
  readonly manualPlanDraft: ManualPlanDraft | null;
  readonly screen: 'SETUP' | 'MANUAL_PLAN';
  readonly organizationScale: number;
  readonly automaticPlanCheckpoint: WorkspaceAutomaticPlanCheckpoint | null;
}

export interface WorkspaceSessionWriteSnapshot {
  readonly version: typeof WORKSPACE_SESSION_VERSION;
  readonly draft: ProjectSetupDraft;
  readonly manualPlanDraft: ManualPlanDraft | null;
  readonly screen: 'SETUP' | 'MANUAL_PLAN';
  readonly organizationScale: number;
  readonly automaticPlanCheckpoint?: WorkspaceAutomaticPlanCheckpoint | null;
}

const LEGACY_OPENING_FIELDS = [
  'fortnightPvpOpeningCredit',
  'dailyCarryPvp',
  'dailyCarryLeft',
  'dailyCarryRight',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function isSideOrNull(value: unknown): boolean {
  return value === null || value === 'LEFT' || value === 'RIGHT';
}

function looksLikeOpeningState(
  value: unknown,
  requireQualification: boolean,
): value is OpeningStateDraft {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !LEGACY_OPENING_FIELDS.every((field) => typeof value[field] === 'string') ||
    typeof value.openingStateConfirmed !== 'boolean'
  ) {
    return false;
  }
  return !requireQualification || typeof value.openingQualificationPvp === 'string';
}

function looksLikeMemberDraft(value: unknown, requireQualification: boolean): boolean {
  if (!isRecord(value) || !isRecord(value.placement)) {
    return false;
  }
  return (
    typeof value.memberKey === 'string' &&
    (value.participation === 'ACTIVE' || value.participation === 'EXCLUDED') &&
    typeof value.memberId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.pvpTarget === 'string' &&
    typeof value.sheetMarker === 'string' &&
    (value.placement.parentMemberKey === null ||
      typeof value.placement.parentMemberKey === 'string') &&
    isSideOrNull(value.placement.sideAtParent) &&
    looksLikeOpeningState(value.openingState, requireQualification)
  );
}

function looksLikeProjectDraft(
  value: unknown,
  requireQualification: boolean,
): value is ProjectSetupDraft {
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
    value.timezone === 'Asia/Seoul' &&
    value.projectStatus === 'IN_PROGRESS' &&
    (value.rootMemberKey === null || typeof value.rootMemberKey === 'string') &&
    (value.selectedMemberKey === null || typeof value.selectedMemberKey === 'string') &&
    value.members.every((member) => looksLikeMemberDraft(member, requireQualification))
  );
}

function isSafePv(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0)
  );
}

function looksLikeProjectSetupBundle(value: unknown): value is ProjectSetupBundle {
  if (
    !isRecord(value) ||
    !isRecord(value.project) ||
    !isRecord(value.project.period) ||
    !isRecord(value.organization) ||
    !Array.isArray(value.organization.members) ||
    !isRecord(value.organization.openingStateByMember)
  ) {
    return false;
  }
  if (
    typeof value.project.projectId !== 'string' ||
    typeof value.project.title !== 'string' ||
    !Number.isSafeInteger(value.project.period.year) ||
    !Number.isSafeInteger(value.project.period.month) ||
    (value.project.period.half !== 'FIRST_HALF' &&
      value.project.period.half !== 'SECOND_HALF') ||
    value.project.timezone !== 'Asia/Seoul' ||
    value.project.projectStatus !== 'IN_PROGRESS' ||
    typeof value.project.organizationSnapshotId !== 'string' ||
    typeof value.organization.snapshotId !== 'string'
  ) {
    return false;
  }
  const memberKeys = new Set<string>();
  for (const member of value.organization.members) {
    if (
      !isRecord(member) ||
      typeof member.memberKey !== 'string' ||
      typeof member.memberId !== 'string' ||
      typeof member.name !== 'string' ||
      !isSafePv(member.pvpTarget) ||
      typeof member.sheetMarker !== 'string' ||
      (member.parentMemberKey !== null && typeof member.parentMemberKey !== 'string') ||
      !isSideOrNull(member.sideAtParent) ||
      memberKeys.has(member.memberKey)
    ) {
      return false;
    }
    memberKeys.add(member.memberKey);
    const opening = value.organization.openingStateByMember[member.memberKey];
    if (
      !isRecord(opening) ||
      !isSafePv(opening.openingQualificationPvp) ||
      !isSafePv(opening.fortnightPvpOpeningCredit) ||
      !isSafePv(opening.dailyCarryPvp) ||
      !isSafePv(opening.dailyCarryLeft) ||
      !isSafePv(opening.dailyCarryRight)
    ) {
      return false;
    }
  }
  return true;
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
        typeof cell.pvp === 'string' &&
        (!Object.hasOwn(cell, 'selfLeft') || typeof cell.selfLeft === 'string') &&
        (!Object.hasOwn(cell, 'selfRight') || typeof cell.selfRight === 'string'),
    )
  );
}

function normalizedScale(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0.25 &&
    value <= 1.5
    ? value
    : 1;
}

function withSafeActiveBundle(draft: ProjectSetupDraft): ProjectSetupDraft {
  return draft.activeBundle === null || looksLikeProjectSetupBundle(draft.activeBundle)
    ? draft
    : { ...draft, activeBundle: null };
}

function withUnifiedVisiblePvpOpenings(draft: ProjectSetupDraft): ProjectSetupDraft {
  const members = draft.members.map((member) => {
    const pvp = member.openingState.dailyCarryPvp;
    return member.openingState.openingQualificationPvp === pvp &&
      member.openingState.fortnightPvpOpeningCredit === pvp
      ? member
      : {
          ...member,
          openingState: {
            ...member.openingState,
            openingQualificationPvp: pvp,
            fortnightPvpOpeningCredit: pvp,
          },
        };
  });
  if (draft.activeBundle === null) {
    return members.every((member, index) => member === draft.members[index])
      ? draft
      : { ...draft, members };
  }
  const openings = Object.create(null) as Record<string, OpeningStateInput>;
  for (const member of draft.activeBundle.organization.members) {
    const opening = draft.activeBundle.organization.openingStateByMember[member.memberKey]!;
    Object.defineProperty(openings, member.memberKey, {
      value: {
        ...opening,
        openingQualificationPvp: opening.dailyCarryPvp,
        fortnightPvpOpeningCredit: opening.dailyCarryPvp,
      },
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return {
    ...draft,
    members,
    activeBundle: {
      ...draft.activeBundle,
      organization: {
        ...draft.activeBundle.organization,
        openingStateByMember: openings,
      },
    },
  };
}

function normalizeV2Snapshot(value: unknown): WorkspaceSessionSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== WORKSPACE_SESSION_VERSION ||
    !looksLikeProjectDraft(value.draft, true)
  ) {
    return null;
  }
  const draft = withUnifiedVisiblePvpOpenings(withSafeActiveBundle(value.draft));
  const manualPlanDraft = looksLikeManualPlanDraft(value.manualPlanDraft)
    ? value.manualPlanDraft
    : null;
  const screen = value.screen === 'MANUAL_PLAN' &&
      draft.activeBundle !== null &&
      manualPlanDraft !== null
    ? 'MANUAL_PLAN' as const
    : 'SETUP' as const;
  const automaticPlanCheckpoint = isRecord(value.automaticPlanCheckpoint)
    ? value.automaticPlanCheckpoint
    : null;

  return deepFreeze({
    version: WORKSPACE_SESSION_VERSION,
    draft,
    manualPlanDraft,
    screen,
    organizationScale: normalizedScale(value.organizationScale),
    automaticPlanCheckpoint,
  });
}

function migrateLegacyMember(value: unknown): MemberDraft {
  const member = value as MemberDraft;
  const opening = member.openingState as OpeningStateDraft;
  return {
    ...member,
    placement: { ...member.placement },
    openingState: {
      openingQualificationPvp: '0',
      fortnightPvpOpeningCredit: opening.fortnightPvpOpeningCredit,
      dailyCarryPvp: opening.dailyCarryPvp,
      dailyCarryLeft: opening.dailyCarryLeft,
      dailyCarryRight: opening.dailyCarryRight,
      openingStateConfirmed: false,
    },
  };
}

function migrateV1Snapshot(value: unknown): WorkspaceSessionSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !looksLikeProjectDraft(value.draft, false)
  ) {
    return null;
  }
  const legacyDraft = value.draft;
  const draft = withUnifiedVisiblePvpOpenings({
    ...legacyDraft,
    members: legacyDraft.members.map(migrateLegacyMember),
    activeBundle: null,
  });
  return deepFreeze({
    version: WORKSPACE_SESSION_VERSION,
    draft,
    manualPlanDraft: looksLikeManualPlanDraft(value.manualPlanDraft)
      ? value.manualPlanDraft
      : null,
    screen: 'SETUP',
    organizationScale: normalizedScale(value.organizationScale),
    automaticPlanCheckpoint: null,
  });
}

function removeStorageKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // 브라우저 저장소 정리가 차단되어도 인메모리 작업은 계속할 수 있습니다.
  }
}

function persistV2Snapshot(snapshot: WorkspaceSessionSnapshot): boolean {
  try {
    window.localStorage.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
    return true;
  } catch {
    return false;
  }
}

function readAndNormalizeV2(storage: Storage): WorkspaceSessionSnapshot | null {
  const raw = storage.getItem(WORKSPACE_SESSION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const normalized = normalizeV2Snapshot(JSON.parse(raw));
    if (normalized !== null) return normalized;
  } catch {
    // 손상된 현재 세대 저장값은 제거하고 다른 저장 위치 또는 v1을 시도합니다.
  }
  removeStorageKey(storage, WORKSPACE_SESSION_STORAGE_KEY);
  return null;
}

function readAndMigrateV1(storage: Storage): WorkspaceSessionSnapshot | null {
  const raw = storage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const migrated = migrateV1Snapshot(JSON.parse(raw));
    if (migrated !== null) return migrated;
  } catch {
    // 손상된 구형 저장값은 아래에서 제거합니다.
  }
  removeStorageKey(storage, LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
  return null;
}

function promoteToLocalStorage(
  snapshot: WorkspaceSessionSnapshot,
  source: Storage,
): WorkspaceSessionSnapshot {
  if (persistV2Snapshot(snapshot)) {
    removeStorageKey(source, WORKSPACE_SESSION_STORAGE_KEY);
    removeStorageKey(source, LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
  }
  return snapshot;
}

export function readWorkspaceSession(): WorkspaceSessionSnapshot | null {
  try {
    const localCurrent = readAndNormalizeV2(window.localStorage);
    if (localCurrent !== null) {
      return localCurrent;
    }

    const localLegacy = readAndMigrateV1(window.localStorage);
    if (localLegacy !== null) {
      return promoteToLocalStorage(localLegacy, window.localStorage);
    }

    const sessionCurrent = readAndNormalizeV2(window.sessionStorage);
    if (sessionCurrent !== null) {
      return promoteToLocalStorage(sessionCurrent, window.sessionStorage);
    }

    const sessionLegacy = readAndMigrateV1(window.sessionStorage);
    if (sessionLegacy !== null) {
      return promoteToLocalStorage(sessionLegacy, window.sessionStorage);
    }
    return null;
  } catch {
    return null;
  }
}

export function writeWorkspaceSession(snapshot: WorkspaceSessionWriteSnapshot): void {
  const current: WorkspaceSessionSnapshot = {
    version: WORKSPACE_SESSION_VERSION,
    draft: snapshot.draft,
    manualPlanDraft: snapshot.manualPlanDraft,
    screen: snapshot.screen,
    organizationScale: snapshot.organizationScale,
    automaticPlanCheckpoint: snapshot.automaticPlanCheckpoint ?? null,
  };
  if (persistV2Snapshot(current)) {
    removeStorageKey(window.localStorage, LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
    removeStorageKey(window.sessionStorage, WORKSPACE_SESSION_STORAGE_KEY);
    removeStorageKey(window.sessionStorage, LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
  }
}

export function replaceWorkspaceAutomaticPlanCheckpoint(
  checkpoint: WorkspaceAutomaticPlanCheckpoint | null,
): boolean {
  const current = readWorkspaceSession();
  if (current === null) {
    return false;
  }
  return persistV2Snapshot({ ...current, automaticPlanCheckpoint: checkpoint });
}

export function clearWorkspaceSession(): void {
  removeStorageKey(window.localStorage, WORKSPACE_SESSION_STORAGE_KEY);
  removeStorageKey(window.localStorage, LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
  removeStorageKey(window.sessionStorage, WORKSPACE_SESSION_STORAGE_KEY);
  removeStorageKey(window.sessionStorage, LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
}
