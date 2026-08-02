import { describe, expect, it } from 'vitest';
import {
  buildBranchRotationCandidateVariants,
  buildBranchSynchronizedCandidateVariants,
  buildConstructiveCandidateVariants,
  buildTierProfileCandidateVariants,
  compareAutomaticPlanObjectives,
  verifyAutomaticPlanCandidate,
} from '..';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

function alignedCandidate(
  request: ReturnType<typeof createOptimizerRequest>,
) {
  const aligned = buildConstructiveCandidateVariants(request)[1];
  if (aligned?.status !== 'SUCCESS') throw new Error('aligned construction failed');
  return aligned.candidate;
}

const memberSpecs = [
  ['root', null, null, 2_400, 2_400, 48, 0],
  ['sandra', 'root', 'LEFT', 1_500, 1_500, 1_992, 0],
  ['mirelle', 'sandra', 'LEFT', 1_500, 1_190, 2_298, 0],
  ['gigi', 'mirelle', 'LEFT', 700, 487, 2_050, 0],
  ['kim', 'gigi', 'LEFT', 700, 33, 0, 83],
  ['yujeong', 'mirelle', 'RIGHT', 700, 700, 605, 261],
  ['marcos', 'yujeong', 'RIGHT', 700, 300, 362, 261],
  ['jacob', 'sandra', 'RIGHT', 700, 700, 0, 0],
  ['esteban', 'jacob', 'RIGHT', 700, 302, 0, 0],
  ['kelly', 'root', 'RIGHT', 2_400, 2_400, 0, 88],
  ['yuri', 'kelly', 'LEFT', 2_400, 2_360, 456, 0],
  ['nam', 'yuri', 'LEFT', 1_500, 1_500, 4_988, 140],
  ['park', 'nam', 'LEFT', 1_500, 1_500, 0, 345],
  ['han', 'yuri', 'RIGHT', 700, 39, 790, 29],
  ['yona', 'han', 'LEFT', 700, 700, 1_870, 242],
  ['simone', 'kelly', 'RIGHT', 1_500, 1_500, 1_350, 0],
  ['raniton', 'simone', 'LEFT', 700, 300, 5, 0],
] as const;

function create202407Request() {
  const members = memberSpecs.map(([
    memberKey,
    parentMemberKey,
    sideAtParent,
    pvpTarget,
  ]) => optimizerMember(memberKey, parentMemberKey, sideAtParent, pvpTarget));
  const openings = Object.freeze(Object.fromEntries(memberSpecs.map(([
    memberKey,
    ,
    ,
    ,
    openingPvp,
    dailyCarryLeft,
    dailyCarryRight,
  ]) => [memberKey, optimizerOpening({
    openingQualificationPvp: openingPvp,
    fortnightPvpOpeningCredit: openingPvp,
    dailyCarryLeft,
    dailyCarryRight,
  })])));
  return createOptimizerRequest(members, openings);
}

