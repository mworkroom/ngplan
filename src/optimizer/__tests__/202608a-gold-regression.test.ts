import { describe, expect, it } from 'vitest';
import {
  createAutomaticPlanRequest,
  createProblemFingerprint,
} from '../../application/automatic-plan';
import { normalizeManualPlanDraft } from '../../application/manual-plan';
import { assessWorkerCandidateSources } from '../../application/automatic-plan/select-worker-candidates';
import {
  buildConstructiveCandidateVariants,
  buildCommissionBoundaryCandidateVariants,
  compareAutomaticPlanObjectives,
  verifyAutomaticPlanCandidate,
  type VerifiedAutomaticPlanCandidate,
} from '..';
import {
  AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
  AUGUST_2026_FIRST_HALF_MOTHER_GOLD_DRAFT,
  AUGUST_2026_FIRST_HALF_POLICY_8_BASELINE_DRAFT,
  AUGUST_2026_FIRST_HALF_VERONICA_LEFT_235_BUNDLE,
} from './202608a-regression-fixture';

function requestForFixture(
  bundle: Parameters<typeof createAutomaticPlanRequest>[0] =
    AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
) {
  const outcome = createAutomaticPlanRequest(
    bundle,
  );
  if (outcome.status === 'FAILURE') throw new Error(outcome.error.code);
  return outcome.request;
}

function verifiedDraft(
  draft: Parameters<typeof normalizeManualPlanDraft>[1],
  candidateId: string,
  bundle: Parameters<typeof createAutomaticPlanRequest>[0] =
    AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
): VerifiedAutomaticPlanCandidate {
  const normalized = normalizeManualPlanDraft(
    bundle,
    draft,
  );
  if (normalized.status === 'FAILURE') {
    throw new Error(normalized.issues.map((issue) => issue.code).join(','));
  }
  const request = requestForFixture(bundle);
  const byCell = new Map(normalized.input.allocations.map((cell) => [
    JSON.stringify([cell.date, cell.memberKey]),
    cell,
  ] as const));
  const canonicalAllocations = request.calendar.dates.flatMap((date) =>
    request.canonicalMemberKeys.map((memberKey) => {
      const cell = byCell.get(JSON.stringify([date, memberKey]));
      if (cell === undefined) throw new Error(`missing ${date}/${memberKey}`);
      return cell;
    }));
  const outcome = verifyAutomaticPlanCandidate(
    request,
    {
      problemFingerprint: request.problemFingerprint,
      allocations: canonicalAllocations,
    },
    {
      candidateId,
      sequence: 1,
      foundAtElapsedMs: 0,
    },
  );
  if (outcome.status === 'FAILURE') throw new Error(outcome.error.code);
  return outcome.candidate;
}

function heuristicBest(
  bundle: Parameters<typeof createAutomaticPlanRequest>[0] =
    AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
): VerifiedAutomaticPlanCandidate {
  const request = requestForFixture(bundle);
  const assessment = assessWorkerCandidateSources(
    request,
    buildConstructiveCandidateVariants(request),
  );
  const raw = assessment.publishableCandidates.at(-1);
  if (raw === undefined) {
    throw new Error(JSON.stringify(assessment.firstFailure ?? 'NO_CANDIDATE'));
  }
  const outcome = verifyAutomaticPlanCandidate(
    request,
    raw,
    {
      candidateId: '202608a-heuristic-best',
      sequence: 1,
      foundAtElapsedMs: 0,
    },
  );
  if (outcome.status === 'FAILURE') throw new Error(outcome.error.code);
  return outcome.candidate;
}

function memberEquivalentUnits(
  candidate: VerifiedAutomaticPlanCandidate,
): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries([
    ...candidate.display.highTargetMemberEquivalentUnitCounts,
    ...candidate.display.target700MemberEquivalentUnitCounts,
  ].map((item) => [item.memberKey, item.commissionEquivalentUnits])));
}

