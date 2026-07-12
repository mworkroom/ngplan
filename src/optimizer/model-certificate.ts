import { isCanonicalNonNegativeSafeInteger } from './checked-integer';
import {
  deriveAutomaticPlanCoordinates,
  validateAutomaticPlanRequest,
} from './candidate-shape';
import {
  AUTOMATIC_PLAN_CALENDAR_VERSION,
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_FINGERPRINT_VERSION,
  AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
  AUTOMATIC_PLAN_MODEL_VERSION,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_POLICY_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
} from './constants';
import { automaticPlanError } from './errors';
import type {
  AutomaticPlanProofProgress,
  AutomaticPlanRequest,
  CertifiedCompleteProof,
  CertifiedModelCertificate,
  ModelCertificate,
  SafeAutomaticPlanError,
} from './types';

export type ModelCertificateOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly certificate: CertifiedModelCertificate;
    }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

export type CompleteProofOutcome =
  | { readonly status: 'SUCCESS'; readonly proof: CertifiedCompleteProof }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

function evidenceIsComplete(certificate: ModelCertificate): boolean {
  const { evidence } = certificate;
  return (
    evidence.soundness === true &&
    evidence.completeness === true &&
    evidence.objectivePreservation === true &&
    evidence.exactIntegerRange === true &&
    evidence.exhaustiveOracle === true &&
    evidence.seededRandomizedComparison === true &&
    evidence.boundarySuite === true &&
    evidence.ruleToConstraintMapping === true &&
    evidence.toleranceSafetyProven === true
  );
}

export function isModelCertificateCompatible(
  request: AutomaticPlanRequest,
  certificate: ModelCertificate,
): boolean {
  return (
    validateAutomaticPlanRequest(request).status === 'SUCCESS' &&
    certificate.certificateVersion === AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION &&
    certificate.modelVersion === AUTOMATIC_PLAN_MODEL_VERSION &&
    certificate.fingerprintVersion === AUTOMATIC_PLAN_FINGERPRINT_VERSION &&
    certificate.rulesetVersion === AUTOMATIC_PLAN_RULESET_VERSION &&
    certificate.engineVersion === AUTOMATIC_PLAN_ENGINE_VERSION &&
    certificate.policyVersion === AUTOMATIC_PLAN_POLICY_VERSION &&
    certificate.objectiveVersion === AUTOMATIC_PLAN_OBJECTIVE_VERSION &&
    certificate.calendarVersion === AUTOMATIC_PLAN_CALENDAR_VERSION &&
    request.rulesetVersion === certificate.rulesetVersion &&
    request.engineVersion === certificate.engineVersion &&
    request.fingerprintVersion === certificate.fingerprintVersion &&
    request.policy.policyVersion === certificate.policyVersion &&
    request.policy.objectiveVersion === certificate.objectiveVersion &&
    request.calendar.calendarVersion === certificate.calendarVersion
  );
}

export function certifyModelCertificate(
  request: AutomaticPlanRequest,
  certificate: ModelCertificate,
): ModelCertificateOutcome {
  if (
    !isModelCertificateCompatible(request, certificate) ||
    certificate.certificateId.trim() === '' ||
    certificate.modelImplementationId.trim() === '' ||
    certificate.solverAdapterId.trim() === '' ||
    certificate.solverAdapterVersion.trim() === '' ||
    certificate.integerSemantics !== 'EXACT_SAFE_INTEGER' ||
    !evidenceIsComplete(certificate)
  ) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH',
        '활성 요청과 완전한 모델 인증서가 일치하지 않습니다.',
      ),
    };
  }
  return {
    status: 'SUCCESS',
    certificate: Object.freeze({
      ...certificate,
      evidence: Object.freeze({ ...certificate.evidence }),
    }) as CertifiedModelCertificate,
  };
}

export function certifyCompleteProof(
  request: AutomaticPlanRequest,
  certificate: CertifiedModelCertificate,
  progress: AutomaticPlanProofProgress,
  conclusion: 'OPTIMAL' | 'INFEASIBLE',
): CompleteProofOutcome {
  const expectedVectorLength = deriveAutomaticPlanCoordinates(request).length;
  if (
    !isModelCertificateCompatible(request, certificate) ||
    progress.stage !== 'COMPLETE' ||
    progress.provenScalarObjectiveCount !== 5 ||
    progress.provenVectorPrefix?.objective !== 'DETERMINISTIC_ALLOCATION_VECTOR' ||
    !isCanonicalNonNegativeSafeInteger(progress.provenVectorPrefix.length) ||
    progress.provenVectorPrefix.length !== expectedVectorLength ||
    (progress.primaryLowerBound !== null &&
      !isCanonicalNonNegativeSafeInteger(progress.primaryLowerBound)) ||
    (conclusion === 'OPTIMAL' && progress.primaryLowerBound === null)
  ) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_PROOF_INCOMPLETE',
        '모든 목적 단계와 최종 배정 벡터의 완전한 증명이 필요합니다.',
      ),
    };
  }
  const completeProgress = Object.freeze({
    ...progress,
    stage: 'COMPLETE' as const,
    provenVectorPrefix: Object.freeze({ ...progress.provenVectorPrefix }),
  });
  return {
    status: 'SUCCESS',
    proof: Object.freeze({
      problemFingerprint: request.problemFingerprint,
      certificateId: certificate.certificateId,
      conclusion,
      progress: completeProgress,
      allObjectiveStagesProven: true as const,
    }) as CertifiedCompleteProof,
  };
}
