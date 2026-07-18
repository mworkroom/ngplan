import type { NormalizedAllocationCell } from '../engine';
import type {
  AutomaticPlanRequest,
  RawAutomaticPlanCandidate,
} from './types';

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;

type DirectSideField = 'SELF_LEFT' | 'SELF_RIGHT';
type BranchSide = 'LEFT' | 'RIGHT';
type ProfileLayout = 'ALIGNED' | 'STAGGERED';

type TierProfile =
  | 'THRESHOLD_300'
  | 'THREE_TWO_FOUR'
  | 'THRESHOLD_700'
  | 'THRESHOLD_1500'
  | 'THRESHOLD_2400';

interface ChildSlots {
  readonly left?: string;
  readonly right?: string;
}

interface DirectSideFieldRef {
  readonly memberKey: string;
  readonly field: DirectSideField;
}

interface MutableCell {
  readonly date: string;
  readonly memberKey: string;
  pvp: number;
  selfLeft?: number;
  selfRight?: number;
}

const PROFILE_MODES: readonly TierProfile[] = Object.freeze([
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
  return field === 'SELF_LEFT' ? cell.selfLeft ?? 0 : cell.selfRight ?? 0;
}

function setDirectValue(
  cell: MutableCell,
  field: DirectSideField,
  value: number,
): void {
  if (field === 'SELF_LEFT') cell.selfLeft = value;
  else cell.selfRight = value;
}

function deriveChildSlots(
  request: AutomaticPlanRequest,
): ReadonlyMap<string, ChildSlots> {
  const mutable = new Map<string, { left?: string; right?: string }>();
  for (const memberKey of request.canonicalMemberKeys) mutable.set(memberKey, {});
  for (const member of request.organization.members) {
    if (member.parentMemberKey === null || member.sideAtParent === null) continue;
    const parent = mutable.get(member.parentMemberKey);
    if (parent === undefined) continue;
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
  sourceByCell: ReadonlyMap<string, NormalizedAllocationCell>,
  firstDate: string,
  memberKeys: readonly string[],
): readonly DirectSideFieldRef[] {
  const fields: DirectSideFieldRef[] = [];
  for (const memberKey of memberKeys) {
    const cell = sourceByCell.get(cellKey(firstDate, memberKey));
    if (cell === undefined) continue;
    if (Object.hasOwn(cell, 'selfLeft')) {
      fields.push(Object.freeze({ memberKey, field: 'SELF_LEFT' }));
    }
    if (Object.hasOwn(cell, 'selfRight')) {
      fields.push(Object.freeze({ memberKey, field: 'SELF_RIGHT' }));
    }
  }
  return Object.freeze(fields);
}

function fieldsForBranch(
  request: AutomaticPlanRequest,
  sourceByCell: ReadonlyMap<string, NormalizedAllocationCell>,
  childSlots: ReadonlyMap<string, ChildSlots>,
  memberKey: string,
  side: BranchSide,
): readonly DirectSideFieldRef[] {
  const firstDate = request.calendar.dates[0]!;
  const childKey = side === 'LEFT'
    ? childSlots.get(memberKey)?.left
    : childSlots.get(memberKey)?.right;
  if (childKey === undefined) {
    const cell = sourceByCell.get(cellKey(firstDate, memberKey));
    const field = side === 'LEFT' ? 'SELF_LEFT' : 'SELF_RIGHT';
    if (cell === undefined || !Object.hasOwn(
      cell,
      field === 'SELF_LEFT' ? 'selfLeft' : 'selfRight',
    )) return Object.freeze([]);
    return Object.freeze([Object.freeze({ memberKey, field })]);
  }
  return editableSideFieldsForMembers(
    sourceByCell,
    firstDate,
    collectSubtreeMemberKeys(childKey, childSlots),
  );
}

function mergeFieldRefs(
  ...groups: readonly (readonly DirectSideFieldRef[])[]
): readonly DirectSideFieldRef[] {
  const result: DirectSideFieldRef[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const ref of group) {
      const key = fieldKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(ref);
    }
  }
  return Object.freeze(result);
}

function thresholdAmounts(total: number, threshold: number): readonly number[] {
  if (total <= 0) return Object.freeze([]);
  const amounts: number[] = [];
  let remaining = total;
  while (remaining >= threshold) {
    amounts.push(threshold);
    remaining -= threshold;
  }
  if (remaining >= MINIMUM_AUTOMATIC_DIRECT_PV) {
    amounts.push(remaining);
  } else if (remaining > 0 && amounts.length > 0) {
    amounts[amounts.length - 1] = amounts.at(-1)! + remaining;
  }
  return Object.freeze(amounts);
}

function repeatingPatternAmounts(
  total: number,
  pattern: readonly number[],
): readonly number[] {
  if (total <= 0) return Object.freeze([]);
  const amounts: number[] = [];
  let remaining = total;
  let patternIndex = 0;
  while (remaining > 0) {
    const amount = Math.min(pattern[patternIndex % pattern.length]!, remaining);
    if (amount < MINIMUM_AUTOMATIC_DIRECT_PV && amounts.length > 0) {
      amounts[amounts.length - 1] = amounts.at(-1)! + amount;
      break;
    }
    amounts.push(amount);
    remaining -= amount;
    patternIndex += 1;
  }
  return Object.freeze(amounts);
}

function profileAmounts(total: number, profile: TierProfile): readonly number[] {
  switch (profile) {
    case 'THRESHOLD_300':
      return thresholdAmounts(total, 300);
    case 'THREE_TWO_FOUR':
      return repeatingPatternAmounts(total, [300, 200, 400]);
    case 'THRESHOLD_700':
      return thresholdAmounts(total, 700);
    case 'THRESHOLD_1500':
      return thresholdAmounts(total, 1_500);
    case 'THRESHOLD_2400':
      return thresholdAmounts(total, 2_400);
  }
}

function evenlySpacedIndexes(totalCount: number, selectedCount: number): readonly number[] {
  if (selectedCount <= 0 || totalCount <= 0) return Object.freeze([]);
  if (selectedCount === 1) return Object.freeze([totalCount - 1]);
  return Object.freeze(Array.from({ length: selectedCount }, (_, index) =>
    Math.round(index * (totalCount - 1) / (selectedCount - 1))));
}

function distributeAmounts(
  amounts: readonly number[],
  targetCount: number,
): readonly number[] {
  if (targetCount <= 0) return Object.freeze([]);
  if (amounts.length <= targetCount) return amounts;
  const combined = Array.from({ length: targetCount }, () => 0);
  for (let index = 0; index < amounts.length; index += 1) {
    combined[index % targetCount] = combined[index % targetCount]! + amounts[index]!;
  }
  return Object.freeze(combined);
}

function rotate<T>(values: readonly T[], offset: number): readonly T[] {
  if (values.length <= 1) return values;
  const normalized = ((offset % values.length) + values.length) % values.length;
  if (normalized === 0) return values;
  return Object.freeze([...values.slice(normalized), ...values.slice(0, normalized)]);
}

function buildDateProfile(
  total: number,
  eligibleDateCount: number,
  profile: TierProfile,
  layout: ProfileLayout,
  ordinal: number,
  deterministicSeed: number,
): readonly number[] {
  if (eligibleDateCount <= 0) return Object.freeze([]);
  const sourceAmounts = profileAmounts(total, profile);
  const amounts = distributeAmounts(sourceAmounts, eligibleDateCount);
  const values = Array.from({ length: eligibleDateCount }, () => 0);
  if (amounts.length === 0) return Object.freeze(values);

  const phase = layout === 'STAGGERED'
    ? (ordinal + deterministicSeed) % amounts.length
    : 0;
  const phasedAmounts = rotate(amounts, phase);
  const baseIndexes = evenlySpacedIndexes(eligibleDateCount, phasedAmounts.length);
  const dateOffset = layout === 'STAGGERED'
    ? (ordinal * 2 + deterministicSeed) % eligibleDateCount
    : 0;
  for (let index = 0; index < phasedAmounts.length; index += 1) {
    const targetIndex = (baseIndexes[index]! + dateOffset) % eligibleDateCount;
    values[targetIndex] = values[targetIndex]! + phasedAmounts[index]!;
  }
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

function reprofileCandidate(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
  fieldRefs: readonly DirectSideFieldRef[],
  profile: TierProfile,
  layout: ProfileLayout,
): RawAutomaticPlanCandidate {
  if (fieldRefs.length === 0) return source;
  const skipDates = new Set(request.calendar.skipDateSet);
  const businessDates = request.calendar.dates.filter((date) => !skipDates.has(date));
  if (businessDates.length <= 1) return source;
  const sourceByCell = new Map(
    source.allocations.map((cell) => [cellKey(cell.date, cell.memberKey), cell] as const),
  );
  const qualificationStarts = qualificationStartIndexByMember(
    request,
    sourceByCell,
    businessDates,
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

  for (let ordinal = 0; ordinal < fieldRefs.length; ordinal += 1) {
    const ref = fieldRefs[ordinal]!;
    const total = source.allocations.reduce(
      (sum, cell) => sum + (cell.memberKey === ref.memberKey
        ? directValue(cell, ref.field)
        : 0),
      0,
    );
    const startIndex = Math.min(
      qualificationStarts.get(ref.memberKey) ?? businessDates.length,
      businessDates.length,
    );
    const eligibleDates = businessDates.slice(startIndex);
    if (total > 0 && eligibleDates.length === 0) return source;
    for (const date of request.calendar.dates) {
      setDirectValue(mutableByCell.get(cellKey(date, ref.memberKey))!, ref.field, 0);
    }
    const dateProfile = buildDateProfile(
      total,
      eligibleDates.length,
      profile,
      layout,
      ordinal,
      request.policy.deterministicSeed,
    );
    for (let index = 0; index < eligibleDates.length; index += 1) {
      setDirectValue(
        mutableByCell.get(cellKey(eligibleDates[index]!, ref.memberKey))!,
        ref.field,
        dateProfile[index]!,
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
 * Produces deterministic, total-preserving schedule alternatives. The source
 * remains the feasibility witness; these profiles only change when each SELF
 * value occurs. Every result still has to pass the canonical Phase 1 verifier
 * and objective comparator before it can become an incumbent.
 */
export function buildTierProfileCandidateVariants(
  request: AutomaticPlanRequest,
  source: RawAutomaticPlanCandidate,
): readonly RawAutomaticPlanCandidate[] {
  const businessDateCount = request.calendar.dates.length - request.calendar.skipDateSet.length;
  if (businessDateCount <= 2 || request.canonicalMemberKeys.length <= 1) {
    return Object.freeze([]);
  }
  const sourceByCell = new Map(
    source.allocations.map((cell) => [cellKey(cell.date, cell.memberKey), cell] as const),
  );
  const childSlots = deriveChildSlots(request);
  const memberByKey = new Map(
    request.organization.members.map((member) => [member.memberKey, member] as const),
  );
  const focusMemberKeys = request.canonicalMemberKeys.filter((memberKey) => {
    const member = memberByKey.get(memberKey);
    if (member?.parentMemberKey === null || member === undefined) return false;
    return member.pvpTarget === 1_500 || member.pvpTarget === 2_400;
  });
  const variants: RawAutomaticPlanCandidate[] = [];

  const allSideFields = editableSideFieldsForMembers(
    sourceByCell,
    request.calendar.dates[0]!,
    request.canonicalMemberKeys,
  );
  for (const profile of ['THRESHOLD_300', 'THREE_TWO_FOUR'] as const) {
    for (const layout of ['ALIGNED', 'STAGGERED'] as const) {
      variants.push(reprofileCandidate(
        request,
        source,
        allSideFields,
        profile,
        layout,
      ));
    }
  }

  for (const memberKey of focusMemberKeys) {
    const leftFields = fieldsForBranch(
      request,
      sourceByCell,
      childSlots,
      memberKey,
      'LEFT',
    );
    const rightFields = fieldsForBranch(
      request,
      sourceByCell,
      childSlots,
      memberKey,
      'RIGHT',
    );
    const bothFields = mergeFieldRefs(leftFields, rightFields);
    for (const profile of PROFILE_MODES) {
      variants.push(reprofileCandidate(
        request,
        source,
        bothFields,
        profile,
        'ALIGNED',
      ));
    }
    for (const profile of [
      'THRESHOLD_300',
      'THREE_TWO_FOUR',
      'THRESHOLD_700',
    ] as const) {
      variants.push(
        reprofileCandidate(request, source, bothFields, profile, 'STAGGERED'),
        reprofileCandidate(request, source, leftFields, profile, 'STAGGERED'),
        reprofileCandidate(request, source, rightFields, profile, 'STAGGERED'),
      );
    }
  }
  return Object.freeze(variants);
}
