/// <reference lib="webworker" />

import {
  buildConstructiveCandidateVariants,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanProofProgress,
  type SafeAutomaticPlanError,
} from '../optimizer';
import {
  AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
  type AutomaticPlanWorkerRequest,
  type AutomaticPlanWorkerResponse,
} from '../application/automatic-plan/worker-protocol';

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const INITIAL_PROOF: AutomaticPlanProofProgress = Object.freeze({
  stage: 'TOTAL_NEW_PV',
  provenScalarObjectiveCount: 0,
  provenVectorPrefix: null,
  primaryLowerBound: null,
});

let activeRunId: string | null = null;
let cancelled = false;

function post(message: AutomaticPlanWorkerResponse): void {
  workerScope.postMessage(message);
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.floor(performance.now() - startedAt));
}

function proofUnavailableError(): SafeAutomaticPlanError {
  return Object.freeze({
    code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE',
    message:
      '브라우저에서 완전한 최소값을 증명할 정확 솔버가 아직 승인되지 않았습니다. 찾은 검증 계획은 사용할 수 있습니다.',
  });
}

function handleStart(message: Extract<AutomaticPlanWorkerRequest, { readonly type: 'START' }>): void {
  activeRunId = message.runId;
  cancelled = false;
  const startedAt = performance.now();
  post(Object.freeze({
    protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
    type: 'PROGRESS',
    runId: message.runId,
    elapsedMs: 0,
    proof: INITIAL_PROOF,
    messageCode: 'BUILDING_VERIFIED_INCUMBENT',
  }));

  queueMicrotask(() => {
    if (cancelled || activeRunId !== message.runId) return;
    let sequence = 0;
    if (message.request.warmStart !== undefined) {
      sequence += 1;
      post(Object.freeze({
        protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
        type: 'INCUMBENT',
        runId: message.runId,
        elapsedMs: elapsed(startedAt),
        candidateSequence: sequence,
        candidate: Object.freeze({
          problemFingerprint: message.request.problemFingerprint,
          allocations: message.request.warmStart,
        }),
      }));
    }

    const constructions = buildConstructiveCandidateVariants(message.request);
    let constructionPosted = false;
    let constructionFailure: SafeAutomaticPlanError | null = null;
    for (let index = 0; index < constructions.length; index += 1) {
      const construction = constructions[index]!;
      if (cancelled || activeRunId !== message.runId) return;
      if (construction.status === 'FAILURE') {
        constructionFailure ??= construction.error;
        continue;
      }
      if (index > 0) {
        const checked = verifyAutomaticPlanCandidate(
          message.request,
          construction.candidate,
          {
            candidateId: `worker-constructive-${index + 1}`,
            sequence: index + 1,
            foundAtElapsedMs: 0,
          },
        );
        if (checked.status === 'FAILURE') continue;
      }
      sequence += 1;
      constructionPosted = true;
      post(Object.freeze({
        protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
        type: 'INCUMBENT',
        runId: message.runId,
        elapsedMs: elapsed(startedAt),
        candidateSequence: sequence,
        candidate: construction.candidate,
      }));
    }
    if (!constructionPosted && sequence === 0) {
      post(Object.freeze({
        protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
        type: 'ERROR',
        runId: message.runId,
        elapsedMs: elapsed(startedAt),
        error: constructionFailure ?? proofUnavailableError(),
        proof: INITIAL_PROOF,
        messageCode: 'CONSTRUCTIVE_PLAN_FAILED',
      }));
      activeRunId = null;
      return;
    }

    post(Object.freeze({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'ERROR',
      runId: message.runId,
      elapsedMs: elapsed(startedAt),
      error: proofUnavailableError(),
      proof: INITIAL_PROOF,
      messageCode: 'EXACT_PROOF_BACKEND_UNAVAILABLE',
    }));
    activeRunId = null;
  });
}

workerScope.onmessage = (event: MessageEvent<AutomaticPlanWorkerRequest>) => {
  const message = event.data;
  if (message.protocolVersion !== AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION) return;
  if (message.type === 'START') {
    handleStart(message);
    return;
  }
  if (message.runId !== activeRunId) return;
  cancelled = true;
  post(Object.freeze({
    protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
    type: 'COMPLETE',
    runId: message.runId,
    elapsedMs: 0,
    status: 'CANCELLED',
    proof: INITIAL_PROOF,
    messageCode: 'CANCELLED_BY_OPERATOR',
  }));
  activeRunId = null;
};

export {};
