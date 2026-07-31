import { DEFAULT_RULE_SET } from '../engine';
import {
  assertCanonicalNonNegativeSafeInteger,
  checkedAddScore,
  checkedMultiplyScore,
} from './checked-integer';
import type { AutomaticPlanRequest } from './types';

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;

interface ChildSlots {
  left?: string;
  right?: string;
}

export interface MemberCommissionCapacity {
  readonly memberKey: string;
  readonly businessDayCount: number;
  readonly minimumRawLeftPv: number;
  readonly minimumRawRightPv: number;
  readonly openingCarryLeftPv: number;
  readonly openingCarryRightPv: number;
  readonly requiredPvp: number;
  readonly aggregateMatchedPvUpperBound: number;
  readonly attainableEquivalentUnitsUpperBound: number;
}

export interface MemberCommissionCapacitySummary {
  readonly rootMemberKey: string;
  readonly businessDayCount: number;
  readonly byMember: ReadonlyMap<string, MemberCommissionCapacity>;
}

const capacityCache = new WeakMap<AutomaticPlanRequest, MemberCommissionCapacitySummary>();

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

function aggregateMatchedPvUpperBound(
  leftPv: number,
  rightPv: number,
  pvp: number,
): number {
  const leftWithAllPvp = checkedAddScore(leftPv, pvp);
  const rightWithAllPvp = checkedAddScore(rightPv, pvp);
  const combined = checkedAddScore(checkedAddScore(leftPv, rightPv), pvp);
  return Math.min(
    Math.floor(combined / 2),
    leftWithAllPvp,
    rightWithAllPvp,
  );
}

function attainableEquivalentUnitsUpperBound(
  matchedPv: number,
  businessDayCount: number,
): number {
  const tierOptions = [
    { pv: 0, units: 0 },
    { pv: 300, units: 1 },
    { pv: 700, units: 2 },
    { pv: 1_500, units: 4 },
    { pv: 2_400, units: 8 },
  ] as const;
  const maximumUnits = checkedMultiplyScore(businessDayCount, 8);
  let minimumPvByUnits = Array.from(
    { length: maximumUnits + 1 },
    () => Number.POSITIVE_INFINITY,
  );
  minimumPvByUnits[0] = 0;
  for (let day = 0; day < businessDayCount; day += 1) {
    const next = [...minimumPvByUnits];
    for (let units = 0; units <= maximumUnits; units += 1) {
      const currentPv = minimumPvByUnits[units]!;
      if (!Number.isFinite(currentPv)) continue;
      for (const tier of tierOptions) {
        const nextUnits = units + tier.units;
        if (nextUnits > maximumUnits) continue;
        next[nextUnits] = Math.min(next[nextUnits]!, currentPv + tier.pv);
      }
    }
    minimumPvByUnits = next;
  }
  for (let units = maximumUnits; units >= 0; units -= 1) {
    if (minimumPvByUnits[units]! <= matchedPv) return units;
  }
  return 0;
}

export function deriveMemberCommissionCapacities(
  request: AutomaticPlanRequest,
): MemberCommissionCapacitySummary {
  const cached = capacityCache.get(request);
  if (cached !== undefined) return cached;

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

  const rawSidesByMember = new Map<string, { left: number; right: number }>();
  const subtreeTotalByMember = new Map<string, number>();
  for (const memberKey of [...request.canonicalMemberKeys].reverse()) {
    const plannedPvp = requiredPvpByMember.get(memberKey)!;
    const smallerSideRequirement = Math.max(
      0,
      DEFAULT_RULE_SET.defaultFortnightSideTarget - plannedPvp,
    );
    const children = childSlots.get(memberKey)!;
    const leftTotal = children.left === undefined
      ? children.right === undefined
        ? DEFAULT_RULE_SET.defaultFortnightSideTarget
        : smallerSideRequirement
      : subtreeTotalByMember.get(children.left)!;
    const rightTotal = children.right === undefined
      ? smallerSideRequirement
      : subtreeTotalByMember.get(children.right)!;
    rawSidesByMember.set(memberKey, { left: leftTotal, right: rightTotal });
    subtreeTotalByMember.set(
      memberKey,
      checkedAddScore(checkedAddScore(plannedPvp, leftTotal), rightTotal),
    );
  }

  const businessDayCount = request.calendar.dates.filter(
    (date) => !request.calendar.skipDateSet.includes(date),
  ).length;
  const byMember = new Map<string, MemberCommissionCapacity>();
  for (const memberKey of request.canonicalMemberKeys) {
    const rawSides = rawSidesByMember.get(memberKey)!;
    const opening = request.organization.openingStateByMember[memberKey]!;
    const requiredPvp = requiredPvpByMember.get(memberKey)!;
    const totalLeft = checkedAddScore(rawSides.left, opening.dailyCarryLeft);
    const totalRight = checkedAddScore(rawSides.right, opening.dailyCarryRight);
    const matchedPvUpperBound = aggregateMatchedPvUpperBound(
      totalLeft,
      totalRight,
      requiredPvp,
    );
    byMember.set(memberKey, Object.freeze({
      memberKey,
      businessDayCount,
      minimumRawLeftPv: rawSides.left,
      minimumRawRightPv: rawSides.right,
      openingCarryLeftPv: opening.dailyCarryLeft,
      openingCarryRightPv: opening.dailyCarryRight,
      requiredPvp,
      aggregateMatchedPvUpperBound: matchedPvUpperBound,
      attainableEquivalentUnitsUpperBound: attainableEquivalentUnitsUpperBound(
        matchedPvUpperBound,
        businessDayCount,
      ),
    }));
  }

  const rootMemberKey = request.organization.members.find(
    (member) => member.parentMemberKey === null,
  )!.memberKey;
  const summary = Object.freeze({ rootMemberKey, businessDayCount, byMember });
  capacityCache.set(request, summary);
  return summary;
}
