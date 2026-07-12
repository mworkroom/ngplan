import type { NormalizedAllocationCell } from '../../engine';
import { createProblemFingerprint } from './fingerprint';

export function createAutomaticPlanCandidateId(
  problemFingerprint: string,
  sequence: number,
  allocations: readonly NormalizedAllocationCell[],
): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('후보 순번은 1 이상의 안전한 정수여야 합니다.');
  }
  const allocationFingerprint = createProblemFingerprint({ allocations });
  return `candidate:${problemFingerprint}:${sequence}:${allocationFingerprint.split(':').at(-1)}`;
}
