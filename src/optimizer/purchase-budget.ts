import type { NormalizedAllocationCell } from '../engine';
import { checkedAddScore } from './checked-integer';
import { AUTOMATIC_PLAN_FINISHING_PV_ALLOWANCE } from './constants';
import { deriveRootCommissionGoalCapacity } from './root-commission-goal';
import type { AutomaticPlanRequest } from './types';

export interface AutomaticPlanPurchaseBudget {
  readonly structuralMinimumTotalPv: number;
  readonly finishingAllowancePv: number;
  readonly maximumTotalPv: number;
}

function allocationValues(
  cell: NormalizedAllocationCell,
): readonly number[] {
  return [
    cell.pvp,
    ...(Object.hasOwn(cell, 'selfLeft') ? [cell.selfLeft!] : []),
    ...(Object.hasOwn(cell, 'selfRight') ? [cell.selfRight!] : []),
  ];
}

/**
 * The root's recursive left/right requirements already include every
 * descendant's direct contribution. Adding the root's own required PVP gives
 * the minimum new-PV total needed to satisfy the fortnight targets.
 */
export function deriveAutomaticPlanPurchaseBudget(
  request: AutomaticPlanRequest,
): AutomaticPlanPurchaseBudget {
  const root = deriveRootCommissionGoalCapacity(request);
  const structuralMinimumTotalPv = checkedAddScore(
    checkedAddScore(root.minimumRawLeftPv, root.minimumRawRightPv),
    root.requiredRootPvp,
  );
  return Object.freeze({
    structuralMinimumTotalPv,
    finishingAllowancePv: AUTOMATIC_PLAN_FINISHING_PV_ALLOWANCE,
    maximumTotalPv: checkedAddScore(
      structuralMinimumTotalPv,
      AUTOMATIC_PLAN_FINISHING_PV_ALLOWANCE,
    ),
  });
}

export function totalAutomaticPlanDirectPv(
  allocations: readonly NormalizedAllocationCell[],
): number {
  let total = 0;
  for (const cell of allocations) {
    for (const value of allocationValues(cell)) {
      total = checkedAddScore(total, value);
    }
  }
  return total;
}
