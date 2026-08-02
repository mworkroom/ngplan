import type { NormalizedAllocationCell } from '../engine';
import type {
  AutomaticPlanRequest,
  RawAutomaticPlanCandidate,
} from './types';

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;
const PREFERRED_MOVE_PV = 100;
const CUMULATIVE_PVP_CAP = 2_400;

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

function legalAutomaticValue(value: number): boolean {
  return value === 0 || value >= MINIMUM_AUTOMATIC_DIRECT_PV;
}

function moveAmounts(
  sourceValue: number,
  seriesTotal: number,
  targetValue: number,
  extraAmounts: readonly number[] = [],
): readonly number[] {
  const candidates = new Set<number>([
    PREFERRED_MOVE_PV,
    MINIMUM_AUTOMATIC_DIRECT_PV,
    sourceValue,
    sourceValue % PREFERRED_MOVE_PV,
    seriesTotal % PREFERRED_MOVE_PV,
    targetValue === 0
      ? PREFERRED_MOVE_PV
      : PREFERRED_MOVE_PV - targetValue % PREFERRED_MOVE_PV,
    ...extraAmounts,
  ]);
  return Object.freeze([...candidates]
    .filter((amount) =>
      Number.isSafeInteger(amount) &&
      amount >= MINIMUM_AUTOMATIC_DIRECT_PV &&
      amount <= sourceValue)
    .sort((left, right) => left - right));
}

function changedCandidate(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  changes: ReadonlyMap<number, ReadonlyMap<AllocationField, number>>,
): RawAutomaticPlanCandidate {
  return Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(source.allocations.map((cell, index) => {
      const cellChanges = changes.get(index);
      if (cellChanges === undefined) return cell;
      let changed = cell;
      for (const [field, value] of cellChanges) {
        changed = withFieldValue(changed, field, value);
      }
      return changed;
    })),
  });
}

function twoCoordinateChanges(
  sourceIndex: number,
  sourceField: AllocationField,
  sourceValue: number,
  targetIndex: number,
  targetField: AllocationField,
  targetValue: number,
): ReadonlyMap<number, ReadonlyMap<AllocationField, number>> {
  const mutable = new Map<number, Map<AllocationField, number>>();
  const set = (index: number, field: AllocationField, value: number): void => {
    const fields = mutable.get(index) ?? new Map<AllocationField, number>();
    fields.set(field, value);
    mutable.set(index, fields);
  };
  set(sourceIndex, sourceField, sourceValue);
  set(targetIndex, targetField, targetValue);
  return new Map([...mutable].map(([index, fields]) => [
    index,
    new Map(fields),
  ]));
}

/**
 * Enumerates deterministic, total-preserving local moves. A move can relocate
 * one member/field's direct PV between business dates, or exchange a SELF-side
 * amount for the same member's cumulative-PVP headroom. The latter keeps total
 * purchasing fixed while allowing current-rule PVP to fill the smaller side.
 *
 * Results are raw heuristic candidates. The canonical verifier remains the
 * only authority for qualification, fortnight targets, and objective values.
 */
export function* buildBoundaryMoveCandidateVariants(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
): Iterable<RawAutomaticPlanCandidate> {
  const skipDates = new Set(request.calendar.skipDateSet);
  const businessDateIndexes = request.calendar.dates.flatMap(
    (date, index) => skipDates.has(date) ? [] : [index],
  );
  const memberCount = request.canonicalMemberKeys.length;
  if (businessDateIndexes.length <= 1 || memberCount === 0) return;

  for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
    const memberKey = request.canonicalMemberKeys[memberIndex]!;
    const firstCell = source.allocations[memberIndex]!;
    const fields: AllocationField[] = ['pvp'];
    if (Object.hasOwn(firstCell, 'selfLeft')) fields.push('selfLeft');
    if (Object.hasOwn(firstCell, 'selfRight')) fields.push('selfRight');

    const allocationIndex = (dateIndex: number): number =>
      dateIndex * memberCount + memberIndex;
    const pvpTotal = businessDateIndexes.reduce(
      (total, dateIndex) =>
        total + source.allocations[allocationIndex(dateIndex)]!.pvp,
      0,
    );
    const opening = request.openingPvpByMember[memberKey]!.cumulativePvpOpening;
    const pvpHeadroom = CUMULATIVE_PVP_CAP - opening - pvpTotal;

    for (const field of fields) {
      const seriesTotal = businessDateIndexes.reduce(
        (total, dateIndex) =>
          total + fieldValue(source.allocations[allocationIndex(dateIndex)]!, field),
        0,
      );
      for (const sourceDateIndex of businessDateIndexes) {
        const sourceIndex = allocationIndex(sourceDateIndex);
        const sourceCell = source.allocations[sourceIndex]!;
        const sourceValue = fieldValue(sourceCell, field);
        if (sourceValue === 0) continue;

        for (const targetDateIndex of businessDateIndexes) {
          if (targetDateIndex === sourceDateIndex) continue;
          const targetIndex = allocationIndex(targetDateIndex);
          const targetCell = source.allocations[targetIndex]!;
          const targetValue = fieldValue(targetCell, field);
          for (const amount of moveAmounts(
            sourceValue,
            seriesTotal,
            targetValue,
          )) {
            const nextSourceValue = sourceValue - amount;
            const nextTargetValue = targetValue + amount;
            if (
              !legalAutomaticValue(nextSourceValue) ||
              !legalAutomaticValue(nextTargetValue)
            ) continue;
            yield changedCandidate(
              request,
              source,
              twoCoordinateChanges(
                sourceIndex,
                field,
                nextSourceValue,
                targetIndex,
                field,
                nextTargetValue,
              ),
            );
          }
        }

        if (field === 'pvp' || pvpHeadroom < MINIMUM_AUTOMATIC_DIRECT_PV) {
          continue;
        }
        for (const targetDateIndex of businessDateIndexes) {
          const targetIndex = allocationIndex(targetDateIndex);
          const targetPvp = source.allocations[targetIndex]!.pvp;
          const nextHundredPvp = pvpTotal % PREFERRED_MOVE_PV === 0
            ? PREFERRED_MOVE_PV
            : PREFERRED_MOVE_PV - pvpTotal % PREFERRED_MOVE_PV;
          for (const amount of moveAmounts(
            sourceValue,
            seriesTotal,
            targetPvp,
            [nextHundredPvp, pvpHeadroom],
          )) {
            if (amount > pvpHeadroom) continue;
            const nextSourceValue = sourceValue - amount;
            const nextTargetPvp = targetPvp + amount;
            if (
              !legalAutomaticValue(nextSourceValue) ||
              !legalAutomaticValue(nextTargetPvp)
            ) continue;
            yield changedCandidate(
              request,
              source,
              twoCoordinateChanges(
                sourceIndex,
                field,
                nextSourceValue,
                targetIndex,
                'pvp',
                nextTargetPvp,
              ),
            );
          }
        }
      }
    }
  }
}
