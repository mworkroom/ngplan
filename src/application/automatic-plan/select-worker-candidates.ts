import {
  buildBranchRotationCandidateVariants,
  buildBranchSynchronizedCandidateVariants,
  compareAutomaticPlanObjectives,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanConstructionOutcome,
  type AutomaticPlanObjectiveVector,
  type AutomaticPlanRequest,
  type RawAutomaticPlanCandidate,
  type SafeAutomaticPlanError,
  type VerifiedAutomaticPlanCandidate,
} from '../../optimizer';

const BRANCH_REFINEMENT_FOCUS_LIMIT = 8;
const SMALL_ORGANIZATION_REFINEMENT_PASSES = 4;
const LARGE_ORGANIZATION_REFINEMENT_PASSES = 2;
const SMALL_ORGANIZATION_DIVERSE_SEED_LIMIT = 2;

export interface WorkerCandidateAssessment {
  readonly publishableCandidates: readonly RawAutomaticPlanCandidate[];
  readonly firstFailure: SafeAutomaticPlanError | null;
}

export interface WorkerTerminalFailure {
  readonly error: SafeAutomaticPlanError;
  readonly messageCode:
    | 'CONSTRUCTIVE_PLAN_FAILED'
    | 'EXACT_PROOF_BACKEND_UNAVAILABLE';
}

const NO_CANDIDATE_ERROR: SafeAutomaticPlanError = Object.freeze({
  code: 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
  message: '현재 조건으로 검증 가능한 자동 계획을 찾지 못했습니다.',
});

const PROOF_UNAVAILABLE_ERROR: SafeAutomaticPlanError = Object.freeze({
  code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE',
  message:
    '정확한 최소값 확인만 중단됐습니다. 찾은 검증 계획은 사용할 수 있습니다.',
});

/**
 * Worker-side preflight. The UI controller verifies every publication again,
 * while this pass prevents an invalid variant from being advertised as an
 * incumbent and preserves the first useful failure when no candidate survives.
 */