describe('202608A approved manual-plan regression', () => {
  it('freezes the approved manual result and the policy-8 comparison copy', () => {
    const gold = verifiedDraft(
      AUGUST_2026_FIRST_HALF_MOTHER_GOLD_DRAFT,
      '202608a-mother-gold',
    );
    const baseline = verifiedDraft(
      AUGUST_2026_FIRST_HALF_POLICY_8_BASELINE_DRAFT,
      '202608a-policy-8-baseline',
    );

    expect(gold.objective).toMatchObject({
      totalNewPv: 23_510,
      confirmedPayoutWon: 6_000_000,
      nonRootCommissionEquivalentUnits: 78,
      rootCommissionGoalShortfallDays: 0,
      discardedExcessPv: 34_355,
    });
    expect(baseline.objective).toMatchObject({
      totalNewPv: 23_500,
      confirmedPayoutWon: 5_640_000,
      rootCommissionGoalShortfallDays: 0,
      discardedExcessPv: 38_315,
    });
    expect(memberEquivalentUnits(gold)).toMatchObject({
      veronica: 8,
      'go-gyusik': 5,
      'kim-jeongmi': 8,
      'karina-kim': 5,
      kelly: 19,
      'nam-seungwoo': 8,
      'kim-gilju': 8,
      siawon: 8,
      'park-jinsook': 9,
    });
  });

  it('protects every basic entitlement and exposes the remaining one-unit search gap deterministically', () => {
    const first = heuristicBest();
    const gold = verifiedDraft(
      AUGUST_2026_FIRST_HALF_MOTHER_GOLD_DRAFT,
      '202608a-mother-gold-comparator',
    );

    expect(first.objective).toMatchObject({
      totalNewPv: 23_500,
      confirmedPayoutWon: 6_000_000,
      nonRootCommissionEquivalentUnits: 77,
      rootCommissionGoalShortfallDays: 0,
      discardedExcessPv: 35_015,
    });
    expect(
      first.objective
        .nonRootBaseEntitlementDescendingEquivalentUnitShortfallVector,
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(compareAutomaticPlanObjectives(gold.objective, first.objective)).toBe(-1);
    expect(memberEquivalentUnits(first)).toEqual({
      veronica: 9,
      'go-gyusik': 5,
      'kim-jeongmi': 8,
      'karina-kim': 5,
      kelly: 18,
      'nam-seungwoo': 8,
      'kim-gilju': 8,
      siawon: 8,
      'park-jinsook': 8,
    });
    expect(
      Object.values(first.calculation.finalAssessmentByMember).every(
        (assessment) => assessment.allTargetsMet,
      ),
    ).toBe(true);
    expect(first.calculation.finalAssessmentByMember['kim-jeongmi']).toMatchObject({
      fortnightSideTarget: 2_500,
      assessedLeft: 2_500,
      leftTargetMet: true,
      allTargetsMet: true,
    });
    expect(createProblemFingerprint(first.allocations)).toBe(
      '3.0.0:fnv1a64-canonical-json-v1:192478ba76417bd3',
    );
  }, 180_000);

  it('measures the corrected Veronica left opening without replacing the historical fixture', () => {
    const historicalRequest = requestForFixture();
    const correctedRequest = requestForFixture(
      AUGUST_2026_FIRST_HALF_VERONICA_LEFT_235_BUNDLE,
    );
    const manual = verifiedDraft(
      AUGUST_2026_FIRST_HALF_MOTHER_GOLD_DRAFT,
      '202608a-mother-corrected-veronica-opening',
      AUGUST_2026_FIRST_HALF_VERONICA_LEFT_235_BUNDLE,
    );
    const heuristic = heuristicBest(
      AUGUST_2026_FIRST_HALF_VERONICA_LEFT_235_BUNDLE,
    );
    const boundaryVariants = buildCommissionBoundaryCandidateVariants(
      correctedRequest,
      heuristic,
      ['kelly'],
    );
    const verifiedBoundaryVariants = boundaryVariants.flatMap(
      (candidate, index) => {
        const outcome = verifyAutomaticPlanCandidate(
          correctedRequest,
          candidate,
          {
            candidateId: `202608a-kelly-boundary-${index + 1}`,
            sequence: index + 1,
            foundAtElapsedMs: 0,
          },
        );
        return outcome.status === 'SUCCESS' ? [outcome.candidate] : [];
      },
    );
    const heuristicUnits = memberEquivalentUnits(heuristic);
    const heuristicKellyUnits = heuristicUnits.kelly ?? 0;
    const kellyImprovedVariants = verifiedBoundaryVariants.filter(
      (candidate) =>
        (memberEquivalentUnits(candidate).kelly ?? 0) > heuristicKellyUnits,
    );

    expect(
      AUGUST_2026_FIRST_HALF_GOLD_BUNDLE.organization.openingStateByMember
        .veronica.dailyCarryLeft,
    ).toBe(0);
    expect(
      AUGUST_2026_FIRST_HALF_VERONICA_LEFT_235_BUNDLE.organization
        .openingStateByMember.veronica.dailyCarryLeft,
    ).toBe(235);
    expect(correctedRequest.problemFingerprint)
      .not.toBe(historicalRequest.problemFingerprint);
    expect(historicalRequest.problemFingerprint).toBe(
      '3.0.0:fnv1a64-canonical-json-v1:603fe4a43ecdad66',
    );
    expect(correctedRequest.problemFingerprint).toBe(
      '3.0.0:fnv1a64-canonical-json-v1:0917b603fdd432a8',
    );
    expect(manual.objective).toMatchObject({
      totalNewPv: 23_510,
      confirmedPayoutWon: 6_060_000,
      nonRootCommissionEquivalentUnits: 79,
      rootCommissionGoalShortfallDays: 0,
      discardedExcessPv: 33_990,
    });
    expect(memberEquivalentUnits(manual)).toEqual({
      veronica: 9,
      'go-gyusik': 5,
      'kim-jeongmi': 8,
      'karina-kim': 5,
      kelly: 19,
      'nam-seungwoo': 8,
      'kim-gilju': 8,
      siawon: 8,
      'park-jinsook': 9,
    });
    expect(heuristic.objective).toMatchObject({
      totalNewPv: 23_500,
      confirmedPayoutWon: 6_000_000,
      nonRootCommissionEquivalentUnits: 78,
      rootCommissionGoalShortfallDays: 0,
      discardedExcessPv: 34_950,
    });
    expect(
      heuristic.objective
        .nonRootBaseEntitlementDescendingEquivalentUnitShortfallVector,
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(heuristicUnits).toEqual({
      veronica: 10,
      'go-gyusik': 5,
      'kim-jeongmi': 8,
      'karina-kim': 5,
      kelly: 18,
      'nam-seungwoo': 8,
      'kim-gilju': 8,
      siawon: 8,
      'park-jinsook': 8,
    });
    expect(compareAutomaticPlanObjectives(
      manual.objective,
      heuristic.objective,
    )).toBe(-1);
    expect(kellyImprovedVariants.length).toBeGreaterThan(0);
    expect(Math.max(...kellyImprovedVariants.map((candidate) =>
      memberEquivalentUnits(candidate).kelly ?? 0))).toBe(19);
    expect(Math.max(
      heuristic.objective.nonRootCommissionEquivalentUnits,
      ...verifiedBoundaryVariants.map((candidate) =>
        candidate.objective.nonRootCommissionEquivalentUnits),
    )).toBe(78);
    expect(kellyImprovedVariants.every((candidate) =>
      candidate.objective
        .nonRootBaseEntitlementDescendingEquivalentUnitShortfallVector
        .some((shortfall) => shortfall > 0),
    )).toBe(true);
    expect(verifiedBoundaryVariants.every((candidate) =>
      compareAutomaticPlanObjectives(
        candidate.objective,
        heuristic.objective,
      ) >= 0,
    )).toBe(true);
  }, 180_000);
});
