import { describe, expect, it } from 'vitest';

import {
  commissionTierFor,
  DEFAULT_RULE_SET,
  isAllowedPvpTarget,
} from '../constants';
import {
  checkedAdd,
  checkedSum,
  parsePv,
  PvAggregateOutOfRangeError,
  subtractFloorZero,
  ZERO_PV,
} from '../pv';
import type { Pv } from '../types';

function pv(value: number): Pv {
  const result = parsePv(value);
  if (!result.ok) {
    throw new Error(`테스트 PV ${value}가 유효하지 않습니다: ${result.code}`);
  }
  return result.value;
}

describe('[VAL-001] — PV 숫자 형식', () => {
  it.each([0, 1, 39, Number.MAX_SAFE_INTEGER])('%s를 허용한다', (value) => {
    expect(parsePv(value)).toEqual({ ok: true, value });
  });

  it.each([
    [-1, 'PV_NEGATIVE'],
    [1.5, 'PV_NOT_INTEGER'],
    ['1', 'PV_INVALID'],
    [Number.NaN, 'PV_INVALID'],
    [Number.POSITIVE_INFINITY, 'PV_INVALID'],
    [Number.MAX_SAFE_INTEGER + 1, 'PV_OUT_OF_RANGE'],
    [Number.MIN_SAFE_INTEGER - 1, 'PV_OUT_OF_RANGE'],
  ] as const)('%s를 %s로 거부한다', (value, code) => {
    expect(parsePv(value)).toEqual({ ok: false, code });
  });
});

describe('[VAL-004] — 파생 PV 합계 안전 범위', () => {
  it('안전한 덧셈과 합계를 Pv로 반환한다', () => {
    expect(checkedAdd(pv(100), pv(200))).toBe(300);
    expect(checkedSum([pv(100), pv(200), pv(300)])).toBe(600);
    expect(checkedSum([])).toBe(ZERO_PV);
  });

  it('합계가 안전 범위를 넘으면 PV_AGGREGATE_OUT_OF_RANGE를 발생시킨다', () => {
    const location = { date: '2026-07-01', memberKey: 'A', field: 'subtreeTotal' };

    expect(() => checkedAdd(pv(Number.MAX_SAFE_INTEGER), pv(1), location)).toThrow(
      PvAggregateOutOfRangeError,
    );

    try {
      checkedSum([pv(Number.MAX_SAFE_INTEGER), pv(1)], location);
      throw new Error('범위 오류가 발생하지 않았습니다.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(PvAggregateOutOfRangeError);
      const aggregateError = error as PvAggregateOutOfRangeError;
      expect(aggregateError.code).toBe('PV_AGGREGATE_OUT_OF_RANGE');
      expect(aggregateError.leftOperand).toBe(Number.MAX_SAFE_INTEGER);
      expect(aggregateError.rightOperand).toBe(1);
      expect(aggregateError.toIssue()).toMatchObject({
        code: 'PV_AGGREGATE_OUT_OF_RANGE',
        severity: 'ERROR',
        location,
      });
    }
  });

  it('0 미만이 되지 않는 잔여량을 계산한다', () => {
    expect(subtractFloorZero(pv(700), pv(300))).toBe(400);
    expect(subtractFloorZero(pv(300), pv(700))).toBe(0);
  });
});

describe('[VAL-P01] — 허용 PVP 목표 상수', () => {
  it('2,400·1,500·700만 목표로 허용한다', () => {
    expect(isAllowedPvpTarget(2400, DEFAULT_RULE_SET)).toBe(true);
    expect(isAllowedPvpTarget(1500, DEFAULT_RULE_SET)).toBe(true);
    expect(isAllowedPvpTarget(700, DEFAULT_RULE_SET)).toBe(true);
    expect(isAllowedPvpTarget(1000, DEFAULT_RULE_SET)).toBe(false);
  });
});

describe('[DAY-004] — 공식 커미션 단계 전체 경계', () => {
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
  ] as const)('판정 최솟값 %s에서 단계 %s를 고른다', (minimum, tier) => {
    expect(commissionTierFor(pv(minimum), pv(90000))).toBe(tier);
  });
});
