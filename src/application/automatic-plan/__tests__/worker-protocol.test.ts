import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
  AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT,
} from '../../../optimizer';
import {
  AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
  isAutomaticPlanWorkerResponse,
} from '../worker-protocol';

const PROOF = Object.freeze({
  stage: AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER[0],
  provenScalarObjectiveCount: 0,
  provenVectorPrefix: null,
  primaryLowerBound: null,
});

const progress = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
  type: 'PROGRESS',
  runId: 'run-protocol',
  elapsedMs: 0,
  proof: PROOF,
  messageCode: 'WORKING',
  ...overrides,
});

describe('automatic plan worker protocol variants', () => {
  it.each([
    null,
    [],
    progress({ protocolVersion: '1.0.0' }),
    progress({ type: 'UNKNOWN' }),
    progress({ runId: 1 }),
    progress({ elapsedMs: '0' }),
    progress({ elapsedMs: Number.POSITIVE_INFINITY }),
    progress({ elapsedMs: -1 }),
  ])('rejects an invalid common envelope: %j', (value) => {
    expect(isAutomaticPlanWorkerResponse(value)).toBe(false);
  });

  it('validates every incumbent-specific field', () => {
    const valid = {
      protocolVersion: AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION,
      type: 'INCUMBENT',
      runId: 'run-protocol',
      elapsedMs: 1,
      candidateSequence: 1,
      candidate: { problemFingerprint: 'problem', allocations: [] },
    };
    expect(isAutomaticPlanWorkerResponse(valid)).toBe(true);
    for (const invalid of [
      { ...valid, candidateSequence: 0 },
      { ...valid, candidateSequence: 1.5 },
      { ...valid, candidate: null },
      { ...valid, candidate: { problemFingerprint: 1, allocations: [] } },
      { ...valid, candidate: { problemFingerprint: 'problem', allocations: {} } },
    ]) {
      expect(isAutomaticPlanWorkerResponse(invalid)).toBe(false);
    }
  });

  it('validates proof progress scalar, bound, and vector-prefix variants', () => {
    expect(isAutomaticPlanWorkerResponse(progress())).toBe(true);
    for (const objective of [
      'PRIORITY_DEPTH_ASCENDING_VECTOR',
      'HIGH_TARGET_ASCENDING_VECTOR',
      'TARGET_700_ASCENDING_VECTOR',
      'DETERMINISTIC_ALLOCATION_VECTOR',
    ]) {
      expect(
        isAutomaticPlanWorkerResponse(progress({
          proof: {
            ...PROOF,
            provenVectorPrefix: { objective, length: 1 },
          },
        })),
      ).toBe(true);
    }
    for (const proof of [
      null,
      { ...PROOF, stage: 1 },
      { ...PROOF, stage: 'TARGET_700_AT_LEAST_EIGHT' },
      { ...PROOF, provenScalarObjectiveCount: 1.5 },
      { ...PROOF, provenScalarObjectiveCount: -1 },
      {
        ...PROOF,
        provenScalarObjectiveCount:
          AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT + 1,
      },
      { ...PROOF, primaryLowerBound: 1.5 },
      { ...PROOF, primaryLowerBound: -1 },
      { ...PROOF, provenVectorPrefix: 'prefix' },
      {
        ...PROOF,
        provenVectorPrefix: { objective: 'VECTOR', length: 1 },
      },
      {
        ...PROOF,
        provenVectorPrefix: {
          objective: 'TARGET_700_ASCENDING_VECTOR',
          length: -1,
        },
      },
      {
        ...PROOF,
        provenVectorPrefix: {
          objective: 'TARGET_700_ASCENDING_VECTOR',
          length: 1.5,
        },
      },
    ]) {
      expect(isAutomaticPlanWorkerResponse(progress({ proof }))).toBe(false);
    }
    expect(isAutomaticPlanWorkerResponse(progress({ messageCode: 1 }))).toBe(false);
  });

  it('accepts only supported terminal completion statuses', () => {
    const complete = (status: unknown) => progress({ type: 'COMPLETE', status });
    expect(isAutomaticPlanWorkerResponse(complete('TIME_LIMIT'))).toBe(true);
    expect(isAutomaticPlanWorkerResponse(complete('CANCELLED'))).toBe(true);
    expect(isAutomaticPlanWorkerResponse(complete('OPTIMAL'))).toBe(false);
  });

  it('validates error response code and message fields', () => {
    const error = (value: unknown) => progress({ type: 'ERROR', error: value });
    expect(
      isAutomaticPlanWorkerResponse(error({ code: 'FAILED', message: 'failed' })),
    ).toBe(true);
    expect(isAutomaticPlanWorkerResponse(error(null))).toBe(false);
    expect(isAutomaticPlanWorkerResponse(error({ code: 1, message: 'failed' }))).toBe(false);
    expect(isAutomaticPlanWorkerResponse(error({ code: 'FAILED', message: 1 }))).toBe(false);
  });
});
