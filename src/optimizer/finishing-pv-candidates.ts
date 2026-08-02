import { DEFAULT_RULE_SET, type NormalizedAllocationCell } from '../engine';
import {
  deriveAutomaticPlanPurchaseBudget,
  totalAutomaticPlanDirectPv,
} from './purchase-budget';
import type {
  AutomaticPlanRequest,
  RawAutomaticPlanCandidate,
} from './types';

type AllocationField = 'pvp' | 'selfLeft' | 'selfRight';

function fieldValue(
  cell: NormalizedAllocationCell,
  field: AllocationField,
): number {
  if (field === 'pvp') return cell.pvp;
  return field === 'selfLeft' ? cell.selfLeft! : cell.selfRight!;
}

function withFieldValue(
  cell: NormalizedAllocationCell,
  field: AllocationField,
  value: number,
): NormalizedAllocationCell {
  if (field === 'pvp') return Object.freeze({ ...cell, pvp: value });
  if (field === 'selfLeft') return Object.freeze({ ...cell, selfLeft: value });
  return Object.freeze({ ...cell, selfRight: value });
}

/**
 * Adds at most the bounded finishing allowance to one existing direct-input
 * cell (or creates one legal 30-PV cell). The canonical verifier decides
 * whether the increment earns more commission and remains otherwise valid.
 */
export function* buildFinishingPvCandidateVariants(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
): Iterable<RawAutomaticPlanCandidate> {
  const budget = deriveAutomaticPlanPurchaseBudget(request);
  const currentTotal = totalAutomaticPlanDirectPv(source.allocations);
  const remainingAllowance = budget.maximumTotalPv - currentTotal;
  if (remainingAllowance <= 0) return;

  const skippedDates = new Set(request.calendar.skipDateSet);
  const memberCount = request.canonicalMemberKeys.length;
  const pvpTotalByMember = request.canonicalMemberKeys.map((_, memberIndex) =>
    source.allocations.reduce((total, cell, allocationIndex) =>
      allocationIndex % memberCount === memberIndex ? total + cell.pvp : total,
    0));

  for (let index = 0; index < source.allocations.length; index += 1) {
    const cell = source.allocations[index]!;
    if (skippedDates.has(cell.date)) continue;
    const memberIndex = index % memberCount;
    const memberKey = request.canonicalMemberKeys[memberIndex]!;
    const fields: AllocationField[] = ['pvp'];
    if (Object.hasOwn(cell, 'selfLeft')) fields.push('selfLeft');
    if (Object.hasOwn(cell, 'selfRight')) fields.push('selfRight');

    for (const field of fields) {
      const currentValue = fieldValue(cell, field);
      for (let increment = 1; increment <= remainingAllowance; increment += 1) {
        const nextValue = currentValue + increment;
        if (currentValue === 0 && nextValue < 30) continue;
        if (
          field === 'pvp' &&
          request.openingPvpByMember[memberKey]!.cumulativePvpOpening +
            pvpTotalByMember[memberIndex]! + increment >
            DEFAULT_RULE_SET.cumulativePvpCap
        ) continue;

        yield Object.freeze({
          problemFingerprint: request.problemFingerprint,
          allocations: Object.freeze(source.allocations.map(
            (candidateCell, candidateIndex) => candidateIndex === index
              ? withFieldValue(candidateCell, field, nextValue)
              : candidateCell,
          )),
        });
      }
    }
  }
}
