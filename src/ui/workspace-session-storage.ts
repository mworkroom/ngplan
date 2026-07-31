import type { ManualPlanDraft } from '../application/manual-plan';
import type {
  MemberDraft,
  ProjectSetupBundle,
  ProjectSetupDraft,
} from '../application/project-setup';

export const LEGACY_WORKSPACE_SESSION_STORAGE_KEY = 'ngplan.workspace-session.v1';
export const LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY = 'ngplan.workspace-session.v2';
export const LEGACY_WORKSPACE_SESSION_STORAGE_V3_KEY = 'ngplan.workspace-session.v3';
export const WORKSPACE_SESSION_STORAGE_KEY = 'ngplan.workspace-session.v4';
export const WORKSPACE_SESSION_VERSION = 4 as const;

export type WorkspaceAutomaticPlanCheckpoint = Readonly<Record<string, unknown>>;

export interface WorkspaceSessionSnapshot {
  readonly version: typeof WORKSPACE_SESSION_VERSION;
  readonly draft: ProjectSetupDraft;
  readonly manualPlanDraft: ManualPlanDraft | null;
  readonly screen: 'SETUP' | 'MANUAL_PLAN' | 'AUTOMATIC_PLAN';
  readonly organizationScale: number;
  readonly automaticPlanCheckpoint: WorkspaceAutomaticPlanCheckpoint | null;
}

export interface WorkspaceSessionWriteSnapshot {
  readonly version: typeof WORKSPACE_SESSION_VERSION;
  readonly draft: ProjectSetupDraft;
  readonly manualPlanDraft: ManualPlanDraft | null;
  readonly screen: 'SETUP' | 'MANUAL_PLAN' | 'AUTOMATIC_PLAN';
  readonly organizationScale: number;
  readonly automaticPlanCheckpoint?: WorkspaceAutomaticPlanCheckpoint | null;
}

const V1_OPENING_FIELDS = [
  'fortnightPvpOpeningCredit',
  'dailyCarryPvp',
  'dailyCarryLeft',
  'dailyCarryRight',
] as const;

const V2_OPENING_FIELDS = [
  'openingQualificationPvp',
  ...V1_OPENING_FIELDS,
] as const;

type StoredOpeningVersion = 'V1' | 'V2' | 'V3' | 'V4';

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
  version: StoredOpeningVersion,
): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (version === 'V3' || version === 'V4') {
    return (
      typeof value.cumulativePvp === 'string' &&
      typeof value.dailyCarryLeft === 'string' &&
      typeof value.dailyCarryRight === 'string' &&
      typeof value.openingStateConfirmed === 'boolean'
    );
  }
  const fields = version === 'V2' ? V2_OPENING_FIELDS : V1_OPENING_FIELDS;
  return (
    fields.every((field) => typeof value[field] === 'string') &&
    typeof value.openingStateConfirmed === 'boolean'
  );
}

function looksLikeMemberDraft(value: unknown, version: StoredOpeningVersion): boolean {
  if (!isRecord(value) || !isRecord(value.placement)) {
    return false;
  }
  return (
    typeof value.memberKey === 'string' &&
    (value.participation === 'ACTIVE' || value.participation === 'EXCLUDED') &&
    (value.sourceMemberId === undefined ||
      value.sourceMemberId === null ||
      typeof value.sourceMemberId === 'string') &&
    typeof value.memberId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.pvpTarget === 'string' &&
    (version !== 'V4' || typeof value.fortnightSideTarget === 'string') &&
    typeof value.sheetMarker === 'string' &&
    (value.placement.parentMemberKey === null ||
      typeof value.placement.parentMemberKey === 'string') &&
    isSideOrNull(value.placement.sideAtParent) &&
    looksLikeOpeningState(value.openingState, version)
  );
}

function looksLikeProjectDraft(
  value: unknown,
  version: StoredOpeningVersion,
): boolean {
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
    value.timezone === 'America/Sao_Paulo' &&
    value.projectStatus === 'IN_PROGRESS' &&
    (value.rootMemberKey === null || typeof value.rootMemberKey === 'string') &&
    (value.selectedMemberKey === null || typeof value.selectedMemberKey === 'string') &&
    value.members.every((member) => looksLikeMemberDraft(member, version))
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
    value.project.timezone !== 'America/Sao_Paulo' ||
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
      (member.fortnightSideTarget !== 1_500 &&
        member.fortnightSideTarget !== 2_500) ||
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
      !isSafePv(opening.dailyCarryRight) ||
      opening.openingQualificationPvp !== opening.fortnightPvpOpeningCredit ||
      opening.dailyCarryPvp !== 0
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
    ) &&
    (!Object.hasOwn(value, 'actualDifferenceMarkers') ||
      (Array.isArray(value.actualDifferenceMarkers) &&
        value.actualDifferenceMarkers.every(
          (marker) =>
            isRecord(marker) &&
            typeof marker.date === 'string' &&
            typeof marker.memberKey === 'string',
        )))
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

