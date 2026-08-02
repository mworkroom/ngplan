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
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

function objective(
  overrides: Partial<AutomaticPlanObjectiveVector> = {},
): AutomaticPlanObjectiveVector {
  return {
    rootCommissionGoalShortfallDays: 0,
    totalNewPv: 100,
    confirmedPayoutWon: 0,
    discardedExcessPv: 0,
    highTargetDescendingEquivalentUnitShortfallVector: [],
    target700DescendingEquivalentUnitShortfallVector: [],
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
  it('maximizes payout, then minimizes total PV after preserving the root goal', () => {
    const structuralMinimum = objective({
      totalNewPv: 100,
      confirmedPayoutWon: 60_000,
    });
    const tenPvFinishingGain = objective({
      totalNewPv: 110,
      confirmedPayoutWon: 120_000,
      nonHundredCellCount: 1,
    });
    expect(
      compareAutomaticPlanObjectives(tenPvFinishingGain, structuralMinimum),
    ).toBe(-1);

    const samePayoutHigherTotal = objective({
      totalNewPv: 101,
      confirmedPayoutWon: 120_000,
    });
    const samePayoutLowerTotal = objective({
      totalNewPv: 100,
      confirmedPayoutWon: 120_000,
    });
    expect(
      compareAutomaticPlanObjectives(samePayoutLowerTotal, samePayoutHigherTotal),
    ).toBe(-1);
  });

  it('keeps the capacity-aware root goal ahead of payout and total PV', () => {
    const lowerTotalWithShortfall = objective({
      totalNewPv: 99,
      rootCommissionGoalShortfallDays: 1,
      confirmedPayoutWon: 60_000,
    });
    const higherTotalWithoutShortfall = objective({
      totalNewPv: 100,
      rootCommissionGoalShortfallDays: 0,
      confirmedPayoutWon: 60_000,
    });
    expect(
      compareAutomaticPlanObjectives(lowerTotalWithShortfall, higherTotalWithoutShortfall),
    ).toBe(1);

    const goalMet = objective({
      rootCommissionGoalShortfallDays: 0,
      confirmedPayoutWon: 60_000,
    });
    const samePayoutWithShortfall = objective({
      rootCommissionGoalShortfallDays: 1,
      confirmedPayoutWon: 60_000,
    });
    expect(compareAutomaticPlanObjectives(goalMet, samePayoutWithShortfall)).toBe(-1);

    const morePayoutWithShortfall = objective({
      rootCommissionGoalShortfallDays: 1,
      confirmedPayoutWon: 120_000,
    });
    expect(compareAutomaticPlanObjectives(goalMet, morePayoutWithShortfall)).toBe(-1);
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
      highTargetDescendingEquivalentUnitShortfallVector: [0],
    });
    expect(compareAutomaticPlanObjectives(clean, waste)).toBe(-1);
    expect(discardedExcessForSettlement(settlement('FULL_COMMISSION'))).toBe(200);
    expect(discardedExcessForSettlement(settlement('BELOW_QUALIFICATION_SETTLEMENT'))).toBe(0);
    expect(discardedExcessForSettlement(settlement('SKIPPED'))).toBe(0);
  });

  it('compares high-target shortfall before target-700 shortfall', () => {
    const strongerHighTarget = objective({
      highTargetDescendingEquivalentUnitShortfallVector: [1, 1],
      target700DescendingEquivalentUnitShortfallVector: [8, 8],
    });
    const strongerTarget700 = objective({
      highTargetDescendingEquivalentUnitShortfallVector: [2, 0],
      target700DescendingEquivalentUnitShortfallVector: [0, 0],
    });
    expect(
      compareAutomaticPlanObjectives(strongerHighTarget, strongerTarget700),
    ).toBe(-1);
  });

  it('prefers the smaller worst target-700 shortfall without a hard threshold', () => {
    const balanced = objective({
      target700DescendingEquivalentUnitShortfallVector: [1, 1, 1],
    });
    const thresholdCount = objective({
      target700DescendingEquivalentUnitShortfallVector: [8, 0, 0],
    });
    expect(compareAutomaticPlanObjectives(balanced, thresholdCount)).toBe(-1);
    expect(
      compareAutomaticPlanObjectives(
        objective({ target700DescendingEquivalentUnitShortfallVector: [0] }),
        objective({ target700DescendingEquivalentUnitShortfallVector: [1] }),
      ),
    ).toBe(-1);
    expect(automaticPlanObjectivesEqual(objective(), objective())).toBe(true);
  });

  it('maximizes cost-neutral future cumulative PVP after both shortfall vectors', () => {
    const investment = objective({ futureCumulativePvpInvestmentPv: 100 });
    const noInvestment = objective({ futureCumulativePvpInvestmentPv: 0 });
    expect(compareAutomaticPlanObjectives(investment, noInvestment)).toBe(-1);

    const fairer = objective({
      target700DescendingEquivalentUnitShortfallVector: [1],
      futureCumulativePvpInvestmentPv: 0,
    });
    const invested = objective({
      target700DescendingEquivalentUnitShortfallVector: [2],
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
      [
        'root commission goal shortfall',
        { rootCommissionGoalShortfallDays: 1 },
        { rootCommissionGoalShortfallDays: 0 },
      ],
      ['confirmed payout', { confirmedPayoutWon: 0 }, { confirmedPayoutWon: 1 }],
      ['discarded excess', { discardedExcessPv: 1 }, { discardedExcessPv: 0 }],
      [
        'high-target shortfall vector',
        { highTargetDescendingEquivalentUnitShortfallVector: [3, 0] },
        { highTargetDescendingEquivalentUnitShortfallVector: [2, 2] },
      ],
      [
        'target-700 shortfall vector',
        { target700DescendingEquivalentUnitShortfallVector: [3, 0] },
        { target700DescendingEquivalentUnitShortfallVector: [2, 2] },
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
        'high-target shortfall vector',
        { highTargetDescendingEquivalentUnitShortfallVector: [8] },
        { highTargetDescendingEquivalentUnitShortfallVector: [8, 7] },
      ],
      [
        'target-700 shortfall vector',
        { target700DescendingEquivalentUnitShortfallVector: [8] },
        { target700DescendingEquivalentUnitShortfallVector: [8, 7] },
      ],
      [
        'deterministic allocation vector',
        { deterministicAllocationVector: [100] },
        { deterministicAllocationVector: [100, 0] },
      ],
    ];

    for (const [label, shorter, longer] of cases) {
      const vectorIsAllocation = label === 'deterministic allocation vector';
      expect(
        compareAutomaticPlanObjectives(
          objective(vectorIsAllocation ? longer : shorter),
          objective(vectorIsAllocation ? shorter : longer),
        ),
        label,
      ).toBe(-1);
      expect(
        compareAutomaticPlanObjectives(
          objective(vectorIsAllocation ? shorter : longer),
          objective(vectorIsAllocation ? longer : shorter),
        ),
        `${label} reverse`,
      ).toBe(1);
    }
  });

  it('rejects shortfall vectors that are not sorted descending', () => {
    expect(() =>
      compareAutomaticPlanObjectives(
        objective({ highTargetDescendingEquivalentUnitShortfallVector: [1, 2] }),
        objective(),
      ),
    ).toThrow(TypeError);
    expect(() =>
      compareAutomaticPlanObjectives(
        objective({ target700DescendingEquivalentUnitShortfallVector: [1, 2] }),
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
      const highShortfall = [next() % 10, next() % 10].sort((a, b) => b - a);
      const target700Shortfall = [next() % 10, next() % 10].sort(
        (a, b) => b - a,
      );
      return objective({
        totalNewPv: next(),
        confirmedPayoutWon: next() * 60_000,
        discardedExcessPv: next(),
        highTargetDescendingEquivalentUnitShortfallVector: highShortfall,
        target700DescendingEquivalentUnitShortfallVector: target700Shortfall,
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
    expect(evaluated.display.target700MembersAtLeastEightEquivalentUnits).toBe(
      evaluated.display.target700MemberEquivalentUnitCounts.filter(
        (item) => item.commissionEquivalentUnits >= 8,
      ).length,
    );
    expect(evaluated.objective).not.toHaveProperty(
      'target700MembersAtLeastEightEquivalentUnits',
    );
  });

  it('keeps a 1,500 side-target member out of the 2,500-only eight-unit display count', () => {
    const members = [
      optimizerMember('root', null, null, 700, 2_500),
      optimizerMember('member-1500', 'root', 'LEFT', 700, 1_500),
    ];
    const achieved = optimizerOpening({
      openingQualificationPvp: 700,
      fortnightPvpOpeningCredit: 700,
    });
    const request = createOptimizerRequest(
      members,
      Object.freeze({ root: achieved, 'member-1500': achieved }),
    );
    const built = buildConstructiveCandidate(request);
    expect(built.status).toBe('SUCCESS');
    if (built.status !== 'SUCCESS') return;
    const calculated = calculatePlan({
      period: request.period,
      organization: request.organization,
      allocations: built.candidate.allocations,
    });
    expect(calculated.status).toBe('SUCCESS');
    if (calculated.status !== 'SUCCESS') return;

    const commissionDate = request.calendar.dates.find(
      (date) =>
        calculated.result.dailySettlementByDateAndMember[date]?.['member-1500']
          ?.settlementKind === 'FULL_COMMISSION',
    );
    expect(commissionDate).toBeDefined();
    if (commissionDate === undefined) return;
    const original = calculated.result.dailySettlementByDateAndMember[commissionDate]![
      'member-1500'
    ]!;
    const calculationWithEightUnitTier: CalculationResult = {
      ...calculated.result,
      dailySettlementByDateAndMember: {
        ...calculated.result.dailySettlementByDateAndMember,
        [commissionDate]: {
          ...calculated.result.dailySettlementByDateAndMember[commissionDate],
          'member-1500': {
            ...original,
            preSettlement: {
              pvp: 2_400 as Pv,
              left: 2_400 as Pv,
              right: 0 as Pv,
            },
            assessedLeft: 2_400 as Pv,
            assessedRight: 2_400 as Pv,
            commissionTier: 2_400,
          },
        },
      },
    };

    const evaluated = evaluateAutomaticPlanObjective(
      request,
      built.candidate.allocations,
      calculationWithEightUnitTier,
    );
    expect(evaluated.status).toBe('SUCCESS');
    if (evaluated.status !== 'SUCCESS') return;
    expect(
      evaluated.display.target700MemberEquivalentUnitCounts.find(
        (item) => item.memberKey === 'member-1500',
      )?.commissionEquivalentUnits,
    ).toBeGreaterThanOrEqual(8);
    expect(evaluated.display.target700MembersAtLeastEightEquivalentUnits).toBe(0);
  });

  it('uses 1·2·4·8 equivalent units rather than occurrence days in shortfall metrics', () => {
    const members = [
      optimizerMember('root', null, null, 2400),
      optimizerMember('priority', 'root', 'LEFT', 700),
    ];
    const request = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening({
        openingQualificationPvp: 2_400,
        fortnightPvpOpeningCredit: 2_400,
      }),
      priority: optimizerOpening({
        openingQualificationPvp: 700,
        fortnightPvpOpeningCredit: 700,
      }),
    }));
    const built = buildConstructiveCandidate(request);
    expect(built.status).toBe('SUCCESS');
    if (built.status !== 'SUCCESS') return;
    const calculated = calculatePlan({
      period: request.period,
      organization: request.organization,
      allocations: built.candidate.allocations,
    });
    expect(calculated.status).toBe('SUCCESS');
    if (calculated.status !== 'SUCCESS') return;

    const tiers = [300, 700, 1500, 2400] as const;
    const settledDates = request.calendar.dates.filter(
      (date) => calculated.result.dailySettlementByDateAndMember[date]?.priority
        ?.settlementStatus === 'SETTLED',
    );
    const tierByDate = new Map(
      settledDates.slice(0, tiers.length).map((date, index) => [date, tiers[index]!] as const),
    );
    const calculationWithKnownTiers: CalculationResult = {
      ...calculated.result,
      dailySettlementByDateAndMember: Object.freeze(Object.fromEntries(
        Object.entries(calculated.result.dailySettlementByDateAndMember).map(
          ([date, byMember]) => {
            const original = byMember.priority!;
            if (original.settlementStatus === 'SKIPPED') return [date, byMember];
            const tier = tierByDate.get(date as IsoDate);
            const priority: DailySettlement = tier === undefined
              ? {
                  ...original,
                  settlementKind: 'NO_COMMISSION',
                  commissionTier: null,
                  commissionOccurred: false,
                }
              : {
                  ...original,
                  preSettlement: { pvp: 0 as Pv, left: tier as Pv, right: tier as Pv },
                  assessedLeft: tier as Pv,
                  assessedRight: tier as Pv,
                  settlementKind: 'FULL_COMMISSION',
                  commissionTier: tier,
                  commissionOccurred: true,
                };
            return [date, Object.freeze({ ...byMember, priority })];
          },
        ),
      )),
    };
    const evaluated = evaluateAutomaticPlanObjective(
      request,
      built.candidate.allocations,
      calculationWithKnownTiers,
    );

    expect(evaluated.status).toBe('SUCCESS');
    if (evaluated.status !== 'SUCCESS') return;
    expect(evaluated.objective.target700DescendingEquivalentUnitShortfallVector)
      .toEqual([0]);
    expect(evaluated.display.target700MemberEquivalentUnitCounts).toEqual([
      expect.objectContaining({
        memberKey: 'priority',
        commissionEquivalentUnits: 15,
        attainableEquivalentUnits: 8,
        equivalentUnitShortfall: 0,
      }),
    ]);
  });

  it('derives fairness groups from targets and ignores sheet markers and topology depth', () => {
    const members = [
      { ...optimizerMember('root', null, null, 2400), sheetMarker: 'BLUE_3' as const },
      { ...optimizerMember('depth-2', 'root', 'LEFT', 700), sheetMarker: 'PURPLE_4' as const },
      { ...optimizerMember('depth-3', 'depth-2', 'LEFT', 1500), sheetMarker: 'NONE' as const },
      { ...optimizerMember('depth-4', 'depth-3', 'LEFT', 2400), sheetMarker: 'PINK_1' as const },
    ];
    const achievedOpening = optimizerOpening({
      openingQualificationPvp: 2_400,
      fortnightPvpOpeningCredit: 2_400,
    });
    const request = createOptimizerRequest(
      members,
      Object.freeze(Object.fromEntries(
        members.map((member) => [member.memberKey, achievedOpening]),
      )),
    );
    const built = buildConstructiveCandidate(request);
    expect(built.status).toBe('SUCCESS');
    if (built.status !== 'SUCCESS') return;
    const calculated = calculatePlan({
      period: request.period,
      organization: request.organization,
      allocations: built.candidate.allocations,
    });
    expect(calculated.status).toBe('SUCCESS');
    if (calculated.status !== 'SUCCESS') return;
    const evaluated = evaluateAutomaticPlanObjective(
      request,
      built.candidate.allocations,
      calculated.result,
    );
    expect(evaluated.status).toBe('SUCCESS');
    if (evaluated.status !== 'SUCCESS') return;

    expect(evaluated.display.highTargetMemberEquivalentUnitCounts.map((item) => item.memberKey))
      .toEqual(['depth-3', 'depth-4']);
    expect(evaluated.objective.highTargetDescendingEquivalentUnitShortfallVector)
      .toHaveLength(2);
    expect(evaluated.display.target700MemberEquivalentUnitCounts.map((item) => item.memberKey))
      .toEqual(['depth-2']);
    expect(evaluated.objective.target700DescendingEquivalentUnitShortfallVector)
      .toHaveLength(1);
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
