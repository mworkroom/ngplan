import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildConstructiveCandidate,
  type AutomaticPlanProofProgress,
  type AutomaticPlanRunState,
} from '../../../optimizer';
import { AutomaticPlanRunController, type AutomaticPlanWorkerLike } from '../run-automatic-plan';
import {
  AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
  isAutomaticPlanWorkerResponse,
  type AutomaticPlanWorkerRequest,
  type AutomaticPlanWorkerResponse,
} from '../worker-protocol';
import { createAutomaticPlanRequest } from '../create-request';
import { createAutomaticPlanBundle } from './fixtures';

const PROOF: AutomaticPlanProofProgress = Object.freeze({
  stage: 'TOTAL_NEW_PV',
  provenScalarObjectiveCount: 0,
  provenVectorPrefix: null,
  primaryLowerBound: 5_000,
});

class FakeWorker implements AutomaticPlanWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: AutomaticPlanWorkerRequest[] = [];
  terminated = false;
  postMessage(message: AutomaticPlanWorkerRequest): void { this.sent.push(message); }
  terminate(): void { this.terminated = true; }
  emit(message: AutomaticPlanWorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
  emitUnknown(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

afterEach(() => vi.useRealTimers());

describe('automatic plan run controller', () => {
  it('ignores stale/decreasing messages and exposes only independently verified candidates', () => {
    const worker = new FakeWorker();
    const states: AutomaticPlanRunState[] = [];
    const candidates = vi.fn();
    const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
    if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
    const built = buildConstructiveCandidate(normalized.request);
    if (built.status !== 'SUCCESS') throw new Error(built.error.message);
    const controller = new AutomaticPlanRunController({
      createWorker: () => worker,
      createRunId: () => 'run-current',
      onStateChange: (state) => states.push(state),
      onVerifiedCandidate: candidates,
    });
    controller.start(normalized.request);
    expect(worker.sent[0]).toMatchObject({ type: 'START', runId: 'run-current' });

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'PROGRESS',
      runId: 'older-run',
      elapsedMs: 100,
      proof: PROOF,
      messageCode: 'STALE',
    });
    expect(states).toHaveLength(1);

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-current',
      elapsedMs: 10,
      candidateSequence: 1,
      candidate: built.candidate,
    });
    expect(candidates).toHaveBeenCalledOnce();
    expect(states.at(-1)?.bestCandidate?.objective.totalNewPv).toBe(5_700);

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'PROGRESS',
      runId: 'run-current',
      elapsedMs: 9,
      proof: PROOF,
      messageCode: 'DECREASING_PROGRESS',
    });
    expect(states.at(-1)?.elapsedMs).toBe(10);

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'PROGRESS',
      runId: 'run-current',
      elapsedMs: 11,
      proof: PROOF,
      messageCode: 'PROOF_PROGRESS',
    });
    expect(states.at(-1)).toMatchObject({
      status: 'RUNNING',
      elapsedMs: 11,
      bestCandidate: { sequence: 1 },
      messageCode: 'PROOF_PROGRESS',
    });

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-current',
      elapsedMs: 11,
      candidateSequence: 1,
      candidate: built.candidate,
    });
    expect(candidates).toHaveBeenCalledOnce();

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-current',
      elapsedMs: 12,
      candidateSequence: 2,
      candidate: built.candidate,
    });
    expect(candidates).toHaveBeenCalledOnce();

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'ERROR',
      runId: 'run-current',
      elapsedMs: 13,
      error: { code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE', message: 'proof unavailable' },
      proof: PROOF,
      messageCode: 'EXACT_PROOF_BACKEND_UNAVAILABLE',
    });
    expect(states.at(-1)).toMatchObject({
      status: 'FAILED',
      bestCandidate: { sequence: 1 },
      error: { code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE' },
    });
    expect(worker.terminated).toBe(true);
  });

  it('cancels cooperatively, preserves the incumbent, and blocks late mutation', () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const states: AutomaticPlanRunState[] = [];
    const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
    if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
    const built = buildConstructiveCandidate(normalized.request);
    if (built.status !== 'SUCCESS') throw new Error(built.error.message);
    const controller = new AutomaticPlanRunController({
      createWorker: () => worker,
      createRunId: () => 'run-cancel',
      cancelTerminationDelayMs: 20,
      onStateChange: (state) => states.push(state),
    });
    controller.start(normalized.request);
    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-cancel',
      elapsedMs: 5,
      candidateSequence: 1,
      candidate: built.candidate,
    });
    controller.cancel();
    expect(states.at(-1)).toMatchObject({ status: 'CANCELLED', bestCandidate: { sequence: 1 } });
    expect(worker.sent.at(-1)).toMatchObject({ type: 'CANCEL', runId: 'run-cancel' });

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-cancel',
      elapsedMs: 6,
      candidateSequence: 2,
      candidate: built.candidate,
    });
    expect(states.at(-1)?.bestCandidate?.sequence).toBe(1);
    vi.advanceTimersByTime(20);
    expect(worker.terminated).toBe(true);
  });

  it('turns an asset/worker error into a safe failed state', () => {
    const worker = new FakeWorker();
    const states: AutomaticPlanRunState[] = [];
    const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
    if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
    const controller = new AutomaticPlanRunController({
      createWorker: () => worker,
      onStateChange: (state) => states.push(state),
    });
    controller.start(normalized.request);
    worker.onerror?.({} as ErrorEvent);
    expect(states.at(-1)).toMatchObject({
      status: 'FAILED',
      bestCandidate: null,
      error: { code: 'AUTOMATIC_PLAN_INTERNAL_ERROR' },
    });
    controller.dispose();
  });

  it('publishes progress and terminal completion without a candidate', () => {
    const worker = new FakeWorker();
    const states: AutomaticPlanRunState[] = [];
    const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
    if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
    const controller = new AutomaticPlanRunController({
      createWorker: () => worker,
      createRunId: () => 'run-progress',
      onStateChange: (state) => states.push(state),
    });

    expect(controller.state).toBeNull();
    controller.cancel();
    controller.start(normalized.request);
    worker.emitUnknown({ broken: true });
    expect(states).toHaveLength(1);

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'PROGRESS',
      runId: 'run-progress',
      elapsedMs: 4,
      proof: PROOF,
      messageCode: 'BUILDING',
    });
    expect(controller.state).toMatchObject({
      status: 'RUNNING',
      elapsedMs: 4,
      bestCandidate: null,
      messageCode: 'BUILDING',
    });

    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'COMPLETE',
      runId: 'run-progress',
      elapsedMs: 8,
      status: 'TIME_LIMIT',
      proof: PROOF,
      messageCode: 'TIME_LIMIT_NO_CANDIDATE',
    });
    expect(controller.state).toMatchObject({
      status: 'TIME_LIMIT',
      elapsedMs: 8,
      bestCandidate: null,
    });
    expect(worker.terminated).toBe(true);
    const sentCount = worker.sent.length;
    controller.cancel();
    expect(worker.sent).toHaveLength(sentCount);
  });

  it('preserves the incumbent when a terminal completion reports an earlier elapsed time', () => {
    const worker = new FakeWorker();
    const states: AutomaticPlanRunState[] = [];
    const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
    if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
    const built = buildConstructiveCandidate(normalized.request);
    if (built.status !== 'SUCCESS') throw new Error(built.error.message);
    const controller = new AutomaticPlanRunController({
      createWorker: () => worker,
      createRunId: () => 'run-complete',
      onStateChange: (state) => states.push(state),
    });
    controller.start(normalized.request);
    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-complete',
      elapsedMs: 10,
      candidateSequence: 1,
      candidate: built.candidate,
    });
    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'COMPLETE',
      runId: 'run-complete',
      elapsedMs: 5,
      status: 'CANCELLED',
      proof: PROOF,
      messageCode: 'WORKER_CANCELLED',
    });

    expect(states.at(-1)).toMatchObject({
      status: 'CANCELLED',
      elapsedMs: 10,
      bestCandidate: { sequence: 1 },
    });
    expect(worker.terminated).toBe(true);
  });

  it('fails safely when an incumbent is rejected by independent verification', () => {
    const worker = new FakeWorker();
    const states: AutomaticPlanRunState[] = [];
    const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
    if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
    const built = buildConstructiveCandidate(normalized.request);
    if (built.status !== 'SUCCESS') throw new Error(built.error.message);
    const controller = new AutomaticPlanRunController({
      createWorker: () => worker,
      createRunId: () => 'run-rejected',
      onStateChange: (state) => states.push(state),
    });
    controller.start(normalized.request);
    worker.emit({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-rejected',
      elapsedMs: 3,
      candidateSequence: 1,
      candidate: { ...built.candidate, problemFingerprint: 'wrong-problem' },
    });

    expect(states.at(-1)).toMatchObject({
      status: 'FAILED',
      bestCandidate: null,
    });
    expect(worker.terminated).toBe(true);
  });

  it('restarts cleanly, ignores stale error callbacks, and uses default cancel termination', () => {
    vi.useFakeTimers();
    const workers = [new FakeWorker(), new FakeWorker()];
    let workerIndex = 0;
    const states: AutomaticPlanRunState[] = [];
    const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
    if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
    const controller = new AutomaticPlanRunController({
      createWorker: () => workers[workerIndex++]!,
      onStateChange: (state) => states.push(state),
    });

    const firstRunId = controller.start(normalized.request);
    const staleError = workers[0]!.onerror;
    const secondRunId = controller.start(normalized.request);
    expect(secondRunId).not.toBe(firstRunId);
    expect(workers[0]!.terminated).toBe(true);
    staleError?.({} as ErrorEvent);
    expect(controller.state).toMatchObject({ status: 'RUNNING' });

    const cancelledError = workers[1]!.onerror;
    controller.cancel();
    const sentCount = workers[1]!.sent.length;
    cancelledError?.({} as ErrorEvent);
    controller.cancel();
    expect(workers[1]!.sent).toHaveLength(sentCount);
    vi.advanceTimersByTime(249);
    expect(workers[1]!.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    expect(workers[1]!.terminated).toBe(true);
    controller.dispose();
  });

  it('validates protocol envelopes before dispatch', () => {
    expect(isAutomaticPlanWorkerResponse(null)).toBe(false);
    expect(isAutomaticPlanWorkerResponse({
      protocolVersion: '0.0.0', type: 'PROGRESS', runId: 'r', elapsedMs: 0,
    })).toBe(false);
    expect(isAutomaticPlanWorkerResponse({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'PROGRESS', runId: 'r', elapsedMs: 0,
    })).toBe(false);
    expect(isAutomaticPlanWorkerResponse({
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'PROGRESS',
      runId: 'r',
      elapsedMs: 0,
      proof: PROOF,
      messageCode: 'WORKING',
    })).toBe(true);
  });
});