function normalizeV4Snapshot(value: unknown): WorkspaceSessionSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== WORKSPACE_SESSION_VERSION ||
    !looksLikeProjectDraft(value.draft, 'V4')
  ) {
    return null;
  }
  const draft = withSafeActiveBundle(value.draft as ProjectSetupDraft);
  const manualPlanDraft = looksLikeManualPlanDraft(value.manualPlanDraft)
    ? value.manualPlanDraft
    : null;
  const requestedPlanScreen =
    value.screen === 'MANUAL_PLAN' || value.screen === 'AUTOMATIC_PLAN'
      ? value.screen
      : null;
  const screen = requestedPlanScreen !== null &&
      draft.activeBundle !== null &&
      manualPlanDraft !== null
    ? requestedPlanScreen
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

export function normalizeWorkspaceSessionSnapshot(
  value: unknown,
): WorkspaceSessionSnapshot | null {
  return normalizeV4Snapshot(value);
}

type LegacyOpeningStateDraft = Readonly<{
  dailyCarryPvp: string;
  dailyCarryLeft: string;
  dailyCarryRight: string;
}>;

type LegacyMemberDraft = Omit<
  MemberDraft,
  'openingState' | 'fortnightSideTarget'
> & Readonly<{
  openingState: LegacyOpeningStateDraft;
}>;

type LegacyProjectSetupDraft = Omit<
  ProjectSetupDraft,
  'members' | 'activeBundle'
> & Readonly<{
  members: readonly LegacyMemberDraft[];
  activeBundle: unknown;
}>;

function migrateLegacyMember(value: unknown): MemberDraft {
  const member = value as LegacyMemberDraft;
  const opening = member.openingState;
  return {
    ...member,
    fortnightSideTarget: '2500',
    placement: { ...member.placement },
    openingState: {
      cumulativePvp: opening.dailyCarryPvp,
      dailyCarryLeft: opening.dailyCarryLeft,
      dailyCarryRight: opening.dailyCarryRight,
      openingStateConfirmed: false,
    },
  };
}

function migrateLegacySnapshot(
  value: unknown,
  version: 1 | 2,
  openingVersion: 'V1' | 'V2',
): WorkspaceSessionSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== version ||
    !looksLikeProjectDraft(value.draft, openingVersion)
  ) {
    return null;
  }
  const legacyDraft = value.draft as LegacyProjectSetupDraft;
  const draft: ProjectSetupDraft = {
    ...legacyDraft,
    members: legacyDraft.members.map(migrateLegacyMember),
    activeBundle: null,
  };
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

type LegacyV3MemberDraft = Omit<MemberDraft, 'fortnightSideTarget'>;

type LegacyV3ProjectSetupDraft = Omit<
  ProjectSetupDraft,
  'members' | 'activeBundle'
> & Readonly<{
  members: readonly LegacyV3MemberDraft[];
  activeBundle: unknown;
}>;

export function migrateWorkspaceSessionV3Snapshot(
  value: unknown,
): WorkspaceSessionSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== 3 ||
    !looksLikeProjectDraft(value.draft, 'V3')
  ) {
    return null;
  }
  const legacyDraft = value.draft as LegacyV3ProjectSetupDraft;
  const draft: ProjectSetupDraft = {
    ...legacyDraft,
    members: legacyDraft.members.map((member) => ({
      ...member,
      placement: { ...member.placement },
      openingState: { ...member.openingState },
      fortnightSideTarget: '2500',
    })),
    activeBundle: null,
  };
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

function persistV4Snapshot(snapshot: WorkspaceSessionSnapshot): boolean {
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

function readAndNormalizeV4(storage: Storage): WorkspaceSessionSnapshot | null {
  const raw = storage.getItem(WORKSPACE_SESSION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const normalized = normalizeV4Snapshot(JSON.parse(raw));
    if (normalized !== null) return normalized;
  } catch {
    // 손상된 현재 세대 저장값은 제거하고 이전 세대 저장 위치를 시도합니다.
  }
  removeStorageKey(storage, WORKSPACE_SESSION_STORAGE_KEY);
  return null;
}

function readAndMigrateV3(storage: Storage): WorkspaceSessionSnapshot | null {
  const raw = storage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_V3_KEY);
  if (raw === null) return null;
  try {
    const migrated = migrateWorkspaceSessionV3Snapshot(JSON.parse(raw));
    if (migrated !== null) return migrated;
  } catch {
    // 손상된 구형 저장값은 아래에서 제거합니다.
  }
  removeStorageKey(storage, LEGACY_WORKSPACE_SESSION_STORAGE_V3_KEY);
  return null;
}

