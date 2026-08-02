import { describe, expect, it } from 'vitest';
import {
  createAutomaticPlanRequest,
  createProblemFingerprint,
} from '../../application/automatic-plan';
import { normalizeManualPlanDraft } from '../../application/manual-plan';
import { assessWorkerCandidateSources } from '../../application/automatic-plan/select-worker-candidates';
import {
  buildConstructiveCandidateVariants,
  verifyAutomaticPlanCandidate,
  type VerifiedAutomaticPlanCandidate,
} from '..';
import {
  AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
  AUGUST_2026_FIRST_HALF_MOTHER_GOLD_DRAFT,
  AUGUST_2026_FIRST_HALF_POLICY_8_BASELINE_DRAFT,
} from './202608a-regression-fixture';

function requestForFixture() {
  const outcome = createAutomaticPlanRequest(
    AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
  );
  if (outcome.status === 'FAILURE') throw new Error(outcome.error.code);
  return outcome.request;
}

function verifiedDraft(
  draft: Parameters<typeof normalizeManualPlanDraft>[1],
  candidateId: string,
): VerifiedAutomaticPlanCandidate {
  const normalized = normalizeManualPlanDraft(
    AUGUST_2026_FIRST_HALF_GOLD_BUNDLE,
    draft,
  );
  if (normalized.status === 'FAILURE') {
    throw new Error(normalized.issues.map((issue) => issue.code).join(','));
  }
  const request = requestForFixture();
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

function heuristicBest(): VerifiedAutomaticPlanCandidate {
  const request = requestForFixture();
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

  it('beats the approved payout, preserves every period target, and remains deterministic', () => {
    const first = heuristicBest();

    expect(first.objective).toMatchObject({
      totalNewPv: 23_500,
      confirmedPayoutWon: 6_060_000,
      rootCommissionGoalShortfallDays: 0,
      discardedExcessPv: 32_756,
    });
    expect(memberEquivalentUnits(first)).toEqual({
      veronica: 10,
      'go-gyusik': 5,
      'kim-jeongmi': 7,
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
      newPvpTotal: 200,
      rawLeftTotal: 2_300,
      assessedLeft: 2_500,
      leftTargetMet: true,
      allTargetsMet: true,
    });
    expect(createProblemFingerprint(first.allocations)).toBe(
      '3.0.0:fnv1a64-canonical-json-v1:dcf9dc632d750079',
    );
  }, 180_000);
});
