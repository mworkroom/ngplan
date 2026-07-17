import { describe, expect, it } from 'vitest';
import type { NormalizedAllocationCell } from '../../engine';
import {
  buildConstructiveCandidateVariants,
  verifyAutomaticPlanCandidate,
} from '..';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

const memberSpecs = [
  ['root', null, null],
  ['left', 'root', 'LEFT'],
  ['right', 'root', 'RIGHT'],
  ['left-left', 'left', 'LEFT'],
  ['left-right', 'left', 'RIGHT'],
  ['right-left', 'right', 'LEFT'],
  ['right-right', 'right', 'RIGHT'],
  ['left-left-left', 'left-left', 'LEFT'],
  ['left-left-right', 'left-left', 'RIGHT'],
  ['left-right-left', 'left-right', 'LEFT'],
  ['left-right-right', 'left-right', 'RIGHT'],
  ['right-left-left', 'right-left', 'LEFT'],
  ['right-left-right', 'right-left', 'RIGHT'],
  ['right-right-left', 'right-right', 'LEFT'],
  ['right-right-right', 'right-right', 'RIGHT'],
] as const;

describe('constructive payout-aligned candidate', () => {
  it('aligns the root direct left and right fields when the root has no children', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 2_400,
      fortnightPvpOpeningCredit: 2_400,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root', null, null, 2_400)],
      Object.freeze({ root: opening }),
    );
    const variants = buildConstructiveCandidateVariants(request);

    expect(variants).toHaveLength(2);
    const aligned = variants[1]!;
    expect(aligned.status).toBe('SUCCESS');
    if (aligned.status !== 'SUCCESS') return;
    expect(aligned.candidate.allocations.some((cell) => cell.selfLeft! > 0)).toBe(true);
    expect(aligned.candidate.allocations.some((cell) => cell.selfRight! > 0)).toBe(true);
  });

  it('keeps the same direct PV while aligning a 22,500-PV root organization at tier 2,400', () => {
    const members = memberSpecs.map(([memberKey, parentMemberKey, sideAtParent]) =>
      optimizerMember(
        memberKey,
        parentMemberKey,
        sideAtParent,
        memberKey === 'root' ? 2_400 : 700,
      ),
    );
    const openings = Object.freeze(Object.fromEntries(
      members.map((member) => [
        member.memberKey,
        member.memberKey === 'root'
          ? optimizerOpening({
              openingQualificationPvp: 2_400,
              fortnightPvpOpeningCredit: 2_400,
            })
          : optimizerOpening(),
      ]),
    ));
    const request = createOptimizerRequest(members, openings);
    const variants = buildConstructiveCandidateVariants(request);

    expect(variants).toHaveLength(2);
    const verified = variants.map((variant, index) => {
      expect(variant.status).toBe('SUCCESS');
      if (variant.status !== 'SUCCESS') throw new Error('constructive variant failed');
      const outcome = verifyAutomaticPlanCandidate(request, variant.candidate, {
        candidateId: `payout-aligned-${index + 1}`,
        sequence: index + 1,
        foundAtElapsedMs: 0,
      });
      expect(outcome.status).toBe('SUCCESS');
      if (outcome.status !== 'SUCCESS') throw new Error(outcome.error.code);
      return outcome.candidate;
    });
    const [staggered, payoutAligned] = verified;

    expect(payoutAligned!.objective.totalNewPv).toBe(staggered!.objective.totalNewPv);
    expect(payoutAligned!.calculation.finalAssessmentByMember.root).toMatchObject({
      rawLeftTotal: 22_500,
      rawRightTotal: 22_500,
    });
    const rootTiers = request.calendar.dates
      .map((date) => payoutAligned!.calculation.dailySettlementByDateAndMember[date]!.root!)
      .filter((settlement) => settlement.settlementKind === 'FULL_COMMISSION')
      .map((settlement) => settlement.commissionTier);
    expect(rootTiers).toContain(2_400);
    expect(payoutAligned!.objective.confirmedPayoutWon)
      .toBeGreaterThan(staggered!.objective.confirmedPayoutWon);
  });

  it('preserves every field total when a large branch exceeds the 2,400-per-day profile', () => {
    const specs: Array<{
      memberKey: string;
      parentMemberKey: string | null;
      sideAtParent: 'LEFT' | 'RIGHT' | null;
      depth: number;
    }> = [{ memberKey: 'root', parentMemberKey: null, sideAtParent: null, depth: 0 }];
    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index]!;
      if (spec.depth === 4) continue;
      specs.push(
        {
          memberKey: `${spec.memberKey}-left`,
          parentMemberKey: spec.memberKey,
          sideAtParent: 'LEFT',
          depth: spec.depth + 1,
        },
        {
          memberKey: `${spec.memberKey}-right`,
          parentMemberKey: spec.memberKey,
          sideAtParent: 'RIGHT',
          depth: spec.depth + 1,
        },
      );
    }
    const members = specs.map((spec) => optimizerMember(
      spec.memberKey,
      spec.parentMemberKey,
      spec.sideAtParent,
      spec.memberKey === 'root' ? 2_400 : 700,
    ));
    const openings = Object.freeze(Object.fromEntries(
      members.map((member) => [
        member.memberKey,
        member.memberKey === 'root'
          ? optimizerOpening({
              openingQualificationPvp: 2_400,
              fortnightPvpOpeningCredit: 2_400,
            })
          : optimizerOpening(),
      ]),
    ));
    const request = createOptimizerRequest(members, openings);
    const variants = buildConstructiveCandidateVariants(request);
    expect(variants).toHaveLength(2);
    const baseline = variants[0]!;
    const aligned = variants[1]!;
    if (baseline.status !== 'SUCCESS' || aligned.status !== 'SUCCESS') {
      throw new Error('constructive variant failed');
    }
    const fieldTotals = (allocations: readonly NormalizedAllocationCell[]) =>
      Object.fromEntries(members.flatMap((member) => [
        ['PVP', allocations.reduce(
          (sum, cell) => sum + (cell.memberKey === member.memberKey ? cell.pvp : 0),
          0,
        )],
        ['SELF_LEFT', allocations.reduce(
          (sum, cell) => sum + (cell.memberKey === member.memberKey ? cell.selfLeft ?? 0 : 0),
          0,
        )],
        ['SELF_RIGHT', allocations.reduce(
          (sum, cell) => sum + (cell.memberKey === member.memberKey ? cell.selfRight ?? 0 : 0),
          0,
        )],
      ].map(([field, total]) => [`${member.memberKey}:${field}`, total])));

    expect(fieldTotals(aligned.candidate.allocations))
      .toEqual(fieldTotals(baseline.candidate.allocations));
  });
});
