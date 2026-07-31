import { DEFAULT_RULE_SET, type NormalizedAllocationCell } from '../engine';
import {
  automaticPlanCoordinateKey,
  deriveAutomaticPlanCoordinates,
  validateAutomaticPlanRequest,
} from './candidate-shape';
import { automaticPlanError } from './errors';
import { verifyAutomaticPlanCandidate } from './candidate-verifier';
import { deriveRootCommissionGoalCapacity } from './root-commission-goal';
import { buildTierProfileCandidateVariants } from './tier-profile-candidates';
import type {
  AutomaticPlanCandidateIdentity,
  AutomaticPlanConstructionOutcome,
  AutomaticPlanCoordinate,
  AutomaticPlanRequest,
  AutomaticPlanVerificationOutcome,
  RawAutomaticPlanCandidate,
} from './types';

const CUMULATIVE_PVP_CAP = 2_400;
const FORTNIGHT_SIDE_TARGET = DEFAULT_RULE_SET.defaultFortnightSideTarget;
const MINIMUM_AUTOMATIC_DIRECT_PV = 30;
const PREFERRED_DIRECT_PV_BLOCK = 100;

interface MutableCell {
  date: string;
  memberKey: string;
  pvp: number;
  selfLeft?: number;
  selfRight?: number;
}

function cellKey(date: string, memberKey: string): string {
  return JSON.stringify([date, memberKey]);
}

function setCoordinate(
  cell: MutableCell,
  coordinate: AutomaticPlanCoordinate,
  value: number,
): void {
  if (coordinate.field === 'PVP') {
    cell.pvp = value;
  } else if (coordinate.field === 'SELF_LEFT') {
    cell.selfLeft = value;
  } else {
    cell.selfRight = value;
  }
}

interface ChildSlots {
  left?: string;
  right?: string;
}

interface SideFieldRef {
  readonly memberKey: string;
  readonly field: 'SELF_LEFT' | 'SELF_RIGHT';
}

type RootSide = 'LEFT' | 'RIGHT';
type DirectField = 'PVP' | 'SELF_LEFT' | 'SELF_RIGHT';
type PriorityBranchSide = 'LEFT' | 'RIGHT';

interface PayoutFieldPlan {
  readonly memberKey: string;
  readonly field: DirectField;
  readonly rootSide: RootSide;
  readonly earliestBusinessDateIndex: number;
  readonly chunks: readonly number[];
}

function sideFieldKey(ref: SideFieldRef): string {
  return JSON.stringify([ref.memberKey, ref.field]);
}

function distributePreferredTotal(
  total: number,
  count: number,
  offset: number,
): readonly number[] {
  if (count <= 0) return Object.freeze([]);
  const values = Array.from({ length: count }, () => 0);
  const chunks = preferredPvpChunks(total);
  for (let index = 0; index < chunks.length; index += 1) {
    const targetIndex = (offset + index) % count;
    values[targetIndex] = values[targetIndex]! + chunks[index]!;
  }
  return Object.freeze(values);
}

function preferredPvpChunks(total: number): readonly number[] {
  if (total === 0) return Object.freeze([]);
  const hundredCount = Math.floor(total / PREFERRED_DIRECT_PV_BLOCK);
  const remainder = total % PREFERRED_DIRECT_PV_BLOCK;
  if (remainder === 0) {
    return Object.freeze(Array.from({ length: hundredCount }, () => 100));
  }
  if (remainder >= MINIMUM_AUTOMATIC_DIRECT_PV) {
    return Object.freeze([
      remainder,
      ...Array.from({ length: hundredCount }, () => 100),
    ]);
  }
  if (hundredCount === 0) {
    throw new TypeError('0이 아닌 자동 직접 값은 30 PV 이상이어야 합니다.');
  }
  return Object.freeze([
    PREFERRED_DIRECT_PV_BLOCK + remainder,
    ...Array.from({ length: hundredCount - 1 }, () => 100),
  ]);
}

function deriveChildSlots(request: AutomaticPlanRequest): ReadonlyMap<string, ChildSlots> {
  const slots = new Map<string, ChildSlots>();
  for (const member of request.organization.members) {
    slots.set(member.memberKey, {});
  }
  for (const member of request.organization.members) {
    if (member.parentMemberKey === null || member.sideAtParent === null) continue;
    const parentSlots = slots.get(member.parentMemberKey)!;
    if (member.sideAtParent === 'LEFT') parentSlots.left = member.memberKey;
    else parentSlots.right = member.memberKey;
  }
  return slots;
}

function directValue(cell: MutableCell, field: DirectField): number {
  if (field === 'PVP') return cell.pvp;
  if (field === 'SELF_LEFT') return cell.selfLeft ?? 0;
  return cell.selfRight ?? 0;
}

