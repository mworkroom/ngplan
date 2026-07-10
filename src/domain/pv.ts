import type {
  Pv,
  ValidationCode,
  ValidationIssue,
  ValidationLocation,
} from './types';

export type ParsePvResult =
  | { readonly ok: true; readonly value: Pv }
  | {
      readonly ok: false;
      readonly code: Extract<
        ValidationCode,
        'PV_INVALID' | 'PV_NEGATIVE' | 'PV_NOT_INTEGER' | 'PV_OUT_OF_RANGE'
      >;
    };

export class PvAggregateOutOfRangeError extends Error {
  readonly code = 'PV_AGGREGATE_OUT_OF_RANGE' as const;

  constructor(
    readonly leftOperand: Pv,
    readonly rightOperand: Pv,
    readonly location: ValidationLocation = {},
  ) {
    super('PV 합계가 JavaScript 안전 정수 범위를 넘습니다.');
    this.name = 'PvAggregateOutOfRangeError';
  }

  toIssue(): ValidationIssue {
    return {
      code: this.code,
      severity: 'ERROR',
      location: this.location,
      message: `${this.leftOperand}와 ${this.rightOperand}의 합이 안전 정수 범위를 넘습니다.`,
      suggestion: '입력 PV 또는 조직 합계 범위를 줄여 주세요.',
    };
  }
}

export function parsePv(value: unknown): ParsePvResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, code: 'PV_INVALID' };
  }
  if (!Number.isInteger(value)) {
    return { ok: false, code: 'PV_NOT_INTEGER' };
  }
  if (!Number.isSafeInteger(value)) {
    return { ok: false, code: 'PV_OUT_OF_RANGE' };
  }
  if (value < 0) {
    return { ok: false, code: 'PV_NEGATIVE' };
  }
  return { ok: true, value: value as Pv };
}

export function checkedAdd(
  left: Pv,
  right: Pv,
  location: ValidationLocation = {},
): Pv {
  if (right > Number.MAX_SAFE_INTEGER - left) {
    throw new PvAggregateOutOfRangeError(left, right, location);
  }
  return (left + right) as Pv;
}

export function checkedSum(
  values: readonly Pv[],
  location: ValidationLocation = {},
): Pv {
  let total = 0 as Pv;
  for (const value of values) {
    total = checkedAdd(total, value, location);
  }
  return total;
}

export function subtractFloorZero(value: Pv, amount: Pv): Pv {
  return Math.max(0, value - amount) as Pv;
}

export const ZERO_PV = 0 as Pv;
