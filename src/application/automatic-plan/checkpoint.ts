import {
  AUTOMATIC_PLAN_CALENDAR_VERSION,
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanDisplayMetrics,
  type AutomaticPlanObjectiveVector,
  type AutomaticPlanRequest,
  type VerifiedAutomaticPlanCandidate,
} from '../../optimizer';
import { createAutomaticPlanCandidateId } from './candidate-identity';
import { canonicalStringify } from './fingerprint';

export const AUTOMATIC_PLAN_CHECKPOINT_VERSION = '2.0.0' as const;

export interface AutomaticPlanCheckpoint
  extends Readonly<Record<string, unknown>> {
  readonly checkpointVersion: typeof AUTOMATIC_PLAN_CHECKPOINT_VERSION;
  readonly problemFingerprint: string;
  readonly rulesetVersion: typeof AUTOMATIC_PLAN_RULESET_VERSION;
  readonly engineVersion: typeof AUTOMATIC_PLAN_ENGINE_VERSION;
  readonly objectiveVersion: typeof AUTOMATIC_PLAN_OBJECTIVE_VERSION;
  readonly calendarVersion: typeof AUTOMATIC_PLAN_CALENDAR_VERSION;
  readonly modelCertificateVersion: typeof AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION;
  readonly candidateId: string;
  readonly sequence: number;
  readonly foundAtElapsedMs: number;
  readonly allocations: VerifiedAutomaticPlanCandidate['allocations'];
  readonly objective: AutomaticPlanObjectiveVector;
  readonly display: AutomaticPlanDisplayMetrics;
  readonly savedAtIso: string;
}

export type RestoreAutomaticPlanCheckpointOutcome =
  | { readonly status: 'RESTORED'; readonly candidate: VerifiedAutomaticPlanCandidate }
  | { readonly status: 'EMPTY' }
  | { readonly status: 'IGNORED'; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAutomaticPlanCheckpointSnapshot(
  value: unknown,
): AutomaticPlanCheckpoint | null {
  if (
      !isRecord(value) ||
      value.checkpointVersion !== AUTOMATIC_PLAN_CHECKPOINT_VERSION ||
      value.rulesetVersion !== AUTOMATIC_PLAN_RULESET_VERSION ||
      value.engineVersion !== AUTOMATIC_PLAN_ENGINE_VERSION ||
      value.objectiveVersion !== AUTOMATIC_PLAN_OBJECTIVE_VERSION ||
      value.calendarVersion !== AUTOMATIC_PLAN_CALENDAR_VERSION ||
      value.modelCertificateVersion !== AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION ||
      typeof value.problemFingerprint !== 'string' ||
      typeof value.candidateId !== 'string' ||
      !Number.isSafeInteger(value.sequence) ||
      (value.sequence as number) < 1 ||
      typeof value.foundAtElapsedMs !== 'number' ||
      !Number.isFinite(value.foundAtElapsedMs) ||
      value.foundAtElapsedMs < 0 ||
      !Array.isArray(value.allocations) ||
      !isRecord(value.objective) ||
      !isRecord(value.display) ||
      typeof value.savedAtIso !== 'string'
  ) {
    return null;
  }
  return value as unknown as AutomaticPlanCheckpoint;
}

export function createAutomaticPlanCheckpointSnapshot(
  candidate: VerifiedAutomaticPlanCandidate,
  savedAt = new Date(),
): AutomaticPlanCheckpoint {
  return Object.freeze({
    checkpointVersion: AUTOMATIC_PLAN_CHECKPOINT_VERSION,
    problemFingerprint: candidate.problemFingerprint,
    rulesetVersion: AUTOMATIC_PLAN_RULESET_VERSION,
    engineVersion: AUTOMATIC_PLAN_ENGINE_VERSION,
    objectiveVersion: AUTOMATIC_PLAN_OBJECTIVE_VERSION,
    calendarVersion: AUTOMATIC_PLAN_CALENDAR_VERSION,
    modelCertificateVersion: AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
    candidateId: candidate.candidateId,
    sequence: candidate.sequence,
    foundAtElapsedMs: candidate.foundAtElapsedMs,
    allocations: candidate.allocations,
    objective: candidate.objective,
    display: candidate.display,
    savedAtIso: savedAt.toISOString(),
  });
}

export function restoreAutomaticPlanCheckpointSnapshot(
  request: AutomaticPlanRequest,
  snapshot: unknown,
): RestoreAutomaticPlanCheckpointOutcome {
  if (snapshot === null || snapshot === undefined) {
    return Object.freeze({ status: 'EMPTY' });
  }
  const checkpoint = parseAutomaticPlanCheckpointSnapshot(snapshot);
  return restoreParsedCheckpoint(request, checkpoint);
}

function restoreParsedCheckpoint(
  request: AutomaticPlanRequest,
  checkpoint: AutomaticPlanCheckpoint | null,
): RestoreAutomaticPlanCheckpointOutcome {
  if (checkpoint === null) {
    return Object.freeze({ status: 'IGNORED', reason: 'CHECKPOINT_MALFORMED' });
  }
  if (checkpoint.problemFingerprint !== request.problemFingerprint) {
    return Object.freeze({ status: 'IGNORED', reason: 'CHECKPOINT_FINGERPRINT_MISMATCH' });
  }
  const expectedCandidateId = createAutomaticPlanCandidateId(
    request.problemFingerprint,
    checkpoint.sequence,
    checkpoint.allocations,
  );
  if (checkpoint.candidateId !== expectedCandidateId) {
    return Object.freeze({ status: 'IGNORED', reason: 'CHECKPOINT_IDENTITY_MISMATCH' });
  }
  const verified = verifyAutomaticPlanCandidate(
    request,
    Object.freeze({
      problemFingerprint: checkpoint.problemFingerprint,
      allocations: checkpoint.allocations,
      claimedObjective: checkpoint.objective,
    }),
    Object.freeze({
      candidateId: checkpoint.candidateId,
      sequence: checkpoint.sequence,
      foundAtElapsedMs: checkpoint.foundAtElapsedMs,
    }),
  );
  if (verified.status === 'FAILURE') {
    return Object.freeze({ status: 'IGNORED', reason: verified.error.code });
  }
  if (
    canonicalStringify(verified.candidate.objective) !== canonicalStringify(checkpoint.objective) ||
    canonicalStringify(verified.candidate.display) !== canonicalStringify(checkpoint.display)
  ) {
    return Object.freeze({ status: 'IGNORED', reason: 'CHECKPOINT_SUMMARY_MISMATCH' });
  }
  return Object.freeze({ status: 'RESTORED', candidate: verified.candidate });
}
