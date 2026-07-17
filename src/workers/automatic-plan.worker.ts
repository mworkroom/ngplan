/// <reference lib="webworker" />

import {
  buildConstructiveCandidateVariants,
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
  type AutomaticPlanProofProgress,
} from '../optimizer';
import {
  assessWorkerCandidateSources,
  workerTerminalFailure,
} from '../application/automatic-plan/select-worker-candidates';
import {
  AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
  type AutomaticPlanWorkerRequest,
  type AutomaticPlanWorkerResponse,
} from '../application/automatic-plan/worker-protocol';

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const INITIAL_PROOF: AutomaticPlanProofProgress = Object.freeze({
  stage: AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER[0],
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
    const constructions = buildConstructiveCandidateVariants(message.request);
    const sources = [
      ...(message.request.warmStart === undefined
        ? []
        : [Object.freeze({
            status: 'SUCCESS' as const,
            candidate: Object.freeze({
              problemFingerprint: message.request.problemFingerprint,
              allocations: message.request.warmStart,
            }),
          })]),
      ...constructions,
    ];
    const assessment = assessWorkerCandidateSources(message.request, sources);
    let sequence = 0;
    for (const candidate of assessment.publishableCandidates) {
      if (cancelled || activeRunId !== message.runId) return;
      sequence += 1;
      post(Object.freeze({
        protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
        type: 'INCUMBENT',
        runId: message.runId,
        elapsedMs: elapsed(startedAt),
        candidateSequence: sequence,
        candidate,
      }));
    }
    const terminal = workerTerminalFailure(assessment);
    if (sequence === 0) {
      post(Object.freeze({
        protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
        type: 'ERROR',
        runId: message.runId,
        elapsedMs: elapsed(startedAt),
        error: terminal.error,
        proof: INITIAL_PROOF,
        messageCode: terminal.messageCode,
      }));
      activeRunId = null;
      return;
    }

    post(Object.freeze({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'ERROR',
      runId: message.runId,
      elapsedMs: elapsed(startedAt),
      error: terminal.error,
      proof: INITIAL_PROOF,
      messageCode: terminal.messageCode,
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