describe('total-preserving tier profile candidates', () => {
  it('PAY-202407-PATTERN explores verified tier layouts without changing field totals', () => {
    const request = create202407Request();
    const baseVariants = buildConstructiveCandidateVariants(request);
    const aligned = baseVariants[1];
    if (aligned?.status !== 'SUCCESS') throw new Error('aligned construction failed');
    const profileVariants = buildTierProfileCandidateVariants(request, aligned.candidate);
    const verified = profileVariants.flatMap((candidate, index) => {
      const outcome = verifyAutomaticPlanCandidate(request, candidate, {
        candidateId: `tier-profile-${index + 1}`,
        sequence: index + 1,
        foundAtElapsedMs: 0,
      });
      return outcome.status === 'SUCCESS' ? [outcome.candidate] : [];
    });
    const alignedVerified = verifyAutomaticPlanCandidate(request, aligned.candidate, {
      candidateId: 'tier-profile-source',
      sequence: profileVariants.length + 1,
      foundAtElapsedMs: 0,
    });
    if (alignedVerified.status !== 'SUCCESS') throw new Error(alignedVerified.error.code);
    const best = [...verified].sort((left, right) =>
      compareAutomaticPlanObjectives(left.objective, right.objective))[0];
    const allVerified = baseVariants.flatMap((variant, index) => {
      if (variant.status !== 'SUCCESS') return [];
      const outcome = verifyAutomaticPlanCandidate(request, variant.candidate, {
        candidateId: `generated-tier-profile-${index + 1}`,
        sequence: index + 1,
        foundAtElapsedMs: 0,
      });
      return outcome.status === 'SUCCESS' ? [outcome.candidate] : [];
    });
    const generatedBest = [...allVerified].sort((left, right) =>
      compareAutomaticPlanObjectives(left.objective, right.objective))[0];
    const profileSignatures = new Set(
      profileVariants.map((candidate) => JSON.stringify(candidate.allocations)),
    );
    const fieldTotals = (candidate: typeof alignedVerified.candidate) => Object.fromEntries(
      request.canonicalMemberKeys.flatMap((memberKey) => [
        ['PVP', candidate.allocations.reduce(
          (sum, cell) => sum + (cell.memberKey === memberKey ? cell.pvp : 0),
          0,
        )],
        ['SELF_LEFT', candidate.allocations.reduce(
          (sum, cell) => sum + (
            cell.memberKey === memberKey ? cell.selfLeft ?? 0 : 0
          ),
          0,
        )],
        ['SELF_RIGHT', candidate.allocations.reduce(
          (sum, cell) => sum + (
            cell.memberKey === memberKey ? cell.selfRight ?? 0 : 0
          ),
          0,
        )],
      ].map(([field, total]) => [`${memberKey}:${field}`, total])),
    );

    expect(profileVariants.length).toBeGreaterThan(10);
    expect(verified.length).toBeGreaterThan(0);
    expect(best).toBeDefined();
    expect(best!.objective.totalNewPv).toBe(alignedVerified.candidate.objective.totalNewPv);
    expect(best!.objective.rootCommissionGoalShortfallDays).toBe(0);
    expect(best!.objective.confirmedPayoutWon)
      .toBeGreaterThan(alignedVerified.candidate.objective.confirmedPayoutWon);
    expect(fieldTotals(best!)).toEqual(fieldTotals(alignedVerified.candidate));
    expect(generatedBest).toBeDefined();
    expect(profileSignatures.has(JSON.stringify(generatedBest!.allocations))).toBe(true);
    expect(compareAutomaticPlanObjectives(
      generatedBest!.objective,
      best!.objective,
    )).toBeLessThanOrEqual(0);
    expect(compareAutomaticPlanObjectives(
      best!.objective,
      alignedVerified.candidate.objective,
    )).toBeLessThan(0);
  }, 15_000);

  it('PAY-202407-BRANCH preserves direct totals across synchronized and rigid branch variants', () => {
    const request = create202407Request();
    const aligned = alignedCandidate(request);
    const variants = [
      ...buildBranchSynchronizedCandidateVariants(request, aligned),
      ...buildBranchRotationCandidateVariants(request, aligned),
    ];
    const totals = (candidate: typeof aligned) => Object.fromEntries(
      request.canonicalMemberKeys.flatMap((memberKey) => [
        ['PVP', candidate.allocations.reduce(
          (sum, cell) => sum + (cell.memberKey === memberKey ? cell.pvp : 0),
          0,
        )],
        ['SELF_LEFT', candidate.allocations.reduce(
          (sum, cell) => sum + (
            cell.memberKey === memberKey ? cell.selfLeft ?? 0 : 0
          ),
          0,
        )],
        ['SELF_RIGHT', candidate.allocations.reduce(
          (sum, cell) => sum + (
            cell.memberKey === memberKey ? cell.selfRight ?? 0 : 0
          ),
          0,
        )],
      ].map(([field, total]) => [`${memberKey}:${field}`, total])),
    );

    expect(variants.length).toBeGreaterThan(100);
    expect(variants.every((candidate) =>
      JSON.stringify(totals(candidate)) === JSON.stringify(totals(aligned))))
      .toBe(true);
    expect(variants.every((candidate) => candidate.allocations.every((cell) =>
      [cell.pvp, cell.selfLeft, cell.selfRight].every((value) =>
        value === undefined || value === 0 || value >= 30))))
      .toBe(true);
  });

  it('returns no profiles for a single member or at most two business dates', () => {
    const singleRequest = createOptimizerRequest();
    expect(buildTierProfileCandidateVariants(
      singleRequest,
      alignedCandidate(singleRequest),
    )).toEqual([]);

    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const request = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening(),
      left: optimizerOpening(),
    }));
    const twoDateRequest = {
      ...request,
      calendar: {
        ...request.calendar,
        dates: request.calendar.dates.slice(0, 2),
        skipDateSet: [],
      },
    };
    expect(buildTierProfileCandidateVariants(
      twoDateRequest,
      alignedCandidate(request),
    )).toEqual([]);
  });

  it('keeps zero side totals zero before and after qualification', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const qualifiedRequest = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
      left: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
    }));
    const zeroSides = {
      ...alignedCandidate(qualifiedRequest),
      allocations: alignedCandidate(qualifiedRequest).allocations.map((cell) => ({
        ...cell,
        ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: 0 } : {}),
        ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: 0 } : {}),
      })),
    };
    const qualifiedProfiles = buildTierProfileCandidateVariants(
      qualifiedRequest,
      zeroSides,
    );
    expect(qualifiedProfiles.length).toBeGreaterThan(0);
    expect(qualifiedProfiles.every((candidate) => candidate.allocations.every((cell) =>
      (cell.selfLeft ?? 0) === 0 && (cell.selfRight ?? 0) === 0))).toBe(true);

    const unqualifiedRequest = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening(),
      left: optimizerOpening(),
    }));
    const neverQualified = {
      ...zeroSides,
      problemFingerprint: unqualifiedRequest.problemFingerprint,
      allocations: zeroSides.allocations.map((cell) => ({ ...cell, pvp: 0 })),
    };
    expect(buildTierProfileCandidateVariants(
      unqualifiedRequest,
      neverQualified,
    ).length).toBeGreaterThan(0);
  });

  it('does not move positive side PV ahead of a member who never qualifies', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const request = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening(),
      left: optimizerOpening(),
    }));
    const source = alignedCandidate(request);
    const neverQualified = {
      ...source,
      allocations: source.allocations.map((cell) => ({ ...cell, pvp: 0 })),
    };
    const profiles = buildTierProfileCandidateVariants(request, neverQualified);

    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((candidate) =>
      JSON.stringify(candidate.allocations) === JSON.stringify(neverQualified.allocations)))
      .toBe(true);
  });

  it('combines threshold chunks when the calendar has only three business dates', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const request = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
      left: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
    }));
    const threeDates = request.calendar.dates.slice(0, 3);
    const threeDateRequest = {
      ...request,
      calendar: { ...request.calendar, dates: threeDates, skipDateSet: [] },
    };
    const source = alignedCandidate(request);
    const compactSource = {
      ...source,
      allocations: source.allocations
        .filter((cell) => threeDates.includes(cell.date))
        .map((cell, index) => ({
          ...cell,
          ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: 0 } : {}),
          ...(Object.hasOwn(cell, 'selfRight')
            ? { selfRight: cell.memberKey === 'root' && index === 0 ? 2_500 : 0 }
            : {}),
        })),
    };
    const profiles = buildTierProfileCandidateVariants(threeDateRequest, compactSource);

    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.some((candidate) => candidate.allocations.some((cell) =>
      (cell.selfRight ?? 0) > 700))).toBe(true);
  });

  it('handles incomplete defensive sources without inventing missing fields', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const request = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
      left: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
    }));
    const source = alignedCandidate(request);
    const firstDate = request.calendar.dates[0];
    const incompleteSource = {
      ...source,
      allocations: source.allocations
        .filter((cell) => !(cell.date === firstDate && cell.memberKey === 'left'))
        .map((cell) => cell.memberKey === 'left'
          ? { date: cell.date, memberKey: cell.memberKey, pvp: cell.pvp }
          : cell),
    };

    expect(buildTierProfileCandidateVariants(request, incompleteSource).length)
      .toBeGreaterThan(0);
  });

  it('treats explicitly undefined optional side values as zero', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const request = createOptimizerRequest(members, Object.freeze({
      root: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
      left: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
    }));
    const source = alignedCandidate(request);
    const undefinedSides = {
      ...source,
      allocations: source.allocations.map((cell) => ({
        ...cell,
        ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: undefined } : {}),
        ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: undefined } : {}),
      })),
    } as unknown as typeof source;

    expect(buildTierProfileCandidateVariants(request, undefinedSides).length)
      .toBeGreaterThan(0);
  });

  it('keeps malformed topology keys contained to defensive profile search', () => {
    const validMembers = [
      optimizerMember('root'),
      optimizerMember('orphan', 'root', 'LEFT'),
    ];
    const validRequest = createOptimizerRequest(validMembers, Object.freeze({
      root: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
      orphan: optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
    }));
    const source = alignedCandidate(validRequest);
    const missingParentRequest = {
      ...validRequest,
      organization: {
        ...validRequest.organization,
        members: [
          optimizerMember('root'),
          optimizerMember('orphan', 'ghost', 'LEFT'),
        ],
      },
    };
    expect(buildTierProfileCandidateVariants(
      missingParentRequest,
      source,
    ).length).toBeGreaterThan(0);

    const missingMemberRequest = {
      ...validRequest,
      organization: {
        ...validRequest.organization,
        members: [optimizerMember('root')],
      },
      canonicalMemberKeys: ['root', 'phantom'],
      openingPvpByMember: {
        root: validRequest.openingPvpByMember.root!,
        phantom: validRequest.openingPvpByMember.orphan!,
      },
    };
    const phantomSource = {
      ...source,
      allocations: source.allocations.map((cell) => cell.memberKey === 'orphan'
        ? { ...cell, memberKey: 'phantom' }
        : cell),
    };
    expect(buildTierProfileCandidateVariants(
      missingMemberRequest,
      phantomSource,
    ).length).toBeGreaterThan(0);
  });
});
