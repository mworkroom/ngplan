import { describe, expect, it } from 'vitest';
import {
  buildBranchRotationCandidateVariants,
  buildBranchSynchronizedCandidateVariants,
  buildCommissionBoundaryCandidateVariants,
  buildVerifiedConstructiveCandidate,
  totalAutomaticPlanDirectPv,
  type AutomaticPlanRequest,
  type RawAutomaticPlanCandidate,
} from '..';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

interface BranchFixtureOptions {
  readonly businessDateCount?: number;
  readonly leftTotal?: number;
  readonly rightTotal?: number;
  readonly focusQualification?: number;
  readonly leafQualification?: number;
}

function branchFixture(
  options: BranchFixtureOptions = {},
): { request: AutomaticPlanRequest; source: RawAutomaticPlanCandidate } {
  const members = Object.freeze([
    optimizerMember('root'),
    optimizerMember('focus', 'root', 'LEFT', 1_500),
    optimizerMember('leaf', 'focus', 'LEFT'),
  ]);
  const base = createOptimizerRequest(members, Object.freeze({
    root: optimizerOpening({ openingQualificationPvp: 300 }),
    focus: optimizerOpening({
      openingQualificationPvp: options.focusQualification ?? 300,
    }),
    leaf: optimizerOpening({
      openingQualificationPvp: options.leafQualification ?? 300,
    }),
  }));
  const businessDates = base.calendar.dates.filter(
    (date) => !base.calendar.skipDateSet.includes(date),
  ).slice(0, options.businessDateCount ?? 3);
  const request: AutomaticPlanRequest = Object.freeze({
    ...base,
    calendar: Object.freeze({
      ...base.calendar,
      dates: Object.freeze(businessDates),
      skipDateSet: Object.freeze([]),
    }),
  });
  const leftTotal = options.leftTotal ?? 310;
  const rightTotal = options.rightTotal ?? 310;
  const allocations = request.calendar.dates.flatMap((date, dateIndex) => [
    Object.freeze({
      date,
      memberKey: 'root',
      pvp: 0,
      selfRight: 0,
    }),
    Object.freeze({
      date,
      memberKey: 'focus',
      pvp: 0,
      selfRight: dateIndex === 0 ? rightTotal : 0,
    }),
    Object.freeze({
      date,
      memberKey: 'leaf',
      pvp: 0,
      selfLeft: dateIndex === 0 ? leftTotal : 0,
      selfRight: 0,
    }),
  ]);
  return {
    request,
    source: Object.freeze({
      problemFingerprint: request.problemFingerprint,
      allocations: Object.freeze(allocations),
    }),
  };
}

