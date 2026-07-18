import {
  compareAutomaticPlanObjectives,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanConstructionOutcome,
  type AutomaticPlanObjectiveVector,
  type AutomaticPlanRequest,
  type RawAutomaticPlanCandidate,
  type SafeAutomaticPlanError,
} from '../../optimizer';

export interface WorkerCandidateAssessment {
  readonly publishableCandidates: readonly RawAutomaticPlanCandidate[];
  readonly firstFailure: SafeAutomaticPlanError | null;
}

export interface WorkerTerminalFailure {
  readonly error: SafeAutomaticPlanError;
  readonly messageCode:
    | 'CONSTRUCTIVE_PLAN_FAILED'
    | 'EXACT_PROOF_BACKEND_UNAVAILABLE';
}

const NO_CANDIDATE_ERROR: SafeAutomaticPlanError = Object.freeze({
  code: 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
  message: '현재 조건으로 검증 가능한 자동 계획을 찾지 못했습니다.',
});

const PROOF_UNAVAILABLE_ERROR: SafeAutomaticPlanError = Object.freeze({
  code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE',
  message:
    '정확한 최소값 확인만 중단됐습니다. 찾은 검증 계획은 사용할 수 있습니다.',
});

/**
 * Worker-side preflight. The UI controller verifies every publication again,
 * while this pass prevents an invalid variant from being advertised as an
 * incumbent and preserves the first useful failure when no candidate survives.
 */
export function assessWorkerCandidateSources(
  request: AutomaticPlanRequest,
  sources: readonly AutomaticPlanConstructionOutcome[],
): WorkerCandidateAssessment {
  const publishableCandidates: RawAutomaticPlanCandidate[] = [];
  let firstFailure: SafeAutomaticPlanError | null = null;
  let bestObjective: AutomaticPlanObjectiveVector | null = null;

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    if (source.status === 'FAILURE') {
      firstFailure ??= source.error;
      continue;
    }
    const verified = verifyAutomaticPlanCandidate(request, source.candidate, {
      candidateId: `worker-preflight-${index + 1}`,
      sequence: index + 1,
      foundAtElapsedMs: 0,
    });
    if (verified.status === 'FAILURE') {
      firstFailure ??= verified.error;
      continue;
    }
    if (
      bestObjective !== null &&
      compareAutomaticPlanObjectives(verified.candidate.objective, bestObjective) >= 0
    ) continue;
    bestObjective = verified.candidate.objective;
    publishableCandidates.push(source.candidate);
  }

  return Object.freeze({
    publishableCandidates: Object.freeze(publishableCandidates),
    firstFailure,
  });
}

export function workerTerminalFailure(
  assessment: WorkerCandidateAssessment,
): WorkerTerminalFailure {
  if (assessment.publishableCandidates.length === 0) {
    return Object.freeze({
      error: assessment.firstFailure ?? NO_CANDIDATE_ERROR,
      messageCode: 'CONSTRUCTIVE_PLAN_FAILED',
    });
  }
  return Object.freeze({
    error: PROOF_UNAVAILABLE_ERROR,
    messageCode: 'EXACT_PROOF_BACKEND_UNAVAILABLE',
  });
}
