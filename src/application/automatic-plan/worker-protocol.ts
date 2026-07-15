import {
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
  AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT,
  AUTOMATIC_PLAN_VECTOR_OBJECTIVE_STAGES,
  isCanonicalNonNegativeSafeInteger,
  type AutomaticPlanProofProgress,
  type AutomaticPlanRequest,
  type RawAutomaticPlanCandidate,
  type SafeAutomaticPlanError,
} from '../../optimizer';

export const AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION = '2.0.0' as const;

const PROOF_STAGE_SET: ReadonlySet<string> = new Set([
  ...AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
  'COMPLETE',
]);

const PROOF_VECTOR_OBJECTIVE_SET: ReadonlySet<string> = new Set(
  AUTOMATIC_PLAN_VECTOR_OBJECTIVE_STAGES,
);

export type AutomaticPlanWorkerRequest =
  | {
      readonly protocolVersion: typeof AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION;
      readonly type: 'START';
      readonly runId: string;
      readonly request: AutomaticPlanRequest;
    }
  | {
      readonly protocolVersion: typeof AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION;
      readonly type: 'CANCEL';
      readonly runId: string;
    };

export type AutomaticPlanWorkerResponse =
  | {
      readonly protocolVersion: typeof AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION;
      readonly type: 'PROGRESS';
      readonly runId: string;
      readonly elapsedMs: number;
      readonly proof: AutomaticPlanProofProgress;
      readonly messageCode: string;
    }
  | {
      readonly protocolVersion: typeof AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION;
      readonly type: 'INCUMBENT';
      readonly runId: string;
      readonly elapsedMs: number;
      readonly candidateSequence: number;
      readonly candidate: RawAutomaticPlanCandidate;
    }
  | {
      readonly protocolVersion: typeof AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION;
      readonly type: 'COMPLETE';
      readonly runId: string;
      readonly elapsedMs: number;
      readonly status: 'TIME_LIMIT' | 'CANCELLED';
      readonly proof: AutomaticPlanProofProgress;
      readonly messageCode: string;
    }
  | {
      readonly protocolVersion: typeof AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION;
      readonly type: 'ERROR';
      readonly runId: string;
      readonly elapsedMs: number;
      readonly error: SafeAutomaticPlanError;
      readonly proof: AutomaticPlanProofProgress;
      readonly messageCode: string;
    };

export function isAutomaticPlanWorkerResponse(
  value: unknown,
): value is AutomaticPlanWorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Readonly<Record<string, unknown>>;
  if (!(
    record.protocolVersion === AUTOMATIC_PLAN_WORKER_PROTOCOL_VERSION &&
    typeof record.type === 'string' &&
    ['PROGRESS', 'INCUMBENT', 'COMPLETE', 'ERROR'].includes(record.type) &&
    typeof record.runId === 'string' &&
    typeof record.elapsedMs === 'number' &&
    Number.isFinite(record.elapsedMs) &&
    record.elapsedMs >= 0
  )) return false;

  const isRecord = (candidate: unknown): candidate is Readonly<Record<string, unknown>> =>
    typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
  const isVectorPrefix = (candidate: unknown): boolean => {
    if (!isRecord(candidate)) return false;
    return (
      typeof candidate.objective === 'string' &&
      PROOF_VECTOR_OBJECTIVE_SET.has(candidate.objective) &&
      isCanonicalNonNegativeSafeInteger(candidate.length)
    );
  };
  const isProof = (candidate: unknown): boolean => {
    if (!isRecord(candidate)) return false;
    return (
      typeof candidate.stage === 'string' &&
      PROOF_STAGE_SET.has(candidate.stage) &&
      isCanonicalNonNegativeSafeInteger(candidate.provenScalarObjectiveCount) &&
      candidate.provenScalarObjectiveCount <=
        AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT &&
      (candidate.primaryLowerBound === null ||
        isCanonicalNonNegativeSafeInteger(candidate.primaryLowerBound)) &&
      (candidate.provenVectorPrefix === null ||
        isVectorPrefix(candidate.provenVectorPrefix))
    );
  };

  if (record.type === 'INCUMBENT') {
    return (
      Number.isSafeInteger(record.candidateSequence) &&
      (record.candidateSequence as number) >= 1 &&
      isRecord(record.candidate) &&
      typeof record.candidate.problemFingerprint === 'string' &&
      Array.isArray(record.candidate.allocations)
    );
  }
  if (!isProof(record.proof) || typeof record.messageCode !== 'string') return false;
  if (record.type === 'PROGRESS') return true;
  if (record.type === 'COMPLETE') {
    return record.status === 'TIME_LIMIT' || record.status === 'CANCELLED';
  }
  return (
    isRecord(record.error) &&
    typeof record.error.code === 'string' &&
    typeof record.error.message === 'string'
  );
}
