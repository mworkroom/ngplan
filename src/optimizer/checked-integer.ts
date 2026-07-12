import { AutomaticPlanRangeError } from './errors';

export function isCanonicalNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0)
  );
}

export function assertCanonicalNonNegativeSafeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!isCanonicalNonNegativeSafeInteger(value)) {
    throw new AutomaticPlanRangeError(`${label}은 0 이상의 안전한 정수여야 합니다.`);
  }
}

export function checkedAddScore(left: number, right: number): number {
  assertCanonicalNonNegativeSafeInteger(left, '왼쪽 점수');
  assertCanonicalNonNegativeSafeInteger(right, '오른쪽 점수');
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new AutomaticPlanRangeError();
  }
  return result;
}

export function checkedMultiplyScore(left: number, right: number): number {
  assertCanonicalNonNegativeSafeInteger(left, '왼쪽 점수');
  assertCanonicalNonNegativeSafeInteger(right, '오른쪽 점수');
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    throw new AutomaticPlanRangeError();
  }
  return result;
}

export function checkedSubtractScore(left: number, right: number): number {
  assertCanonicalNonNegativeSafeInteger(left, '피감수');
  assertCanonicalNonNegativeSafeInteger(right, '감수');
  const result = left - right;
  if (!Number.isSafeInteger(result) || result < 0 || Object.is(result, -0)) {
    throw new AutomaticPlanRangeError();
  }
  return result;
}

export function checkedSumScores(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total = checkedAddScore(total, value);
  }
  return total;
}
