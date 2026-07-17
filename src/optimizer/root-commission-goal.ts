import { DEFAULT_RULE_SET } from '../engine';
import {
  assertCanonicalNonNegativeSafeInteger,
  checkedAddScore,
  checkedMultiplyScore,
  checkedSubtractScore,
} from './checked-integer';
import type { AutomaticPlanRequest } from './types';

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;
const MINIMUM_COMMISSION_TIER = 300;

interface ChildSlots {
  left?: string;
  right?: string;
}

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

export function requiredAutomaticPvpForMember(
  pvpTarget: number,
  cumulativePvpOpening: number,
): number {
  assertCanonicalNonNegativeSafeInteger(pvpTarget, 'PVP 목표');
  assertCanonicalNonNegativeSafeInteger(cumulativePvpOpening, 'PVP 시작값');
  const personalDeficit = Math.max(0, pvpTarget - cumulativePvpOpening);
  const qualificationDeficit = Math.max(
    0,
    DEFAULT_RULE_SET.qualificationPolicy.threshold - cumulativePvpOpening,
  );
  const headroom = DEFAULT_RULE_SET.cumulativePvpCap - cumulativePvpOpening;
  let requiredPvp = Math.max(personalDeficit, qualificationDeficit);
  if (requiredPvp > 0 && requiredPvp < MINIMUM_AUTOMATIC_DIRECT_PV) {
    requiredPvp = MINIMUM_AUTOMATIC_DIRECT_PV;
  }
  requiredPvp = Math.max(
    requiredPvp,
    qualificationDeficit === 0
      ? 0
      : Math.max(qualificationDeficit, MINIMUM_AUTOMATIC_DIRECT_PV),
  );
  if (requiredPvp > headroom) {
    throw new RangeError('required automatic PVP exceeds cumulative PVP headroom');
  }
  return requiredPvp;
}

export function deriveRootCommissionGoalCapacity(
  request: AutomaticPlanRequest,
): RootCommissionGoalCapacity {
  const memberByKey = new Map(
    request.organization.members.map((member) => [member.memberKey, member] as const),
  );
  const childSlots = new Map<string, ChildSlots>(
    request.organization.members.map((member) => [member.memberKey, {}]),
  );
  for (const member of request.organization.members) {
    if (member.parentMemberKey === null || member.sideAtParent === null) continue;
    const slots = childSlots.get(member.parentMemberKey)!;
    if (member.sideAtParent === 'LEFT') slots.left = member.memberKey;
    else slots.right = member.memberKey;
  }

  const requiredPvpByMember = new Map<string, number>();
  for (const memberKey of request.canonicalMemberKeys) {
    const member = memberByKey.get(memberKey)!;
    const opening = request.openingPvpByMember[memberKey]!;
    requiredPvpByMember.set(
      memberKey,
      requiredAutomaticPvpForMember(member.pvpTarget, opening.cumulativePvpOpening),
    );
  }

  const subtreeTotalByMember = new Map<string, number>();
  let rootRawLeft = 0;
  let rootRawRight = 0;
  const rootMemberKey = request.organization.members.find(
    (member) => member.parentMemberKey === null,
  )!.memberKey;
  for (const memberKey of [...request.canonicalMemberKeys].reverse()) {
    const plannedPvp = requiredPvpByMember.get(memberKey)!;
    const smallerSideRequirement = Math.max(
      0,
      DEFAULT_RULE_SET.fortnightSideTarget - plannedPvp,
    );
    const children = childSlots.get(memberKey)!;
    const leftTotal = children.left === undefined
      ? children.right === undefined
        ? DEFAULT_RULE_SET.fortnightSideTarget
        : smallerSideRequirement
      : subtreeTotalByMember.get(children.left)!;
    const rightTotal = children.right === undefined
      ? smallerSideRequirement
      : subtreeTotalByMember.get(children.right)!;
    if (memberKey === rootMemberKey) {
      rootRawLeft = leftTotal;
      rootRawRight = rightTotal;
    }
    subtreeTotalByMember.set(
      memberKey,
      checkedAddScore(checkedAddScore(plannedPvp, leftTotal), rightTotal),
    );
  }

  const rootOpening = request.organization.openingStateByMember[rootMemberKey]!;
  const openingCarryLeftPv = rootOpening.dailyCarryLeft;
  const openingCarryRightPv = rootOpening.dailyCarryRight;
  const requiredRootPvp = requiredPvpByMember.get(rootMemberKey)!;
  const businessDayCount = request.calendar.dates.filter(
    (date) => !request.calendar.skipDateSet.includes(date),
  ).length;
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
