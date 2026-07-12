import { afterEach, describe, expect, it } from 'vitest';
import {
  addRootMember,
  createProjectDraft,
  type ProjectSetupDraft,
} from '../../application/project-setup';
import {
  clearWorkspaceSession,
  LEGACY_WORKSPACE_SESSION_STORAGE_KEY,
  readWorkspaceSession,
  replaceWorkspaceAutomaticPlanCheckpoint,
  WORKSPACE_SESSION_STORAGE_KEY,
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

afterEach(() => {
  window.sessionStorage.clear();
});

describe('workspace session storage v2', () => {
  it('persists and reads only the current schema v2 write contract', () => {
    const draft = createDraft();
    writeWorkspaceSession({
      version: 2,
      draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 0.8,
    });

    expect(Object.isFrozen(draft)).toBe(false);
    expect(window.sessionStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!))
      .toMatchObject({ version: 2, automaticPlanCheckpoint: null });
    expect(readWorkspaceSession()).toEqual({
      version: 2,
      draft,
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 0.8,
      automaticPlanCheckpoint: null,
    });
  });

  it('migrates v1 without copying any old PVP meaning into qualification', () => {
    const legacyDraft = structuredClone(createDraftWithMember()) as unknown as Record<
      string,
      unknown
    >;
    const members = legacyDraft.members as Array<Record<string, unknown>>;
    const opening = members[0]!.openingState as Record<string, unknown>;
    delete opening.openingQualificationPvp;
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
    expect(migrated?.version).toBe(2);
    expect(migrated?.screen).toBe('SETUP');
    expect(migrated?.draft.activeBundle).toBeNull();
    expect(migrated?.manualPlanDraft).toEqual(manualPlanDraft);
    expect(migrated?.automaticPlanCheckpoint).toBeNull();
    expect(migrated?.draft.members[0]?.openingState).toEqual({
      openingQualificationPvp: '0',
      fortnightPvpOpeningCredit: '700',
      dailyCarryPvp: '300',
      dailyCarryLeft: '20',
      dailyCarryRight: '30',
      openingStateConfirmed: false,
    });
    expect(window.sessionStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!))
      .toMatchObject({ version: 2, screen: 'SETUP', automaticPlanCheckpoint: null });
  });

  it('isolates malformed checkpoint data without discarding setup/manual work', () => {
    const draft = createDraft();
    writeWorkspaceSession({
      version: 2,
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

    const raw = JSON.parse(window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!);
    raw.automaticPlanCheckpoint = 'broken-checkpoint';
    window.sessionStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify(raw));

    const restored = readWorkspaceSession();
    expect(restored?.draft).toEqual(draft);
    expect(restored?.automaticPlanCheckpoint).toBeNull();
    expect(replaceWorkspaceAutomaticPlanCheckpoint(null)).toBe(true);
  });

  it('ignores malformed or unknown v2 data and clears both workspace generations', () => {
    window.sessionStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, '{broken');
    expect(readWorkspaceSession()).toBeNull();
    expect(window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 99, draft: {} }),
    );
    expect(readWorkspaceSession()).toBeNull();

    window.sessionStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY, '{}');
    writeWorkspaceSession({
      version: 2,
      draft: createDraft(),
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 1,
    });
    window.sessionStorage.setItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY, '{}');
    clearWorkspaceSession();
    expect(window.sessionStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)).toBeNull();
  });
});
