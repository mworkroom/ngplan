import type {
  AutomaticPlanErrorCode,
  SafeAutomaticPlanError,
} from './types';

export class AutomaticPlanRangeError extends Error {
  readonly code = 'OPTIMIZATION_SCORE_OUT_OF_RANGE' as const;

  constructor(message = '최적화 점수를 안전한 정수 범위에서 계산할 수 없습니다.') {
    super(message);
    this.name = 'AutomaticPlanRangeError';
  }
}

export function automaticPlanError(
  code: AutomaticPlanErrorCode,
  message: string,
  extras: Omit<SafeAutomaticPlanError, 'code' | 'message'> = {},
): SafeAutomaticPlanError {
  return Object.freeze({ code, message, ...extras });
}

export function errorFromUnknown(error: unknown): SafeAutomaticPlanError {
  if (error instanceof AutomaticPlanRangeError) {
    return automaticPlanError(error.code, error.message);
  }
  return automaticPlanError(
    'AUTOMATIC_PLAN_INTERNAL_ERROR',
    '자동 계획을 검증하는 중 내부 오류가 발생했습니다.',
  );
}
