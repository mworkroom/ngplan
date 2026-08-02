import type { NormalizedAllocationCell } from '../engine';
import type {
  AutomaticPlanRequest,
  RawAutomaticPlanCandidate,
} from './types';

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;
const PREFERRED_DIRECT_PV_BLOCK = 100;

type BranchSide = 'LEFT' | 'RIGHT';
type DirectSideField = 'SELF_LEFT' | 'SELF_RIGHT';
type SharedProfile =
  | 'THRESHOLD_300'
  | 'THREE_TWO_FOUR'
  | 'THRESHOLD_700'
  | 'THRESHOLD_1500'
  | 'THRESHOLD_2400';
type ExtraLayout = 'ACTIVE_DATES' | 'ALL_DATES';

interface ChildSlots {
  readonly left?: string;
  readonly right?: string;
}

interface DirectSideFieldRef {
  readonly memberKey: string;
  readonly field: DirectSideField;
}

interface BranchResources {
  readonly memberKeys: readonly string[];
  readonly sideFields: readonly DirectSideFieldRef[];
}

interface MutableCell {
  readonly date: string;
  readonly memberKey: string;
  pvp: number;
  selfLeft?: number;
  selfRight?: number;
}

interface FieldPlan {
  readonly ref: DirectSideFieldRef;
  readonly earliestBusinessDateIndex: number;
  readonly chunks: readonly number[];
}

const SHARED_PROFILES: readonly SharedProfile[] = Object.freeze([
  'THRESHOLD_300',
  'THREE_TWO_FOUR',
  'THRESHOLD_700',
  'THRESHOLD_1500',
  'THRESHOLD_2400',
]);

function cellKey(date: string, memberKey: string): string {
  return JSON.stringify([date, memberKey]);
}

function fieldKey(ref: DirectSideFieldRef): string {
  return JSON.stringify([ref.memberKey, ref.field]);
}

function directValue(
  cell: Pick<NormalizedAllocationCell, 'selfLeft' | 'selfRight'>,
  field: DirectSideField,
): number {
  return field === 'SELF_LEFT' ? cell.selfLeft! : cell.selfRight!;
}

function addDirectValue(
  cell: MutableCell,
  field: DirectSideField,
  value: number,
): void {
  if (field === 'SELF_LEFT') cell.selfLeft = cell.selfLeft! + value;
  else cell.selfRight = cell.selfRight! + value;
}

