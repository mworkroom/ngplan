import { describe, expect, it } from 'vitest';
import type { NormalizedAllocationCell } from '../../engine';
import {
  buildConstructiveCandidate,
  buildVerifiedConstructiveCandidate,
  deriveNormalizedAutomaticPlanCalendar,
  deriveCanonicalAutomaticPlanMemberKeys,
  validateAutomaticPlanCandidateShape,
  validateAutomaticPlanRequest,
  verifyAutomaticPlanCandidate,
} from '..';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

function replaceCell(
  cells: readonly NormalizedAllocationCell[],
  index: number,
  patch: Partial<NormalizedAllocationCell>,
): readonly NormalizedAllocationCell[] {
  return cells.map((cell, cellIndex) =>
    cellIndex === index ? { ...cell, ...patch } : cell,
  );
}

function firstTwoSettlementIndexes(
  cells: readonly NormalizedAllocationCell[],
  skipDates: readonly string[],
): readonly [number, number] {
  const indexes = cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => !skipDates.includes(cell.date))
    .slice(0, 2)
    .map(({ index }) => index);
  return [indexes[0]!, indexes[1]!];
}

describe('Phase 4 request and candidate boundary', () => {
  it('uses root-first LEFT-before-RIGHT independently of input array order', () => {
    const members = [
      optimizerMember('right', 'root', 'RIGHT'),
      optimizerMember('left-leaf', 'left', 'LEFT'),
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    expect(deriveCanonicalAutomaticPlanMemberKeys(members)).toEqual([
      'root',
      'left',
      'left-leaf',
      'right',
    ]);
  });

  it('P4-REQ-001 accepts the exact versioned request and rejects a reordered identity', () => {
    const request = createOptimizerRequest();
    expect(validateAutomaticPlanRequest(request)).toEqual({ status: 'SUCCESS' });
    expect(
      validateAutomaticPlanRequest({
        ...request,
        canonicalMemberKeys: ['unknown'],
      }),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MEMBER_ORDER_INVALID' },
    });
  });

  it('P4-REQ-002 accepts 50 members and rejects 51 members', () => {
    const requestWithMemberCount = (count: number) => {
      const members = Array.from({ length: count }, (_, index) =>
        optimizerMember(
          `member-${index}`,
          index === 0 ? null : `member-${index - 1}`,
          index === 0 ? null : 'LEFT',
        ),
      );
      const openings = Object.freeze(
        Object.fromEntries(
          members.map((member) => [member.memberKey, optimizerOpening()]),
        ),
      );
      return createOptimizerRequest(members, openings);
    };
    expect(validateAutomaticPlanRequest(requestWithMemberCount(50))).toEqual({
      status: 'SUCCESS',
    });
    expect(validateAutomaticPlanRequest(requestWithMemberCount(51))).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MEMBER_LIMIT_EXCEEDED' },
    });
  });

  it('[CAL-005] derives ISO date-only Sunday skips independently of host timezone', () => {
    const originalTimezone = process.env.TZ;
    const zones = [
      'Asia/Seoul',
      'UTC',
      'America/Sao_Paulo',
      'America/New_York',
    ];
    try {
      const julyCalendars = zones.map((timezone) => {
        process.env.TZ = timezone;
        return deriveNormalizedAutomaticPlanCalendar({
          year: 2026,
          month: 7,
          half: 'FIRST_HALF',
        });
      });
      const novemberCalendars = zones.map((timezone) => {
        process.env.TZ = timezone;
        return deriveNormalizedAutomaticPlanCalendar({
          year: 2026,
          month: 11,
          half: 'FIRST_HALF',
        });
      });
      for (const calendar of julyCalendars.slice(1)) {
        expect(calendar).toEqual(julyCalendars[0]);
      }
      for (const calendar of novemberCalendars.slice(1)) {
        expect(calendar).toEqual(novemberCalendars[0]);
      }
      expect(julyCalendars[0]?.skipDateSet).toContain('2026-07-12');
      expect(julyCalendars[0]?.skipDateSet).not.toContain('2026-07-13');
      expect(novemberCalendars[0]?.skipDateSet).toContain('2026-11-01');
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimezone;
      }
    }
  });

  it('P4-SHAPE-001/002 accepts the full canonical matrix and Sunday zeros', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    expect(built.status).toBe('SUCCESS');
    if (built.status !== 'SUCCESS') return;
    expect(
      validateAutomaticPlanCandidateShape(request, built.candidate.allocations),
    ).toMatchObject({ status: 'SUCCESS' });
    for (const cell of built.candidate.allocations.filter((candidate) =>
      request.calendar.skipDateSet.includes(candidate.date),
    )) {
      expect([cell.pvp, cell.selfLeft, cell.selfRight].filter((value) => value !== undefined)).toEqual([
        0,
        0,
        0,
      ]);
    }
  });

  it('P4-SHAPE-003 rejects missing, reordered, and skipped-date nonzero cells', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const cells = built.candidate.allocations;
    expect(validateAutomaticPlanCandidateShape(request, cells.slice(1))).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID' },
    });
    expect(
      validateAutomaticPlanCandidateShape(request, [cells[1]!, cells[0]!, ...cells.slice(2)]),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CANDIDATE_ORDER_INVALID' },
    });
    const sundayIndex = cells.findIndex((cell) =>
      request.calendar.skipDateSet.includes(cell.date),
    );
    expect(
      validateAutomaticPlanCandidateShape(
        request,
        replaceCell(cells, sundayIndex, { pvp: 1 }),
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_SKIPPED_DATE_NONZERO' },
    });
  });

  it('P4-SHAPE-004 rejects negative zero before Phase 1', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    expect(
      validateAutomaticPlanCandidateShape(
        request,
        replaceCell(built.candidate.allocations, 0, { pvp: -0 }),
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID' },
    });
  });

  it('STATUS-001 produces a verified constructive incumbent without a proof status', () => {
    const request = createOptimizerRequest();
    const verified = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'constructive-1',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    expect(verified.candidate.calculation.rulesetVersion).toBe('3.0.0');
    expect(verified.candidate.objective.totalNewPv).toBe(5_700);
    expect(verified.candidate).not.toHaveProperty('status');
  });

  it('STATUS-001 constructs and verifies an unordered multi-member tree', () => {
    const members = [
      optimizerMember('right', 'root', 'RIGHT'),
      optimizerMember('left-leaf', 'left', 'LEFT'),
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const openings = Object.freeze(
      Object.fromEntries(
        members.map((member) => [member.memberKey, optimizerOpening()]),
      ),
    );
    const request = createOptimizerRequest(members, openings);
    const verified = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'constructive-tree',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    expect(
      request.canonicalMemberKeys.every(
        (memberKey) =>
          verified.candidate.calculation.finalAssessmentByMember[memberKey]?.allTargetsMet ===
          true,
      ),
    ).toBe(true);
  });

  it('OPT-P04 reports terminal carry without adding a carry penalty', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const base = verifyAutomaticPlanCandidate(request, built.candidate, {
      candidateId: 'base-carry',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    const finalBusinessIndex = built.candidate.allocations.reduce(
      (lastIndex, cell, index) =>
        request.calendar.skipDateSet.includes(cell.date) ? lastIndex : index,
      -1,
    );
    const withCarry = verifyAutomaticPlanCandidate(
      request,
      {
        problemFingerprint: request.problemFingerprint,
        allocations: replaceCell(built.candidate.allocations, finalBusinessIndex, {
          selfLeft: 100,
          selfRight: 100,
        }),
      },
      { candidateId: 'extra-carry', sequence: 2, foundAtElapsedMs: 1 },
    );
    expect(base.status).toBe('SUCCESS');
    expect(withCarry.status).toBe('SUCCESS');
    if (base.status !== 'SUCCESS' || withCarry.status !== 'SUCCESS') return;
    expect(withCarry.candidate.objective.discardedExcessPv).toBe(
      base.candidate.objective.discardedExcessPv,
    );
    expect(withCarry.candidate.display.terminalCarrySummary.totalCarryPv).toBe(
      base.candidate.display.terminalCarrySummary.totalCarryPv + 200,
    );
    expect(withCarry.candidate.objective).not.toHaveProperty('terminalCarry');
  });

  it('QUAL-001 accepts inclusive same-day 267 crossing', () => {
    const opening = optimizerOpening({ openingQualificationPvp: 33 });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const [first, second] = firstTwoSettlementIndexes(
      built.candidate.allocations,
      request.calendar.skipDateSet,
    );
    let allocations = replaceCell(built.candidate.allocations, first, { pvp: 267 });
    allocations = replaceCell(allocations, second, { pvp: 433 });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        { problemFingerprint: request.problemFingerprint, allocations },
        { candidateId: 'qual-300', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({ status: 'SUCCESS' });
  });

  it('[OPEN-002] keeps qualification, daily carry, and fortnight PVP ledgers separate', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 33,
      dailyCarryPvp: 100,
      dailyCarryLeft: 200,
      dailyCarryRight: 100,
      fortnightPvpOpeningCredit: 300,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const [first, second] = firstTwoSettlementIndexes(
      built.candidate.allocations,
      request.calendar.skipDateSet,
    );
    let allocations: readonly NormalizedAllocationCell[] =
      built.candidate.allocations.map((cell) => ({ ...cell, pvp: 0 }));
    allocations = replaceCell(allocations, first, {
      pvp: 400,
      selfLeft: 0,
      selfRight: 200,
    });
    allocations = replaceCell(allocations, second, {
      pvp: 0,
      selfLeft: 2_500,
      selfRight: 2_500,
    });
    const verified = verifyAutomaticPlanCandidate(
      request,
      { problemFingerprint: request.problemFingerprint, allocations },
      { candidateId: 'separate-opening-ledgers', sequence: 1, foundAtElapsedMs: 0 },
    );
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    const firstDate = allocations[first]!.date;
    expect(
      verified.candidate.calculation.dailySettlementByDateAndMember[firstDate]?.root,
    ).toMatchObject({
      qualificationPvp: 433,
      preSettlement: { pvp: 500, left: 200, right: 300 },
      assessedLeft: 700,
      assessedRight: 300,
      settlementKind: 'FULL_COMMISSION',
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(
      verified.candidate.calculation.finalAssessmentByMember.root,
    ).toMatchObject({
      openingQualificationPvp: 33,
      closingQualificationPvp: 433,
      fortnightPvpOpeningCredit: 300,
      newPvpTotal: 400,
      personalPvpTotal: 700,
    });
  });

  it('spreads the constructive plan across eight qualified commission dates', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const verified = verifyAutomaticPlanCandidate(
      request,
      built.candidate,
      { candidateId: 'spread-eight-days', sequence: 1, foundAtElapsedMs: 0 },
    );
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    const settlements = Object.values(
      verified.candidate.calculation.dailySettlementByDateAndMember,
    ).flatMap((byMember) => Object.values(byMember));
    const fullCommissionDates = settlements.filter(
      (settlement) => settlement.settlementKind === 'FULL_COMMISSION',
    );
    expect(new Set(fullCommissionDates.map((settlement) => settlement.date)).size).toBe(8);
    expect(
      fullCommissionDates.every(
        (settlement) =>
          settlement.qualificationThresholdMet && settlement.qualificationPvp >= 300,
      ),
    ).toBe(true);
  });

  it('QUAL-002/005 rejects a mechanically reset settlement at qualification 299', () => {
    const opening = optimizerOpening({ openingQualificationPvp: 33 });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const [first, second] = firstTwoSettlementIndexes(
      built.candidate.allocations,
      request.calendar.skipDateSet,
    );
    let allocations = replaceCell(built.candidate.allocations, first, { pvp: 266 });
    allocations = replaceCell(allocations, second, { pvp: 434 });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        { problemFingerprint: request.problemFingerprint, allocations },
        { candidateId: 'qual-299', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_BELOW_QUALIFICATION_SETTLEMENT' },
    });
  });

  it('MODEL-003 rejects solver-reported objective disagreement', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    expect(
      verifyAutomaticPlanCandidate(
        request,
        {
          ...built.candidate,
          claimedObjective: {
            totalNewPv: 1,
            discardedExcessPv: 0,
            target700MembersAtLeastEight: 0,
            target700AscendingDayVector: [0],
            nonHundredCellCount: 0,
            maxDirectPvp: 1,
            deterministicAllocationVector: [1],
          },
        },
        { candidateId: 'mismatch', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_OBJECTIVE_MISMATCH' },
    });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        {
          ...built.candidate,
          claimedObjective: {
            totalNewPv: 5_700,
            discardedExcessPv: 0,
            target700MembersAtLeastEight: 1,
            target700AscendingDayVector: [0],
            nonHundredCellCount: 0,
            maxDirectPvp: 700,
            deterministicAllocationVector: [700],
          },
        },
        { candidateId: 'malformed-score', sequence: 2, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_OBJECTIVE_MISMATCH' },
    });
  });
});
