import {
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
  compareAutomaticPlanObjectives,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanProofProgress,
  type AutomaticPlanRequest,
  type AutomaticPlanRunState,
  type SafeAutomaticPlanError,
  type VerifiedAutomaticPlanCandidate,
} from '../../optimizer';
import { createAutomaticPlanCandidateId } from './candidate-identity';
import {
  AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
  isAutomaticPlanWorkerResponse,
  type AutomaticPlanWorkerRequest,
} from './worker-protocol';

export interface AutomaticPlanWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: AutomaticPlanWorkerRequest): void;
  terminate(): void;
}

export type AutomaticPlanWorkerFactory = () => AutomaticPlanWorkerLike;

export interface AutomaticPlanRunControllerOptions {
  readonly createWorker: AutomaticPlanWorkerFactory;
  readonly onStateChange: (state: AutomaticPlanRunState) => void;
  readonly onVerifiedCandidate?: (candidate: VerifiedAutomaticPlanCandidate) => void;
  readonly createRunId?: () => string;
  readonly cancelTerminationDelayMs?: number;
}

const INITIAL_PROOF: AutomaticPlanProofProgress = Object.freeze({
  stage: AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER[0],
  provenScalarObjectiveCount: 0,
  provenVectorPrefix: null,
  primaryLowerBound: null,
});

let runSequence = 0;

function safeWorkerError(message: string): SafeAutomaticPlanError {
  return Object.freeze({
    code: 'AUTOMATIC_PLAN_INTERNAL_ERROR',
    message,
  });
}