function setDirectValue(
  cell: MutableCell,
  field: DirectSideField,
  value: number,
): void {
  if (field === 'SELF_LEFT') cell.selfLeft = value;
  else cell.selfRight = value;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function deriveChildSlots(
  request: AutomaticPlanRequest,
): ReadonlyMap<string, ChildSlots> {
  const mutable = new Map<string, { left?: string; right?: string }>();
  for (const memberKey of request.canonicalMemberKeys) mutable.set(memberKey, {});
  for (const member of request.organization.members) {
    if (member.parentMemberKey === null || member.sideAtParent === null) continue;
    const parent = mutable.get(member.parentMemberKey)!;
    if (member.sideAtParent === 'LEFT') parent.left = member.memberKey;
    else parent.right = member.memberKey;
  }
  return new Map([...mutable].map(([memberKey, slots]) => [
    memberKey,
    Object.freeze({ ...slots }),
  ]));
}

function collectSubtreeMemberKeys(
  rootMemberKey: string,
  childSlots: ReadonlyMap<string, ChildSlots>,
): readonly string[] {
  const memberKeys: string[] = [];
  const visit = (memberKey: string): void => {
    memberKeys.push(memberKey);
    const slots = childSlots.get(memberKey);
    if (slots?.left !== undefined) visit(slots.left);
    if (slots?.right !== undefined) visit(slots.right);
  };
  visit(rootMemberKey);
  return Object.freeze(memberKeys);
}

function editableSideFieldsForMembers(
  childSlots: ReadonlyMap<string, ChildSlots>,
  memberKeys: readonly string[],
): readonly DirectSideFieldRef[] {
  const fields: DirectSideFieldRef[] = [];
  for (const memberKey of memberKeys) {
    const slots = childSlots.get(memberKey)!;
    if (slots.left === undefined) {
      fields.push(Object.freeze({ memberKey, field: 'SELF_LEFT' }));
    }
    if (slots.right === undefined) {
      fields.push(Object.freeze({ memberKey, field: 'SELF_RIGHT' }));
    }
  }
  return Object.freeze(fields);
}

function resourcesForBranch(
  childSlots: ReadonlyMap<string, ChildSlots>,
  memberKey: string,
  side: BranchSide,
): BranchResources {
  const childKey = side === 'LEFT'
    ? childSlots.get(memberKey)?.left
    : childSlots.get(memberKey)?.right;
  if (childKey === undefined) {
    const field = side === 'LEFT' ? 'SELF_LEFT' : 'SELF_RIGHT';
    return Object.freeze({
      memberKeys: Object.freeze([]),
      sideFields: Object.freeze([Object.freeze({ memberKey, field })]),
    });
  }
  const memberKeys = collectSubtreeMemberKeys(childKey, childSlots);
  return Object.freeze({
    memberKeys,
    sideFields: editableSideFieldsForMembers(
      childSlots,
      memberKeys,
    ),
  });
}

function preferredChunks(total: number): readonly number[] {
  if (total <= 0) return Object.freeze([]);
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
  return Object.freeze([
    PREFERRED_DIRECT_PV_BLOCK + remainder,
    ...Array.from({ length: hundredCount - 1 }, () => 100),
  ]);
}

function evenlySpacedIndexes(
  totalCount: number,
  selectedCount: number,
): readonly number[] {
  if (selectedCount === 1) return Object.freeze([totalCount - 1]);
  return Object.freeze(Array.from({ length: selectedCount }, (_, index) =>
    Math.round(index * (totalCount - 1) / (selectedCount - 1))));
}

function rotateIndexes(
  indexes: readonly number[],
  totalCount: number,
  phase: number,
): readonly number[] {
  if (totalCount <= 1 || phase === 0) return indexes;
  return Object.freeze(indexes.map((index) => (index + phase) % totalCount));
}

function distributeTotal(
  values: number[],
  total: number,
  indexes: readonly number[],
  phase: number,
): void {
  if (total <= 0 || indexes.length === 0) return;
  const quotient = Math.floor(total / indexes.length);
  const remainder = total % indexes.length;
  for (let ordinal = 0; ordinal < indexes.length; ordinal += 1) {
    const index = indexes[(ordinal + phase) % indexes.length]!;
    values[index] = values[index]! + quotient + (ordinal < remainder ? 1 : 0);
  }
}

function tierForProfile(profile: SharedProfile): number | null {
  switch (profile) {
    case 'THRESHOLD_300':
      return 300;
    case 'THRESHOLD_700':
      return 700;
    case 'THRESHOLD_1500':
      return 1_500;
    case 'THRESHOLD_2400':
      return 2_400;
    case 'THREE_TWO_FOUR':
      return null;
  }
}

function buildSharedMatchedProfile(
  matchedTotal: number,
  businessDateCount: number,
  profile: SharedProfile,
  phase: number,
): readonly number[] {
  const values = Array.from({ length: businessDateCount }, () => 0);
  if (matchedTotal <= 0 || businessDateCount <= 0) return Object.freeze(values);
  const tier = tierForProfile(profile);
  if (tier !== null) {
    const activeCount = Math.min(
      businessDateCount,
      Math.max(1, Math.floor(matchedTotal / tier)),
    );
    const activeIndexes = rotateIndexes(
      evenlySpacedIndexes(businessDateCount, activeCount),
      businessDateCount,
      phase,
    );
    const baseAmount = matchedTotal >= tier ? tier : matchedTotal;
    for (const index of activeIndexes) values[index] = baseAmount;
    const used = baseAmount * activeIndexes.length;
    distributeTotal(values, matchedTotal - used, activeIndexes, phase);
    return Object.freeze(values);
  }

  const pattern = [300, 200, 400] as const;
  let remaining = matchedTotal;
  const indexes = rotateIndexes(
    Array.from({ length: businessDateCount }, (_, index) => index),
    businessDateCount,
    phase,
  );
  for (let ordinal = 0; ordinal < indexes.length && remaining > 0; ordinal += 1) {
    const requested = pattern[ordinal % pattern.length]!;
    const amount = Math.min(requested, remaining);
    const index = indexes[ordinal]!;
    if (amount < MINIMUM_AUTOMATIC_DIRECT_PV && ordinal > 0) {
      values[indexes[ordinal - 1]!] = values[indexes[ordinal - 1]!]! + amount;
    } else {
      values[index] = amount;
    }
    remaining -= amount;
  }
  distributeTotal(values, remaining, indexes, phase);
  return Object.freeze(values);
}

function buildBranchTargetProfile(
  branchTotal: number,
  matchedProfile: readonly number[],
  extraLayout: ExtraLayout,
  phase: number,
): readonly number[] {
  const values = [...matchedProfile];
  const matchedTotal = matchedProfile.reduce((sum, value) => sum + value, 0);
  const activeIndexes = matchedProfile.flatMap((value, index) => value > 0 ? [index] : []);
  const allIndexes = Array.from({ length: matchedProfile.length }, (_, index) => index);
  distributeTotal(
    values,
    branchTotal - matchedTotal,
    extraLayout === 'ACTIVE_DATES' && activeIndexes.length > 0
      ? activeIndexes
      : allIndexes,
    phase,
  );
  return Object.freeze(values);
}

function qualificationStartIndexByMember(
  request: AutomaticPlanRequest,
  sourceByCell: ReadonlyMap<string, NormalizedAllocationCell>,
  businessDates: readonly string[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const memberKey of request.canonicalMemberKeys) {
    let qualification = request.openingPvpByMember[memberKey]!.cumulativePvpOpening;
    if (qualification >= 300) {
      result.set(memberKey, 0);
      continue;
    }
    let qualifiedIndex = businessDates.length;
    for (let index = 0; index < businessDates.length; index += 1) {
      qualification += sourceByCell.get(cellKey(businessDates[index]!, memberKey))!.pvp;
      if (qualification >= 300) {
        qualifiedIndex = index;
        break;
      }
    }
    result.set(memberKey, qualifiedIndex);
  }
  return result;
}

function fixedPvpProfile(
  resources: BranchResources,
  sourceByCell: ReadonlyMap<string, NormalizedAllocationCell>,
  businessDates: readonly string[],
): readonly number[] {
  const values: number[] = [];
  for (const date of businessDates) {
    const total = sum(resources.memberKeys.map(
      (memberKey) => sourceByCell.get(cellKey(date, memberKey))!.pvp,
    ));
    values.push(total);
  }
  return Object.freeze(values);
}

function branchTotal(
  resources: BranchResources,
  source: RawAutomaticPlanCandidate,
): number {
  const memberKeys = new Set(resources.memberKeys);
  const sideFieldKeys = new Set(resources.sideFields.map(fieldKey));
  return sum(source.allocations.flatMap((cell) => {
    const values: number[] = memberKeys.has(cell.memberKey) ? [cell.pvp] : [];
    if (sideFieldKeys.has(fieldKey({ memberKey: cell.memberKey, field: 'SELF_LEFT' }))) {
      values.push(cell.selfLeft!);
    }
    if (sideFieldKeys.has(fieldKey({ memberKey: cell.memberKey, field: 'SELF_RIGHT' }))) {
      values.push(cell.selfRight!);
    }
    return values;
  }));
}

function chooseTargetDateIndex(
  target: readonly number[],
  current: readonly number[],
  earliestIndex: number,
  chunk: number,
  tieOffset: number,
): number {
  const eligibleCount = target.length - earliestIndex;
  let bestIndex = earliestIndex;
  let bestDeficit = Number.NEGATIVE_INFINITY;
  let bestRemainder = Number.POSITIVE_INFINITY;
  for (let ordinal = 0; ordinal < eligibleCount; ordinal += 1) {
    const index = earliestIndex + ((ordinal + tieOffset) % eligibleCount);
    const deficit = target[index]! - current[index]!;
    const remainder = Math.abs(deficit - chunk);
    if (
      deficit > bestDeficit ||
      (deficit === bestDeficit && remainder < bestRemainder)
    ) {
      bestIndex = index;
      bestDeficit = deficit;
      bestRemainder = remainder;
    }
  }
  return bestIndex;
}

function scheduleBranchFields(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  sourceByCell: ReadonlyMap<string, NormalizedAllocationCell>,
  mutableByCell: ReadonlyMap<string, MutableCell>,
  resources: BranchResources,
  businessDates: readonly string[],
  qualificationStarts: ReadonlyMap<string, number>,
  targetProfile: readonly number[],
  phase: number,
): boolean {
  const fixedProfile = fixedPvpProfile(resources, sourceByCell, businessDates);
  const plans: FieldPlan[] = [];
  for (const ref of resources.sideFields) {
    const total = sum(source.allocations.map((cell) =>
      cell.memberKey === ref.memberKey ? directValue(cell, ref.field) : 0));
    const earliestBusinessDateIndex = Math.min(
      qualificationStarts.get(ref.memberKey)!,
      businessDates.length,
    );
    if (total > 0 && earliestBusinessDateIndex >= businessDates.length) return false;
    plans.push(Object.freeze({
      ref,
      earliestBusinessDateIndex,
      chunks: preferredChunks(total),
    }));
    for (const date of request.calendar.dates) {
      const cell = mutableByCell.get(cellKey(date, ref.memberKey))!;
      setDirectValue(cell, ref.field, 0);
    }
  }

  const current = [...fixedProfile];
  for (let fieldOrdinal = 0; fieldOrdinal < plans.length; fieldOrdinal += 1) {
    const plan = plans[fieldOrdinal]!;
    for (let chunkOrdinal = 0; chunkOrdinal < plan.chunks.length; chunkOrdinal += 1) {
      const chunk = plan.chunks[chunkOrdinal]!;
      const targetIndex = chooseTargetDateIndex(
        targetProfile,
        current,
        plan.earliestBusinessDateIndex,
        chunk,
        phase + fieldOrdinal + chunkOrdinal,
      );
      const cell = mutableByCell.get(
        cellKey(businessDates[targetIndex]!, plan.ref.memberKey),
      )!;
      addDirectValue(cell, plan.ref.field, chunk);
      current[targetIndex] = current[targetIndex]! + chunk;
    }
  }
  return true;
}

function synchronizeMemberBranches(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  memberKey: string,
  profile: SharedProfile,
  extraLayout: ExtraLayout,
  phase: number,
): RawAutomaticPlanCandidate {
  const skipDates = new Set(request.calendar.skipDateSet);
  const businessDates = request.calendar.dates.filter((date) => !skipDates.has(date));
  if (businessDates.length <= 1) return source;
  const sourceByCell = new Map(
    source.allocations.map((cell) => [cellKey(cell.date, cell.memberKey), cell] as const),
  );
  const childSlots = deriveChildSlots(request);
  const left = resourcesForBranch(
    childSlots,
    memberKey,
    'LEFT',
  );
  const right = resourcesForBranch(
    childSlots,
    memberKey,
    'RIGHT',
  );
  const leftTotal = branchTotal(left, source);
  const rightTotal = branchTotal(right, source);
  const matchedProfile = buildSharedMatchedProfile(
    Math.min(leftTotal, rightTotal),
    businessDates.length,
    profile,
    phase,
  );
  const leftTarget = buildBranchTargetProfile(
    leftTotal,
    matchedProfile,
    extraLayout,
    phase,
  );
  const rightTarget = buildBranchTargetProfile(
    rightTotal,
    matchedProfile,
    extraLayout,
    phase,
  );
  const mutableByCell = new Map<string, MutableCell>();
  for (const cell of source.allocations) {
    mutableByCell.set(cellKey(cell.date, cell.memberKey), {
      date: cell.date,
      memberKey: cell.memberKey,
      pvp: cell.pvp,
      ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: cell.selfLeft! } : {}),
      ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: cell.selfRight! } : {}),
    });
  }
  const qualificationStarts = qualificationStartIndexByMember(
    request,
    sourceByCell,
    businessDates,
  );
  if (!scheduleBranchFields(
    request,
    source,
    sourceByCell,
    mutableByCell,
    left,
    businessDates,
    qualificationStarts,
    leftTarget,
    phase,
  )) return source;
  if (!scheduleBranchFields(
    request,
    source,
    sourceByCell,
    mutableByCell,
    right,
    businessDates,
    qualificationStarts,
    rightTarget,
    phase,
  )) return source;

  return Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(source.allocations.map((sourceCell) => {
      const cell = mutableByCell.get(cellKey(sourceCell.date, sourceCell.memberKey))!;
      return Object.freeze({
        date: cell.date,
        memberKey: cell.memberKey,
        pvp: cell.pvp,
        ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: cell.selfLeft! } : {}),
        ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: cell.selfRight! } : {}),
      });
    })),
  });
}

