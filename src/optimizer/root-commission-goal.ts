import { DEFAULT_RULE_SET } from '../engine';
import {
  checkedAddScore,
  checkedMultiplyScore,
  checkedSubtractScore,
} from './checked-integer';
import {
  deriveMemberCommissionCapacities,
} from './member-commission-capacity';
import type { AutomaticPlanRequest } from './types';

export { requiredAutomaticPvpForMember } from './member-commission-capacity';

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;
const MINIMUM_COMMISSION_TIER = 300;

export interface RootCommissionGoalCapacity {
  readonly rootMemberKey: string;
  readonly businessDayCount: number;
  readonly targetCommissionDays: number;
  readonly capacityLimited: boolean;
  readonly minimumRawLeftPv: number;
  readonly minimumRawRightPv: number;
  readonly openingCarryLeftPv: number;
  readonly openingCarryRightPv: number;
  readonly requiredRootPvp: number;
  readonly firstCommissionConsumption: {
    readonly rawLeftPv: number;
    readonly rawRightPv: number;
    readonly pvp: number;
  } | null;
}

export function deriveRootCommissionGoalCapacity(
  request: AutomaticPlanRequest,
): RootCommissionGoalCapacity {
  const capacities = deriveMemberCommissionCapacities(request);
  const rootMemberKey = capacities.rootMemberKey;
  const rootCapacity = capacities.byMember.get(rootMemberKey)!;
  const rootRawLeft = rootCapacity.minimumRawLeftPv;
  const rootRawRight = rootCapacity.minimumRawRightPv;
  const openingCarryLeftPv = rootCapacity.openingCarryLeftPv;
  const openingCarryRightPv = rootCapacity.openingCarryRightPv;
  const requiredRootPvp = rootCapacity.requiredPvp;
  const businessDayCount = capacities.businessDayCount;
  const noOpeningCapacity = (
    left: number,
    right: number,
    pvp: number,
    maximumDays: number,
  ): number => {
    let capacity = 0;
    for (let days = 1; days <= maximumDays; days += 1) {
      const sideSlots = checkedAddScore(
        Math.floor(left / MINIMUM_COMMISSION_TIER),
        Math.floor(right / MINIMUM_COMMISSION_TIER),
      );
      const requiredPerSide = checkedMultiplyScore(MINIMUM_COMMISSION_TIER, days);
      const pvpDeficit =
        checkedAddScore(
          Math.max(0, requiredPerSide - left),
          Math.max(0, requiredPerSide - right),
        );
      if (sideSlots >= days && pvpDeficit <= pvp) capacity = days;
    }
    return capacity;
  };
  const qualificationPvp = Math.max(
    0,
    DEFAULT_RULE_SET.qualificationPolicy.threshold -
      request.openingPvpByMember[rootMemberKey]!.cumulativePvpOpening,
  );
  let targetCommissionDays = 0;
  let firstCommissionConsumption: RootCommissionGoalCapacity[
    'firstCommissionConsumption'
  ] = null;
  const considerFirstCommission = (
    rawLeftPv: number,
    rawRightPv: number,
    pvp: number,
  ): void => {
    if (rawLeftPv > rootRawLeft || rawRightPv > rootRawRight) return;
    const days = checkedAddScore(1, noOpeningCapacity(
      checkedSubtractScore(rootRawLeft, rawLeftPv),
      checkedSubtractScore(rootRawRight, rawRightPv),
      checkedSubtractScore(requiredRootPvp, pvp),
      Math.max(0, businessDayCount - 1),
    ));
    const currentConsumption = firstCommissionConsumption === null
      ? Number.POSITIVE_INFINITY
      : checkedAddScore(
          checkedAddScore(
            firstCommissionConsumption.rawLeftPv,
            firstCommissionConsumption.rawRightPv,
          ),
          firstCommissionConsumption.pvp,
        );
    const nextConsumption = checkedAddScore(
      checkedAddScore(rawLeftPv, rawRightPv),
      pvp,
    );
    if (days > targetCommissionDays || (
      days === targetCommissionDays && nextConsumption < currentConsumption
    )) {
      targetCommissionDays = days;
      firstCommissionConsumption = Object.freeze({ rawLeftPv, rawRightPv, pvp });
    }
  };
  for (let firstPvp = qualificationPvp; firstPvp <= requiredRootPvp; firstPvp += 1) {
    if (firstPvp !== 0 && firstPvp < MINIMUM_AUTOMATIC_DIRECT_PV) continue;

    const leftAppliedRawLeft = Math.max(
      0,
      MINIMUM_COMMISSION_TIER - firstPvp - openingCarryLeftPv,
    );
    const leftPreSettlement = checkedAddScore(
      openingCarryLeftPv,
      leftAppliedRawLeft,
    );
    const leftAppliedRawRight = Math.max(
      0,
      MINIMUM_COMMISSION_TIER - openingCarryRightPv,
      leftPreSettlement - openingCarryRightPv,
    );
    considerFirstCommission(leftAppliedRawLeft, leftAppliedRawRight, firstPvp);

    const rightAppliedRawRight = Math.max(
      0,
      MINIMUM_COMMISSION_TIER - firstPvp - openingCarryRightPv,
    );
    const rightPreSettlement = checkedAddScore(
      openingCarryRightPv,
      rightAppliedRawRight,
    );
    const rightPreSettlementExclusive = checkedAddScore(rightPreSettlement, 1);
    const rightAppliedRawLeft = Math.max(
      0,
      MINIMUM_COMMISSION_TIER - openingCarryLeftPv,
      rightPreSettlementExclusive - openingCarryLeftPv,
    );
    considerFirstCommission(rightAppliedRawLeft, rightAppliedRawRight, firstPvp);
  }
  targetCommissionDays = Math.min(targetCommissionDays, businessDayCount);

  return Object.freeze({
    rootMemberKey,
    businessDayCount,
    targetCommissionDays,
    capacityLimited: targetCommissionDays < businessDayCount,
    minimumRawLeftPv: rootRawLeft,
    minimumRawRightPv: rootRawRight,
    openingCarryLeftPv,
    openingCarryRightPv,
    requiredRootPvp,
    firstCommissionConsumption,
  });
}