export class AutomaticPlanRunController {
  readonly #options: AutomaticPlanRunControllerOptions;
  #worker: AutomaticPlanWorkerLike | null = null;
  #runId: string | null = null;
  #request: AutomaticPlanRequest | null = null;
  #state: AutomaticPlanRunState | null = null;
  #lastCandidateSequence = 0;
  #cancelledRunIds = new Set<string>();
  #terminationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AutomaticPlanRunControllerOptions) {
    this.#options = options;
  }

  get state(): AutomaticPlanRunState | null {
    return this.#state;
  }

  start(request: AutomaticPlanRequest): string {
    this.#stopWorker();
    const runId = this.#options.createRunId?.() ?? `run-${++runSequence}`;
    const worker = this.#options.createWorker();
    this.#worker = worker;
    this.#runId = runId;
    this.#request = request;
    this.#lastCandidateSequence = 0;
    worker.onmessage = (event) => this.#handleMessage(event.data);
    worker.onerror = () => {
      if (this.#runId !== runId || this.#cancelledRunIds.has(runId)) return;
      this.#fail(0, safeWorkerError('자동 계획 작업을 불러오거나 계속하지 못했습니다.'));
    };
    this.#publish(Object.freeze({
      status: 'RUNNING',
      elapsedMs: 0,
      bestCandidate: null,
      proof: INITIAL_PROOF,
      messageCode: 'FINDING_USABLE_PLAN',
    }));
    worker.postMessage(Object.freeze({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'START',
      runId,
      request,
    }));
    return runId;
  }

  cancel(): void {
    const runId = this.#runId;
    const worker = this.#worker;
    if (runId === null || worker === null || this.#state?.status !== 'RUNNING') return;
    this.#cancelledRunIds.add(runId);
    worker.postMessage(Object.freeze({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'CANCEL',
      runId,
    }));
    this.#publish(Object.freeze({
      status: 'CANCELLED',
      elapsedMs: this.#state.elapsedMs,
      bestCandidate: this.#state.bestCandidate,
      proof: this.#state.proof,
      messageCode: 'CANCELLED_BY_OPERATOR',
    }));
    this.#terminationTimer = setTimeout(
      () => this.#stopWorker(runId),
      this.#options.cancelTerminationDelayMs ?? 250,
    );
  }

  dispose(): void {
    this.#stopWorker();
    this.#runId = null;
    this.#request = null;
  }

  #publish(state: AutomaticPlanRunState): void {
    this.#state = state;
    this.#options.onStateChange(state);
  }

  #handleMessage(data: unknown): void {
    if (!isAutomaticPlanWorkerResponse(data)) return;
    const runId = this.#runId;
    const request = this.#request;
    if (
      runId === null ||
      request === null ||
      data.runId !== runId ||
      this.#cancelledRunIds.has(runId)
    ) return;

    if (data.type === 'INCUMBENT') {
      if (
        !Number.isSafeInteger(data.candidateSequence) ||
        data.candidateSequence <= this.#lastCandidateSequence
      ) return;
      this.#lastCandidateSequence = data.candidateSequence;
      const identity = Object.freeze({
        candidateId: createAutomaticPlanCandidateId(
          request.problemFingerprint,
          data.candidateSequence,
          data.candidate.allocations,
        ),
        sequence: data.candidateSequence,
        foundAtElapsedMs: data.elapsedMs,
      });
      const verified = verifyAutomaticPlanCandidate(request, data.candidate, identity);
      if (verified.status === 'FAILURE') {
        this.#fail(data.elapsedMs, verified.error);
        return;
      }
      const currentCandidate = this.#state?.bestCandidate ?? null;
      if (
        currentCandidate !== null &&
        compareAutomaticPlanObjectives(
          verified.candidate.objective,
          currentCandidate.objective,
        ) >= 0
      ) {
        return;
      }
      const currentProof = this.#state?.proof ?? INITIAL_PROOF;
      const next = Object.freeze({
        status: 'RUNNING' as const,
        elapsedMs: Math.max(this.#state?.elapsedMs ?? 0, data.elapsedMs),
        bestCandidate: verified.candidate,
        proof: currentProof,
        messageCode: 'VERIFIED_PLAN_FOUND',
      });
      this.#publish(next);
      this.#options.onVerifiedCandidate?.(verified.candidate);
      return;
    }

    if (data.type === 'PROGRESS') {
      if (data.elapsedMs < (this.#state?.elapsedMs ?? 0)) return;
      const bestCandidate = this.#state?.bestCandidate ?? null;
      this.#publish(Object.freeze({
        status: 'RUNNING',
        elapsedMs: data.elapsedMs,
        bestCandidate,
        proof: data.proof,
        messageCode: data.messageCode,
      }));
      return;
    }

    if (data.type === 'COMPLETE') {
      const bestCandidate = this.#state?.bestCandidate ?? null;
      this.#publish(Object.freeze({
        status: data.status,
        elapsedMs: Math.max(this.#state?.elapsedMs ?? 0, data.elapsedMs),
        bestCandidate,
        proof: data.proof,
        messageCode: data.messageCode,
      }));
      this.#stopWorker(runId);
      return;
    }

    this.#fail(data.elapsedMs, data.error, data.proof, data.messageCode);
  }

  #fail(
    elapsedMs: number,
    error: SafeAutomaticPlanError,
    proof: AutomaticPlanProofProgress = this.#state?.proof ?? INITIAL_PROOF,
    messageCode = 'CALCULATION_FAILED',
  ): void {
    this.#publish(Object.freeze({
      status: 'FAILED',
      elapsedMs,
      bestCandidate: this.#state?.bestCandidate ?? null,
      proof,
      error,
      messageCode,
    }));
    this.#stopWorker(this.#runId ?? undefined);
  }

  #stopWorker(expectedRunId?: string): void {
    if (expectedRunId !== undefined && this.#runId !== expectedRunId) return;
    if (this.#terminationTimer !== null) {
      clearTimeout(this.#terminationTimer);
      this.#terminationTimer = null;
    }
    if (this.#worker !== null) {
      this.#worker.onmessage = null;
      this.#worker.onerror = null;
      this.#worker.terminate();
      this.#worker = null;
    }
  }
}