function rotateBranch(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  resources: BranchResources,
  businessDates: readonly string[],
  shift: number,
): RawAutomaticPlanCandidate {
  const sourceByCell = new Map(
    source.allocations.map((cell) => [cellKey(cell.date, cell.memberKey), cell] as const),
  );
  const mutableByCell = new Map<string, MutableCell>();
  for (const cell of source.allocations) {
    mutableByCell.set(cellKey(cell.date, cell.memberKey), {
      date: cell.date,
      memberKey: cell.memberKey,
      pvp: cell.pvp,
      ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: cell.selfLeft! } : {}),
      ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: cell.selfRight! } : {}),
    });
  }
  for (const memberKey of resources.memberKeys) {
    const values = businessDates.map((date) =>
      sourceByCell.get(cellKey(date, memberKey))!.pvp);
    for (let targetIndex = 0; targetIndex < businessDates.length; targetIndex += 1) {
      const sourceIndex = (
        targetIndex - shift + businessDates.length
      ) % businessDates.length;
      mutableByCell.get(cellKey(businessDates[targetIndex]!, memberKey))!.pvp =
        values[sourceIndex]!;
    }
  }
  for (const ref of resources.sideFields) {
    const values = businessDates.map((date) => {
      const cell = sourceByCell.get(cellKey(date, ref.memberKey))!;
      return directValue(cell, ref.field);
    });
    for (let targetIndex = 0; targetIndex < businessDates.length; targetIndex += 1) {
      const sourceIndex = (
        targetIndex - shift + businessDates.length
      ) % businessDates.length;
      setDirectValue(
        mutableByCell.get(cellKey(businessDates[targetIndex]!, ref.memberKey))!,
        ref.field,
        values[sourceIndex]!,
      );
    }
  }
  return Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(source.allocations.map((sourceCell) => {
      const cell = mutableByCell.get(cellKey(sourceCell.date, sourceCell.memberKey))!;
      return Object.freeze({
        date: cell.date,
        memberKey: cell.memberKey,
        pvp: cell.pvp,
        ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: cell.selfLeft! } : {}),
        ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: cell.selfRight! } : {}),
      });
    })),
  });
}

