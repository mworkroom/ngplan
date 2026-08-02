import { describe, expect, it } from 'vitest';
import type { NormalizedAllocationCell } from '../../engine';
import {
  buildConstructiveCandidate,
  buildFinishingPvCandidateVariants,
  deriveAutomaticPlanPurchaseBudget,
  totalAutomaticPlanDirectPv,
  verifyAutomaticPlanCandidate,
} from '..';
import { createOptimizerRequest } from './fixtures';

function replaceCell(
  cells: readonly NormalizedAllocationCell[],
  index: number,
  patch: Partial<NormalizedAllocationCell>,
): readonly NormalizedAllocationCell[] {
  return cells.map((cell, cellIndex) =>
    cellIndex === index ? { ...cell, ...patch } : cell,
  );
}

describe('Phase 4 bounded finishing PV', () => {
  it('derives the recursive structural minimum and a 30-PV hard ceiling', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error(built.error.code);
    const budget = deriveAutomaticPlanPurchaseBudget(request);

    expect(totalAutomaticPlanDirectPv(built.candidate.allocations)).toBe(
      budget.structuralMinimumTotalPv,
    );
    expect(budget.finishingAllowancePv).toBe(30);
    expect(budget.maximumTotalPv).toBe(budget.structuralMinimumTotalPv + 30);
  });

  it('enumerates deterministic legal increments without crossing the ceiling', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error(built.error.code);
    const first = [...buildFinishingPvCandidateVariants(request, built.candidate)];
    const second = [...buildFinishingPvCandidateVariants(request, built.candidate)];
    const maximum = deriveAutomaticPlanPurchaseBudget(request).maximumTotalPv;

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(first.every((candidate) =>
      totalAutomaticPlanDirectPv(candidate.allocations) <= maximum)).toBe(true);
    expect(first.every((candidate) => candidate.allocations.every((cell) =>
      [cell.pvp, cell.selfLeft, cell.selfRight]
        .filter((value): value is number => value !== undefined)
        .every((value) => value === 0 || value >= 30),
    ))).toBe(true);
  });

  it('accepts +30 but independently rejects +31 over the structural minimum', () => {
    const request = createOptimizerRequest();
    const built = buildConstructiveCandidate(request);
    if (built.status !== 'SUCCESS') throw new Error(built.error.code);
    const index = built.candidate.allocations.findIndex((cell) =>
      !request.calendar.skipDateSet.includes(cell.date) &&
      cell.selfLeft !== undefined &&
      cell.selfLeft > 0,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const cell = built.candidate.allocations[index]!;

    const verifyWithIncrement = (increment: number) =>
      verifyAutomaticPlanCandidate(
        request,
        {
          problemFingerprint: request.problemFingerprint,
          allocations: replaceCell(built.candidate.allocations, index, {
            selfLeft: cell.selfLeft! + increment,
          }),
        },
        {
          candidateId: `finishing-${increment}`,
          sequence: increment,
          foundAtElapsedMs: 0,
        },
      );

    expect(verifyWithIncrement(30)).toMatchObject({ status: 'SUCCESS' });
    expect(verifyWithIncrement(31)).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_EXCESS_PURCHASE_LIMIT_EXCEEDED',
      },
    });
  });
});
