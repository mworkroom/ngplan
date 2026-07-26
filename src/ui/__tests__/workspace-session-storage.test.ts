import { afterEach, describe, expect, it } from 'vitest';
import {
  addRootMember,
  assignMemberDirectoryIdentity,
  createProjectDraft,
  type ProjectSetupDraft,
} from '../../application/project-setup';
import {
  clearWorkspaceSession,
  LEGACY_WORKSPACE_SESSION_STORAGE_KEY,
  LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY,
  readWorkspaceSession,
  replaceWorkspaceAutomaticPlanCheckpoint,
  WORKSPACE_SESSION_STORAGE_KEY,
  WORKSPACE_SESSION_VERSION,
  writeWorkspaceSession,
} from '../workspace-session-storage';

function createDraft(): ProjectSetupDraft {
  let sequence = 0;
  return createProjectDraft({
    year: 2026,
    month: 7,
    half: 'FIRST_HALF',
    generateId: (kind) => `${kind}-${++sequence}`,
  });
}

function createDraftWithMember(): ProjectSetupDraft {
  const outcome = addRootMember(createDraft(), 'member-1');
  if (outcome.status !== 'SUCCESS') {
    throw new Error(outcome.error.message);
  }
  return outcome.draft;
}

function createLegacyDraft(
  version: 1 | 2,
  cumulativePvp = '0',
): Record<string, unknown> {
  const legacyDraft = structuredClone(createDraftWithMember()) as unknown as Record<
    string,
    unknown
  >;
  const members = legacyDraft.members as Array<Record<string, unknown>>;
  for (const member of members) {
    const current = member.openingState as Record<string, unknown>;
    member.openingState = {
      ...(version === 2 ? { openingQualificationPvp: cumulativePvp } : {}),
      fortnightPvpOpeningCredit: cumulativePvp,
      dailyCarryPvp: cumulativePvp,
      dailyCarryLeft: current.dailyCarryLeft,
      dailyCarryRight: current.dailyCarryRight,
      openingStateConfirmed: current.openingStateConfirmed,
    };
  }
  return legacyDraft;
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('persistent workspace storage v3', () => {
  it('persists and reads only the current schema v3 write contract', () => {
    const draft = createDraft();
    writeWorkspaceSession({
      version: WORKSPACE_SESSION_VERSION,
      draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 0.8,
    });

    expect(Object.isFrozen(draft)).toBe(false);
    expect(window.localStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!))
      .toMatchObject({ version: 3, automaticPlanCheckpoint: null });
    expect(readWorkspaceSession()).toEqual({
      version: WORKSPACE_SESSION_VERSION,
      draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 0.8,
      automaticPlanCheckpoint: null,
    });
  });

  it('persists the source member UUID used for directory duplicate protection', () => {
    const withRoot = addRootMember(createDraft(), 'member-1');
    if (withRoot.status !== 'SUCCESS') {
      throw new Error(withRoot.error.message);
    }
    const assigned = assignMemberDirectoryIdentity(
      withRoot.draft,
      'member-1',
      {
        sourceMemberId: 'directory-member-1',
        memberId: '1001',
        displayName: 'Bia',
      },
    );
    if (assigned.status !== 'SUCCESS') {
      throw new Error(assigned.message);
    }

    writeWorkspaceSession({
      version: WORKSPACE_SESSION_VERSION,
      draft: assigned.draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 1,
    });

    expect(readWorkspaceSession()?.draft.members[0]).toMatchObject({
      sourceMemberId: 'directory-member-1',
      memberId: '1001',
      name: 'Bia',
    });
  });

  it('migrates v1 visible PVP into cumulative PVP and clears derived state', () => {
    const legacyDraft = createLegacyDraft(1);
    const members = legacyDraft.members as Array<Record<string, unknown>>;
    const opening = members[0]!.openingState as Record<string, unknown>;
    opening.fortnightPvpOpeningCredit = '700';
    opening.dailyCarryPvp = '300';
    opening.dailyCarryLeft = '20';
    opening.dailyCarryRight = '30';
    opening.openingStateConfirmed = true;
    legacyDraft.activeBundle = { legacyBundleMustNotSurvive: true };
    const manualPlanDraft = {
      cells: [
        {
          date: '2026-07-01',
          memberKey: 'member-1',
          pvp: '123',
          selfLeft: '',
          selfRight: '',
        },
      ],
    };
    window.sessionStorage.setItem(
      LEGACY_WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        draft: legacyDraft,
        manualPlanDraft,
        screen: 'MANUAL_PLAN',
        organizationScale: 0.9,
      }),
    );

    const migrated = readWorkspaceSession();

    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(3);
    expect(migrated?.screen).toBe('SETUP');
    expect(migrated?.draft.activeBundle).toBeNull();
    expect(migrated?.manualPlanDraft).toEqual(manualPlanDraft);
    expect(migrated?.automaticPlanCheckpoint).toBeNull();
    expect(migrated?.draft.members[0]?.openingState).toEqual({
      cumulativePvp: '300',
      dailyCarryLeft: '20',
      dailyCarryRight: '30',
      openingStateConfirmed: false,
    });
    expect(window.sessionStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!))
      .toMatchObject({ version: 3, screen: 'SETUP', automaticPlanCheckpoint: null });
  });

  it('migrates local v2 visible PVP without clamping and discards stale bundle/checkpoint', () => {
    const legacyDraft = createLegacyDraft(2, '2500');
    legacyDraft.activeBundle = { staleBundle: true };
    const manualPlanDraft = {
      cells: [
        {
          date: '2026-07-01',
          memberKey: 'member-1',
          pvp: '123',
          selfLeft: '30',
          selfRight: '30',
        },
      ],
    };
    window.localStorage.setItem(
      LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY,
      JSON.stringify({
        version: 2,
        draft: legacyDraft,
        manualPlanDraft,
        screen: 'MANUAL_PLAN',
        organizationScale: 0.75,
        automaticPlanCheckpoint: { candidateId: 'stale-candidate' },
      }),
    );

    const migrated = readWorkspaceSession();

    expect(migrated).toMatchObject({
      version: 3,
      screen: 'SETUP',
      organizationScale: 0.75,
      automaticPlanCheckpoint: null,
      manualPlanDraft,
    });
    expect(migrated?.draft.activeBundle).toBeNull();
    expect(migrated?.draft.members[0]?.openingState).toEqual({
      cumulativePvp: '2500',
      dailyCarryLeft: '0',
      dailyCarryRight: '0',
      openingStateConfirmed: false,
    });
    expect(window.localStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY)).toBeNull();
    expect(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it('isolates malformed checkpoint data without discarding setup/manual work', () => {
    const draft = createDraft();
    writeWorkspaceSession({
      version: WORKSPACE_SESSION_VERSION,
      draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 1,
      automaticPlanCheckpoint: { checkpointVersion: '1.0.0', candidateId: 'candidate-1' },
    });
    expect(readWorkspaceSession()?.automaticPlanCheckpoint).toEqual({
      checkpointVersion: '1.0.0',
      candidateId: 'candidate-1',
    });

    const raw = JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!);
    raw.automaticPlanCheckpoint = 'broken-checkpoint';
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify(raw));

    const restored = readWorkspaceSession();
    expect(restored?.draft).toEqual(draft);
    expect(restored?.automaticPlanCheckpoint).toBeNull();
    expect(replaceWorkspaceAutomaticPlanCheckpoint(null)).toBe(true);
  });

  it('ignores malformed current data and clears all workspace generations', () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, '{broken');
    expect(readWorkspaceSession()).toBeNull();
    expect(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();

    window.localStorage.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 99, draft: {} }),
    );
    expect(readWorkspaceSession()).toBeNull();

    window.sessionStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY, '{}');
    window.sessionStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY, '{}');
    writeWorkspaceSession({
      version: WORKSPACE_SESSION_VERSION,
      draft: createDraft(),
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 1,
    });
    window.sessionStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY, '{}');
    window.sessionStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY, '{}');
    window.localStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY, '{}');
    window.localStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY, '{}');
    clearWorkspaceSession();
    expect(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_V2_KEY)).toBeNull();
  });

  it('promotes an existing v3 session snapshot into persistent local storage', () => {
    const draft = createDraftWithMember();
    window.sessionStorage.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: WORKSPACE_SESSION_VERSION,
        draft,
        manualPlanDraft: null,
        screen: 'SETUP',
        organizationScale: 1,
        automaticPlanCheckpoint: null,
      }),
    );

    expect(readWorkspaceSession()?.draft).toEqual(draft);
    expect(window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).not.toBeNull();
  });
});