/**
 * Rigidly rotates a complete descendant branch without changing the relative
 * date pattern inside it. This lets a parent align LEFT/RIGHT contribution
 * dates while preserving a child's already useful internal schedule. `source`
 * must be a normalized candidate that already survived canonical verification.
 */
export function buildBranchRotationCandidateVariants(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  requestedFocusMemberKeys?: readonly string[],
): readonly RawAutomaticPlanCandidate[] {
  const skipDates = new Set(request.calendar.skipDateSet);
  const businessDates = request.calendar.dates.filter((date) => !skipDates.has(date));
  if (businessDates.length <= 2 || request.canonicalMemberKeys.length <= 1) {
    return Object.freeze([]);
  }
  const memberByKey = new Map(
    request.organization.members.map((member) => [member.memberKey, member] as const),
  );
  const eligibleFocusMemberKeys = request.canonicalMemberKeys.filter((memberKey) => {
    const member = memberByKey.get(memberKey);
    return member !== undefined && member.parentMemberKey !== null;
  });
  const eligibleSet = new Set(eligibleFocusMemberKeys);
  const focusMemberKeys = requestedFocusMemberKeys === undefined
    ? eligibleFocusMemberKeys
    : requestedFocusMemberKeys.filter((memberKey, index) =>
        eligibleSet.has(memberKey) && requestedFocusMemberKeys.indexOf(memberKey) === index);
  if (focusMemberKeys.length === 0) return Object.freeze([]);
  const childSlots = deriveChildSlots(request);
  const variants: RawAutomaticPlanCandidate[] = [];
  const seen = new Set([JSON.stringify(source.allocations)]);
  for (const memberKey of focusMemberKeys) {
    for (const side of ['LEFT', 'RIGHT'] as const) {
      const resources = resourcesForBranch(
        childSlots,
        memberKey,
        side,
      );
      for (let shift = 1; shift < businessDates.length; shift += 1) {
        const candidate = rotateBranch(
          request,
          source,
          resources,
          businessDates,
          shift,
        );
        const signature = JSON.stringify(candidate.allocations);
        if (seen.has(signature)) continue;
        seen.add(signature);
        variants.push(candidate);
      }
    }
  }
  return Object.freeze(variants);
}

