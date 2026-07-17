import { describe, expect, it } from 'vitest';
import { deriveNormalizedAutomaticPlanCalendar } from '..';
import {
  buildConstructiveCandidateVariants,
  deriveRootCommissionGoalCapacity,
  requiredAutomaticPvpForMember,
  verifyAutomaticPlanCandidate,
} from '..';
import type { PeriodInput } from '../../engine';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

const balancedMemberSpecs = [
  ['root', null, null],
  ['left', 'root', 'LEFT'],
  ['right', 'root', 'RIGHT'],
  ['left-left', 'left', 'LEFT'],
  ['left-right', 'left', 'RIGHT'],
  ['right-left', 'right', 'LEFT'],
  ['right-right', 'right', 'RIGHT'],
  ['left-left-left', 'left-left', 'LEFT'],
  ['left-left-right', 'left-left', 'RIGHT'],
  ['left-right-left', 'left-right', 'LEFT'],
  ['left-right-right', 'left-right', 'RIGHT'],
  ['right-left-left', 'right-left', 'LEFT'],
  ['right-left-right', 'right-left', 'RIGHT'],
  ['right-right-left', 'right-right', 'LEFT'],
  ['right-right-right', 'right-right', 'RIGHT'],
] as const;

function verifiedAligned(request: ReturnType<typeof createOptimizerRequest>) {
  const variant = buildConstructiveCandidateVariants(request)[1];
  if (variant?.status !== 'SUCCESS') throw new Error('aligned construction failed');
  const tooSmall = variant.candidate.allocations.find((cell) =>
    [cell.pvp, cell.selfLeft, cell.selfRight].some(
      (value) => value !== undefined && value > 0 && value < 30,
    ));
  if (tooSmall !== undefined) throw new Error(JSON.stringify(tooSmall));
  const verified = verifyAutomaticPlanCandidate(request, variant.candidate, {
    candidateId: 'root-goal-aligned',
    sequence: 1,
    foundAtElapsedMs: 0,
  });
  if (verified.status !== 'SUCCESS') throw new Error(JSON.stringify(verified.error));
  return verified.candidate;
}

function balancedRequest(period?: PeriodInput) {
  const members = balancedMemberSpecs.map(([key, parent, side]) =>
    optimizerMember(key, parent, side, key === 'root' ? 2_400 : 700));
  const achieved = optimizerOpening({
    openingQualificationPvp: 2_400,
    fortnightPvpOpeningCredit: 2_400,
  });
  const base = createOptimizerRequest(
    members,
    Object.freeze(Object.fromEntries(members.map((member) => [member.memberKey, achieved]))),
  );
  if (period === undefined) return base;
  return Object.freeze({
    ...base,
    period,
    calendar: deriveNormalizedAutomaticPlanCalendar(period),
    problemFingerprint: `${base.problemFingerprint}-${period.year}-${period.month}-${period.half}`,
  });
}