function addDirectValue(cell: MutableCell, field: DirectField, value: number): void {
  if (field === 'PVP') cell.pvp += value;
  else if (field === 'SELF_LEFT') cell.selfLeft = (cell.selfLeft ?? 0) + value;
  else cell.selfRight = (cell.selfRight ?? 0) + value;
}

function deriveRootSideByMember(
  request: AutomaticPlanRequest,
  rootKey: string,
): ReadonlyMap<string, RootSide> {
  const memberByKey = new Map(
    request.organization.members.map((member) => [member.memberKey, member] as const),
  );
  const result = new Map<string, RootSide>();
  for (const member of request.organization.members) {
    if (member.memberKey === rootKey) continue;
    let branchMember = member;
    while (branchMember.parentMemberKey !== rootKey) {
      const parent = branchMember.parentMemberKey === null
        ? undefined
        : memberByKey.get(branchMember.parentMemberKey);
      if (parent === undefined) break;
      branchMember = parent;
    }
    if (branchMember.parentMemberKey === rootKey && branchMember.sideAtParent !== null) {
      result.set(member.memberKey, branchMember.sideAtParent);
    }
  }
  return result;
}

function rootSideForField(
  memberKey: string,
  field: DirectField,
  rootKey: string,
  rootSideByMember: ReadonlyMap<string, RootSide>,
): RootSide | null {
  if (memberKey !== rootKey) return rootSideByMember.get(memberKey) ?? null;
  if (field === 'SELF_LEFT') return 'LEFT';
  if (field === 'SELF_RIGHT') return 'RIGHT';
  return null;
}

function evenlySpacedIndexes(totalCount: number, selectedCount: number): readonly number[] {
  if (selectedCount <= 0 || totalCount <= 0) return Object.freeze([]);
  if (selectedCount === 1) return Object.freeze([0]);
  return Object.freeze(Array.from({ length: selectedCount }, (_, index) =>
    Math.round(index * (totalCount - 1) / (selectedCount - 1))));
}

function addProfileRemainder(
  profile: number[],
  total: number,
  targetIndexes: readonly number[],
): void {
  if (total <= 0 || targetIndexes.length === 0) return;
  const quotient = Math.floor(total / targetIndexes.length);
  const remainder = total % targetIndexes.length;
  for (let index = 0; index < targetIndexes.length; index += 1) {
    profile[targetIndexes[index]!] = profile[targetIndexes[index]!]! +
      quotient + (index < remainder ? 1 : 0);
  }
}

function addPvpProfileRemainder(
  profile: number[],
  total: number,
  targetIndexes: readonly number[],
): void {
  if (total <= 0 || targetIndexes.length === 0) return;
  const preferredIndexes = [
    ...targetIndexes.filter((index) => profile[index]! > 0),
    ...targetIndexes.filter((index) => profile[index] === 0),
  ];
  const chunks = preferredPvpChunks(total);
  for (let index = 0; index < chunks.length; index += 1) {
    const targetIndex = preferredIndexes[index % preferredIndexes.length]!;
    profile[targetIndex] = profile[targetIndex]! + chunks[index]!;
  }
}

