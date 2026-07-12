import { describe, expect, it } from 'vitest';
import type { DailySettlement, IsoDate, Pv } from '../../engine';
import {
  AutomaticPlanRangeError,
  automaticPlanObjectivesEqual,
  checkedAddScore,
  compareAutomaticPlanObjectives,
  discardedExcessForSettlement,
  type AutomaticPlanObjectiveVector,
} from '..';

function objective(
  overrides: Partial<AutomaticPlanObjectiveVector> = {},
): AutomaticPlanObjectiveVector {
  return {
    totalNewPv: 100,
    discardedExcessPv: 0,
    target700MembersAtLeastEight: 0,
    target700AscendingDayVector: [],
    nonHundredCellCount: 0,
    maxDirectPvp: 100,
    deterministicAllocationVector: [100, 0, 0],
    ...overrides,
  };
}

function settlement(
  kind: DailySettlement['settlementKind'],
): DailySettlement {
  return {
    date: '2026-07-01' as IsoDate,
    memberKey: 'root',
    businessCalendarMode: kind === 'SKIPPED' ? 'SKIP_NO_INPUT' : 'SETTLE',
    settlementStatus: kind === 'SKIPPED' ? 'SKIPPED' : 'SETTLED',
    carryIn: { pvp: 0 as Pv, left: 0 as Pv, right: 0 as Pv },
    rawPerformance: {
      date: '2026-07-01' as IsoDate,
      memberKey: 'root',
      directPvp: 500 as Pv,
      organizationLeft: 0 as Pv,
      organizationRight: 300 as Pv,
      subtreeTotal: 800 as Pv,
    },
    preSettlement: { pvp: 500 as Pv, left: 0 as Pv, right: 300 as Pv },
    qualificationPvp: (kind === 'FULL_COMMISSION' ? 300 : 299) as Pv,
    qualificationThresholdMet: kind === 'FULL_COMMISSION',
    settlementKind: kind,
    pvpAppliedSide: kind === 'SKIPPED' ? null : 'LEFT',
    pvpApplicationReason: kind === 'SKIPPED' ? null : 'SMALLER_LEFT',
    assessedLeft: kind === 'SKIPPED' ? null : (500 as Pv),
    assessedRight: kind === 'SKIPPED' ? null : (300 as Pv),
    commissionTier:
      kind === 'FULL_COMMISSION' || kind === 'BELOW_QUALIFICATION_SETTLEMENT'
        ? 300
        : null,
    commissionOccurred: kind === 'FULL_COMMISSION',
    carryOut: { pvp: 0 as Pv, left: 0 as Pv, right: 0 as Pv },
  };
}

describe('Phase 4 canonical objective comparator', () => {
  it('OPT-003/004 keeps total PV ahead of every lower preference', () => {
    const exact = objective({ totalNewPv: 39, nonHundredCellCount: 1 });
    const rounded = objective({ totalNewPv: 100, nonHundredCellCount: 0 });
    expect(compareAutomaticPlanObjectives(exact, rounded)).toBe(-1);
  });

  it('OPT-P03 minimizes full-only discarded excess second', () => {
    const clean = objective({ discardedExcessPv: 0, target700MembersAtLeastEight: 0 });
    const waste = objective({
      discardedExcessPv: 1,
      target700MembersAtLeastEight: 10,
      target700AscendingDayVector: Array.from({ length: 10 }, () => 8),
    });
    expect(compareAutomaticPlanObjectives(clean, waste)).toBe(-1);
    expect(discardedExcessForSettlement(settlement('FULL_COMMISSION'))).toBe(200);
    expect(discardedExcessForSettlement(settlement('BELOW_QUALIFICATION_SETTLEMENT'))).toBe(0);
    expect(discardedExcessForSettlement(settlement('SKIPPED'))).toBe(0);
  });

  it('OPT-009 applies the threshold before the ascending vector', () => {
    const threshold = objective({
      target700MembersAtLeastEight: 2,
      target700AscendingDayVector: [0, 8, 8],
    });
    const balanced = objective({
      target700MembersAtLeastEight: 0,
      target700AscendingDayVector: [7, 7, 7],
    });
    expect(compareAutomaticPlanObjectives(threshold, balanced)).toBe(-1);
  });

  it('OPT-P02/011 maximizes the complete ascending vector and accepts empty vectors', () => {
    expect(
      compareAutomaticPlanObjectives(
        objective({
          target700MembersAtLeastEight: 1,
          target700AscendingDayVector: [9],
        }),
        objective({
          target700MembersAtLeastEight: 1,
          target700AscendingDayVector: [8],
        }),
      ),
    ).toBe(-1);
    expect(automaticPlanObjectivesEqual(objective(), objective())).toBe(true);
  });

  it('OPT-005/012/013 has no exact-100 stage and then minimizes max PVP', () => {
    const lowerMaximum = objective({
      totalNewPv: 400,
      nonHundredCellCount: 0,
      maxDirectPvp: 200,
      deterministicAllocationVector: [200, 200],
    });
    const moreExactHundreds = objective({
      totalNewPv: 400,
      nonHundredCellCount: 0,
      maxDirectPvp: 300,
      deterministicAllocationVector: [100, 300],
    });
    expect(compareAutomaticPlanObjectives(lowerMaximum, moreExactHundreds)).toBe(-1);
    expect(Object.keys(lowerMaximum)).not.toContain('exactPvp100CellCount');
  });

  it('OPT-P05 maximizes the complete canonical allocation vector last', () => {
    const earlier = objective({ deterministicAllocationVector: [100, 0] });
    const later = objective({ deterministicAllocationVector: [0, 100] });
    expect(compareAutomaticPlanObjectives(earlier, later)).toBe(-1);
  });

  it('P4-COMP-001 is antisymmetric, transitive, and total over seeded valid vectors', () => {
    let seed = 17;
    const next = (): number => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed % 20;
    };
    const values = Array.from({ length: 40 }, () => {
      const days = [next() % 10, next() % 10].sort((a, b) => a - b);
      return objective({
        totalNewPv: next(),
        discardedExcessPv: next(),
        target700MembersAtLeastEight: days.filter((day) => day >= 8).length,
        target700AscendingDayVector: days,
        nonHundredCellCount: next(),
        maxDirectPvp: next(),
        deterministicAllocationVector: [next(), next()],
      });
    });
    for (const left of values) {
      for (const right of values) {
        expect(
          compareAutomaticPlanObjectives(left, right) +
            compareAutomaticPlanObjectives(right, left),
        ).toBe(0);
      }
    }
    for (let index = 0; index < values.length - 2; index += 1) {
      const sorted = [values[index]!, values[index + 1]!, values[index + 2]!].sort(
        compareAutomaticPlanObjectives,
      );
      expect(compareAutomaticPlanObjectives(sorted[0]!, sorted[2]!)).toBeLessThanOrEqual(0);
    }
  });

  it('OPT-P06 rejects negative zero and checked-score overflow', () => {
    expect(() => objective({ totalNewPv: -0 })).not.toThrow();
    expect(() => compareAutomaticPlanObjectives(objective({ totalNewPv: -0 }), objective())).toThrow(
      AutomaticPlanRangeError,
    );
    expect(() => checkedAddScore(Number.MAX_SAFE_INTEGER, 1)).toThrow(
      AutomaticPlanRangeError,
    );
  });
});