describe('root commission operational goal', () => {
  it('derives and reaches capacity 8 across a 13-day one-member target-700 period', () => {
    const request = createOptimizerRequest();
    const capacity = deriveRootCommissionGoalCapacity(request);
    expect(capacity).toMatchObject({
      businessDayCount: 13,
      targetCommissionDays: 8,
      capacityLimited: true,
    });

    const candidate = verifiedAligned(request);
    expect(candidate.display.rootCommissionGoal).toEqual({
      rootMemberKey: 'root',
      businessDayCount: 13,
      targetCommissionDays: 8,
      actualCommissionDays: 8,
      shortfallDays: 0,
      capacityLimited: true,
      met: true,
    });
    const occurrenceIndexes = request.calendar.dates
      .filter((date) => !request.calendar.skipDateSet.includes(date))
      .map((date, index) => ({
        index,
        settlement: candidate.calculation.dailySettlementByDateAndMember[date]!.root!,
      }))
      .filter(({ settlement }) => settlement.settlementKind === 'FULL_COMMISSION')
      .map(({ index }) => index);
    expect(occurrenceIndexes).toHaveLength(8);
    expect(occurrenceIndexes[0]).toBe(0);
    expect(occurrenceIndexes.at(-1)).toBe(12);
  });

  it('preserves a legal 30-PV root profile when the opening achievement is 699', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 699,
      fortnightPvpOpeningCredit: 699,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    expect(deriveRootCommissionGoalCapacity(request)).toMatchObject({
      requiredRootPvp: 30,
      targetCommissionDays: 8,
    });

    const candidate = verifiedAligned(request);
    expect(candidate.allocations.reduce((total, cell) => total + cell.pvp, 0)).toBe(30);
    expect(candidate.display.rootCommissionGoal).toMatchObject({
      targetCommissionDays: 8,
      actualCommissionDays: 8,
      shortfallDays: 0,
      met: true,
    });
  });

  it('uses opening carry for only the first commission event', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 700,
      fortnightPvpOpeningCredit: 700,
      dailyCarryLeft: 300,
      dailyCarryRight: 300,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    expect(deriveRootCommissionGoalCapacity(request)).toMatchObject({
      targetCommissionDays: 9,
      firstCommissionConsumption: { rawLeftPv: 0, rawRightPv: 0, pvp: 0 },
    });

    const candidate = verifiedAligned(request);
    expect(candidate.display.rootCommissionGoal).toMatchObject({
      targetCommissionDays: 9,
      actualCommissionDays: 9,
      shortfallDays: 0,
      met: true,
    });
  });

  it('reaches every business day when the recursive organization total is sufficient', () => {
    const request = balancedRequest();
    expect(deriveRootCommissionGoalCapacity(request)).toMatchObject({
      minimumRawLeftPv: 20_000,
      minimumRawRightPv: 20_000,
    });
    const candidate = verifiedAligned(request);
    expect(candidate.display.rootCommissionGoal).toMatchObject({
      businessDayCount: 13,
      targetCommissionDays: 13,
      actualCommissionDays: 13,
      shortfallDays: 0,
      capacityLimited: false,
      met: true,
    });
  });

  it('uses a dynamic 14-business-day target', () => {
    const request = balancedRequest({
      year: 2026,
      month: 1,
      half: 'SECOND_HALF',
    });
    const candidate = verifiedAligned(request);
    expect(candidate.display.rootCommissionGoal).toMatchObject({
      businessDayCount: 14,
      targetCommissionDays: 14,
      actualCommissionDays: 14,
      shortfallDays: 0,
      capacityLimited: false,
      met: true,
    });
  });

  it('uses a dynamic 12-business-day target', () => {
    const request = balancedRequest({
      year: 2026,
      month: 11,
      half: 'FIRST_HALF',
    });
    const candidate = verifiedAligned(request);
    expect(candidate.display.rootCommissionGoal).toMatchObject({
      businessDayCount: 12,
      targetCommissionDays: 12,
      actualCommissionDays: 12,
      shortfallDays: 0,
      capacityLimited: false,
      met: true,
    });
  });

  it('accepts a calculation-valid shortfall candidate and records the warning metric', () => {
    const request = createOptimizerRequest();
    const aligned = buildConstructiveCandidateVariants(request)[1];
    if (aligned?.status !== 'SUCCESS') throw new Error('aligned construction failed');
    const businessDates = request.calendar.dates.filter(
      (date) => !request.calendar.skipDateSet.includes(date),
    );
    const firstDate = businessDates[0]!;
    const totals = aligned.candidate.allocations.reduce(
      (result, cell) => ({
        pvp: result.pvp + cell.pvp,
        left: result.left + (cell.selfLeft ?? 0),
        right: result.right + (cell.selfRight ?? 0),
      }),
      { pvp: 0, left: 0, right: 0 },
    );
    const compressed = aligned.candidate.allocations.map((cell) => Object.freeze({
      ...cell,
      pvp: cell.date === firstDate ? totals.pvp : 0,
      ...(Object.hasOwn(cell, 'selfLeft')
        ? { selfLeft: cell.date === firstDate ? totals.left : 0 }
        : {}),
      ...(Object.hasOwn(cell, 'selfRight')
        ? { selfRight: cell.date === firstDate ? totals.right : 0 }
        : {}),
    }));
    const verified = verifyAutomaticPlanCandidate(request, {
      problemFingerprint: request.problemFingerprint,
      allocations: compressed,
    }, {
      candidateId: 'root-goal-shortfall',
      sequence: 1,
      foundAtElapsedMs: 0,
    });

    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    expect(verified.candidate.display.rootCommissionGoal).toMatchObject({
      targetCommissionDays: 8,
      actualCommissionDays: 1,
      shortfallDays: 7,
      capacityLimited: true,
      met: false,
    });
    expect(verified.candidate.objective.rootCommissionGoalShortfallDays).toBe(7);
  });

  it('respects the engine smaller-side orientation for asymmetric opening carry', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 700,
      fortnightPvpOpeningCredit: 700,
      dailyCarryLeft: 1_000,
      dailyCarryRight: 0,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    expect(deriveRootCommissionGoalCapacity(request).firstCommissionConsumption)
      .toEqual({ rawLeftPv: 0, rawRightPv: 300, pvp: 0 });
  });

  it('covers right-only topology, oversized opening orientation, and PVP headroom defense', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('right', 'root', 'RIGHT'),
    ];
    const rightOnly = createOptimizerRequest(
      members,
      Object.freeze({
        root: optimizerOpening(),
        right: optimizerOpening(),
      }),
    );
    expect(deriveRootCommissionGoalCapacity(rightOnly)).toMatchObject({
      minimumRawLeftPv: 1_800,
      minimumRawRightPv: 5_000,
    });

    const oversizedOpening = optimizerOpening({
      openingQualificationPvp: 700,
      fortnightPvpOpeningCredit: 700,
      dailyCarryLeft: 10_000,
      dailyCarryRight: 0,
    });
    const asymmetric = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: oversizedOpening }),
    );
    expect(deriveRootCommissionGoalCapacity(asymmetric).firstCommissionConsumption)
      .toEqual({ rawLeftPv: 0, rawRightPv: 300, pvp: 0 });

    expect(() => requiredAutomaticPvpForMember(2_400, 2_401)).toThrow(
      'required automatic PVP exceeds cumulative PVP headroom',
    );
  });
});