function rootCommissionProfiles(
  request: AutomaticPlanRequest,
): Readonly<Record<RootSide | 'PVP', readonly number[]>> {
  const goal = deriveRootCommissionGoalCapacity(request);
  const left = Array.from({ length: goal.businessDayCount }, () => 0);
  const right = Array.from({ length: goal.businessDayCount }, () => 0);
  const pvp = Array.from({ length: goal.businessDayCount }, () => 0);
  const targetIndexes = evenlySpacedIndexes(
    goal.businessDayCount,
    goal.targetCommissionDays,
  );
  const first = goal.firstCommissionConsumption;
  if (first === null || targetIndexes.length === 0) {
    addProfileRemainder(left, goal.minimumRawLeftPv, [0]);
    addProfileRemainder(right, goal.minimumRawRightPv, [0]);
    addPvpProfileRemainder(pvp, goal.requiredRootPvp, [0]);
    return Object.freeze({ LEFT: left, RIGHT: right, PVP: pvp });
  }

  const firstIndex = targetIndexes[0]!;
  left[firstIndex] = first.rawLeftPv;
  right[firstIndex] = first.rawRightPv;
  pvp[firstIndex] = first.pvp;
  let remainingLeft = goal.minimumRawLeftPv - first.rawLeftPv;
  let remainingRight = goal.minimumRawRightPv - first.rawRightPv;
  let remainingPvp = goal.requiredRootPvp - first.pvp;
  const remainingTargetIndexes = targetIndexes.slice(1);
  const remainingDayCount = remainingTargetIndexes.length;
  if (remainingDayCount > 0) {
    const leftFullCount = Math.max(
      0,
      remainingDayCount - Math.min(
        remainingDayCount,
        Math.floor(remainingRight / 300),
      ),
    );
    for (let index = 0; index < remainingDayCount; index += 1) {
      const targetIndex = remainingTargetIndexes[index]!;
      if (index < leftFullCount) {
        left[targetIndex] = 300;
        remainingLeft -= 300;
      } else {
        right[targetIndex] = 300;
        remainingRight -= 300;
      }
    }
    for (const targetIndex of remainingTargetIndexes) {
      const leftNeeded = 300 - left[targetIndex]!;
      const addedLeft = Math.min(leftNeeded, remainingLeft);
      left[targetIndex] = left[targetIndex]! + addedLeft;
      remainingLeft -= addedLeft;
      const rightNeeded = 300 - right[targetIndex]!;
      const addedRight = Math.min(rightNeeded, remainingRight);
      right[targetIndex] = right[targetIndex]! + addedRight;
      remainingRight -= addedRight;
      const pvpNeeded =
        Math.max(0, 300 - left[targetIndex]!) +
        Math.max(0, 300 - right[targetIndex]!);
      pvp[targetIndex] = pvpNeeded;
      remainingPvp -= pvpNeeded;
    }
  }
  addProfileRemainder(left, remainingLeft, targetIndexes);
  addProfileRemainder(right, remainingRight, targetIndexes);
  addPvpProfileRemainder(pvp, remainingPvp, targetIndexes);
  return Object.freeze({
    LEFT: Object.freeze(left),
    RIGHT: Object.freeze(right),
    PVP: Object.freeze(pvp),
  });
}

/**
 * Reuses the feasibility candidate's exact per-field totals, but coordinates
 * descendant contributions so the root's two organization sides reach the
 * same known commission tiers on the same dates. This is still only a
 * heuristic candidate; the canonical verifier and objective comparator decide
 * whether it is usable and better than the staggered feasibility candidate.
 */
function checkedSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    const next = total + value;
    if (!Number.isSafeInteger(next)) return null;
    total = next;
  }
  return total;
}