/**
 * Builds deterministic, total-preserving alternatives that coordinate the
 * complete LEFT and RIGHT descendant contribution pools of target 1,500/2,400
 * members. Each result is still an unproven heuristic and must pass the
 * canonical candidate verifier and objective comparator before publication.
 * `source` must already be normalized and canonically verified.
 */
export function buildBranchSynchronizedCandidateVariants(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  requestedFocusMemberKeys?: readonly string[],
): readonly RawAutomaticPlanCandidate[] {
  const businessDateCount = request.calendar.dates.length - request.calendar.skipDateSet.length;
  if (businessDateCount <= 2 || request.canonicalMemberKeys.length <= 1) {
    return Object.freeze([]);
  }
  const memberByKey = new Map(
    request.organization.members.map((member) => [member.memberKey, member] as const),
  );
  const eligibleFocusMemberKeys = request.canonicalMemberKeys.filter((memberKey) => {
    const member = memberByKey.get(memberKey);
    return member !== undefined && member.parentMemberKey !== null;
  });
  const eligibleSet = new Set(eligibleFocusMemberKeys);
  const focusMemberKeys = requestedFocusMemberKeys === undefined
    ? eligibleFocusMemberKeys
    : requestedFocusMemberKeys.filter((memberKey, index) =>
        eligibleSet.has(memberKey) && requestedFocusMemberKeys.indexOf(memberKey) === index);
  if (focusMemberKeys.length === 0) return Object.freeze([]);

  const variants: RawAutomaticPlanCandidate[] = [];
  const seen = new Set([JSON.stringify(source.allocations)]);
  const add = (candidate: RawAutomaticPlanCandidate): void => {
    const signature = JSON.stringify(candidate.allocations);
    if (seen.has(signature)) return;
    seen.add(signature);
    variants.push(candidate);
  };
  const phases = businessDateCount > 3 ? [0, 1] as const : [0] as const;
  for (const memberKey of focusMemberKeys) {
    for (const profile of SHARED_PROFILES) {
      for (const extraLayout of ['ACTIVE_DATES', 'ALL_DATES'] as const) {
        for (const phase of phases) {
          add(synchronizeMemberBranches(
            request,
            source,
            memberKey,
            profile,
            extraLayout,
            phase,
          ));
        }
      }
    }
  }

  for (const profile of SHARED_PROFILES) {
    for (const extraLayout of ['ACTIVE_DATES', 'ALL_DATES'] as const) {
      for (const memberOrder of [focusMemberKeys, [...focusMemberKeys].reverse()] as const) {
        let composed = source;
        for (const memberKey of memberOrder) {
          composed = synchronizeMemberBranches(
            request,
            composed,
            memberKey,
            profile,
            extraLayout,
            0,
          );
        }
        add(composed);
      }
    }
  }
  return Object.freeze(variants);
}
