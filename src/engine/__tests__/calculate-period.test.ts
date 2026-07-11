import { describe, expect, test } from 'vitest';

import { DEFAULT_RULE_SET } from '../../domain/constants';
import type {
  CalculatePlanInput,
  CalculationResult,
  CommissionTier,
} from '../../domain/types';
import { deepFreeze, makePlanInput, member } from '../../test-support/fixtures';
import { calculatePlan } from '../calculate-period';

function calculate(input: CalculatePlanInput): CalculationResult {
  const outcome = calculatePlan(input);
  expect(outcome.status).toBe('SUCCESS');
  if (outcome.status !== 'SUCCESS') {
    throw new Error(JSON.stringify(outcome.validation.errors));
  }
  return outcome.result;
}

describe('calculatePlan', () => {
  test('[DAY-003] combines prior carry with next-day raw performance', () => {
    const result = calculate(
      makePlanInput({
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 100, selfLeft: 200, selfRight: 100 },
          { date: '2026-07-02', memberKey: 'A', pvp: 0, selfLeft: 0, selfRight: 200 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A!.carryOut).toEqual({
      pvp: 100,
      left: 200,
      right: 100,
    });
    expect(result.dailySettlementByDateAndMember['2026-07-02']!.A).toMatchObject({
      preSettlement: { pvp: 100, left: 200, right: 300 },
      assessedLeft: 300,
      assessedRight: 300,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  test('[DAY-009] reselects the smaller side for carried PVP', () => {
    const result = calculate(
      makePlanInput({
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 100, selfLeft: 100, selfRight: 250 },
          { date: '2026-07-02', memberKey: 'A', pvp: 0, selfLeft: 200, selfRight: 0 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-02']!.A).toMatchObject({
      preSettlement: { pvp: 100, left: 300, right: 250 },
      pvpAppliedSide: 'RIGHT',
      assessedLeft: 300,
      assessedRight: 350,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  test('[DAY-010] preserves fortnight raw totals after a daily reset', () => {
    const result = calculate(
      makePlanInput({
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 100, selfLeft: 200, selfRight: 300 },
          { date: '2026-07-02', memberKey: 'A', pvp: 100, selfLeft: 100, selfRight: 0 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A!.commissionTier).toBe(300);
    expect(result.finalAssessmentByMember.A).toMatchObject({
      newPvpTotal: 200,
      rawLeftTotal: 300,
      rawRightTotal: 300,
    });
  });

  test('[DAY-P01] never repropagates child carry to its parent', () => {
    const members = [member('A'), member('B', 'A', 'LEFT')];
    const result = calculate(
      makePlanInput({
        members,
        allocations: [
          { date: '2026-07-01', memberKey: 'B', pvp: 100, selfLeft: 200, selfRight: 100 },
        ],
      }),
    );

    expect(result.rawPerformanceByDateAndMember['2026-07-01']!.A!.organizationLeft).toBe(400);
    expect(result.rawPerformanceByDateAndMember['2026-07-02']!.A!.organizationLeft).toBe(0);
    expect(result.dailySettlementByDateAndMember['2026-07-02']!.A).toMatchObject({
      carryIn: { pvp: 0, left: 400, right: 0 },
      preSettlement: { pvp: 0, left: 400, right: 0 },
    });
  });

  test('[DAY-P02] preserves parent raw performance after child reset', () => {
    const result = calculate(
      makePlanInput({
        members: [member('A'), member('B', 'A', 'LEFT')],
        allocations: [
          { date: '2026-07-01', memberKey: 'B', pvp: 100, selfLeft: 200, selfRight: 300 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.B).toMatchObject({
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(result.rawPerformanceByDateAndMember['2026-07-01']!.A!.organizationLeft).toBe(600);
  });

  test('[ORG-002] propagates a multi-level chain through the full pipeline', () => {
    const result = calculate(
      makePlanInput({
        members: [
          member('A'),
          member('B', 'A', 'LEFT'),
          member('C', 'B', 'LEFT'),
        ],
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 25, selfRight: 50 },
          { date: '2026-07-01', memberKey: 'B', pvp: 50, selfRight: 100 },
          { date: '2026-07-01', memberKey: 'C', pvp: 100, selfLeft: 200, selfRight: 300 },
        ],
      }),
    );

    expect(result.rawPerformanceByDateAndMember['2026-07-01']).toMatchObject({
      C: { subtreeTotal: 600 },
      B: { organizationLeft: 600, subtreeTotal: 750 },
      A: { directPvp: 25, organizationLeft: 750, organizationRight: 50, subtreeTotal: 825 },
    });
  });

  test('[ORG-006] keeps child PVP out of the parent personal target', () => {
    const result = calculate(
      makePlanInput({
        members: [member('A'), member('B', 'A', 'LEFT')],
        allocations: [
          { date: '2026-07-01', memberKey: 'B', pvp: 700, selfLeft: 0, selfRight: 0 },
        ],
      }),
    );

    expect(result.rawPerformanceByDateAndMember['2026-07-01']!.A).toMatchObject({
      directPvp: 0,
      organizationLeft: 700,
    });
    expect(result.finalAssessmentByMember.A).toMatchObject({
      newPvpTotal: 0,
      personalPvpTotal: 0,
      remainingPvp: 700,
    });
  });

  test('[HALF-P03] excludes daily PVP opening carry from fortnight totals', () => {
    const result = calculate(
      makePlanInput({
        opening: { A: { dailyCarryPvp: 300 } },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 400, selfLeft: 0, selfRight: 0 },
        ],
      }),
    );

    expect(result.finalAssessmentByMember.A).toMatchObject({
      newPvpTotal: 400,
      personalPvpTotal: 400,
      periodPvpForSide: 400,
      remainingPvp: 300,
    });
  });

  test('[HALF-P04] keeps fortnight opening PVP local to its member', () => {
    const result = calculate(
      makePlanInput({
        members: [member('A'), member('B', 'A', 'LEFT')],
        opening: { B: { fortnightPvpOpeningCredit: 300 } },
      }),
    );

    expect(result.finalAssessmentByMember.B).toMatchObject({
      personalPvpTotal: 300,
      periodPvpForSide: 300,
      assessedLeft: 300,
      assessedRight: 0,
    });
    expect(result.finalAssessmentByMember.A!.rawLeftTotal).toBe(0);
  });

  test('[OPEN-001] separates the four opening-state roles', () => {
    const input = makePlanInput({
      opening: {
        A: {
          fortnightPvpOpeningCredit: 300,
          dailyCarryPvp: 100,
          dailyCarryLeft: 200,
          dailyCarryRight: 100,
        },
      },
      allocations: [
        { date: '2026-07-01', memberKey: 'A', pvp: 400, selfLeft: 0, selfRight: 200 },
      ],
    });
    const result = calculate(input);

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A).toMatchObject({
      preSettlement: { pvp: 500, left: 200, right: 300 },
      assessedLeft: 700,
      assessedRight: 300,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(result.finalAssessmentByMember.A).toMatchObject({
      personalPvpTotal: 700,
      newPvpTotal: 400,
      rawLeftTotal: 0,
      rawRightTotal: 200,
      personalPvpTargetMet: true,
    });
  });

  test('[OPEN-P01] applies only opening credit plus new PVP at fortnight close', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: { fortnightPvpOpeningCredit: 300, dailyCarryPvp: 100 },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 400, selfLeft: 0, selfRight: 200 },
        ],
      }),
    );

    expect(result.finalAssessmentByMember.A).toMatchObject({
      periodPvpForSide: 700,
      pvpAppliedSide: 'LEFT',
      assessedLeft: 700,
      assessedRight: 200,
      sideTargetsMet: false,
    });
  });

  test('[CAL-004] carries Saturday balance through skipped Sunday into Monday', () => {
    const result = calculate(
      makePlanInput({
        allocations: [
          { date: '2026-07-11', memberKey: 'A', pvp: 100, selfLeft: 200, selfRight: 100 },
          { date: '2026-07-13', memberKey: 'A', pvp: 0, selfLeft: 0, selfRight: 200 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-12']!.A).toMatchObject({
      businessCalendarMode: 'SKIP_NO_INPUT',
      settlementStatus: 'SKIPPED',
      carryIn: { pvp: 100, left: 200, right: 100 },
      carryOut: { pvp: 100, left: 200, right: 100 },
      pvpAppliedSide: null,
      assessedLeft: null,
      assessedRight: null,
      commissionTier: null,
      commissionOccurred: false,
    });
    expect(result.dailySettlementByDateAndMember['2026-07-13']!.A).toMatchObject({
      preSettlement: { pvp: 100, left: 200, right: 300 },
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  test('[CAL-P01] preserves every Sunday as a skipped audit row', () => {
    const result = calculate(makePlanInput());

    for (const date of ['2026-07-05', '2026-07-12']) {
      expect(result.rawPerformanceByDateAndMember[date]!.A!.subtreeTotal).toBe(0);
      expect(result.dailySettlementByDateAndMember[date]!.A).toMatchObject({
        businessCalendarMode: 'SKIP_NO_INPUT',
        settlementStatus: 'SKIPPED',
        pvpAppliedSide: null,
        commissionOccurred: false,
      });
      expect(result.runningFortnightByDateAndMember[date]!.A).toBeDefined();
    }
  });

  test('[CAL-P02] retains final-Sunday carry and audit date', () => {
    const result = calculate(
      makePlanInput({
        year: 2026,
        month: 11,
        allocations: [
          { date: '2026-11-14', memberKey: 'A', pvp: 100, selfLeft: 200, selfRight: 100 },
        ],
      }),
    );

    expect(result.period.endDate).toBe('2026-11-15');
    expect(result.dailySettlementByDateAndMember['2026-11-15']!.A).toMatchObject({
      businessCalendarMode: 'SKIP_NO_INPUT',
      carryIn: { pvp: 100, left: 200, right: 100 },
      carryOut: { pvp: 100, left: 200, right: 100 },
    });
  });

  test('[COUNT-P01] applies the eight-day preference by target, not position', () => {
    const result = calculate(
      makePlanInput({
        members: [
          member('A', null, null, 700),
          member('B', 'A', 'LEFT', 1500),
          member('C', 'A', 'RIGHT', 2400),
        ],
      }),
    );

    expect(result.finalAssessmentByMember.A!.recommendationStatus).toBe('BELOW_RECOMMENDED');
    expect(result.finalAssessmentByMember.B!.recommendationStatus).toBe('NOT_APPLICABLE');
    expect(result.finalAssessmentByMember.C!.recommendationStatus).toBe('NOT_APPLICABLE');
  });

  test('[COUNT-001] records eight distinct commission dates and tiers', () => {
    const businessDates = [
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
    ];
    const tiers: CommissionTier[] = [300, 300, 700, 1500, 2400, 6000, 20000, 60000];
    const result = calculate(
      makePlanInput({
        allocations: businessDates.map((date, index) => ({
          date,
          memberKey: 'A',
          pvp: 0,
          selfLeft: tiers[index]!,
          selfRight: tiers[index]!,
        })),
      }),
    );

    expect(result.finalAssessmentByMember.A!.commissionDays).toBe(8);
    expect(result.finalAssessmentByMember.A!.commissionOccurrences.map(({ tier }) => tier)).toEqual(tiers);
  });

  test('[COUNT-003] keeps six days as a soft recommendation miss', () => {
    const dates = [
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-06',
      '2026-07-07',
    ];
    const result = calculate(
      makePlanInput({
        members: [member('A', null, null, 700)],
        allocations: dates.map((date, index) => ({
          date,
          memberKey: 'A',
          pvp: index === 0 ? 700 : 0,
          selfLeft: 500,
          selfRight: 500,
        })),
      }),
    );

    expect(result.finalAssessmentByMember.A).toMatchObject({
      allTargetsMet: true,
      commissionDays: 6,
      recommendationStatus: 'BELOW_RECOMMENDED',
    });
  });

  test('[VAL-004] returns aggregate overflow as a failure without partial results', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const outcome = calculatePlan(
      makePlanInput({
        members: [
          member('A'),
          member('B', 'A', 'LEFT'),
          member('C', 'A', 'RIGHT'),
        ],
        allocations: [
          { date: '2026-07-01', memberKey: 'B', pvp: maximum, selfLeft: 0, selfRight: 0 },
          { date: '2026-07-01', memberKey: 'C', pvp: 1, selfLeft: 0, selfRight: 0 },
        ],
      }),
    );

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status === 'FAILURE') {
      expect(outcome.validation.errors).toEqual([
        expect.objectContaining({ code: 'PV_AGGREGATE_OUT_OF_RANGE' }),
      ]);
      expect('result' in outcome).toBe(false);
    }
  });

  test('reports the date where fortnight PVP progress first overflows', () => {
    const outcome = calculatePlan(
      makePlanInput({
        opening: {
          A: { fortnightPvpOpeningCredit: Number.MAX_SAFE_INTEGER },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 1, selfLeft: 0, selfRight: 0 },
        ],
      }),
    );

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status === 'FAILURE') {
      expect(outcome.validation.errors).toEqual([
        expect.objectContaining({
          code: 'PV_AGGREGATE_OUT_OF_RANGE',
          location: expect.objectContaining({
            date: '2026-07-01',
            memberKey: 'A',
            field: 'runningFortnight.personalPvpTotal',
          }),
        }),
      ]);
    }
  });

  test('is deterministic, input-immutable, and independent of member array order', () => {
    const orderedMembers = [member('A'), member('B', 'A', 'LEFT')];
    const shuffledMembers = [orderedMembers[1]!, orderedMembers[0]!];
    const options = {
      allocations: [
        { date: '2026-07-01', memberKey: 'A', pvp: 100, selfRight: 50 },
        { date: '2026-07-01', memberKey: 'B', pvp: 200, selfLeft: 300, selfRight: 400 },
      ],
    } as const;
    const orderedInput = deepFreeze(makePlanInput({ ...options, members: orderedMembers }));
    const shuffledInput = deepFreeze(makePlanInput({ ...options, members: shuffledMembers }));
    const before = structuredClone(orderedInput);

    const first = calculatePlan(orderedInput);
    const second = calculatePlan(orderedInput);
    const shuffled = calculatePlan(shuffledInput);

    expect(first).toEqual(second);
    expect(shuffled).toEqual(first);
    expect(orderedInput).toEqual(before);
  });

  test('returns validation failure before building partial calculation results', () => {
    const valid = makePlanInput();
    const invalid: CalculatePlanInput = {
      ...valid,
      allocations: valid.allocations.map((cell, index) =>
        index === 0 ? { ...cell, date: '2026-07-16' } : cell,
      ),
    };
    const outcome = calculatePlan(invalid);

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status === 'FAILURE') {
      expect(outcome.validation.errors.some(({ code }) => code === 'DATE_OUTSIDE_PERIOD')).toBe(true);
      expect('result' in outcome).toBe(false);
    }
  });

  test('returns a validation issue for malformed runtime input', () => {
    const outcome = calculatePlan(null as unknown as CalculatePlanInput);

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status === 'FAILURE') {
      expect(outcome.validation.errors).toEqual([
        expect.objectContaining({ code: 'INPUT_STRUCTURE_INVALID' }),
      ]);
    }
  });

  test('snapshots accessor-backed input once before validation and calculation', () => {
    const valid = makePlanInput();
    const sundayIndex = valid.allocations.findIndex(
      ({ date, memberKey }) => date === '2026-07-05' && memberKey === 'A',
    );
    const sundayCell = { ...valid.allocations[sundayIndex]! };
    let reads = 0;
    Object.defineProperty(sundayCell, 'pvp', {
      enumerable: true,
      get: () => (reads++ === 0 ? 0 : 1),
    });
    const accessorInput: CalculatePlanInput = {
      ...valid,
      allocations: valid.allocations.map((cell, index) =>
        index === sundayIndex ? sundayCell : cell,
      ),
    };

    const outcome = calculatePlan(accessorInput);

    expect(reads).toBe(1);
    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status === 'SUCCESS') {
      expect(
        outcome.result.rawPerformanceByDateAndMember['2026-07-05']!.A!
          .directPvp,
      ).toBe(0);
    }
  });

  test('rejects a modified RuleSet body that reuses version 2.0.0', () => {
    const alteredRules = {
      ...DEFAULT_RULE_SET,
      commissionTiers: [700, 700, 1500, 2400, 6000, 20000, 60000] as const,
    };
    const outcome = calculatePlan(makePlanInput(), alteredRules);

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status === 'FAILURE') {
      expect(outcome.validation.errors).toEqual([
        expect.objectContaining({ code: 'RULESET_BODY_MISMATCH' }),
      ]);
    }
  });

  test('stores special member keys as own audit-record properties', () => {
    const result = calculate(
      makePlanInput({ members: [member('__proto__')] }),
    );

    expect(Object.hasOwn(result.rawPerformanceByDateAndMember['2026-07-01']!, '__proto__')).toBe(true);
    expect(Object.hasOwn(result.dailySettlementByDateAndMember['2026-07-01']!, '__proto__')).toBe(true);
    expect(Object.hasOwn(result.runningFortnightByDateAndMember['2026-07-01']!, '__proto__')).toBe(true);
    expect(Object.hasOwn(result.finalAssessmentByMember, '__proto__')).toBe(true);
    expect(result.finalAssessmentByMember.__proto__!.memberKey).toBe('__proto__');
  });
});