function buildRootPayoutAlignedCandidateUnchecked(
  request: AutomaticPlanRequest,
  baseline: RawAutomaticPlanCandidate,
): RawAutomaticPlanCandidate {
  const skipDates = new Set(request.calendar.skipDateSet);
  const businessDates = request.calendar.dates.filter((date) => !skipDates.has(date));
  if (businessDates.length <= 1) return baseline;

  const rootKey = request.canonicalMemberKeys[0]!;
  const rootSideByMember = deriveRootSideByMember(request, rootKey);
  const profiles = rootCommissionProfiles(request);
  const profileRootPvpTotal = checkedSum(profiles.PVP);
  const baselineRootPvpTotal = checkedSum(baseline.allocations
    .filter((cell) => cell.memberKey === rootKey)
    .map((cell) => cell.pvp));
  if (
    profileRootPvpTotal === null ||
    baselineRootPvpTotal === null ||
    profileRootPvpTotal !== baselineRootPvpTotal
  ) return baseline;
  const baselineCells = new Map(
    baseline.allocations.map((cell) => [cellKey(cell.date, cell.memberKey), cell] as const),
  );
  const alignedCells = new Map<string, MutableCell>();
  for (const cell of baseline.allocations) {
    alignedCells.set(cellKey(cell.date, cell.memberKey), {
      date: cell.date,
      memberKey: cell.memberKey,
      pvp: 0,
      ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: 0 } : {}),
      ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: 0 } : {}),
    });
  }

  const groupTotal: Record<RootSide, number> = { LEFT: 0, RIGHT: 0 };
  const groupFixed = {
    LEFT: Array.from({ length: businessDates.length }, () => 0),
    RIGHT: Array.from({ length: businessDates.length }, () => 0),
  } satisfies Record<RootSide, number[]>;
  const plans: PayoutFieldPlan[] = [];
  const fields = ['PVP', 'SELF_LEFT', 'SELF_RIGHT'] as const;

  for (const memberKey of request.canonicalMemberKeys) {
    for (const field of fields) {
      const firstBaselineCell = baselineCells.get(cellKey(request.calendar.dates[0]!, memberKey))!;
      if (field !== 'PVP' && !Object.hasOwn(
        firstBaselineCell,
        field === 'SELF_LEFT' ? 'selfLeft' : 'selfRight',
      )) continue;

      const total = baseline.allocations.reduce(
        (sum, cell) => cell.memberKey === memberKey
          ? sum + directValue(cell, field)
          : sum,
        0,
      );
      const rootSide = rootSideForField(memberKey, field, rootKey, rootSideByMember);
      if (rootSide === null) {
        if (memberKey === rootKey && field === 'PVP') {
          for (let index = 0; index < businessDates.length; index += 1) {
            alignedCells.get(cellKey(businessDates[index]!, memberKey))!.pvp =
              profiles.PVP[index]!;
          }
          continue;
        }
        for (const date of request.calendar.dates) {
          const source = baselineCells.get(cellKey(date, memberKey))!;
          const target = alignedCells.get(cellKey(date, memberKey))!;
          addDirectValue(target, field, directValue(source, field));
        }
        continue;
      }

      groupTotal[rootSide] += total;
      let remaining = total;
      const opening = request.openingPvpByMember[memberKey]!.cumulativePvpOpening;
      const qualificationIndex = opening >= 300
        ? 0
        : businessDates.findIndex((date) =>
            directValue(baselineCells.get(cellKey(date, memberKey))!, 'PVP') > 0
          );
      if (qualificationIndex < 0) return baseline;
      if (field === 'PVP') {
        if (opening < 300 && remaining > 0) {
          const qualification = Math.max(300 - opening, MINIMUM_AUTOMATIC_DIRECT_PV);
          if (remaining < qualification) return baseline;
          const target = alignedCells.get(
            cellKey(businessDates[qualificationIndex]!, memberKey),
          )!;
          addDirectValue(target, field, qualification);
          groupFixed[rootSide][qualificationIndex] =
            groupFixed[rootSide][qualificationIndex]! + qualification;
          remaining -= qualification;
        }
      }
      plans.push({
        memberKey,
        field,
        rootSide,
        earliestBusinessDateIndex: qualificationIndex,
        chunks: preferredPvpChunks(remaining),
      });
    }
  }

  for (const rootSide of ['LEFT', 'RIGHT'] as const) {
    const profile = profiles[rootSide];
    if (profile.reduce((sum, value) => sum + value, 0) !== groupTotal[rootSide]) {
      return baseline;
    }
    const remainingCapacity = profile.map(
      (value, index) => value - groupFixed[rootSide][index]!,
    );
    for (const plan of plans) {
      if (plan.rootSide !== rootSide) continue;
      for (const chunk of plan.chunks) {
        let bestIndex = Math.min(
          plan.earliestBusinessDateIndex,
          businessDates.length - 1,
        );
        for (
          let index = bestIndex + 1;
          index < businessDates.length;
          index += 1
        ) {
          if (remainingCapacity[index]! > remainingCapacity[bestIndex]!) {
            bestIndex = index;
          }
        }
        const target = alignedCells.get(
          cellKey(businessDates[bestIndex]!, plan.memberKey),
        )!;
        addDirectValue(target, plan.field, chunk);
        remainingCapacity[bestIndex] = remainingCapacity[bestIndex]! - chunk;
      }
    }
  }

  const allocations = baseline.allocations.map((cell) => {
    const aligned = alignedCells.get(cellKey(cell.date, cell.memberKey))!;
    return Object.freeze({
      date: aligned.date,
      memberKey: aligned.memberKey,
      pvp: aligned.pvp,
      ...(Object.hasOwn(aligned, 'selfLeft') ? { selfLeft: aligned.selfLeft! } : {}),
      ...(Object.hasOwn(aligned, 'selfRight') ? { selfRight: aligned.selfRight! } : {}),
    });
  });
  return Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(allocations),
  });
}

function buildRootPayoutAlignedCandidate(
  request: AutomaticPlanRequest,
  baseline: RawAutomaticPlanCandidate,
): RawAutomaticPlanCandidate {
  try {
    const aligned = buildRootPayoutAlignedCandidateUnchecked(request, baseline);
    const rootKey = request.canonicalMemberKeys[0]!;
    const baselineRootPvpTotal = checkedSum(baseline.allocations
      .filter((cell) => cell.memberKey === rootKey)
      .map((cell) => cell.pvp));
    const alignedRootPvpTotal = checkedSum(aligned.allocations
      .filter((cell) => cell.memberKey === rootKey)
      .map((cell) => cell.pvp));
    const containsTooSmallDirectValue = aligned.allocations.some((cell) =>
      [cell.pvp, cell.selfLeft, cell.selfRight].some(
        (value) => value !== undefined && value > 0 && value < MINIMUM_AUTOMATIC_DIRECT_PV,
      ));
    if (
      baselineRootPvpTotal === null ||
      alignedRootPvpTotal === null ||
      baselineRootPvpTotal !== alignedRootPvpTotal ||
      containsTooSmallDirectValue
    ) return baseline;
    return aligned;
  } catch {
    // The aligned profile is only a heuristic. If an aggregate witness cannot
    // be represented by legal direct cells, retain the verified-feasibility
    // baseline instead of aborting all constructive variants.
    return baseline;
  }
}

