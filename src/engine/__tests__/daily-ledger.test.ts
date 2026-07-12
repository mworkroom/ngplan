import { describe, expect, it } from 'vitest';

import { DEFAULT_RULE_SET } from '../../domain/constants';
import { PvAggregateOutOfRangeError } from '../../domain/pv';
import type { IsoDate, Pv, PvBalance, RawPerformance } from '../../domain/types';
import {
  NonZeroInputOnSkippedDateError,
  settleDaily,
} from '../daily-ledger';

const SATURDAY = '2026-07-11' as IsoDate;
const SUNDAY = '2026-07-12' as IsoDate;
const MONDAY = '2026-07-13' as IsoDate;

const pv = (value: number): Pv => value as Pv;
const balance = (pvp: number, left: number, right: number): PvBalance => ({
  pvp: pv(pvp),
  left: pv(left),
  right: pv(right),
});
const raw = (
  pvp: number,
  left: number,
  right: number,
  date: IsoDate = SATURDAY,
): RawPerformance => ({
  date,
  memberKey: 'A',
  directPvp: pv(pvp),
  organizationLeft: pv(left),
  organizationRight: pv(right),
  subtreeTotal: pv(pvp + left + right),
});
const settle = (
  pvp: number,
  left: number,
  right: number,
  carryIn: PvBalance = balance(0, 0, 0),
  date: IsoDate = SATURDAY,
  qualificationPvp = 300,
) => settleDaily({
  carryIn,
  rawPerformance: raw(pvp, left, right, date),
  qualificationPvp: pv(qualificationPvp),
});

