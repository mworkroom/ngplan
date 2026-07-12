import { verifyAutomaticPlanCandidate, type VerifiedAutomaticPlanCandidate } from '../../optimizer';
import {
  convertVerifiedAllocationsToManualPlanDraft,
  type ManualPlanDraft,
} from '../manual-plan';
import type { ProjectSetupBundle } from '../project-setup';
import { createAutomaticPlanCandidateId } from './candidate-identity';
import { createAutomaticPlanRequest } from './create-request';

export type ApplyAutomaticPlanCandidateOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly draft: ManualPlanDraft;
      readonly candidate: VerifiedAutomaticPlanCandidate;
    }
  | {
      readonly status: 'FAILURE';
      readonly draft: ManualPlanDraft;
      readonly code:
        | 'REQUEST_INVALID'
        | 'CANDIDATE_STALE'
        | 'CANDIDATE_IDENTITY_MISMATCH'
        | 'CANDIDATE_REJECTED'
        | 'DRAFT_CONVERSION_FAILED';
      readonly message: string;
    };

function failure(
  draft: ManualPlanDraft,
  code: Extract<ApplyAutomaticPlanCandidateOutcome, { status: 'FAILURE' }>['code'],
  message: string,
): ApplyAutomaticPlanCandidateOutcome {
  return Object.freeze({ status: 'FAILURE', draft, code, message });
}

export function applyVerifiedAutomaticPlanCandidate(
  bundle: ProjectSetupBundle,
  currentDraft: ManualPlanDraft,
  pinnedCandidate: VerifiedAutomaticPlanCandidate,
): ApplyAutomaticPlanCandidateOutcome {
  const normalized = createAutomaticPlanRequest(bundle);
  if (normalized.status === 'FAILURE') {
    return failure(currentDraft, 'REQUEST_INVALID', normalized.error.message);
  }
  const request = normalized.request;
  if (pinnedCandidate.problemFingerprint !== request.problemFingerprint) {
    return failure(
      currentDraft,
      'CANDIDATE_STALE',
      '선택한 자동 계획이 현재 설정과 다릅니다. 새로 계산해 주세요.',
    );
  }
  const expectedCandidateId = createAutomaticPlanCandidateId(
    request.problemFingerprint,
    pinnedCandidate.sequence,
    pinnedCandidate.allocations,
  );
  if (expectedCandidateId !== pinnedCandidate.candidateId) {
    return failure(
      currentDraft,
      'CANDIDATE_IDENTITY_MISMATCH',
      '선택한 자동 계획의 고정된 내용을 확인할 수 없습니다.',
    );
  }
  const verified = verifyAutomaticPlanCandidate(
    request,
    Object.freeze({
      problemFingerprint: pinnedCandidate.problemFingerprint,
      allocations: pinnedCandidate.allocations,
      claimedObjective: pinnedCandidate.objective,
    }),
    Object.freeze({
      candidateId: pinnedCandidate.candidateId,
      sequence: pinnedCandidate.sequence,
      foundAtElapsedMs: pinnedCandidate.foundAtElapsedMs,
    }),
  );
  if (verified.status === 'FAILURE') {
    return failure(currentDraft, 'CANDIDATE_REJECTED', verified.error.message);
  }

  const converted = convertVerifiedAllocationsToManualPlanDraft(
    bundle,
    verified.candidate.allocations,
    currentDraft,
  );
  if (converted.status === 'FAILURE') {
    return failure(
      currentDraft,
      'DRAFT_CONVERSION_FAILED',
      converted.issues[0]?.message ??
        '자동 계획을 계획표 형식으로 바꾸지 못했습니다.',
    );
  }
  return Object.freeze({
    status: 'SUCCESS',
    draft: converted.draft,
    candidate: verified.candidate,
  });
}
