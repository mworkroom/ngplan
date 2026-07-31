import type {
  MemberSnapshot,
  OpeningStateInput,
  OrganizationSnapshotInput,
  PeriodInput,
} from '../../engine';
import {
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_FINGERPRINT_VERSION,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_POLICY_VERSION,
  AUTOMATIC_PLAN_REQUEST_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
  deriveCanonicalAutomaticPlanMemberKeys,
  deriveNormalizedAutomaticPlanCalendar,
  type AutomaticPlanRequest,
  type NormalizedOpeningPvpState,
} from '..';

export const JULY_FIRST_HALF: PeriodInput = Object.freeze({
  year: 2026,
  month: 7,
  half: 'FIRST_HALF',
});

export function optimizerMember(
  memberKey: string,
  parentMemberKey: string | null = null,
  sideAtParent: 'LEFT' | 'RIGHT' | null = null,
  pvpTarget: 700 | 1500 | 2400 = 700,
  fortnightSideTarget: 1500 | 2500 = 2500,
): MemberSnapshot {
  return Object.freeze({
    memberKey,
    memberId: `id-${memberKey}`,
    name: memberKey,
    pvpTarget,
    fortnightSideTarget,
    sheetMarker: 'NONE',
    parentMemberKey,
    sideAtParent,
  });
}

export function optimizerOpening(
  overrides: Partial<OpeningStateInput> = {},
): OpeningStateInput {
  return Object.freeze({
    openingQualificationPvp: 0,
    fortnightPvpOpeningCredit: 0,
    dailyCarryPvp: 0,
    dailyCarryLeft: 0,
    dailyCarryRight: 0,
    ...overrides,
  });
}

export function createOptimizerRequest(
  members: readonly MemberSnapshot[] = [optimizerMember('root')],
  openings: Readonly<Record<string, OpeningStateInput>> = Object.freeze({
    root: optimizerOpening(),
  }),
): AutomaticPlanRequest {
  const organization: OrganizationSnapshotInput = Object.freeze({
    snapshotId: 'optimizer-snapshot',
    members: Object.freeze([...members]),
    openingStateByMember: openings,
  });
  const openingPvpByMember = Object.create(null) as Record<
    string,
    NormalizedOpeningPvpState
  >;
  for (const member of members) {
    const opening = openings[member.memberKey]!;
    openingPvpByMember[member.memberKey] = Object.freeze({
      cumulativePvpOpening: opening.openingQualificationPvp,
    });
  }
  return Object.freeze({
    requestVersion: AUTOMATIC_PLAN_REQUEST_VERSION,
    rulesetVersion: AUTOMATIC_PLAN_RULESET_VERSION,
    engineVersion: AUTOMATIC_PLAN_ENGINE_VERSION,
    fingerprintVersion: AUTOMATIC_PLAN_FINGERPRINT_VERSION,
    period: JULY_FIRST_HALF,
    organization,
    policy: Object.freeze({
      policyVersion: AUTOMATIC_PLAN_POLICY_VERSION,
      objectiveVersion: AUTOMATIC_PLAN_OBJECTIVE_VERSION,
      deterministicSeed: 4_204,
    }),
    calendar: deriveNormalizedAutomaticPlanCalendar(JULY_FIRST_HALF),
    canonicalMemberKeys: deriveCanonicalAutomaticPlanMemberKeys(members),
    openingPvpByMember: Object.freeze(openingPvpByMember),
    problemFingerprint: `fingerprint-${members.map((member) => member.memberKey).join('-')}`,
  });
}
