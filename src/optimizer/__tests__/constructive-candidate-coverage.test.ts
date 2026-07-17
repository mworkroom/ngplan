import { describe, expect, it, vi } from 'vitest';
import type { AutomaticPlanRequest } from '../types';

vi.mock('../candidate-shape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../candidate-shape')>();
  return {
    ...actual,
    validateAutomaticPlanRequest: vi.fn(() => ({ status: 'SUCCESS' as const })),
  };
});

import {
  buildConstructiveCandidate,
  buildConstructiveCandidateVariants,
} from '../constructive-candidate';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

function successfulCandidate(request: AutomaticPlanRequest) {
  const outcome = buildConstructiveCandidate(request);
  if (outcome.status !== 'SUCCESS') {
    throw new Error(`constructive failure: ${outcome.error.code}`);
  }
  return outcome.candidate;
}

function requestWithOneBusinessDate(request: AutomaticPlanRequest): AutomaticPlanRequest {
  return {
    ...request,
    calendar: {
      ...request.calendar,
      dates: ['2026-07-01'],
      skipDateSet: [],
    },
  };
}

describe('constructive candidate branch coverage', () => {
  it('handles a one-day right-child tree and puts every required value on that date', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('right', 'root', 'RIGHT'),
    ];
    const request = requestWithOneBusinessDate(
      createOptimizerRequest(
        members,
        Object.freeze({
          root: optimizerOpening(),
          right: optimizerOpening(),
        }),
      ),
    );

    const candidate = successfulCandidate(request);

    expect(candidate.allocations).toHaveLength(2);
    expect(candidate.allocations).toEqual([
      expect.objectContaining({
        date: '2026-07-01',
        memberKey: 'root',
        pvp: 700,
        selfLeft: 22_500,
      }),
      expect.objectContaining({
        date: '2026-07-01',
        memberKey: 'right',
        pvp: 700,
        selfLeft: 19_300,
        selfRight: 2_500,
      }),
    ]);
    expect(
      candidate.allocations
        .flatMap((cell) => [cell.pvp, cell.selfLeft, cell.selfRight])
        .filter((value): value is number => value !== undefined && value !== 0)
        .every((value) => value >= 30),
    ).toBe(true);
    const variants = buildConstructiveCandidateVariants(request);
    expect(variants).toHaveLength(2);
    expect(variants[1]).toEqual(variants[0]);
  });

  it('returns stable failures for no business date and a missing normalized opening', () => {
    const base = createOptimizerRequest();
    expect(
      buildConstructiveCandidate({
        ...base,
        calendar: { ...base.calendar, dates: [], skipDateSet: [] },
      }),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED' },
    });
    expect(buildConstructiveCandidateVariants({
      ...base,
      calendar: { ...base.calendar, dates: [], skipDateSet: [] },
    })).toEqual([
      expect.objectContaining({
        status: 'FAILURE',
        error: expect.objectContaining({ code: 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED' }),
      }),
    ]);

    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const missingOpening = createOptimizerRequest(
      members,
      Object.freeze({
        root: optimizerOpening(),
        left: optimizerOpening(),
      }),
    );
    expect(
      buildConstructiveCandidate({
        ...missingOpening,
        openingPvpByMember: { root: missingOpening.openingPvpByMember.root! },
      }),
    ).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
        location: { memberKey: 'left' },
      },
    });
  });

  it('covers a left-child tree on the canonical multi-day calendar', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const request = createOptimizerRequest(
      members,
      Object.freeze({
        root: optimizerOpening(),
        left: optimizerOpening(),
      }),
    );

    const candidate = successfulCandidate(request);

    expect(candidate.allocations.some((cell) => cell.memberKey === 'root' && cell.selfRight! > 0))
      .toBe(true);
    expect(candidate.allocations.some((cell) => cell.memberKey === 'left' && cell.selfLeft! > 0))
      .toBe(true);
  });

  it.each([
    {
      opening: 699,
      expectedTotal: 45_030,
      expectedPvp: 30,
      expectedLeft: 22_500,
    },
    {
      opening: 799,
      expectedTotal: 45_000,
      expectedPvp: 0,
      expectedLeft: 22_500,
    },
  ])(
    'keeps exact totals at cumulative opening $opening',
    ({ opening, expectedTotal, expectedPvp, expectedLeft }) => {
      const openingState = optimizerOpening({
        openingQualificationPvp: opening,
        fortnightPvpOpeningCredit: opening,
      });
      const request = createOptimizerRequest(
        [optimizerMember('root')],
        Object.freeze({ root: openingState }),
      );

      const candidate = successfulCandidate(request);
      const total = candidate.allocations.reduce(
        (sum, cell) => sum + cell.pvp + (cell.selfLeft ?? 0) + (cell.selfRight ?? 0),
        0,
      );

      expect(total).toBe(expectedTotal);
      expect(candidate.allocations.reduce((sum, cell) => sum + cell.pvp, 0)).toBe(
        expectedPvp,
      );
      expect(
        candidate.allocations.reduce((sum, cell) => sum + (cell.selfLeft ?? 0), 0),
      ).toBe(expectedLeft);
      expect(
        candidate.allocations.some((cell) =>
          [cell.pvp, cell.selfLeft, cell.selfRight].some(
            (value) => value !== undefined && value > 0 && value % 100 === 1,
          ),
        ),
      ).toBe(false);
    },
  );

  it('distributes the root floor without emitting a sub-30 cell', () => {
    const opening = optimizerOpening({
      openingQualificationPvp: 2_180,
      fortnightPvpOpeningCredit: 2_180,
    });
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: opening }),
    );

    const candidate = successfulCandidate(request);
    const businessCells = candidate.allocations.filter(
      (cell) => !request.calendar.skipDateSet.includes(cell.date),
    );

    expect(businessCells.reduce((sum, cell) => sum + cell.selfLeft!, 0)).toBe(22_500);
    expect(businessCells.reduce((sum, cell) => sum + cell.selfRight!, 0)).toBe(22_500);
    expect(
      businessCells
        .flatMap((cell) => [cell.pvp, cell.selfLeft, cell.selfRight])
        .filter((value): value is number => value !== undefined && value !== 0)
        .every((value) => value >= 30),
    ).toBe(true);
  });

  it('defensively rejects an impossible 10-PV post-qualification remainder', () => {
    const malformedMember = {
      ...optimizerMember('root'),
      pvpTarget: 310,
    } as unknown as ReturnType<typeof optimizerMember>;
    const request = createOptimizerRequest(
      [malformedMember],
      Object.freeze({ root: optimizerOpening() }),
    );

    expect(() => buildConstructiveCandidate(request)).toThrow(
      '0이 아닌 자동 직접 값은 30 PV 이상이어야 합니다.',
    );
  });
});
