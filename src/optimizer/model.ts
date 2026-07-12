import { isCanonicalNonNegativeSafeInteger } from './checked-integer';
import {
  deriveAutomaticPlanCoordinates,
  validateAutomaticPlanRequest,
} from './candidate-shape';
import {
  AUTOMATIC_PLAN_MODEL_VERSION,
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
} from './constants';
import { automaticPlanError } from './errors';
import type {
  AutomaticPlanCoordinate,
  AutomaticPlanRequest,
  SafeAutomaticPlanError,
} from './types';

export interface AutomaticPlanVariableBound {
  readonly coordinate: AutomaticPlanCoordinate;
  readonly minimum: 0;
  readonly maximum: number;
}

export interface AutomaticPlanModel {
  readonly modelVersion: typeof AUTOMATIC_PLAN_MODEL_VERSION;
  readonly problemFingerprint: string;
  readonly decisionCoordinates: readonly AutomaticPlanCoordinate[];
  readonly variableBounds: readonly AutomaticPlanVariableBound[];
  readonly objectiveStages: typeof AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER;
}

export type AutomaticPlanModelOutcome =
  | { readonly status: 'SUCCESS'; readonly model: AutomaticPlanModel }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

/**
 * Creates only the solver-neutral exact-model boundary. This does not certify
 * that any concrete backend implements the model soundly or completely.
 */
export function createAutomaticPlanModel(
  request: AutomaticPlanRequest,
  verifiedTotalPvUpperBound: number,
): AutomaticPlanModelOutcome {
  const validRequest = validateAutomaticPlanRequest(request);
  if (validRequest.status === 'FAILURE') {
    return validRequest;
  }
  if (!isCanonicalNonNegativeSafeInteger(verifiedTotalPvUpperBound)) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'OPTIMIZATION_SCORE_OUT_OF_RANGE',
        '검증 후보의 총 PV를 안전한 변수 상한으로 사용할 수 없습니다.',
      ),
    };
  }
  const decisionCoordinates = deriveAutomaticPlanCoordinates(request);
  const variableBounds = decisionCoordinates.map((coordinate) =>
    Object.freeze({
      coordinate,
      minimum: 0 as const,
      maximum: request.calendar.skipDateSet.includes(coordinate.date)
        ? 0
        : verifiedTotalPvUpperBound,
    }),
  );
  return {
    status: 'SUCCESS',
    model: Object.freeze({
      modelVersion: AUTOMATIC_PLAN_MODEL_VERSION,
      problemFingerprint: request.problemFingerprint,
      decisionCoordinates,
      variableBounds: Object.freeze(variableBounds),
      objectiveStages: AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
    }),
  };
}
