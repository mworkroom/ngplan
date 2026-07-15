import type { NormalizedAllocationCell } from '../engine';
import {
  automaticPlanCoordinateKey,
  deriveAutomaticPlanCoordinates,
  validateAutomaticPlanRequest,
} from './candidate-shape';
import { automaticPlanError } from './errors';
import { verifyAutomaticPlanCandidate } from './candidate-verifier';
import type {
  AutomaticPlanCandidateIdentity,
  AutomaticPlanConstructionOutcome,
  AutomaticPlanCoordinate,
  AutomaticPlanRequest,
  AutomaticPlanVerificationOutcome,
  RawAutomaticPlanCandidate,
} from './types';

const CUMULATIVE_PVP_CAP = 2_400;
const FORTNIGHT_SIDE_TARGET = 2_500;
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

function findBoundarySide(
  memberKey: string,
  slots: ReadonlyMap<string, ChildSlots>,
): SideFieldRef {
  const children = slots.get(memberKey)!;
  if (children.left === undefined) {
    return { memberKey, field: 'SELF_LEFT' };
  }
  if (children.right === undefined) {
    return { memberKey, field: 'SELF_RIGHT' };
  }
  return findBoundarySide(children.left, slots);
}

function rootSideAnchor(
  rootKey: string,
  side: 'LEFT' | 'RIGHT',
  slots: ReadonlyMap<string, ChildSlots>,
): SideFieldRef {
  const rootSlots = slots.get(rootKey)!;
  const childKey = side === 'LEFT' ? rootSlots.left : rootSlots.right;
  return childKey === undefined
    ? { memberKey: rootKey, field: side === 'LEFT' ? 'SELF_LEFT' : 'SELF_RIGHT' }
    : findBoundarySide(childKey, slots);
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
  const pvpDates = settlementDates.length > 1
    ? settlementDates.slice(0, -1)
    : settlementDates;
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
  const rootMember = request.organization.members.find(
    (member) => member.memberKey === rootKey,
  )!;
  const requiredFinalRootTier = rootMember.pvpTarget === 2_400 ? 700 : 300;
  const finalBusinessDate = settlementDates.at(-1)!;
  const earlierBusinessDates = settlementDates.slice(0, -1);
  const sideTotalByField = new Map<string, number>();
  const sideStartIndexByField = new Map<string, number>();
  const subtreeTotalByMember = new Map<string, number>();
  for (const memberKey of [...request.canonicalMemberKeys].reverse()) {
    const opening = request.openingPvpByMember[memberKey]!;
    const plannedPvp = plannedPvpByMember.get(memberKey)!;
    const periodPvp = opening.cumulativePvpOpening + plannedPvp;
    const smallerSideRequirement = Math.max(
      0,
      FORTNIGHT_SIDE_TARGET - periodPvp,
    );
    const children = childSlots.get(memberKey)!;
    let leftTotal: number;
    let rightTotal: number;
    if (children.left === undefined && children.right === undefined) {
      leftTotal = smallerSideRequirement;
      rightTotal = FORTNIGHT_SIDE_TARGET;
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
        qualificationStartIndexByMember.get(memberKey)!,
      );
      sideStartIndexByField.set(
        sideFieldKey({ memberKey, field: 'SELF_RIGHT' }),
        memberKey === rootKey || opening.cumulativePvpOpening >= 300 ? 0 : 1,
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
  const finalAnchors = new Set([
    sideFieldKey(rootSideAnchor(rootKey, 'LEFT', childSlots)),
    sideFieldKey(rootSideAnchor(rootKey, 'RIGHT', childSlots)),
  ]);
  let sideFieldIndex = 0;
  for (const memberKey of request.canonicalMemberKeys) {
    const finalCell = cells.get(cellKey(finalBusinessDate, memberKey))!;
    for (const field of ['SELF_LEFT', 'SELF_RIGHT'] as const) {
      const property = field === 'SELF_LEFT' ? 'selfLeft' : 'selfRight';
      if (!Object.hasOwn(finalCell, property)) continue;
      const fieldKey = sideFieldKey({ memberKey, field });
      const isFinalAnchor = finalAnchors.has(fieldKey);
      let sideTotal = sideTotalByField.get(fieldKey)!;
      if (isFinalAnchor) sideTotal = Math.max(sideTotal, requiredFinalRootTier);
      const startIndex = Math.min(
        sideStartIndexByField.get(fieldKey)!,
        Math.max(0, earlierBusinessDates.length - 1),
      );
      const eligibleEarlierDates = earlierBusinessDates.slice(startIndex);
      let finalAllocation = eligibleEarlierDates.length === 0
        ? sideTotal
        : isFinalAnchor
          ? requiredFinalRootTier
          : 0;
      if (
        sideTotal - finalAllocation > 0 &&
        sideTotal - finalAllocation < MINIMUM_AUTOMATIC_DIRECT_PV
      ) {
        finalAllocation += sideTotal - finalAllocation;
      }
      const earlierAllocation = distributePreferredTotal(
        sideTotal - finalAllocation,
        eligibleEarlierDates.length,
        sideFieldIndex,
      );
      for (let index = 0; index < eligibleEarlierDates.length; index += 1) {
        const cell = cells.get(cellKey(eligibleEarlierDates[index]!, memberKey))!;
        if (field === 'SELF_LEFT') cell.selfLeft = earlierAllocation[index]!;
        else cell.selfRight = earlierAllocation[index]!;
      }
      if (field === 'SELF_LEFT') finalCell.selfLeft = finalAllocation;
      else finalCell.selfRight = finalAllocation;
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

export { automaticPlanCoordinateKey };
