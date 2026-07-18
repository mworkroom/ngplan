import { describe, expect, it } from 'vitest';
import {
  buildBranchRotationCandidateVariants,
  buildBranchSynchronizedCandidateVariants,
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
    )).toEqual([]);

    const rightUnqualified = branchFixture({ focusQualification: 0 });
    expect(buildBranchSynchronizedCandidateVariants(
      rightUnqualified.request,
      rightUnqualified.source,
    )).toEqual([]);
  });
});