function readAndMigrateLegacy(
  storage: Storage,
  key: string,
  version: 1 | 2,
  openingVersion: 'V1' | 'V2',
): WorkspaceSessionSnapshot | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const migrated = migrateLegacySnapshot(
      JSON.parse(raw),
      version,
      openingVersion,
    );
    if (migrated !== null) return migrated;
  } catch {
    // 손상된 구형 저장값은 아래에서 제거합니다.
  }
  removeStorageKey(storage, key);
  return null;
}

function removeLegacyStorageKeys(storage: Storage): void {
  removeStorageKey(storage, LEGACY_WORKSPACE_SESSION_STORAGE_V3_KEY);
  removeStorageKey(storage, LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY);
  removeStorageKey(storage, LEGACY_WORKSPACE_SESSION_STORAGE_KEY);
}

function promoteToLocalStorage(
  snapshot: WorkspaceSessionSnapshot,
  source: Storage,
): WorkspaceSessionSnapshot {
  if (persistV4Snapshot(snapshot)) {
    removeLegacyStorageKeys(source);
    if (source === window.sessionStorage) {
      removeStorageKey(source, WORKSPACE_SESSION_STORAGE_KEY);
    }
  }
  return snapshot;
}

export function readWorkspaceSession(): WorkspaceSessionSnapshot | null {
  try {
    const localCurrent = readAndNormalizeV4(window.localStorage);
    if (localCurrent !== null) {
      return localCurrent;
    }

    const localV3 = readAndMigrateV3(window.localStorage);
    if (localV3 !== null) {
      return promoteToLocalStorage(localV3, window.localStorage);
    }

    const localV2 = readAndMigrateLegacy(
      window.localStorage,
      LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY,
      2,
      'V2',
    );
    if (localV2 !== null) {
      return promoteToLocalStorage(localV2, window.localStorage);
    }

    const localV1 = readAndMigrateLegacy(
      window.localStorage,
      LEGACY_WORKSPACE_SESSION_STORAGE_KEY,
      1,
      'V1',
    );
    if (localV1 !== null) {
      return promoteToLocalStorage(localV1, window.localStorage);
    }

    const sessionCurrent = readAndNormalizeV4(window.sessionStorage);
    if (sessionCurrent !== null) {
      return promoteToLocalStorage(sessionCurrent, window.sessionStorage);
    }

    const sessionV3 = readAndMigrateV3(window.sessionStorage);
    if (sessionV3 !== null) {
      return promoteToLocalStorage(sessionV3, window.sessionStorage);
    }

    const sessionV2 = readAndMigrateLegacy(
      window.sessionStorage,
      LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY,
      2,
      'V2',
    );
    if (sessionV2 !== null) {
      return promoteToLocalStorage(sessionV2, window.sessionStorage);
    }

    const sessionV1 = readAndMigrateLegacy(
      window.sessionStorage,
      LEGACY_WORKSPACE_SESSION_STORAGE_KEY,
      1,
      'V1',
    );
    if (sessionV1 !== null) {
      return promoteToLocalStorage(sessionV1, window.sessionStorage);
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
  if (persistV4Snapshot(current)) {
    removeLegacyStorageKeys(window.localStorage);
    removeStorageKey(window.sessionStorage, WORKSPACE_SESSION_STORAGE_KEY);
    removeLegacyStorageKeys(window.sessionStorage);
  }
}

export function replaceWorkspaceAutomaticPlanCheckpoint(
  checkpoint: WorkspaceAutomaticPlanCheckpoint | null,
): boolean {
  const current = readWorkspaceSession();
  if (current === null) {
    return false;
  }
  return persistV4Snapshot({ ...current, automaticPlanCheckpoint: checkpoint });
}

export function clearWorkspaceSession(): void {
  removeStorageKey(window.localStorage, WORKSPACE_SESSION_STORAGE_KEY);
  removeLegacyStorageKeys(window.localStorage);
  removeStorageKey(window.sessionStorage, WORKSPACE_SESSION_STORAGE_KEY);
  removeLegacyStorageKeys(window.sessionStorage);
}