describe('daily-ledger', () => {
  it('[DAY-001] PVP로 작은 쪽을 채워 300 달성', () => {
    const carryIn = balance(0, 0, 0);
    const performance = raw(100, 200, 300);
    const carryBefore = structuredClone(carryIn);
    const rawBefore = structuredClone(performance);

    const result = settleDaily({
      carryIn,
      rawPerformance: performance,
      qualificationPvp: pv(300),
      rules: DEFAULT_RULE_SET,
    });

    expect(result).toMatchObject({
      businessCalendarMode: 'SETTLE',
      settlementStatus: 'SETTLED',
      preSettlement: { pvp: 100, left: 200, right: 300 },
      qualificationPvp: 300,
      qualificationThresholdMet: true,
      settlementKind: 'FULL_COMMISSION',
      pvpAppliedSide: 'LEFT',
      pvpApplicationReason: 'SMALLER_LEFT',
      assessedLeft: 300,
      assessedRight: 300,
      commissionTier: 300,
      commissionOccurred: true,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(carryIn).toEqual(carryBefore);
    expect(performance).toEqual(rawBefore);
    expect(result.carryIn).not.toBe(carryIn);
    expect(result.rawPerformance).not.toBe(performance);
  });

  it('[DAY-002] 300 미달 시 세 잔액 그대로 이월', () => {
    const result = settle(100, 200, 100);

    expect(result).toMatchObject({
      pvpAppliedSide: 'RIGHT',
      pvpApplicationReason: 'SMALLER_RIGHT',
      assessedLeft: 200,
      assessedRight: 200,
      settlementKind: 'NO_COMMISSION',
      commissionTier: null,
      commissionOccurred: false,
      carryOut: { pvp: 100, left: 200, right: 100 },
    });
  });

  it('[DAY-003] 전일 이월과 다음 날 원본의 합으로 커미션 발생', () => {
    const first = settle(100, 200, 100);
    const second = settle(0, 0, 200, first.carryOut, MONDAY);

    expect(first.carryOut).toEqual(balance(100, 200, 100));
    expect(second).toMatchObject({
      preSettlement: { pvp: 100, left: 200, right: 300 },
      assessedLeft: 300,
      assessedRight: 300,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  it.each([
    [299, null],
    [300, 300],
    [699, 300],
    [700, 700],
    [1499, 700],
    [1500, 1500],
    [2399, 1500],
    [2400, 2400],
    [5999, 2400],
    [6000, 6000],
    [19999, 6000],
    [20000, 20000],
    [59999, 20000],
    [60000, 60000],
    [80000, 60000],
  ] as const)('[DAY-004] 판정 최솟값 %i의 공식 단계는 %s', (minimum, tier) => {
    const result = settle(0, minimum, minimum);

    expect(result.commissionTier).toBe(tier);
    expect(result.commissionOccurred).toBe(tier !== null);
    expect(result.carryOut).toEqual(
      tier === null ? balance(0, minimum, minimum) : balance(0, 0, 0),
    );
  });

  it('[DAY-005] 하루에는 가장 높은 단계 한 번만 발생', () => {
    const result = settle(0, 1600, 1500);

    expect(result.commissionTier).toBe(1500);
    expect(result.commissionOccurred).toBe(true);
  });

  it('[DAY-006] 큰 초과분까지 전량 초기화', () => {
    const result = settle(0, 10000, 300);

    expect(result.commissionTier).toBe(300);
    expect(result.carryOut).toEqual(balance(0, 0, 0));
  });

  it('[QUAL-005] qualification 299의 실제 정산은 reset하되 full commission으로 세지 않음', () => {
    const result = settle(0, 300, 300, balance(0, 0, 0), SATURDAY, 299);

    expect(result).toMatchObject({
      qualificationPvp: 299,
      qualificationThresholdMet: false,
      settlementKind: 'BELOW_QUALIFICATION_SETTLEMENT',
      commissionTier: 300,
      commissionOccurred: false,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  it('[DAY-007] PVP 적용 후 작은 쪽이 역전되어도 재분배하지 않음', () => {
    const result = settle(500, 0, 300);

    expect(result).toMatchObject({
      pvpAppliedSide: 'LEFT',
      assessedLeft: 500,
      assessedRight: 300,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  it('[DAY-008] 미발생 PVP는 PVP 항목으로 보존', () => {
    const result = settle(250, 0, 100);

    expect(result.commissionTier).toBeNull();
    expect(result.carryOut).toEqual(balance(250, 0, 100));
  });

  it('[DAY-009] 이월 PVP는 다음 날의 작은 쪽에 다시 적용', () => {
    const first = settle(100, 100, 250);
    const second = settle(0, 200, 0, first.carryOut, MONDAY);

    expect(first.pvpAppliedSide).toBe('LEFT');
    expect(second).toMatchObject({
      preSettlement: { pvp: 100, left: 300, right: 250 },
      pvpAppliedSide: 'RIGHT',
      assessedLeft: 300,
      assessedRight: 350,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  it('[DAY-P03] 좌·우 동률이면 왼쪽 적용 사유를 남김', () => {
    const result = settle(100, 300, 300);

    expect(result).toMatchObject({
      pvpAppliedSide: 'LEFT',
      pvpApplicationReason: 'TIE_LEFT',
      assessedLeft: 400,
      assessedRight: 300,
      commissionTier: 300,
      commissionOccurred: true,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  it('[CAL-004] [CAL-P01] 일요일은 정산 없이 잔액을 월요일로 넘김', () => {
    const saturday = settle(100, 200, 100, balance(0, 0, 0), SATURDAY);
    const sunday = settle(0, 0, 0, saturday.carryOut, SUNDAY);
    const monday = settle(0, 0, 200, sunday.carryOut, MONDAY);

    expect(sunday).toMatchObject({
      businessCalendarMode: 'SKIP_NO_INPUT',
      settlementStatus: 'SKIPPED',
      settlementKind: 'SKIPPED',
      carryIn: { pvp: 100, left: 200, right: 100 },
      preSettlement: { pvp: 100, left: 200, right: 100 },
      pvpAppliedSide: null,
      pvpApplicationReason: null,
      assessedLeft: null,
      assessedRight: null,
      commissionTier: null,
      commissionOccurred: false,
      carryOut: { pvp: 100, left: 200, right: 100 },
    });
    expect(monday).toMatchObject({
      assessedLeft: 300,
      assessedRight: 300,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });

  it('[CAL-P01] 일요일 신규 원본은 방어적으로 거부', () => {
    expect(() => settle(1, 0, 0, balance(0, 0, 0), SUNDAY))
      .toThrow(NonZeroInputOnSkippedDateError);
  });

  it('[VAL-004] carry 합과 PVP 적용 합의 안전 정수 범위를 검사', () => {
    expect(() => settleDaily({
      carryIn: balance(Number.MAX_SAFE_INTEGER, 0, 0),
      rawPerformance: raw(1, 0, 0),
      qualificationPvp: pv(300),
    })).toThrow(PvAggregateOutOfRangeError);

    expect(() => settleDaily({
      carryIn: balance(1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      rawPerformance: raw(0, 0, 0),
      qualificationPvp: pv(300),
    })).toThrow(PvAggregateOutOfRangeError);
  });
});
