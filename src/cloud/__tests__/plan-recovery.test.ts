import { describe, expect, it } from 'vitest';
import {
  addRootMember,
  createProjectDraft,
  type IdGenerator,
} from '../../application/project-setup';
import {
  createPeriodCopySession,
  createRecoveryCopySession,
  deriveRecommendedPlanningPeriod,
  formatPlanningPeriodRange,
  isValidPlanningPeriod,
  manualPlanDraftHasEnteredValues,
} from '../plan-recovery';
import { cloudDocumentFromWorkspaceSession } from '../cloud-plan-document';
import {
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../../ui/workspace-session-storage';

const sourceIds: IdGenerator = (kind) =>
  kind === 'PROJECT' ? 'source-project' : `${kind.toLowerCase()}-source`;

function sourceSession(): WorkspaceSessionSnapshot {
  const withRoot = addRootMember(
    createProjectDraft({
      year: 2026,
      month: 7,
      half: 'SECOND_HALF',
      generateId: sourceIds,
    }),
    'root',
  );
  if (withRoot.status !== 'SUCCESS') {
    throw new Error(withRoot.error.message);
  }
  return {
    version: WORKSPACE_SESSION_VERSION,
    draft: withRoot.draft,
    manualPlanDraft: {
      cells: [{ date: '2026-07-16', memberKey: 'root', pvp: '123' }],
    },
    screen: 'SETUP',
    organizationScale: 0.8,
    automaticPlanCheckpoint: { candidate: true },
  };
}

describe('plan recovery rules', () => {
  it('recommends the next Sao Paulo half instead of silently using today', () => {
    expect(
      deriveRecommendedPlanningPeriod(new Date('2026-07-31T15:00:00.000Z')),
    ).toEqual({ year: 2026, month: 8, half: 'FIRST_HALF' });
    expect(
      deriveRecommendedPlanningPeriod(new Date('2026-08-10T15:00:00.000Z')),
    ).toEqual({ year: 2026, month: 8, half: 'SECOND_HALF' });
    expect(
      deriveRecommendedPlanningPeriod(new Date('2026-12-31T15:00:00.000Z')),
    ).toEqual({ year: 2027, month: 1, half: 'FIRST_HALF' });
  });

  it('validates and formats explicit calendar ranges', () => {
    expect(
      formatPlanningPeriodRange({
        year: 2028,
        month: 2,
        half: 'SECOND_HALF',
      }),
    ).toBe('2028년 2월 16일–29일');
    expect(
      formatPlanningPeriodRange({
        year: 2026,
        month: 8,
        half: 'FIRST_HALF',
      }),
    ).toBe('2026년 8월 1일–15일');
    expect(
      isValidPlanningPeriod({ year: 2026, month: 12, half: 'FIRST_HALF' }),
    ).toBe(true);
    expect(
      isValidPlanningPeriod({ year: 1999, month: 13, half: 'FIRST_HALF' }),
    ).toBe(false);
  });

  it('distinguishes blank or skipped zero cells from entered values', () => {
    expect(manualPlanDraftHasEnteredValues(null)).toBe(false);
    expect(
      manualPlanDraftHasEnteredValues({
        cells: [{ date: '2026-07-20', memberKey: 'root', pvp: '0' }],
      }),
    ).toBe(false);
    expect(
      manualPlanDraftHasEnteredValues({
        cells: [{ date: '2026-07-20', memberKey: 'root', pvp: ' 12 ' }],
      }),
    ).toBe(true);
    expect(
      manualPlanDraftHasEnteredValues({
        cells: [{ date: '2026-07-20', memberKey: 'root', pvp: '잘못된 값' }],
      }),
    ).toBe(true);
  });

  it('creates a new-period shell without moving date-bound numbers', () => {
    const original = sourceSession();
    const source = {
      ...original,
      draft: {
        ...original.draft,
        members: original.draft.members.map((member) => ({
          ...member,
          fortnightSideTarget: '1500',
        })),
      },
    };
    const copy = createPeriodCopySession(
      source,
      { year: 2026, month: 8, half: 'FIRST_HALF' },
      { projectId: 'period-copy', organizationSnapshotId: 'org-copy' },
    );
    expect(copy).toMatchObject({
      draft: {
        projectId: 'period-copy',
        organizationSnapshotId: 'org-copy',
        year: '2026',
        month: '8',
        half: 'FIRST_HALF',
        title: '202608A',
        activeBundle: null,
      },
      manualPlanDraft: null,
      screen: 'SETUP',
      organizationScale: 0.8,
      automaticPlanCheckpoint: null,
    });
    expect(source.manualPlanDraft?.cells[0]?.pvp).toBe('123');
    expect(copy.draft.members.every(
      (member) => member.fortnightSideTarget === '2500',
    )).toBe(true);
  });

  it('opens a recovery point as a separately identified plan copy', () => {
    const source = sourceSession();
    const copy = createRecoveryCopySession(
      cloudDocumentFromWorkspaceSession(source),
      { projectId: 'recovery-copy', organizationSnapshotId: 'recovery-org' },
    );
    expect(copy.draft).toMatchObject({
      projectId: 'recovery-copy',
      organizationSnapshotId: 'recovery-org',
      title: '202607B · 이전 내용',
      titleSource: 'MANUAL',
      activeBundle: null,
    });
    expect(copy.manualPlanDraft?.cells[0]?.pvp).toBe('123');
    expect(copy.screen).toBe('SETUP');
  });
});