function deriveOrganizationDepthByMember(
  request: AutomaticPlanRequest,
): ReadonlyMap<string, number> {
  const memberByKey = new Map(
    request.organization.members.map((member) => [member.memberKey, member] as const),
  );
  const depthByMember = new Map<string, number>();
  const derive = (memberKey: string): number => {
    const cached = depthByMember.get(memberKey);
    if (cached !== undefined) return cached;
    const member = memberByKey.get(memberKey)!;
    const depth = member.parentMemberKey === null
      ? 1
      : derive(member.parentMemberKey) + 1;
    depthByMember.set(memberKey, depth);
    return depth;
  };
  for (const memberKey of request.canonicalMemberKeys) derive(memberKey);
  return depthByMember;
}

function collectSubtreeMemberKeys(
  memberKey: string,
  childSlots: ReadonlyMap<string, ChildSlots>,
): readonly string[] {
  const result: string[] = [];
  const visit = (currentKey: string): void => {
    result.push(currentKey);
    const children = childSlots.get(currentKey)!;
    if (children.left !== undefined) visit(children.left);
    if (children.right !== undefined) visit(children.right);
  };
  visit(memberKey);
  return Object.freeze(result);
}

function buildPriorityBranchShiftCandidate(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  priorityMemberKey: string,
  branchSide: PriorityBranchSide,
  shift: number,
): RawAutomaticPlanCandidate {
  const skipDates = new Set(request.calendar.skipDateSet);
  const shiftDates = request.calendar.dates
    .filter((date) => !skipDates.has(date))
    .slice(0, -1);
  if (shiftDates.length < 2) return source;

  const childSlots = deriveChildSlots(request);
  const branchChildKey = branchSide === 'LEFT'
    ? childSlots.get(priorityMemberKey)!.left
    : childSlots.get(priorityMemberKey)!.right;
  const memberKeys = branchChildKey === undefined
    ? Object.freeze([priorityMemberKey])
    : collectSubtreeMemberKeys(branchChildKey, childSlots);
  const sourceByCell = new Map(
    source.allocations.map((cell) => [cellKey(cell.date, cell.memberKey), cell] as const),
  );
  const shiftedByCell = new Map<string, MutableCell>();
  for (const cell of source.allocations) {
    shiftedByCell.set(cellKey(cell.date, cell.memberKey), {
      date: cell.date,
      memberKey: cell.memberKey,
      pvp: cell.pvp,
      ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: cell.selfLeft! } : {}),
      ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: cell.selfRight! } : {}),
    });
  }

  const fields: readonly DirectField[] = branchChildKey === undefined
    ? Object.freeze([branchSide === 'LEFT' ? 'SELF_LEFT' : 'SELF_RIGHT'])
    : Object.freeze(['SELF_LEFT', 'SELF_RIGHT']);
  for (const memberKey of memberKeys) {
    let cumulativePvp = request.openingPvpByMember[memberKey]!.cumulativePvpOpening;
    let firstQualifiedDateIndex = cumulativePvp >= 300 ? 0 : -1;
    if (firstQualifiedDateIndex < 0) {
      for (let index = 0; index < shiftDates.length; index += 1) {
        cumulativePvp += sourceByCell.get(cellKey(shiftDates[index]!, memberKey))!.pvp;
        if (cumulativePvp >= 300) {
          firstQualifiedDateIndex = index;
          break;
        }
      }
    }
    if (firstQualifiedDateIndex < 0) continue;
    const memberShiftDates = shiftDates.slice(firstQualifiedDateIndex);
    if (memberShiftDates.length < 2) continue;
    for (const field of fields) {
      const firstSource = sourceByCell.get(cellKey(request.calendar.dates[0]!, memberKey))!;
      if (
        field !== 'PVP' &&
        !Object.hasOwn(firstSource, field === 'SELF_LEFT' ? 'selfLeft' : 'selfRight')
      ) continue;
      const values = memberShiftDates.map((date) =>
        directValue(sourceByCell.get(cellKey(date, memberKey))!, field)
      );
      for (let targetIndex = 0; targetIndex < memberShiftDates.length; targetIndex += 1) {
        const sourceIndex = (
          targetIndex - shift + memberShiftDates.length
        ) % memberShiftDates.length;
        const target = shiftedByCell.get(
          cellKey(memberShiftDates[targetIndex]!, memberKey),
        )!;
        if (field === 'PVP') target.pvp = values[sourceIndex]!;
        else if (field === 'SELF_LEFT') target.selfLeft = values[sourceIndex]!;
        else target.selfRight = values[sourceIndex]!;
      }
    }
  }

  return Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(source.allocations.map((cell) => {
      const shifted = shiftedByCell.get(cellKey(cell.date, cell.memberKey))!;
      return Object.freeze({
        date: shifted.date,
        memberKey: shifted.memberKey,
        pvp: shifted.pvp,
        ...(Object.hasOwn(shifted, 'selfLeft') ? { selfLeft: shifted.selfLeft! } : {}),
        ...(Object.hasOwn(shifted, 'selfRight') ? { selfRight: shifted.selfRight! } : {}),
      });
    })),
  });
}

