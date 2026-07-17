import { describe, expect, test } from 'vitest';

import { DEFAULT_RULE_SET } from '../../domain/constants';
import type {
  CalculatePlanInput,
  CalculationResult,
  CommissionTier,
  Pv,
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

  test('[HALF-P03] uses cumulative PVP for personal progress but not side assessment or daily carry', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: {
            openingQualificationPvp: 300,
            fortnightPvpOpeningCredit: 300,
          },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 400, selfLeft: 0, selfRight: 0 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A!.preSettlement.pvp)
      .toBe(400);
    expect(result.finalAssessmentByMember.A).toMatchObject({
      newPvpTotal: 400,
      personalPvpTotal: 700,
      periodPvpForSide: 400,
      remainingPvp: 0,
    });
  });

  test('[HALF-P04] keeps fortnight opening PVP local to its member', () => {
    const result = calculate(
      makePlanInput({
        members: [member('A'), member('B', 'A', 'LEFT')],
        opening: {
          B: {
            openingQualificationPvp: 300,
            fortnightPvpOpeningCredit: 300,
          },
        },
      }),
    );

    expect(result.finalAssessmentByMember.B).toMatchObject({
      personalPvpTotal: 300,
      periodPvpForSide: 0,
      assessedLeft: 0,
      assessedRight: 0,
    });
    expect(result.finalAssessmentByMember.A!.rawLeftTotal).toBe(0);
  });

  test('[OPEN-001] maps one cumulative PVP opening to qualification and fortnight only', () => {
    const input = makePlanInput({
      opening: {
        A: {
          openingQualificationPvp: 300,
          fortnightPvpOpeningCredit: 300,
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
      preSettlement: { pvp: 400, left: 200, right: 300 },
      assessedLeft: 600,
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

  test('[OPEN-P01] applies only new PVP at fortnight close', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: {
            openingQualificationPvp: 300,
            fortnightPvpOpeningCredit: 300,
          },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 400, selfLeft: 0, selfRight: 200 },
        ],
      }),
    );

    expect(result.finalAssessmentByMember.A).toMatchObject({
      periodPvpForSide: 400,
      pvpAppliedSide: 'LEFT',
      assessedLeft: 400,
      assessedRight: 200,
      sideTargetsMet: false,
    });
  });

  test('[QUAL-001] opening 33과 당일 direct PVP 267을 먼저 합산해 같은 날 full commission을 허용', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: { openingQualificationPvp: 33, fortnightPvpOpeningCredit: 33 },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 267, selfLeft: 33, selfRight: 300 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A).toMatchObject({
      qualificationPvp: 300,
      qualificationThresholdMet: true,
      settlementKind: 'FULL_COMMISSION',
      commissionTier: 300,
      commissionOccurred: true,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(result.runningFortnightByDateAndMember['2026-07-01']!.A).toMatchObject({
      qualificationPvp: 300,
      qualificationThresholdMet: true,
    });
    expect(result.finalAssessmentByMember.A).toMatchObject({
      openingQualificationPvp: 33,
      closingQualificationPvp: 300,
      commissionDays: 1,
      belowQualificationSettlementDays: 0,
    });
    expect(result.warnings).toEqual([]);
  });

  test('[QUAL-002] opening 33과 당일 direct PVP 266은 실제 reset하되 full commission으로 세지 않고 경고', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: { openingQualificationPvp: 33, fortnightPvpOpeningCredit: 33 },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 266, selfLeft: 34, selfRight: 300 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A).toMatchObject({
      qualificationPvp: 299,
      qualificationThresholdMet: false,
      settlementKind: 'BELOW_QUALIFICATION_SETTLEMENT',
      commissionTier: 300,
      commissionOccurred: false,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(result.finalAssessmentByMember.A).toMatchObject({
      commissionDays: 0,
      commissionOccurrences: [],
      belowQualificationSettlementDays: 1,
      belowQualificationSettlementOccurrences: [
        { date: '2026-07-01', tier: 300, qualificationPvp: 299 },
      ],
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'BELOW_QUALIFICATION_SETTLEMENT',
        severity: 'WARNING',
        location: {
          date: '2026-07-01',
          memberKey: 'A',
          field: 'qualificationPvp',
        },
      }),
    ]);
  });

  test('[QUAL-003] qualification PVP는 일일 reset과 무관하게 날짜별로 inclusive 누적', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: { openingQualificationPvp: 33, fortnightPvpOpeningCredit: 33 },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 100, selfLeft: 0, selfRight: 0 },
          { date: '2026-07-02', memberKey: 'A', pvp: 200, selfLeft: 0, selfRight: 300 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A).toMatchObject({
      qualificationPvp: 133,
      settlementKind: 'NO_COMMISSION',
      carryOut: { pvp: 100, left: 0, right: 0 },
    });
    expect(result.dailySettlementByDateAndMember['2026-07-02']!.A).toMatchObject({
      preSettlement: { pvp: 300, left: 0, right: 300 },
      qualificationPvp: 333,
      settlementKind: 'FULL_COMMISSION',
      commissionTier: 300,
    });
    expect(result.finalAssessmentByMember.A!.closingQualificationPvp).toBe(333);
  });

  test('[QUAL-004] qualification 300 미만의 한쪽 실적은 정산 단계가 없으면 carry', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: { openingQualificationPvp: 33, fortnightPvpOpeningCredit: 33 },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 0, selfLeft: 300, selfRight: 0 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A).toMatchObject({
      qualificationPvp: 33,
      settlementKind: 'NO_COMMISSION',
      commissionTier: null,
      carryOut: { pvp: 0, left: 300, right: 0 },
    });
    expect(result.warnings).toEqual([]);
  });

  test('[QUAL-006] opening qualification PVP가 300이면 첫 영업일부터 full commission 가능', () => {
    const result = calculate(
      makePlanInput({
        opening: {
          A: { openingQualificationPvp: 300, fortnightPvpOpeningCredit: 300 },
        },
        allocations: [
          { date: '2026-07-01', memberKey: 'A', pvp: 0, selfLeft: 300, selfRight: 300 },
        ],
      }),
    );

    expect(result.dailySettlementByDateAndMember['2026-07-01']!.A).toMatchObject({
      qualificationPvp: 300,
      settlementKind: 'FULL_COMMISSION',
      commissionOccurred: true,
    });
  });

  test('[QUAL-007] non-zero daily opening PVP is rejected at the product boundary', () => {
    const outcome = calculatePlan(
      makePlanInput({
        opening: {
          A: {
            openingQualificationPvp: 33,
            fortnightPvpOpeningCredit: 33,
            dailyCarryPvp: 267,
          },
        },
      }),
    );

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status === 'FAILURE') {
      expect(outcome.validation.errors).toEqual([
        expect.objectContaining({ code: 'DAILY_PVP_OPENING_NONZERO' }),
      ]);
    }
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
    expect(result.closingDailyCarryByMember.A).toEqual({
      pvp: 100,
      left: 200,
      right: 100,
    });
  });

  test('[CARRY-001] 마지막 영업일의 미정산 carry를 authoritative closing state로 노출', () => {
    const result = calculate(
      makePlanInput({
        half: 'SECOND_HALF',
        allocations: [
          { date: '2026-07-31', memberKey: 'A', pvp: 100, selfLeft: 200, selfRight: 100 },
        ],
      }),
    );

    expect(result.period.endDate).toBe('2026-07-31');
    expect(result.dailySettlementByDateAndMember['2026-07-31']!.A).toMatchObject({
      settlementKind: 'NO_COMMISSION',
      carryOut: { pvp: 100, left: 200, right: 100 },
    });
    expect(result.closingDailyCarryByMember.A).toEqual({
      pvp: 100,
      left: 200,
      right: 100,
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
        opening: {
          A: { openingQualificationPvp: 300, fortnightPvpOpeningCredit: 300 },
        },
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

  test('[VAL-004] rejects direct PVP above the lifetime cap without partial results', () => {
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
        expect.objectContaining({ code: 'CUMULATIVE_PVP_ALLOCATION_EXCEEDS_CAP' }),
      ]);
      expect('result' in outcome).toBe(false);
    }
  });

  test('reports a cumulative PVP opening above 2,400', () => {
    const outcome = calculatePlan(
      makePlanInput({
        opening: {
          A: {
            openingQualificationPvp: 2401,
            fortnightPvpOpeningCredit: 2401,
          },
        },
      }),
    );

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status === 'FAILURE') {
      expect(outcome.validation.errors).toEqual([
        expect.objectContaining({
          code: 'CUMULATIVE_PVP_OPENING_EXCEEDS_CAP',
          location: expect.objectContaining({
            memberKey: 'A',
            field: 'openingQualificationPvp',
          }),
        }),
      ]);
    }
  });

  test('reports the member whose direct PVP exceeds remaining cumulative headroom', () => {
    const outcome = calculatePlan(
      makePlanInput({
        opening: {
          A: {
            openingQualificationPvp: 2400,
            fortnightPvpOpeningCredit: 2400,
          },
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
          code: 'CUMULATIVE_PVP_ALLOCATION_EXCEEDS_CAP',
          location: {
            memberKey: 'A',
            snapshotId: 'snapshot-test',
            field: 'pvp',
          },
        }),
      ]);
    }
  });

  test('uses ruleset and engine 5.0.0 and canonical root-first LEFT-before-RIGHT output order', () => {
    const result = calculate(
      makePlanInput({
        members: [
          member('B', 'Z', 'RIGHT'),
          member('A', 'M', 'LEFT'),
          member('Z'),
          member('M', 'Z', 'LEFT'),
        ],
      }),
    );

    expect(result.rulesetVersion).toBe('5.0.0');
    expect(result.engineVersion).toBe('5.0.0');
    expect(result.inputSnapshot.organization.members.map(({ memberKey }) => memberKey))
      .toEqual(['Z', 'M', 'A', 'B']);
    expect(Object.keys(result.finalAssessmentByMember)).toEqual(['Z', 'M', 'A', 'B']);
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

  test('rejects a modified RuleSet body that reuses version 5.0.0', () => {
    const alteredRules = {
      ...DEFAULT_RULE_SET,
      rootFortnightSideTarget: 22_499 as Pv,
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
    expect(Object.hasOwn(result.closingDailyCarryByMember, '__proto__')).toBe(true);
    expect(result.finalAssessmentByMember.__proto__!.memberKey).toBe('__proto__');
  });
});
