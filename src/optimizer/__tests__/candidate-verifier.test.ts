import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engineModule from '../../engine';
import type { NormalizedAllocationCell } from '../../engine';
import {
  AUTOMATIC_PLAN_RULESET_VERSION,
  buildConstructiveCandidate,
  buildConstructiveCandidateVariants,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('P4-REQ-002 accepts 57 members and rejects 58 members', () => {
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
    expect(validateAutomaticPlanRequest(requestWithMemberCount(57))).toEqual({
      status: 'SUCCESS',
    });
    expect(validateAutomaticPlanRequest(requestWithMemberCount(58))).toMatchObject({
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
    expect(verified.candidate.calculation.rulesetVersion).toBe(
      AUTOMATIC_PLAN_RULESET_VERSION,
    );
    expect(verified.candidate.objective.totalNewPv).toBe(5_000);
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
    const base = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'base-carry',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    expect(base.status).toBe('SUCCESS');
    if (base.status !== 'SUCCESS') return;
    expect(base.candidate.display.terminalCarrySummary.totalCarryPv).toBeGreaterThanOrEqual(0);
    expect(base.candidate.objective).not.toHaveProperty('terminalCarry');
  });

  it('QUAL-001 accepts inclusive same-day 267 crossing', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 33,
      fortnightPvpOpeningCredit: 33,
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
      pvp: 267,
    });
    allocations = replaceCell(allocations, second, { pvp: 400 });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        { problemFingerprint: request.problemFingerprint, allocations },
        { candidateId: 'qual-300', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({ status: 'SUCCESS' });
  });

  it('[OPEN-001] maps one cumulative PVP to qualification/fortnight and daily PVP zero', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 33,
      dailyCarryLeft: 200,
      dailyCarryRight: 100,
      fortnightPvpOpeningCredit: 33,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const verified = verifyAutomaticPlanCandidate(
      request,
      built.candidate,
      { candidateId: 'cumulative-opening-ledgers', sequence: 1, foundAtElapsedMs: 0 },
    );
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    expect(
      verified.candidate.calculation.finalAssessmentByMember.root,
    ).toMatchObject({
      openingQualificationPvp: 33,
      closingQualificationPvp: 700,
      fortnightPvpOpeningCredit: 33,
      newPvpTotal: 667,
      personalPvpTotal: 700,
    });
    expect(
      verified.candidate.calculation.inputSnapshot.organization.openingStateByMember.root,
    ).toMatchObject({
      openingQualificationPvp: 33,
      fortnightPvpOpeningCredit: 33,
      dailyCarryPvp: 0,
      dailyCarryLeft: 200,
      dailyCarryRight: 100,
    });
  });

  it('passes identity, fingerprint, and shape boundary failures through the verifier', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');

    for (const identity of [
      { candidateId: ' ', sequence: 1, foundAtElapsedMs: 0 },
      { candidateId: 'candidate', sequence: -0, foundAtElapsedMs: 0 },
      { candidateId: 'candidate', sequence: 1, foundAtElapsedMs: -1 },
    ]) {
      expect(
        verifyAutomaticPlanCandidate(request, built.candidate, identity),
      ).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' },
      });
    }

    expect(
      verifyAutomaticPlanCandidate(
        request,
        { ...built.candidate, problemFingerprint: 'stale-fingerprint' },
        { candidateId: 'fingerprint', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_FINGERPRINT_MISMATCH' },
    });

    expect(
      verifyAutomaticPlanCandidate(
        request,
        {
          ...built.candidate,
          allocations: replaceCell(built.candidate.allocations, 0, { pvp: -0 }),
        },
        { candidateId: 'shape', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID' },
    });
  });

  it('rejects an engine-invalid cumulative PVP overflow and an unmet member target', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const firstBusinessIndex = built.candidate.allocations.findIndex(
      (cell) => !request.calendar.skipDateSet.includes(cell.date),
    );

    const engineInvalidCandidate = {
      ...built.candidate,
      allocations: replaceCell(built.candidate.allocations, firstBusinessIndex, {
        pvp: 2_400,
      }),
    };
    expect(
      verifyAutomaticPlanCandidate(
        request,
        engineInvalidCandidate,
        { candidateId: 'engine-rejected', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_ENGINE_REJECTED' },
    });

    const rejectedCalculation = engineModule.calculatePlan({
      period: request.period,
      organization: request.organization,
      allocations: engineInvalidCandidate.allocations,
    });
    if (rejectedCalculation.status !== 'FAILURE') {
      throw new Error('engine rejection fixture failed');
    }
    vi.spyOn(engineModule, 'calculatePlan').mockReturnValueOnce({
      ...rejectedCalculation,
      validation: {
        ...rejectedCalculation.validation,
        errors: [],
      },
    });
    const rejectedWithoutCause = verifyAutomaticPlanCandidate(
      request,
      engineInvalidCandidate,
      { candidateId: 'engine-rejected-without-cause', sequence: 2, foundAtElapsedMs: 0 },
    );
    expect(rejectedWithoutCause).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_ENGINE_REJECTED' },
    });
    if (rejectedWithoutCause.status === 'FAILURE') {
      expect(rejectedWithoutCause.error).not.toHaveProperty('causeCode');
    }

    expect(
      verifyAutomaticPlanCandidate(
        request,
        {
          ...built.candidate,
          allocations: built.candidate.allocations.map((cell) => ({
            ...cell,
            selfLeft: 0,
          })),
        },
        { candidateId: 'target-unmet', sequence: 3, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_TARGET_UNMET',
        location: { memberKey: 'root' },
      },
    });
  });

  it('rejects a candidate when the calculated engine version is not supported', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const verified = verifyAutomaticPlanCandidate(
      request,
      built.candidate,
      { candidateId: 'version-source', sequence: 1, foundAtElapsedMs: 0 },
    );
    if (verified.status !== 'SUCCESS') throw new Error('verified fixture failed');
    vi.spyOn(engineModule, 'calculatePlan').mockReturnValueOnce({
      status: 'SUCCESS',
      result: {
        ...verified.candidate.calculation,
        engineVersion: 'unsupported-engine-version',
      },
    });

    expect(
      verifyAutomaticPlanCandidate(
        request,
        built.candidate,
        { candidateId: 'version-mismatch', sequence: 2, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_VERSION_UNSUPPORTED' },
    });
  });

  it('defensively rejects missing or tampered engine state and unexpected exceptions', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const verified = verifyAutomaticPlanCandidate(
      request,
      built.candidate,
      { candidateId: 'defensive-source', sequence: 1, foundAtElapsedMs: 0 },
    );
    if (verified.status !== 'SUCCESS') throw new Error('verified fixture failed');
    const calculation = verified.candidate.calculation;
    const firstDate = request.calendar.dates[0]!;

    let openingReadCount = 0;
    const intermittentOpening = {
      get root() {
        openingReadCount += 1;
        return openingReadCount === 1
          ? request.openingPvpByMember.root
          : undefined;
      },
    } as typeof request.openingPvpByMember;
    const intermittentOpeningRequest = {
      ...request,
      openingPvpByMember: intermittentOpening,
    };
    expect(
      verifyAutomaticPlanCandidate(
        intermittentOpeningRequest,
        built.candidate,
        { candidateId: 'missing-opening', sequence: 2, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_OPENING_STATE_INVALID' },
    });

    const calculatePlanSpy = vi.spyOn(engineModule, 'calculatePlan');
    const missingSettlements = Object.fromEntries(
      Object.entries(calculation.dailySettlementByDateAndMember)
        .filter(([date]) => date !== firstDate),
    ) as typeof calculation.dailySettlementByDateAndMember;
    calculatePlanSpy.mockReturnValueOnce({
      status: 'SUCCESS',
      result: {
        ...calculation,
        dailySettlementByDateAndMember: missingSettlements,
      },
    });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        built.candidate,
        { candidateId: 'missing-settlement', sequence: 3, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_QUALIFICATION_MISMATCH' },
    });

    const firstSettlement = calculation.dailySettlementByDateAndMember[firstDate]!.root!;
    const qualificationMismatchSettlements = {
      ...calculation.dailySettlementByDateAndMember,
      [firstDate]: {
        ...calculation.dailySettlementByDateAndMember[firstDate],
        root: {
          ...firstSettlement,
          qualificationPvp: firstSettlement.qualificationPvp + 1,
        },
      },
    } as unknown as typeof calculation.dailySettlementByDateAndMember;
    calculatePlanSpy.mockReturnValueOnce({
      status: 'SUCCESS',
      result: {
        ...calculation,
        dailySettlementByDateAndMember: qualificationMismatchSettlements,
      },
    });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        built.candidate,
        { candidateId: 'qualification-mismatch', sequence: 4, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_QUALIFICATION_MISMATCH' },
    });

    const firstBusinessIndex = built.candidate.allocations.findIndex(
      (cell) => !request.calendar.skipDateSet.includes(cell.date),
    );
    const overCapAllocations = replaceCell(
      built.candidate.allocations,
      firstBusinessIndex,
      { pvp: 2_400 },
    );
    let qualificationPvp = 0;
    const overCapSettlements = Object.fromEntries(
      request.calendar.dates.map((date, index) => {
        qualificationPvp += overCapAllocations[index]!.pvp;
        const settlementByMember = calculation.dailySettlementByDateAndMember[date]!;
        return [
          date,
          {
            ...settlementByMember,
            root: {
              ...settlementByMember.root!,
              qualificationPvp,
              qualificationThresholdMet: qualificationPvp >= 300,
            },
          },
        ];
      }),
    ) as unknown as typeof calculation.dailySettlementByDateAndMember;
    calculatePlanSpy.mockReturnValueOnce({
      status: 'SUCCESS',
      result: {
        ...calculation,
        dailySettlementByDateAndMember: overCapSettlements,
      },
    });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        {
          problemFingerprint: request.problemFingerprint,
          allocations: overCapAllocations,
        },
        { candidateId: 'verifier-cap', sequence: 5, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID',
        location: { memberKey: 'root', field: 'PVP' },
      },
    });

    calculatePlanSpy.mockImplementationOnce(() => {
      throw new Error('unexpected engine exception');
    });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        built.candidate,
        { candidateId: 'unexpected-exception', sequence: 6, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_INTERNAL_ERROR' },
    });
  });

  it('P4-SHAPE-005/006 accepts 0 or at least 30 and rejects 1-29', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const businessZeroIndex = built.candidate.allocations.findIndex(
      (cell) => !request.calendar.skipDateSet.includes(cell.date) && cell.pvp === 0,
    );
    expect(businessZeroIndex).toBeGreaterThanOrEqual(0);
    for (const pvp of [1, 10, 29]) {
      expect(
        validateAutomaticPlanCandidateShape(
          request,
          replaceCell(built.candidate.allocations, businessZeroIndex, { pvp }),
        ),
      ).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID' },
      });
    }
    for (const pvp of [30, 39, 100]) {
      expect(
        validateAutomaticPlanCandidateShape(
          request,
          replaceCell(built.candidate.allocations, businessZeroIndex, { pvp }),
        ),
      ).toMatchObject({ status: 'SUCCESS' });
    }
  });

  it('uses every business date without requiring a final-business-date root commission', () => {
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
    const businessDates = request.calendar.dates.filter(
      (date) => !request.calendar.skipDateSet.includes(date),
    );
    for (const date of businessDates) {
      expect(
        built.candidate.allocations
          .filter((cell) => cell.date === date)
          .some((cell) => [cell.pvp, cell.selfLeft, cell.selfRight]
            .some((value) => value !== undefined && value > 0)),
      ).toBe(true);
    }
    expect(
      verified.candidate.calculation.dailySettlementByDateAndMember[
        businessDates.at(-1)!
      ]?.root,
    ).toMatchObject({
      settlementKind: 'NO_COMMISSION',
      qualificationThresholdMet: true,
      commissionTier: null,
    });
    expect(verified.candidate.display.rootCommissionGoal).toMatchObject({
      rootMemberKey: 'root',
      businessDayCount: businessDates.length,
      targetCommissionDays: 8,
    });
  });

  it('accepts a target-700 root without a commission on the final business date', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const businessIndexes = built.candidate.allocations
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => !request.calendar.skipDateSet.includes(cell.date))
      .map(({ index }) => index);
    const previousIndex = businessIndexes.at(-2)!;
    const finalIndex = businessIndexes.at(-1)!;
    const previous = built.candidate.allocations[previousIndex]!;
    const final = built.candidate.allocations[finalIndex]!;
    let allocations = replaceCell(built.candidate.allocations, previousIndex, {
      pvp: previous.pvp + final.pvp,
      selfLeft: previous.selfLeft! + final.selfLeft!,
      selfRight: previous.selfRight! + final.selfRight!,
    });
    allocations = replaceCell(allocations, finalIndex, {
      pvp: 0,
      selfLeft: 0,
      selfRight: 0,
    });

    const verified = verifyAutomaticPlanCandidate(
        request,
        { problemFingerprint: request.problemFingerprint, allocations },
        { candidateId: 'missing-final-root-commission', sequence: 1, foundAtElapsedMs: 0 },
      );
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    expect(verified.candidate.display.rootCommissionGoal.targetCommissionDays).toBe(8);
  });

  it('P4-CAP/PERIOD keeps opening 2,400 PVP at zero without a final tier rule', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 2_400,
      fortnightPvpOpeningCredit: 2_400,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root', null, null, 2_400)],
      Object.freeze({ root: opening }),
    );
    const verified = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'root-2400-final-700',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    expect(verified.candidate.allocations.every((cell) => cell.pvp === 0)).toBe(true);
    const finalBusinessDate = request.calendar.dates
      .filter((date) => !request.calendar.skipDateSet.includes(date))
      .at(-1)!;
    expect(
      verified.candidate.calculation.dailySettlementByDateAndMember[
        finalBusinessDate
      ]?.root,
    ).toMatchObject({
      settlementKind: 'NO_COMMISSION',
      commissionTier: null,
    });
    expect(verified.candidate.display.rootCommissionGoal).toMatchObject({
      targetCommissionDays: 8,
      capacityLimited: true,
    });
  });

  it('accepts a target-2,400 root whose final business day reaches tier 300', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 2_400,
      fortnightPvpOpeningCredit: 2_400,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root', null, null, 2_400)],
      Object.freeze({ root: opening }),
    );
    const aligned = buildConstructiveCandidateVariants(request)[1];
    if (aligned?.status !== 'SUCCESS') throw new Error('aligned fixture failed');
    const verified = verifyAutomaticPlanCandidate(
      request,
      aligned.candidate,
      { candidateId: 'final-root-tier-300', sequence: 1, foundAtElapsedMs: 0 },
    );
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    const finalBusinessDate = request.calendar.dates
      .filter((date) => !request.calendar.skipDateSet.includes(date))
      .at(-1)!;
    expect(
      verified.candidate.calculation.dailySettlementByDateAndMember[finalBusinessDate]?.root,
    ).toMatchObject({ settlementKind: 'FULL_COMMISSION', commissionTier: 300 });
  });

  it('fails construction when a target-2,400 deficit is smaller than the 30-PV minimum', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 2_399,
      fortnightPvpOpeningCredit: 2_399,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root', null, null, 2_400)],
      Object.freeze({ root: opening }),
    );
    expect(buildConstructiveCandidate(request)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED' },
    });
  });

  it('keeps an opening-680 personal deficit exact with recursive side targets', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 680,
      fortnightPvpOpeningCredit: 680,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );
    const verified = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'opening-680-exact-side-budget',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    expect(verified.candidate.objective.totalNewPv).toBe(5_000);
    expect(verified.candidate.calculation.finalAssessmentByMember.root).toMatchObject({
      newPvpTotal: 30,
      personalPvpTotal: 710,
      rawLeftTotal: 2_500,
      rawRightTotal: 2_470,
      assessedLeft: 2_500,
      assessedRight: 2_500,
      allTargetsMet: true,
    });
    expect(
      verified.candidate.allocations
        .flatMap((cell) => [cell.pvp, cell.selfLeft, cell.selfRight])
        .filter((value): value is number => value !== undefined && value !== 0)
        .every((value) => value >= 30),
    ).toBe(true);
  });

  it('QUAL-002/005 rejects a mechanically reset settlement at qualification 299', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 33,
      fortnightPvpOpeningCredit: 33,
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
      pvp: 266,
      selfLeft: 300,
      selfRight: 300,
    });
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

  it('passes through an objective failure for a commission tier without a payout contract', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error('constructive fixture failed');
    const firstBusinessIndex = built.candidate.allocations.findIndex(
      (cell) => !request.calendar.skipDateSet.includes(cell.date),
    );
    const allocations = replaceCell(
      built.candidate.allocations,
      firstBusinessIndex,
      { selfLeft: 6_000, selfRight: 6_000 },
    );

    expect(
      verifyAutomaticPlanCandidate(
        request,
        { problemFingerprint: request.problemFingerprint, allocations },
        { candidateId: 'unconfirmed-payout-tier', sequence: 1, foundAtElapsedMs: 0 },
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_PAYOUT_TABLE_INCOMPLETE',
        causeCode: 'UNCONFIRMED_COMMISSION_TIER_6000',
      },
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
            rootCommissionGoalShortfallDays: 0,
            totalNewPv: 1,
            confirmedPayoutWon: 0,
            discardedExcessPv: 0,
            highTargetDescendingEquivalentUnitShortfallVector: [],
            target700DescendingEquivalentUnitShortfallVector: [1, 0],
            futureCumulativePvpInvestmentPv: 0,
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
            rootCommissionGoalShortfallDays: 0,
            totalNewPv: 5_700,
            confirmedPayoutWon: 0,
            discardedExcessPv: 0,
            highTargetDescendingEquivalentUnitShortfallVector: [],
            target700DescendingEquivalentUnitShortfallVector: [0],
            futureCumulativePvpInvestmentPv: 0,
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
