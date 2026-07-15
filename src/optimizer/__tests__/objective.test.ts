import { describe, expect, it } from 'vitest';
import {
  calculatePlan,
  type CalculationResult,
  type DailySettlement,
  type IsoDate,
  type Pv,
} from '../../engine';
import {
  AutomaticPlanRangeError,
  automaticPlanObjectivesEqual,
  buildConstructiveCandidate,
  checkedAddScore,
  compareAutomaticPlanObjectives,
  discardedExcessForSettlement,
  evaluateAutomaticPlanObjective,
  type AutomaticPlanObjectiveVector,
} from '..';
import { createOptimizerRequest } from './fixtures';

function objective(
  overrides: Partial<AutomaticPlanObjectiveVector> = {},
): AutomaticPlanObjectiveVector {
  return {
    totalNewPv: 100,
    confirmedPayoutWon: 0,
    discardedExcessPv: 0,
    highTargetAscendingDayVector: [],
    target700AscendingDayVector: [],
    futureCumulativePvpInvestmentPv: 0,
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

function calculationFixture() {
  const request = createOptimizerRequest();
  const built = buildConstructiveCandidate(request);
  if (built.status !== 'SUCCESS') throw new Error(built.error.message);
  const calculated = calculatePlan({
    period: request.period,
    organization: request.organization,
    allocations: built.candidate.allocations,
  });
  if (calculated.status !== 'SUCCESS') {
    throw new Error(calculated.validation.errors[0]?.message ?? 'calculation failed');
  }
  return {
    request,
    allocations: built.candidate.allocations,
    calculation: calculated.result,
  };
}

describe('Phase 4 canonical objective comparator', () => {
  it('keeps total PV ahead of every lower preference', () => {
    const exact = objective({
      totalNewPv: 39,
      confirmedPayoutWon: 0,
      nonHundredCellCount: 1,
    });
    const rounded = objective({
      totalNewPv: 100,
      confirmedPayoutWon: 480_000,
      nonHundredCellCount: 0,
    });
    expect(compareAutomaticPlanObjectives(exact, rounded)).toBe(-1);
  });

  it('maximizes confirmed payout before minimizing discarded excess', () => {
    const morePayout = objective({
      confirmedPayoutWon: 120_000,
      discardedExcessPv: 999,
    });
    const lessPayout = objective({
      confirmedPayoutWon: 60_000,
      discardedExcessPv: 0,
    });
    expect(compareAutomaticPlanObjectives(morePayout, lessPayout)).toBe(-1);

    const clean = objective({ discardedExcessPv: 0 });
    const waste = objective({
      discardedExcessPv: 1,
      highTargetAscendingDayVector: [14],
    });
    expect(compareAutomaticPlanObjectives(clean, waste)).toBe(-1);
    expect(discardedExcessForSettlement(settlement('FULL_COMMISSION'))).toBe(200);
    expect(discardedExcessForSettlement(settlement('BELOW_QUALIFICATION_SETTLEMENT'))).toBe(0);
    expect(discardedExcessForSettlement(settlement('SKIPPED'))).toBe(0);
  });

  it('compares high-target fairness before target-700 fairness', () => {
    const strongerHighTarget = objective({
      highTargetAscendingDayVector: [8, 9],
      target700AscendingDayVector: [0, 0],
    });
    const strongerTarget700 = objective({
      highTargetAscendingDayVector: [7, 14],
      target700AscendingDayVector: [14, 14],
    });
    expect(
      compareAutomaticPlanObjectives(strongerHighTarget, strongerTarget700),
    ).toBe(-1);
  });

  it('prefers the complete balanced target-700 vector without an eight-day threshold', () => {
    const balanced = objective({
      target700AscendingDayVector: [7, 7, 7],
    });
    const thresholdCount = objective({
      target700AscendingDayVector: [0, 8, 8],
    });
    expect(compareAutomaticPlanObjectives(balanced, thresholdCount)).toBe(-1);
    expect(
      compareAutomaticPlanObjectives(
        objective({ target700AscendingDayVector: [9] }),
        objective({ target700AscendingDayVector: [8] }),
      ),
    ).toBe(-1);
    expect(automaticPlanObjectivesEqual(objective(), objective())).toBe(true);
  });

  it('maximizes cost-neutral future cumulative PVP after both fairness vectors', () => {
    const investment = objective({ futureCumulativePvpInvestmentPv: 100 });
    const noInvestment = objective({ futureCumulativePvpInvestmentPv: 0 });
    expect(compareAutomaticPlanObjectives(investment, noInvestment)).toBe(-1);

    const fairer = objective({
      target700AscendingDayVector: [7],
      futureCumulativePvpInvestmentPv: 0,
    });
    const invested = objective({
      target700AscendingDayVector: [6],
      futureCumulativePvpInvestmentPv: 1_000,
    });
    expect(compareAutomaticPlanObjectives(fairer, invested)).toBe(-1);
  });

  it('then minimizes non-hundred cells and maximum direct PVP', () => {
    const fewerIrregular = objective({
      nonHundredCellCount: 0,
      maxDirectPvp: 300,
    });
    const lowerMaximum = objective({
      nonHundredCellCount: 1,
      maxDirectPvp: 200,
    });
    expect(compareAutomaticPlanObjectives(fewerIrregular, lowerMaximum)).toBe(-1);

    const max200 = objective({
      nonHundredCellCount: 0,
      maxDirectPvp: 200,
      deterministicAllocationVector: [200, 200],
    });
    const max300 = objective({
      nonHundredCellCount: 0,
      maxDirectPvp: 300,
      deterministicAllocationVector: [100, 300],
    });
    expect(compareAutomaticPlanObjectives(max200, max300)).toBe(-1);
    expect(Object.keys(max200)).not.toContain('exactPvp100CellCount');
  });

  it('maximizes the complete canonical allocation vector last', () => {
    const earlier = objective({ deterministicAllocationVector: [100, 0] });
    const later = objective({ deterministicAllocationVector: [0, 100] });
    expect(compareAutomaticPlanObjectives(earlier, later)).toBe(-1);
  });

  it('returns the reverse direction at every scalar and vector tie-break', () => {
    const cases: readonly [
      string,
      Partial<AutomaticPlanObjectiveVector>,
      Partial<AutomaticPlanObjectiveVector>,
    ][] = [
      ['total PV', { totalNewPv: 101 }, { totalNewPv: 100 }],
      ['confirmed payout', { confirmedPayoutWon: 0 }, { confirmedPayoutWon: 1 }],
      ['discarded excess', { discardedExcessPv: 1 }, { discardedExcessPv: 0 }],
      [
        'high-target vector',
        { highTargetAscendingDayVector: [7, 14] },
        { highTargetAscendingDayVector: [8, 8] },
      ],
      [
        'target-700 vector',
        { target700AscendingDayVector: [7, 14] },
        { target700AscendingDayVector: [8, 8] },
      ],
      [
        'future cumulative PVP investment',
        { futureCumulativePvpInvestmentPv: 0 },
        { futureCumulativePvpInvestmentPv: 1 },
      ],
      ['non-hundred cells', { nonHundredCellCount: 1 }, { nonHundredCellCount: 0 }],
      ['maximum direct PVP', { maxDirectPvp: 101 }, { maxDirectPvp: 100 }],
      [
        'deterministic allocation vector',
        { deterministicAllocationVector: [0, 100] },
        { deterministicAllocationVector: [100, 0] },
      ],
    ];

    for (const [label, left, right] of cases) {
      expect(
        compareAutomaticPlanObjectives(objective(left), objective(right)),
        label,
      ).toBe(1);
      expect(
        compareAutomaticPlanObjectives(objective(right), objective(left)),
        `${label} reverse`,
      ).toBe(-1);
    }
  });

  it('uses vector length only after an equal shared prefix', () => {
    const cases: readonly [
      string,
      Partial<AutomaticPlanObjectiveVector>,
      Partial<AutomaticPlanObjectiveVector>,
    ][] = [
      [
        'high-target vector',
        { highTargetAscendingDayVector: [8] },
        { highTargetAscendingDayVector: [8, 9] },
      ],
      [
        'target-700 vector',
        { target700AscendingDayVector: [8] },
        { target700AscendingDayVector: [8, 9] },
      ],
      [
        'deterministic allocation vector',
        { deterministicAllocationVector: [100] },
        { deterministicAllocationVector: [100, 0] },
      ],
    ];

    for (const [label, shorter, longer] of cases) {
      expect(
        compareAutomaticPlanObjectives(objective(longer), objective(shorter)),
        label,
      ).toBe(-1);
      expect(
        compareAutomaticPlanObjectives(objective(shorter), objective(longer)),
        `${label} reverse`,
      ).toBe(1);
    }
  });

  it('rejects fairness vectors that are not sorted ascending', () => {
    expect(() =>
      compareAutomaticPlanObjectives(
        objective({ highTargetAscendingDayVector: [2, 1] }),
        objective(),
      ),
    ).toThrow(TypeError);
    expect(() =>
      compareAutomaticPlanObjectives(
        objective({ target700AscendingDayVector: [2, 1] }),
        objective(),
      ),
    ).toThrow(TypeError);
  });

  it('is antisymmetric, transitive, and total over seeded valid vectors', () => {
    let seed = 17;
    const next = (): number => {
      seed = (seed * 48_271) % 2_147_483_647;
      return seed % 20;
    };
    const values = Array.from({ length: 40 }, () => {
      const highDays = [next() % 10, next() % 10].sort((a, b) => a - b);
      const target700Days = [next() % 10, next() % 10].sort(
        (a, b) => a - b,
      );
      return objective({
        totalNewPv: next(),
        confirmedPayoutWon: next() * 60_000,
        discardedExcessPv: next(),
        highTargetAscendingDayVector: highDays,
        target700AscendingDayVector: target700Days,
        futureCumulativePvpInvestmentPv: next(),
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
      expect(
        compareAutomaticPlanObjectives(sorted[0]!, sorted[2]!),
      ).toBeLessThanOrEqual(0);
    }
  });

  it('evaluates confirmed payouts and future cumulative investment', () => {
    const fixture = calculationFixture();
    const assessment = fixture.calculation.finalAssessmentByMember.root!;
    const withFutureInvestment: CalculationResult = {
      ...fixture.calculation,
      finalAssessmentByMember: {
        ...fixture.calculation.finalAssessmentByMember,
        root: {
          ...assessment,
          personalPvpTotal: 823 as Pv,
        },
      },
    };
    const evaluated = evaluateAutomaticPlanObjective(
      fixture.request,
      fixture.allocations,
      withFutureInvestment,
    );
    expect(evaluated.status).toBe('SUCCESS');
    if (evaluated.status !== 'SUCCESS') return;
    expect(evaluated.objective.futureCumulativePvpInvestmentPv).toBe(123);

    const expectedPayout = Object.values(
      fixture.calculation.dailySettlementByDateAndMember,
    )
      .flatMap((byMember) => Object.values(byMember))
      .reduce((total, daily) => {
        if (daily.settlementKind !== 'FULL_COMMISSION') return total;
        const payout = {
          300: 60_000,
          700: 120_000,
          1500: 240_000,
          2400: 480_000,
        }[daily.commissionTier as 300 | 700 | 1500 | 2400];
        if (payout === undefined) throw new Error('unexpected fixture tier');
        return total + payout;
      }, 0);
    expect(evaluated.objective.confirmedPayoutWon).toBe(expectedPayout);
    expect(evaluated.display.target700MembersAtLeastEight).toBe(
      evaluated.objective.target700AscendingDayVector.filter((days) => days >= 8)
        .length,
    );
    expect(evaluated.objective).not.toHaveProperty(
      'target700MembersAtLeastEight',
    );
  });

  it('fails closed when a full commission uses an unconfirmed payout tier', () => {
    const fixture = calculationFixture();
    const fullEntry = Object.entries(
      fixture.calculation.dailySettlementByDateAndMember,
    )
      .flatMap(([date, byMember]) =>
        Object.entries(byMember).map(([memberKey, daily]) => ({
          date,
          memberKey,
          daily,
        })),
      )
      .find(({ daily }) => daily.settlementKind === 'FULL_COMMISSION');
    if (fullEntry === undefined) throw new Error('fixture has no full commission');
    const withUnknownPayout: CalculationResult = {
      ...fixture.calculation,
      dailySettlementByDateAndMember: {
        ...fixture.calculation.dailySettlementByDateAndMember,
        [fullEntry.date]: {
          ...fixture.calculation.dailySettlementByDateAndMember[fullEntry.date],
          [fullEntry.memberKey]: {
            ...fullEntry.daily,
            commissionTier: 6000,
          },
        },
      },
    };
    expect(
      evaluateAutomaticPlanObjective(
        fixture.request,
        fixture.allocations,
        withUnknownPayout,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_PAYOUT_TABLE_INCOMPLETE',
        location: {
          date: fullEntry.date,
          memberKey: fullEntry.memberKey,
        },
        causeCode: 'UNCONFIRMED_COMMISSION_TIER_6000',
      },
    });
  });

  it('rejects negative zero and checked-score overflow', () => {
    expect(() => objective({ totalNewPv: -0 })).not.toThrow();
    expect(() =>
      compareAutomaticPlanObjectives(
        objective({ totalNewPv: -0 }),
        objective(),
      ),
    ).toThrow(AutomaticPlanRangeError);
    expect(() => checkedAddScore(Number.MAX_SAFE_INTEGER, 1)).toThrow(
      AutomaticPlanRangeError,
    );
  });
});