function buildComposedPriorityBranchShiftCandidate(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  memberKeys: readonly string[],
  branchSide: PriorityBranchSide,
  shift: number,
): RawAutomaticPlanCandidate {
  let candidate = source;
  for (const memberKey of memberKeys) {
    candidate = buildPriorityBranchShiftCandidate(
      request,
      candidate,
      memberKey,
      branchSide,
      shift,
    );
  }
  return candidate;
}

/**
 * Deterministic feasibility-first warm start. It uses the complete business
 * calendar, preserves practical direct-value boundaries, and makes no
 * optimality or infeasibility claim.
 */
export function buildConstructiveCandidate(
  request: AutomaticPlanRequest,
): AutomaticPlanConstructionOutcome {
  const requestValidation = validateAutomaticPlanRequest(request);
  if (requestValidation.status === 'FAILURE') {
    return requestValidation;
  }
  const skipDates = new Set(request.calendar.skipDateSet);
  const settlementDates = request.calendar.dates.filter((date) => !skipDates.has(date));
  if (settlementDates.length === 0) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
        '신규 값을 배정할 수 있는 영업일이 없습니다.',
      ),
    };
  }
  const coordinates = deriveAutomaticPlanCoordinates(request);
  const cells = new Map<string, MutableCell>();
  for (const date of request.calendar.dates) {
    for (const memberKey of request.canonicalMemberKeys) {
      cells.set(cellKey(date, memberKey), { date, memberKey, pvp: 0 });
    }
  }
  for (const coordinate of coordinates) {
    const cell = cells.get(cellKey(coordinate.date, coordinate.memberKey));
    if (cell === undefined) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
          '구성 후보의 날짜·회원 셀을 만들 수 없습니다.',
        ),
      };
    }
    setCoordinate(cell, coordinate, 0);
  }
  const pvpDates = settlementDates;
  const childSlots = deriveChildSlots(request);
  const leafOrdinalByMember = new Map<string, number>();
  for (const memberKey of request.canonicalMemberKeys) {
    const children = childSlots.get(memberKey)!;
    if (children.left === undefined && children.right === undefined) {
      leafOrdinalByMember.set(memberKey, leafOrdinalByMember.size);
    }
  }
  const plannedPvpByMember = new Map<string, number>();
  const qualificationStartIndexByMember = new Map<string, number>();
  for (const memberKey of request.canonicalMemberKeys) {
    const member = request.organization.members.find(
      (candidate) => candidate.memberKey === memberKey,
    );
    const opening = request.openingPvpByMember[memberKey];
    if (member === undefined || opening === undefined) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
          '구성 후보에 필요한 회원 또는 시작값이 없습니다.',
          { location: { memberKey } },
        ),
      };
    }
    const personalDeficit = Math.max(0, member.pvpTarget - opening.cumulativePvpOpening);
    const qualificationDeficit = Math.max(
      0,
      300 - opening.cumulativePvpOpening,
    );
    const headroom = CUMULATIVE_PVP_CAP - opening.cumulativePvpOpening;
    let requiredPvp = Math.max(personalDeficit, qualificationDeficit);
    if (requiredPvp > 0 && requiredPvp < MINIMUM_AUTOMATIC_DIRECT_PV) {
      requiredPvp = MINIMUM_AUTOMATIC_DIRECT_PV;
    }
    const firstQualificationPvp = qualificationDeficit === 0
      ? 0
      : Math.max(qualificationDeficit, MINIMUM_AUTOMATIC_DIRECT_PV);
    requiredPvp = Math.max(requiredPvp, firstQualificationPvp);
    if (requiredPvp > headroom) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
          '남은 누적 PVP 한도 안에서 30 PV 이상의 자동 배정으로 목표를 채울 수 없습니다.',
          { location: { memberKey, field: 'PVP' } },
        ),
      };
    }
    plannedPvpByMember.set(memberKey, requiredPvp);
    const children = childSlots.get(memberKey)!;
    const hasChild = children.left !== undefined || children.right !== undefined;
    const leafStartWindow = Math.max(1, Math.min(6, pvpDates.length - 1));
    const qualificationStartIndex =
      opening.cumulativePvpOpening >= 300 ||
      hasChild ||
      memberKey === request.canonicalMemberKeys[0]
      ? 0
      : pvpDates.length === 1
        ? 0
        : 1 + (leafOrdinalByMember.get(memberKey)! % leafStartWindow);
    qualificationStartIndexByMember.set(memberKey, qualificationStartIndex);
    const eligiblePvpDates = pvpDates.slice(qualificationStartIndex);
    const firstPvpDate = eligiblePvpDates[0]!;
    if (firstQualificationPvp > 0) {
      cells.get(cellKey(firstPvpDate, memberKey))!.pvp = firstQualificationPvp;
    }
    const remainingPvp = requiredPvp - firstQualificationPvp;
    const chunks = preferredPvpChunks(remainingPvp);
    for (let index = 0; index < chunks.length; index += 1) {
      const date = eligiblePvpDates[
        (index + (firstQualificationPvp > 0 ? 1 : 0)) % eligiblePvpDates.length
      ]!;
      const cell = cells.get(cellKey(date, memberKey))!;
      cell.pvp += chunks[index]!;
    }
  }

  const rootKey = request.canonicalMemberKeys[0]!;
  const allocationBusinessDates = settlementDates;
  const sideTotalByField = new Map<string, number>();
  const sideStartIndexByField = new Map<string, number>();
  const subtreeTotalByMember = new Map<string, number>();
  for (const memberKey of [...request.canonicalMemberKeys].reverse()) {
    const opening = request.openingPvpByMember[memberKey]!;
    const plannedPvp = plannedPvpByMember.get(memberKey)!;
    const smallerSideRequirement = Math.max(
      0,
      FORTNIGHT_SIDE_TARGET - plannedPvp,
    );
    const children = childSlots.get(memberKey)!;
    let leftTotal: number;
    let rightTotal: number;
    if (children.left === undefined && children.right === undefined) {
      // The workbook convention keeps a leaf's full 2,500 PV on the left and
      // subtracts the member's own PVP from the right-side direct total.
      leftTotal = FORTNIGHT_SIDE_TARGET;
      rightTotal = smallerSideRequirement;
      sideTotalByField.set(
        sideFieldKey({ memberKey, field: 'SELF_LEFT' }),
        leftTotal,
      );
      sideTotalByField.set(
        sideFieldKey({ memberKey, field: 'SELF_RIGHT' }),
        rightTotal,
      );
      sideStartIndexByField.set(
        sideFieldKey({ memberKey, field: 'SELF_LEFT' }),
        memberKey === rootKey || opening.cumulativePvpOpening >= 300 ? 0 : 1,
      );
      sideStartIndexByField.set(
        sideFieldKey({ memberKey, field: 'SELF_RIGHT' }),
        qualificationStartIndexByMember.get(memberKey)!,
      );
    } else {
      leftTotal = children.left === undefined
        ? smallerSideRequirement
        : subtreeTotalByMember.get(children.left)!;
      rightTotal = children.right === undefined
        ? smallerSideRequirement
        : subtreeTotalByMember.get(children.right)!;
      if (children.left === undefined) {
        const key = sideFieldKey({ memberKey, field: 'SELF_LEFT' });
        sideTotalByField.set(key, leftTotal);
        sideStartIndexByField.set(
          key,
          qualificationStartIndexByMember.get(memberKey)!,
        );
      }
      if (children.right === undefined) {
        const key = sideFieldKey({ memberKey, field: 'SELF_RIGHT' });
        sideTotalByField.set(key, rightTotal);
        sideStartIndexByField.set(
          key,
          qualificationStartIndexByMember.get(memberKey)!,
        );
      }
    }
    subtreeTotalByMember.set(memberKey, plannedPvp + leftTotal + rightTotal);
  }
  let sideFieldIndex = 0;
  for (const memberKey of request.canonicalMemberKeys) {
    for (const field of ['SELF_LEFT', 'SELF_RIGHT'] as const) {
      const firstCell = cells.get(cellKey(allocationBusinessDates[0]!, memberKey))!;
      const property = field === 'SELF_LEFT' ? 'selfLeft' : 'selfRight';
      if (!Object.hasOwn(firstCell, property)) continue;
      const fieldKey = sideFieldKey({ memberKey, field });
      const sideTotal = sideTotalByField.get(fieldKey)!;
      const startIndex = Math.min(
        sideStartIndexByField.get(fieldKey)!,
        Math.max(0, allocationBusinessDates.length - 1),
      );
      const eligibleDates = allocationBusinessDates.slice(startIndex);
      const distributed = distributePreferredTotal(
        sideTotal,
        eligibleDates.length,
        sideFieldIndex,
      );
      for (let index = 0; index < eligibleDates.length; index += 1) {
        const cell = cells.get(cellKey(eligibleDates[index]!, memberKey))!;
        if (field === 'SELF_LEFT') cell.selfLeft = distributed[index]!;
        else cell.selfRight = distributed[index]!;
      }
      sideFieldIndex += 1;
    }
  }
  const allocations: NormalizedAllocationCell[] = [];
  for (const date of request.calendar.dates) {
    for (const memberKey of request.canonicalMemberKeys) {
      const cell = cells.get(cellKey(date, memberKey));
      if (cell === undefined) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
            '구성 후보 셀을 정본 순서로 만들 수 없습니다.',
          ),
        };
      }
      allocations.push(
        Object.freeze({
          date,
          memberKey,
          pvp: cell.pvp,
          ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: cell.selfLeft! } : {}),
          ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: cell.selfRight! } : {}),
        }),
      );
    }
  }
  const candidate: RawAutomaticPlanCandidate = Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(allocations),
  });
  return { status: 'SUCCESS', candidate };
}

