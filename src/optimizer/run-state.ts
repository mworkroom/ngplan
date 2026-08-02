import { isCanonicalNonNegativeSafeInteger } from './checked-integer';
import { AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER } from './constants';
import { automaticPlanError } from './errors';
import type {
  AutomaticPlanProofProgress,
  AutomaticPlanRequest,
  AutomaticPlanRunState,
  CertifiedCompleteProof,
  CertifiedModelCertificate,
  SafeAutomaticPlanError,
  VerifiedAutomaticPlanCandidate,
} from './types';

export type AutomaticPlanRunStateOutcome =
  | { readonly status: 'SUCCESS'; readonly state: AutomaticPlanRunState }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

export function createInitialAutomaticPlanProofProgress(): AutomaticPlanProofProgress {
  return Object.freeze({
    stage: AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER[0],
    provenScalarObjectiveCount: 0,
    provenVectorPrefix: null,
    primaryLowerBound: null,
  });
}

function validateElapsed(elapsedMs: number): SafeAutomaticPlanError | null {
  return isCanonicalNonNegativeSafeInteger(elapsedMs)
    ? null
    : automaticPlanError(
        'AUTOMATIC_PLAN_REQUEST_INVALID',
        '자동 계획 경과 시간이 올바르지 않습니다.',
      );
}

export function createOptimalAutomaticPlanRunState(
  request: AutomaticPlanRequest,
  candidate: VerifiedAutomaticPlanCandidate,
  certificate: CertifiedModelCertificate,
  proof: CertifiedCompleteProof,
  elapsedMs: number,
): AutomaticPlanRunStateOutcome {
  const elapsedError = validateElapsed(elapsedMs);
  if (
    elapsedError !== null ||
    candidate.problemFingerprint !== request.problemFingerprint ||
    proof.problemFingerprint !== request.problemFingerprint ||
    proof.certificateId !== certificate.certificateId ||
    proof.conclusion !== 'OPTIMAL' ||
    proof.progress.primaryLowerBound !== candidate.objective.totalNewPv ||
    proof.progress.provenVectorPrefix?.length !==
      candidate.objective.deterministicAllocationVector.length
  ) {
    return {
      status: 'FAILURE',
      error:
        elapsedError ??
        automaticPlanError(
          'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH',
          '최적 후보, 문제 지문, 모델 인증서와 완전 증명이 일치하지 않습니다.',
        ),
    };
  }
  return {
    status: 'SUCCESS',
    state: Object.freeze({
      status: 'OPTIMAL',
      elapsedMs,
      bestCandidate: candidate,
      proof: proof.progress,
      certifiedProof: proof,
      modelCertificateId: certificate.certificateId,
      messageCode: 'OPTIMAL_PROVEN',
    }),
  };
}

export function createInfeasibleAutomaticPlanRunState(
  request: AutomaticPlanRequest,
  certificate: CertifiedModelCertificate,
  proof: CertifiedCompleteProof,
  elapsedMs: number,
): AutomaticPlanRunStateOutcome {
  const elapsedError = validateElapsed(elapsedMs);
  if (
    elapsedError !== null ||
    proof.problemFingerprint !== request.problemFingerprint ||
    proof.certificateId !== certificate.certificateId ||
    proof.conclusion !== 'INFEASIBLE'
  ) {
    return {
      status: 'FAILURE',
      error:
        elapsedError ??
        automaticPlanError(
          'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH',
          '불가능 증명, 문제 지문과 모델 인증서가 일치하지 않습니다.',
        ),
    };
  }
  return {
    status: 'SUCCESS',
    state: Object.freeze({
      status: 'INFEASIBLE',
      elapsedMs,
      bestCandidate: null,
      proof: proof.progress,
      certifiedProof: proof,
      modelCertificateId: certificate.certificateId,
      messageCode: 'INFEASIBLE_PROVEN',
    }),
  };
}

export function createUnprovenAutomaticPlanRunState(
  status: 'RUNNING' | 'TIME_LIMIT' | 'CANCELLED',
  elapsedMs: number,
  bestCandidate: VerifiedAutomaticPlanCandidate | null,
  proof: AutomaticPlanProofProgress,
  messageCode: string,
): AutomaticPlanRunStateOutcome {
  const elapsedError = validateElapsed(elapsedMs);
  if (elapsedError !== null) {
    return { status: 'FAILURE', error: elapsedError };
  }
  return {
    status: 'SUCCESS',
    state: Object.freeze({ status, elapsedMs, bestCandidate, proof, messageCode }),
  };
}

export function createFailedAutomaticPlanRunState(
  elapsedMs: number,
  bestCandidate: VerifiedAutomaticPlanCandidate | null,
  proof: AutomaticPlanProofProgress,
  error: SafeAutomaticPlanError,
  messageCode: string,
): AutomaticPlanRunStateOutcome {
  const elapsedError = validateElapsed(elapsedMs);
  if (elapsedError !== null) {
    return { status: 'FAILURE', error: elapsedError };
  }
  return {
    status: 'SUCCESS',
    state: Object.freeze({
      status: 'FAILED',
      elapsedMs,
      bestCandidate,
      proof,
      error,
      messageCode,
    }),
  };
}