describe('branch-synchronized candidate boundaries', () => {
  it('skips searches that have too few dates or no requested eligible member', () => {
    const short = branchFixture({ businessDateCount: 2 });
    expect(buildBranchSynchronizedCandidateVariants(short.request, short.source)).toEqual([]);
    expect(buildBranchRotationCandidateVariants(short.request, short.source)).toEqual([]);

    const normal = branchFixture();
    expect(buildBranchSynchronizedCandidateVariants(
      normal.request,
      normal.source,
      ['missing-member'],
    )).toEqual([]);
    expect(buildBranchRotationCandidateVariants(
      normal.request,
      normal.source,
      [],
    )).toEqual([]);
  });

  it('coordinates a sub-tier 300·10 remainder without changing branch totals', () => {
    const { request, source } = branchFixture();
    const synchronized = buildBranchSynchronizedCandidateVariants(
      request,
      source,
      ['focus', 'focus', 'missing-member'],
    );
    const rotations = buildBranchRotationCandidateVariants(
      request,
      source,
      ['focus', 'focus', 'missing-member'],
    );

    expect(synchronized.length).toBeGreaterThan(0);
    expect(rotations.length).toBeGreaterThan(0);
    const totals = (candidate: RawAutomaticPlanCandidate) => ({
      left: candidate.allocations.reduce(
        (total, cell) => total + (cell.memberKey === 'leaf'
          ? cell.pvp + cell.selfLeft! + cell.selfRight!
          : 0),
        0,
      ),
      right: candidate.allocations.reduce(
        (total, cell) => total + (cell.memberKey === 'focus' ? cell.selfRight! : 0),
        0,
      ),
    });
    expect([...synchronized, ...rotations].every((candidate) =>
      JSON.stringify(totals(candidate)) === JSON.stringify({ left: 310, right: 310 })))
      .toBe(true);
  });

  it('deduplicates zero-total layouts and stops a side that cannot qualify', () => {
    const empty = branchFixture({ leftTotal: 0, rightTotal: 0 });
    expect(buildBranchSynchronizedCandidateVariants(empty.request, empty.source)).toEqual([]);
    expect(buildBranchRotationCandidateVariants(empty.request, empty.source)).toEqual([]);

    const leftUnqualified = branchFixture({ leafQualification: 0 });
    expect(buildBranchSynchronizedCandidateVariants(
      leftUnqualified.request,
      leftUnqualified.source,
      ['focus'],
    )).toEqual([]);

    const rightUnqualified = branchFixture({ focusQualification: 0 });
    expect(buildBranchSynchronizedCandidateVariants(
      rightUnqualified.request,
      rightUnqualified.source,
      ['focus'],
    )).toEqual([]);
  });

  it('moves payout-preserving branch slack toward the next boundary deterministically', () => {
    const members = Object.freeze([
      optimizerMember('root', null, null, 2_400),
      optimizerMember('focus', 'root', 'LEFT', 2_400),
      optimizerMember('root-right', 'root', 'RIGHT', 2_400),
      optimizerMember('focus-left', 'focus', 'LEFT', 2_400),
      optimizerMember('focus-right', 'focus', 'RIGHT', 2_400),
    ]);
    const openings = Object.freeze(Object.fromEntries(members.map((member) => [
      member.memberKey,
      optimizerOpening({
        openingQualificationPvp: member.pvpTarget,
        fortnightPvpOpeningCredit: member.pvpTarget,
      }),
    ])));
    const request = createOptimizerRequest(members, openings);
    const verified = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'commission-boundary-source',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;

    const first = buildCommissionBoundaryCandidateVariants(
      request,
      verified.candidate,
      ['focus', 'focus', 'missing-member'],
    );
    const second = buildCommissionBoundaryCandidateVariants(
      request,
      verified.candidate,
      ['focus', 'focus', 'missing-member'],
    );
    const allEligible = buildCommissionBoundaryCandidateVariants(
      request,
      verified.candidate,
    );
    const leafOnly = buildCommissionBoundaryCandidateVariants(
      request,
      verified.candidate,
      ['focus-left'],
    );
    expect(buildCommissionBoundaryCandidateVariants(
      request,
      verified.candidate,
      ['root', 'missing-member'],
    )).toEqual([]);
    const firstBusinessDate = request.calendar.dates.find((date) =>
      !request.calendar.skipDateSet.includes(date))!;
    const oneDateRequest: AutomaticPlanRequest = Object.freeze({
      ...request,
      calendar: Object.freeze({
        ...request.calendar,
        dates: Object.freeze([firstBusinessDate]),
        skipDateSet: Object.freeze([]),
      }),
    });
    expect(buildCommissionBoundaryCandidateVariants(
      oneDateRequest,
      verified.candidate,
    )).toEqual([]);
    const sourceTotal = totalAutomaticPlanDirectPv(
      verified.candidate.allocations,
    );

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(allEligible.length).toBeGreaterThanOrEqual(first.length);
    expect(leafOnly).toEqual(buildCommissionBoundaryCandidateVariants(
      request,
      verified.candidate,
      ['focus-left'],
    ));
    expect(first.every((candidate) =>
      totalAutomaticPlanDirectPv(candidate.allocations) === sourceTotal,
    )).toBe(true);
    expect(first.every((candidate) => candidate.allocations.every((cell) =>
      [cell.pvp, cell.selfLeft, cell.selfRight]
        .filter((value): value is number => value !== undefined)
        .every((value) => value === 0 || value >= 30),
    ))).toBe(true);
  });

  it('can move descendant PVP together with branch contributions', () => {
    const members = Object.freeze([
      optimizerMember('root', null, null, 2_400),
      optimizerMember('focus', 'root', 'LEFT', 2_400),
      optimizerMember('root-right', 'root', 'RIGHT', 2_400),
      optimizerMember('focus-left', 'focus', 'LEFT', 2_400),
      optimizerMember('focus-right', 'focus', 'RIGHT', 2_400),
    ]);
    const openings = Object.freeze(Object.fromEntries(members.map((member) => [
      member.memberKey,
      optimizerOpening({
        openingQualificationPvp: 300,
        fortnightPvpOpeningCredit: 300,
      }),
    ])));
    const request = createOptimizerRequest(members, openings);
    const verified = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'commission-boundary-pvp-source',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;

    const variants = buildCommissionBoundaryCandidateVariants(
      request,
      verified.candidate,
      ['focus'],
    );
    const sourceTotal = totalAutomaticPlanDirectPv(
      verified.candidate.allocations,
    );

    expect(variants.length).toBeGreaterThan(0);
    expect(variants.some((candidate) => candidate.allocations.some(
      (cell, index) => cell.pvp !== verified.candidate.allocations[index]!.pvp,
    ))).toBe(true);
    expect(variants.every((candidate) =>
      totalAutomaticPlanDirectPv(candidate.allocations) === sourceTotal,
    )).toBe(true);
  });

});