export function buildVerifiedConstructiveCandidate(
  request: AutomaticPlanRequest,
  identity: AutomaticPlanCandidateIdentity,
): AutomaticPlanVerificationOutcome {
  const built = buildConstructiveCandidate(request);
  if (built.status === 'FAILURE') {
    return built;
  }
  return verifyAutomaticPlanCandidate(request, built.candidate, identity);
}

export function buildConstructiveCandidateVariants(
  request: AutomaticPlanRequest,
): readonly AutomaticPlanConstructionOutcome[] {
  const baseline = buildConstructiveCandidate(request);
  if (baseline.status === 'FAILURE') return Object.freeze([baseline]);
  const payoutAligned = buildRootPayoutAlignedCandidate(request, baseline.candidate);
  const variants: AutomaticPlanConstructionOutcome[] = [
    baseline,
    Object.freeze({ status: 'SUCCESS', candidate: payoutAligned }),
  ];
  const depthByMember = deriveOrganizationDepthByMember(request);
  const childSlots = deriveChildSlots(request);
  const priorityMemberKeys = request.canonicalMemberKeys.filter((memberKey) => {
    const depth = depthByMember.get(memberKey);
    return depth === 2 || depth === 3;
  });
  const rootMemberKey = request.organization.members.find(
    (member) => member.parentMemberKey === null,
  )!.memberKey;
  const rootChildren = childSlots.get(rootMemberKey)!;
  const composedMemberKeys = (
    rootChildren.left === undefined && rootChildren.right === undefined
      ? priorityMemberKeys
      : [rootMemberKey, ...priorityMemberKeys]
  );
  const shiftableDateCount = request.calendar.dates.filter(
    (date) => !request.calendar.skipDateSet.includes(date),
  ).length - 1;
  for (const memberKey of priorityMemberKeys) {
    for (const branchSide of ['LEFT', 'RIGHT'] as const) {
      for (let shift = 1; shift < shiftableDateCount; shift += 1) {
        variants.push(Object.freeze({
          status: 'SUCCESS',
          candidate: buildPriorityBranchShiftCandidate(
            request,
            payoutAligned,
            memberKey,
            branchSide,
            shift,
          ),
        }));
      }
    }
  }
  if (composedMemberKeys.length > 1) {
    for (let shift = 1; shift < shiftableDateCount; shift += 1) {
      for (const branchSide of ['LEFT', 'RIGHT'] as const) {
        variants.push(Object.freeze({
          status: 'SUCCESS',
          candidate: buildComposedPriorityBranchShiftCandidate(
            request,
            payoutAligned,
            composedMemberKeys,
            branchSide,
            shift,
          ),
        }));
      }
    }
  }
  const seenCandidates = new Set(
    variants.flatMap((variant) => variant.status === 'SUCCESS'
      ? [JSON.stringify(variant.candidate.allocations)]
      : []),
  );
  for (const candidate of buildTierProfileCandidateVariants(
    request,
    payoutAligned,
  )) {
    const signature = JSON.stringify(candidate.allocations);
    if (seenCandidates.has(signature)) continue;
    seenCandidates.add(signature);
    variants.push(Object.freeze({ status: 'SUCCESS', candidate }));
  }
  return Object.freeze(variants);
}

export { automaticPlanCoordinateKey };
