import {
  commissionEquivalentUnitsForTier,
} from '../../engine';
import {
  buildBranchRotationCandidateVariants,
  buildBranchSynchronizedCandidateVariants,
  buildBoundaryMoveCandidateVariants,
  buildCommissionBoundaryCandidateVariants,
  buildFinishingPvCandidateVariants,
  compareAutomaticPlanObjectives,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanConstructionOutcome,
  type AutomaticPlanObjectiveVector,
  type AutomaticPlanRequest,
  type RawAutomaticPlanCandidate,
  type SafeAutomaticPlanError,
  type VerifiedAutomaticPlanCandidate,
} from '../../optimizer';

const BRANCH_REFINEMENT_FOCUS_LIMIT = 12;
const SMALL_ORGANIZATION_REFINEMENT_PASSES = 8;
const LARGE_ORGANIZATION_REFINEMENT_PASSES = 2;
const SMALL_ORGANIZATION_REFINEMENT_BEAM_WIDTH = 6;
const SMALL_ORGANIZATION_BOUNDARY_MOVE_PASSES = 3;
const SMALL_ORGANIZATION_COMMISSION_BOUNDARY_PASSES = 4;
const SMALL_ORGANIZATION_COMMISSION_BOUNDARY_BEAM_WIDTH = 5;
const SMALL_ORGANIZATION_FINISHING_PV_PASSES = 3;

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
  const assessedAllocationSignatures = new Set<string>();
  const rootMemberKey = request.organization.members.find(
    (member) => member.parentMemberKey === null,
  )!.memberKey;

  const verifyCandidate = (
    candidate: RawAutomaticPlanCandidate,
  ): VerifiedAutomaticPlanCandidate | null => {
    const signature = JSON.stringify(candidate.allocations);
    if (assessedAllocationSignatures.has(signature)) return null;
    assessedAllocationSignatures.add(signature);
    verificationSequence += 1;
    const verified = verifyAutomaticPlanCandidate(request, candidate, {
      candidateId: `worker-preflight-${verificationSequence}`,
      sequence: verificationSequence,
      foundAtElapsedMs: 0,
    });
    if (verified.status === 'FAILURE') {
      firstFailure ??= verified.error;
      return null;
    }
    return verified.candidate;
  };

  const equivalentUnitsForMember = (
    candidate: VerifiedAutomaticPlanCandidate,
    memberKey: string,
  ): number => {
    const item = [
      ...candidate.display.highTargetMemberEquivalentUnitCounts,
      ...candidate.display.target700MemberEquivalentUnitCounts,
    ].find((candidateItem) => candidateItem.memberKey === memberKey);
    if (item !== undefined) return item.commissionEquivalentUnits;
    if (memberKey !== rootMemberKey) return 0;
    return request.calendar.dates.reduce((total, date) => {
      const settlement = candidate.calculation.dailySettlementByDateAndMember[
        date
      ]![memberKey]!;
      if (settlement.settlementKind !== 'FULL_COMMISSION') return total;
      const units = settlement.commissionTier === null
        ? null
        : commissionEquivalentUnitsForTier(settlement.commissionTier);
      return total + (units ?? 0);
    }, 0);
  };

  const totalEquivalentUnits = (
    candidate: VerifiedAutomaticPlanCandidate,
  ): number => request.canonicalMemberKeys.reduce(
    (total, memberKey) => total + equivalentUnitsForMember(candidate, memberKey),
    0,
  );

  const selectRefinementFrontier = (
    candidates: readonly VerifiedAutomaticPlanCandidate[],
    memberKeys: readonly string[],
    width: number,
  ): readonly VerifiedAutomaticPlanCandidate[] => {
    const unique = new Map<string, VerifiedAutomaticPlanCandidate>();
    for (const candidate of candidates) {
      const signature = JSON.stringify(candidate.allocations);
      const existing = unique.get(signature);
      if (
        existing === undefined ||
        compareAutomaticPlanObjectives(candidate.objective, existing.objective) < 0
      ) unique.set(signature, candidate);
    }
    const ranked = [...unique.values()].sort((left, right) =>
      compareAutomaticPlanObjectives(left.objective, right.objective));
    const globalBest = ranked[0];
    if (globalBest === undefined) return Object.freeze([]);

    const selected: VerifiedAutomaticPlanCandidate[] = [];
    const selectedSignatures = new Set<string>();
    const add = (candidate: VerifiedAutomaticPlanCandidate): void => {
      if (selected.length >= width) return;
      const signature = JSON.stringify(candidate.allocations);
      if (selectedSignatures.has(signature)) return;
      selectedSignatures.add(signature);
      selected.push(candidate);
    };
    add(globalBest);
    const totalUnitBest = [...ranked].sort((left, right) =>
      totalEquivalentUnits(right) - totalEquivalentUnits(left) ||
      compareAutomaticPlanObjectives(left.objective, right.objective))[0];
    if (totalUnitBest !== undefined) add(totalUnitBest);

    const specialists = memberKeys.flatMap((memberKey) => {
      const best = [...ranked].sort((left, right) =>
        equivalentUnitsForMember(right, memberKey) -
          equivalentUnitsForMember(left, memberKey) ||
        compareAutomaticPlanObjectives(left.objective, right.objective))[0];
      if (best === undefined) return [];
      return [{
        candidate: best,
        gain: equivalentUnitsForMember(best, memberKey) -
          equivalentUnitsForMember(globalBest, memberKey),
      }];
    }).sort((left, right) =>
      right.gain - left.gain ||
      compareAutomaticPlanObjectives(left.candidate.objective, right.candidate.objective));
    for (const specialist of specialists) add(specialist.candidate);
    for (const candidate of ranked) add(candidate);
    return Object.freeze(selected);
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
    publishIfBetter(source.candidate, verified);
  }

  const initialBest = searchState.bestCandidate;
  if (initialBest !== null) {
    const canonicalIndex = new Map(request.canonicalMemberKeys.map(
      (memberKey, index) => [memberKey, index] as const,
    ));
    const refinementPasses = request.canonicalMemberKeys.length <= 20
      ? SMALL_ORGANIZATION_REFINEMENT_PASSES
      : LARGE_ORGANIZATION_REFINEMENT_PASSES;
    let frontier: readonly VerifiedAutomaticPlanCandidate[] = [initialBest];
    for (let pass = 0; pass < refinementPasses; pass += 1) {
      const focusMemberKeys = [
        ...frontier[0]!.display.highTargetMemberEquivalentUnitCounts,
        ...frontier[0]!.display.target700MemberEquivalentUnitCounts,
      ]
        .sort((left, right) =>
          right.baseEntitlementEquivalentUnitShortfall -
            left.baseEntitlementEquivalentUnitShortfall ||
          right.equivalentUnitShortfall - left.equivalentUnitShortfall ||
          canonicalIndex.get(left.memberKey)! -
            canonicalIndex.get(right.memberKey)!)
        .slice(0, BRANCH_REFINEMENT_FOCUS_LIMIT)
        .map((item) => item.memberKey);
      const verifiedPool: VerifiedAutomaticPlanCandidate[] = [...frontier];
      for (const currentSeed of frontier) {
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
        for (const raw of branchCandidates) {
          const verified = verifyCandidate(raw);
          if (verified === null) continue;
          publishIfBetter(raw, verified);
          verifiedPool.push(verified);
        }
      }
      const nextFrontier = selectRefinementFrontier(
        verifiedPool,
        focusMemberKeys,
        request.canonicalMemberKeys.length <= 20
          ? SMALL_ORGANIZATION_REFINEMENT_BEAM_WIDTH
          : 1,
      );
      const previousSignatures = new Set(frontier.map(
        (candidate) => JSON.stringify(candidate.allocations),
      ));
      if (
        nextFrontier.length === frontier.length &&
        nextFrontier.every((candidate) =>
          previousSignatures.has(JSON.stringify(candidate.allocations)))
      ) break;
      frontier = nextFrontier;
    }
  }

  if (
    request.canonicalMemberKeys.length <= 20 &&
    searchState.bestCandidate !== null
  ) {
    let localSeed = searchState.bestCandidate;
    for (
      let pass = 0;
      pass < SMALL_ORGANIZATION_BOUNDARY_MOVE_PASSES;
      pass += 1
    ) {
      let nextSeed = localSeed;
      for (const raw of buildBoundaryMoveCandidateVariants(request, localSeed)) {
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
      if (nextSeed === localSeed) break;
      localSeed = nextSeed;
    }
  }

  if (
    request.canonicalMemberKeys.length <= 20 &&
    searchState.bestCandidate !== null
  ) {
    let boundaryFrontier: readonly VerifiedAutomaticPlanCandidate[] = [
      searchState.bestCandidate,
    ];
    const nonRootFocusMemberKeys = [
      ...searchState.bestCandidate.display.highTargetMemberEquivalentUnitCounts,
      ...searchState.bestCandidate.display.target700MemberEquivalentUnitCounts,
    ]
      .sort((left, right) =>
        right.baseEntitlementEquivalentUnitShortfall -
          left.baseEntitlementEquivalentUnitShortfall ||
        right.equivalentUnitShortfall - left.equivalentUnitShortfall ||
        request.canonicalMemberKeys.indexOf(left.memberKey) -
          request.canonicalMemberKeys.indexOf(right.memberKey))
      .slice(0, BRANCH_REFINEMENT_FOCUS_LIMIT - 1)
      .map((item) => item.memberKey);
    const focusMemberKeys = [...nonRootFocusMemberKeys, rootMemberKey];
    for (
      let pass = 0;
      pass < SMALL_ORGANIZATION_COMMISSION_BOUNDARY_PASSES;
      pass += 1
    ) {
      const retained: VerifiedAutomaticPlanCandidate[] = [...boundaryFrontier];
      const topByObjective: VerifiedAutomaticPlanCandidate[] = [];
      let totalUnitBest: VerifiedAutomaticPlanCandidate | null = null;
      const specialistByMember = new Map<
        string,
        VerifiedAutomaticPlanCandidate
      >();
      const retain = (candidate: VerifiedAutomaticPlanCandidate): void => {
        topByObjective.push(candidate);
        topByObjective.sort((left, right) =>
          compareAutomaticPlanObjectives(left.objective, right.objective));
        if (
          topByObjective.length >
            SMALL_ORGANIZATION_COMMISSION_BOUNDARY_BEAM_WIDTH
        ) topByObjective.pop();
        if (
          totalUnitBest === null ||
          totalEquivalentUnits(candidate) > totalEquivalentUnits(totalUnitBest) ||
          (
            totalEquivalentUnits(candidate) === totalEquivalentUnits(totalUnitBest) &&
            compareAutomaticPlanObjectives(
              candidate.objective,
              totalUnitBest.objective,
            ) < 0
          )
        ) totalUnitBest = candidate;
        for (const memberKey of focusMemberKeys) {
          const existing = specialistByMember.get(memberKey);
          if (
            existing === undefined ||
            equivalentUnitsForMember(candidate, memberKey) >
              equivalentUnitsForMember(existing, memberKey) ||
            (
              equivalentUnitsForMember(candidate, memberKey) ===
                equivalentUnitsForMember(existing, memberKey) &&
              compareAutomaticPlanObjectives(
                candidate.objective,
                existing.objective,
              ) < 0
            )
          ) specialistByMember.set(memberKey, candidate);
        }
      };
      for (const seed of boundaryFrontier) retain(seed);
      for (const boundarySeed of boundaryFrontier) {
        for (const raw of buildCommissionBoundaryCandidateVariants(
          request,
          boundarySeed,
          focusMemberKeys,
        )) {
          const verified = verifyCandidate(raw);
          if (verified === null) continue;
          publishIfBetter(raw, verified);
          retain(verified);
        }
      }
      retained.push(...topByObjective, ...specialistByMember.values());
      if (totalUnitBest !== null) retained.push(totalUnitBest);
      const nextFrontier = selectRefinementFrontier(
        retained,
        focusMemberKeys,
        SMALL_ORGANIZATION_COMMISSION_BOUNDARY_BEAM_WIDTH,
      );
      const previousSignatures = new Set(boundaryFrontier.map((candidate) =>
        JSON.stringify(candidate.allocations)));
      if (
        nextFrontier.length === boundaryFrontier.length &&
        nextFrontier.every((candidate) =>
          previousSignatures.has(JSON.stringify(candidate.allocations)))
      ) break;
      boundaryFrontier = nextFrontier;
    }
  }

  if (
    request.canonicalMemberKeys.length <= 20 &&
    searchState.bestCandidate !== null
  ) {
    let finishingSeed = searchState.bestCandidate;
    for (
      let pass = 0;
      pass < SMALL_ORGANIZATION_FINISHING_PV_PASSES;
      pass += 1
    ) {
      let nextSeed = finishingSeed;
      for (const raw of buildFinishingPvCandidateVariants(
        request,
        finishingSeed,
      )) {
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
      if (nextSeed === finishingSeed) break;
      finishingSeed = nextSeed;
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
