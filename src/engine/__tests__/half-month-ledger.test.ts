import { describe, expect, it } from 'vitest';

import { DEFAULT_RULE_SET } from '../../domain/constants';
import { PvAggregateOutOfRangeError } from '../../domain/pv';
import type {
  BelowQualificationSettlementOccurrence,
  CommissionOccurrence,
  CommissionTier,
  IsoDate,
  MemberSnapshot,
  OpeningStateInput,
  Pv,
  PvBalance,
  PvpTarget,
  RawPerformance,
} from '../../domain/types';
import { settleDaily } from '../daily-ledger';
import {
  accumulateFortnightDay,
  createFortnightAccumulator,
  evaluateFortnight,
  type FortnightAccumulator,
} from '../half-month-ledger';

const D1 = '2026-07-11' as IsoDate;
const SUNDAY = '2026-07-12' as IsoDate;
const D2 = '2026-07-13' as IsoDate;
const pv = (value: number): Pv => value as Pv;

const member = (pvpTarget: PvpTarget, memberKey = 'A'): MemberSnapshot => ({
  memberKey,
  memberId: `ID-${memberKey}`,
  name: memberKey,
  pvpTarget,
  sheetMarker: 'NONE',
  parentMemberKey: null,
  sideAtParent: null,
});
const opening = (
  fortnightPvpOpeningCredit = 0,
  dailyCarryPvp = 0,
  dailyCarryLeft = 0,
  dailyCarryRight = 0,
  openingQualificationPvp = 0,
): OpeningStateInput => ({
  openingQualificationPvp,
  fortnightPvpOpeningCredit,
  dailyCarryPvp,
  dailyCarryLeft,
  dailyCarryRight,
});
const balance = (pvp: number, left: number, right: number): PvBalance => ({
  pvp: pv(pvp),
  left: pv(left),
  right: pv(right),
});
const raw = (
  pvp: number,
  left: number,
  right: number,
  date: IsoDate = D1,
): RawPerformance => ({
  date,
  memberKey: 'A',
  directPvp: pv(pvp),
  organizationLeft: pv(left),
  organizationRight: pv(right),
  subtreeTotal: pv(pvp + left + right),
});
const accumulator = (
  pvp: number,
  left: number,
  right: number,
  commissionOccurrences: readonly CommissionOccurrence[] = [],
  belowQualificationSettlementOccurrences: readonly BelowQualificationSettlementOccurrence[] = [],
): FortnightAccumulator => ({
  newPvpTotal: pv(pvp),
  rawLeftTotal: pv(left),
  rawRightTotal: pv(right),
  commissionOccurrences,
  belowQualificationSettlementOccurrences,
});
const occurrences = (tiers: readonly CommissionTier[]): CommissionOccurrence[] =>
  tiers.map((tier, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}` as IsoDate,
    tier,
  }));
const assess = (
  pvpTarget: PvpTarget,
  openingCredit: number,
  newPvp: number,
  left: number,
  right: number,
  commissionOccurrences: readonly CommissionOccurrence[] = [],
) => evaluateFortnight({
  member: member(pvpTarget),
  openingState: opening(openingCredit),
  accumulator: accumulator(newPvp, left, right, commissionOccurrences),
});

describe('half-month-ledger', () => {
  it('[HALF-001] 목표 1,500의 시작 PVP가 신규 필요량을 줄임', () => {
    const result = assess(1500, 700, 800, 0, 0);

    expect(result).toMatchObject({
      personalPvpTarget: 1500,
      personalPvpTotal: 1500,
      remainingPvp: 0,
      personalPvpTargetMet: true,
    });
  });

  it('[HALF-002] 시작 PVP만으로 목표를 초과해도 목표 단계는 그대로임', () => {
    const result = assess(1500, 1600, 0, 0, 0);

    expect(result).toMatchObject({
      personalPvpTarget: 1500,
      personalPvpTotal: 1600,
      remainingPvp: 0,
    });
  });

  it('[HALF-003] 직접 선택한 목표 700을 적용', () => {
    const result = assess(700, 800, 0, 0, 0);

    expect(result).toMatchObject({
      personalPvpTarget: 700,
      personalPvpTotal: 800,
      remainingPvp: 0,
    });
  });

  it('[HALF-004] 일일 좌·우 시작 잔액은 보름 원본에 포함하지 않음', () => {
    const result = evaluateFortnight({
      member: member(700),
      openingState: opening(0, 0, 362, 261),
      accumulator: createFortnightAccumulator(),
    });

    expect(result).toMatchObject({
      rawLeftTotal: 0,
      rawRightTotal: 0,
      assessedLeft: 0,
      assessedRight: 0,
      sideTargetsMet: false,
    });
  });

  it('[HALF-005] 보름 마감 PVP가 작은 쪽을 채움', () => {
    const result = assess(700, 0, 400, 2500, 2100);

    expect(result).toMatchObject({
      periodPvpForSide: 400,
      pvpAppliedSide: 'RIGHT',
      pvpApplicationReason: 'SMALLER_RIGHT',
      assessedLeft: 2500,
      assessedRight: 2500,
      leftTargetMet: true,
      rightTargetMet: true,
      sideTargetsMet: true,
    });
  });

  it('[HALF-006] 동률 PVP를 나누지 않고 왼쪽에 전량 적용', () => {
    const result = assess(700, 0, 400, 2300, 2300);

    expect(result).toMatchObject({
      pvpAppliedSide: 'LEFT',
      pvpApplicationReason: 'TIE_LEFT',
      assessedLeft: 2700,
      assessedRight: 2300,
      leftTargetMet: true,
      rightTargetMet: false,
      sideTargetsMet: false,
    });
  });

  it('[HALF-007] PVP 적용은 원본 누계를 변경하지 않음', () => {
    const source = accumulator(400, 2500, 2100);
    const sourceBefore = structuredClone(source);

    const result = evaluateFortnight({
      member: member(700),
      openingState: opening(),
      accumulator: source,
      rules: DEFAULT_RULE_SET,
    });

    expect(result).toMatchObject({
      newPvpTotal: 400,
      rawLeftTotal: 2500,
      rawRightTotal: 2100,
      assessedLeft: 2500,
      assessedRight: 2500,
    });
    expect(source).toEqual(sourceBefore);
  });

  it('[HALF-P01] 보름 시작값과 신규 PVP 전액을 작은 쪽에 적용', () => {
    const result = assess(700, 300, 400, 2500, 1800);

    expect(result).toMatchObject({
      personalPvpTotal: 700,
      remainingPvp: 0,
      periodPvpForSide: 700,
      pvpAppliedSide: 'RIGHT',
      assessedLeft: 2500,
      assessedRight: 2500,
      allTargetsMet: true,
    });
  });

  it('[HALF-P02] 목표 초과 PVP도 자르지 않고 전액 적용', () => {
    const result = assess(1500, 1600, 400, 2500, 500);

    expect(result).toMatchObject({
      personalPvpTotal: 2000,
      personalPvpTarget: 1500,
      periodPvpForSide: 2000,
      assessedLeft: 2500,
      assessedRight: 2500,
      allTargetsMet: true,
    });
  });

  it('[HALF-P03] 일일 PVP 시작 잔액은 개인·보름 PVP에서 제외', () => {
    const result = evaluateFortnight({
      member: member(700),
      openingState: opening(0, 300, 0, 0),
      accumulator: accumulator(400, 0, 0),
    });

    expect(result).toMatchObject({
      personalPvpTotal: 400,
      remainingPvp: 300,
      periodPvpForSide: 400,
      assessedLeft: 400,
      assessedRight: 0,
    });
  });

  it('[HALF-P04] 보름 PVP 시작값은 회원 본인의 판정에만 사용', () => {
    const result = assess(700, 300, 0, 0, 0);

    expect(result).toMatchObject({
      fortnightPvpOpeningCredit: 300,
      newPvpTotal: 0,
      rawLeftTotal: 0,
      rawRightTotal: 0,
      periodPvpForSide: 300,
    });
  });

  it('[OPEN-001] [OPEN-P01] qualification·일일·보름 시작값 역할을 분리', () => {
    const memberA = member(700);
    const openingState = opening(300, 100, 200, 100, 33);
    const performance = raw(400, 0, 200);
    const daily = settleDaily({
      carryIn: balance(100, 200, 100),
      rawPerformance: performance,
      qualificationPvp: pv(433),
    });
    const day = accumulateFortnightDay({
      previous: createFortnightAccumulator(),
      rawPerformance: performance,
      dailySettlement: daily,
      member: memberA,
      openingState,
    });
    const final = evaluateFortnight({
      member: memberA,
      openingState,
      accumulator: day.accumulator,
    });

    expect(daily).toMatchObject({
      preSettlement: { pvp: 500, left: 200, right: 300 },
      assessedLeft: 700,
      assessedRight: 300,
      commissionTier: 300,
    });
    expect(day.runningState).toMatchObject({
      newPvpTotal: 400,
      rawLeftTotal: 0,
      rawRightTotal: 200,
      personalPvpTotal: 700,
      remainingPvp: 0,
      qualificationPvp: 433,
    });
    expect(final).toMatchObject({
      openingQualificationPvp: 33,
      closingQualificationPvp: 433,
      periodPvpForSide: 700,
      assessedLeft: 700,
      assessedRight: 200,
    });
  });

  it('[DAY-010] 일일 초기화 뒤에도 보름 원본은 누적', () => {
    const memberA = member(700);
    const openingState = opening();
    const firstRaw = raw(100, 200, 300, D1);
    const firstDaily = settleDaily({
      carryIn: balance(0, 0, 0),
      rawPerformance: firstRaw,
      qualificationPvp: pv(300),
    });
    const first = accumulateFortnightDay({
      previous: createFortnightAccumulator(),
      rawPerformance: firstRaw,
      dailySettlement: firstDaily,
      member: memberA,
      openingState,
    });
    const secondRaw = raw(100, 100, 0, D2);
    const secondDaily = settleDaily({
      carryIn: firstDaily.carryOut,
      rawPerformance: secondRaw,
      qualificationPvp: pv(400),
    });
    const second = accumulateFortnightDay({
      previous: first.accumulator,
      rawPerformance: secondRaw,
      dailySettlement: secondDaily,
      member: memberA,
      openingState,
    });

    expect(firstDaily.carryOut).toEqual(balance(0, 0, 0));
    expect(second.accumulator).toMatchObject({
      newPvpTotal: 200,
      rawLeftTotal: 300,
      rawRightTotal: 300,
    });
    expect(second.accumulator.commissionOccurrences).toEqual([
      { date: D1, tier: 300 },
    ]);
  });

  it('[QUAL-005] below-300 settlement은 별도 추적하고 full commission 일수에서 제외', () => {
    const memberA = member(700);
    const openingState = opening(0, 0, 0, 0, 33);
    const performance = raw(266, 300, 300, D1);
    const daily = settleDaily({
      carryIn: balance(0, 0, 0),
      rawPerformance: performance,
      qualificationPvp: pv(299),
    });
    const day = accumulateFortnightDay({
      previous: createFortnightAccumulator(),
      rawPerformance: performance,
      dailySettlement: daily,
      member: memberA,
      openingState,
    });
    const final = evaluateFortnight({
      member: memberA,
      openingState,
      accumulator: day.accumulator,
    });

    expect(final).toMatchObject({
      closingQualificationPvp: 299,
      qualificationThresholdMet: false,
      commissionDays: 0,
      commissionOccurrences: [],
      belowQualificationSettlementDays: 1,
      belowQualificationSettlementOccurrences: [
        { date: D1, tier: 300, qualificationPvp: 299 },
      ],
    });
  });

  it('[CAL-P02] 마지막 일요일에도 같은 진행 누계를 감사 행으로 남김', () => {
    const previous = accumulator(100, 200, 100);
    const sundayRaw = raw(0, 0, 0, SUNDAY);
    const sundayDaily = settleDaily({
      carryIn: balance(100, 200, 100),
      rawPerformance: sundayRaw,
      qualificationPvp: pv(300),
    });

    const result = accumulateFortnightDay({
      previous,
      rawPerformance: sundayRaw,
      dailySettlement: sundayDaily,
      member: member(700),
      openingState: opening(),
    });

    expect(result.runningState).toMatchObject({
      date: SUNDAY,
      newPvpTotal: 100,
      rawLeftTotal: 200,
      rawRightTotal: 100,
    });
  });

  it('[COUNT-001] [COUNT-002] 날짜별 최고 단계 하나만 발생일로 집계', () => {
    const eight = occurrences([300, 300, 700, 1500, 2400, 6000, 20000, 60000]);
    const eightResult = assess(700, 0, 700, 2500, 1800, eight);
    const oneResult = assess(700, 0, 700, 2500, 1800, occurrences([60000]));

    expect(eightResult.commissionDays).toBe(8);
    expect(eightResult.commissionOccurrences).toEqual(eight);
    expect(oneResult.commissionDays).toBe(1);
    expect(oneResult.commissionOccurrences).toEqual(occurrences([60000]));
  });

  it('[COUNT-003] 6회 권장 미달은 필수 보름 목표 실패가 아님', () => {
    const result = assess(
      700,
      0,
      700,
      2500,
      1800,
      occurrences([300, 300, 300, 300, 300, 300]),
    );

    expect(result).toMatchObject({
      allTargetsMet: true,
      commissionDays: 6,
      recommendationStatus: 'BELOW_RECOMMENDED',
      recommendedCommissionDays: 8,
    });
  });

  it('[COUNT-P01] 8회 권장은 목표 700에만 적용', () => {
    const eight = occurrences([300, 300, 300, 300, 300, 300, 300, 300]);

    expect(assess(700, 0, 700, 2500, 1800, eight)).toMatchObject({
      recommendationStatus: 'MET_OR_EXCEEDED',
      recommendedCommissionDays: 8,
    });
    expect(assess(1500, 0, 700, 2500, 1800, eight)).toMatchObject({
      recommendationStatus: 'NOT_APPLICABLE',
      recommendedCommissionDays: null,
    });
    expect(assess(2400, 0, 700, 2500, 1800, eight)).toMatchObject({
      recommendationStatus: 'NOT_APPLICABLE',
      recommendedCommissionDays: null,
    });
  });

  it('[VAL-004] 보름 누계와 마감 적용의 안전 정수 범위를 검사', () => {
    const performance = raw(1, 0, 0);
    const daily = settleDaily({
      carryIn: balance(0, 0, 0),
      rawPerformance: performance,
      qualificationPvp: pv(300),
    });

    expect(() => accumulateFortnightDay({
      previous: accumulator(Number.MAX_SAFE_INTEGER, 0, 0),
      rawPerformance: performance,
      dailySettlement: daily,
      member: member(700),
      openingState: opening(),
    })).toThrow(PvAggregateOutOfRangeError);

    expect(() => assess(700, 1, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER))
      .toThrow(PvAggregateOutOfRangeError);
  });
});