export function assessWorkerCandidateSources(
  request: AutomaticPlanRequest,
  sources: readonly AutomaticPlanConstructionOutcome[],
): WorkerCandidateAssessment {
  const publishableCandidates: RawAutomaticPlanCandidate[] = [];
  let firstFailure: SafeAutomaticPlanError | null = null;
  let bestObjective: AutomaticPlanObjectiveVector | null = null;
  const searchState: { bestCandidate: VerifiedAutomaticPlanCandidate | null } = {
    bestCandidate: null,
  };
  let verificationSequence = 0;
  const verifiedByAllocation = new Map<
    string,
    VerifiedAutomaticPlanCandidate | null
  >();
  const bestUnitSeedByMember = new Map<string, VerifiedAutomaticPlanCandidate>();

  const verifyCandidate = (
    candidate: RawAutomaticPlanCandidate,
  ): VerifiedAutomaticPlanCandidate | null => {
    const signature = JSON.stringify(candidate.allocations);
    const cached = verifiedByAllocation.get(signature);
    if (cached !== undefined || verifiedByAllocation.has(signature)) {
      return cached ?? null;
    }
    verificationSequence += 1;
    const verified = verifyAutomaticPlanCandidate(request, candidate, {
      candidateId: `worker-preflight-${verificationSequence}`,
      sequence: verificationSequence,
      foundAtElapsedMs: 0,
    });
    if (verified.status === 'FAILURE') {
      firstFailure ??= verified.error;
      verifiedByAllocation.set(signature, null);
      return null;
    }
    verifiedByAllocation.set(signature, verified.candidate);
    return verified.candidate;
  };

  const rememberDiverseSeeds = (
    candidate: VerifiedAutomaticPlanCandidate,
  ): void => {
    for (const item of candidate.display.highTargetMemberEquivalentUnitCounts) {
      const existing = bestUnitSeedByMember.get(item.memberKey);
      const existingItem = existing?.display.highTargetMemberEquivalentUnitCounts.find(
        (candidateItem) => candidateItem.memberKey === item.memberKey,
      );
      if (
        existing === undefined ||
        existingItem === undefined ||
        item.commissionEquivalentUnits > existingItem.commissionEquivalentUnits ||
        (
          item.commissionEquivalentUnits === existingItem.commissionEquivalentUnits &&
          compareAutomaticPlanObjectives(candidate.objective, existing.objective) < 0
        )
      ) {
        bestUnitSeedByMember.set(item.memberKey, candidate);
      }
    }
  };

  const publishIfBetter = (
    raw: RawAutomaticPlanCandidate,
    verified: VerifiedAutomaticPlanCandidate,
  ): boolean => {
    if (
      bestObjective !== null &&
      compareAutomaticPlanObjectives(verified.objective, bestObjective) >= 0
    ) return false;
    bestObjective = verified.objective;
    searchState.bestCandidate = verified;
    publishableCandidates.push(raw);
    return true;
  };

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    if (source.status === 'FAILURE') {
      firstFailure ??= source.error;
      continue;
    }
    const verified = verifyCandidate(source.candidate);
    if (verified === null) continue;
    rememberDiverseSeeds(verified);
    publishIfBetter(source.candidate, verified);
  }

  const initialBest = searchState.bestCandidate;
  if (initialBest !== null) {
    const canonicalIndex = new Map(request.canonicalMemberKeys.map(
      (memberKey, index) => [memberKey, index] as const,
    ));
    const worstMemberKeys = [...initialBest.display.highTargetMemberEquivalentUnitCounts]
      .sort((left, right) =>
        right.equivalentUnitShortfall - left.equivalentUnitShortfall ||
        canonicalIndex.get(left.memberKey)! -
          canonicalIndex.get(right.memberKey)!)
      .map((item) => item.memberKey);
    const diverseSeedLimit = request.canonicalMemberKeys.length <= 20
      ? SMALL_ORGANIZATION_DIVERSE_SEED_LIMIT
      : 0;
    const seeds: VerifiedAutomaticPlanCandidate[] = [initialBest];
    const seedSignatures = new Set([JSON.stringify(initialBest.allocations)]);
    for (const memberKey of worstMemberKeys) {
      if (seeds.length >= 1 + diverseSeedLimit) break;
      const seed = bestUnitSeedByMember.get(memberKey)!;
      const signature = JSON.stringify(seed.allocations);
      if (seedSignatures.has(signature)) continue;
      seedSignatures.add(signature);
      seeds.push(seed);
    }
    const refinementPasses = request.canonicalMemberKeys.length <= 20
      ? SMALL_ORGANIZATION_REFINEMENT_PASSES
      : LARGE_ORGANIZATION_REFINEMENT_PASSES;

    for (const seed of seeds) {
      let currentSeed = seed;
      for (let pass = 0; pass < refinementPasses; pass += 1) {
        const focusMemberKeys = [
          ...currentSeed.display.highTargetMemberEquivalentUnitCounts,
        ]
          .sort((left, right) =>
            right.equivalentUnitShortfall - left.equivalentUnitShortfall ||
            canonicalIndex.get(left.memberKey)! -
              canonicalIndex.get(right.memberKey)!)
          .slice(0, BRANCH_REFINEMENT_FOCUS_LIMIT)
          .map((item) => item.memberKey);
        const branchCandidates = [
          ...buildBranchSynchronizedCandidateVariants(
            request,
            currentSeed,
            focusMemberKeys,
          ),
          ...buildBranchRotationCandidateVariants(
            request,
            currentSeed,
            focusMemberKeys,
          ),
        ];
        let nextSeed = currentSeed;
        for (const raw of branchCandidates) {
          const verified = verifyCandidate(raw);
          if (verified === null) continue;
          publishIfBetter(raw, verified);
          if (
            compareAutomaticPlanObjectives(
              verified.objective,
              nextSeed.objective,
            ) < 0
          ) nextSeed = verified;
        }
        if (nextSeed === currentSeed) break;
        currentSeed = nextSeed;
      }
    }
  }

  return Object.freeze({
    publishableCandidates: Object.freeze(publishableCandidates),
    firstFailure,
  });
}

export function workerTerminalFailure(
  assessment: WorkerCandidateAssessment,
): WorkerTerminalFailure {
  if (assessment.publishableCandidates.length === 0) {
    return Object.freeze({
      error: assessment.firstFailure ?? NO_CANDIDATE_ERROR,
      messageCode: 'CONSTRUCTIVE_PLAN_FAILED',
    });
  }
  return Object.freeze({
    error: PROOF_UNAVAILABLE_ERROR,
    messageCode: 'EXACT_PROOF_BACKEND_UNAVAILABLE',
  });
}
