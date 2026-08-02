import type { NormalizedAllocationCell } from '../engine';
import type {
  AutomaticPlanRequest,
  RawAutomaticPlanCandidate,
  VerifiedAutomaticPlanCandidate,
} from './types';

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;
const TRANSFER_PLAN_LIMIT = 5;
const COMMISSION_BOUNDARIES = [300, 700, 1_500, 2_400] as const;

type AllocationField = 'pvp' | 'selfLeft' | 'selfRight';
type BranchSide = 'LEFT' | 'RIGHT';

interface ChildSlots {
  readonly left?: string;
  readonly right?: string;
}

interface FieldRef {
  readonly memberKey: string;
  readonly field: AllocationField;
}

interface Transfer {
  readonly sourceIndex: number;
  readonly targetIndex: number;
  readonly field: AllocationField;
  readonly amount: number;
}

type TransferPlan = readonly Transfer[];

interface DonorCoordinate {
  readonly ref: FieldRef;
  readonly sourceIndex: number;
  readonly targetIndex: number;
  readonly donorValue: number;
  readonly targetValue: number;
  readonly dateIndex: number;
  readonly slack: number;
}

function cellKey(date: string, memberKey: string): string {
  return JSON.stringify([date, memberKey]);
}

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

function deriveChildSlots(
  request: AutomaticPlanRequest,
): ReadonlyMap<string, ChildSlots> {
  const mutable = new Map<string, { left?: string; right?: string }>();
  for (const memberKey of request.canonicalMemberKeys) mutable.set(memberKey, {});
  for (const member of request.organization.members) {
    if (member.parentMemberKey === null || member.sideAtParent === null) continue;
    const slots = mutable.get(member.parentMemberKey)!;
    if (member.sideAtParent === 'LEFT') slots.left = member.memberKey;
    else slots.right = member.memberKey;
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
  const result: string[] = [];
  const visit = (memberKey: string): void => {
    result.push(memberKey);
    const slots = childSlots.get(memberKey)!;
    if (slots.left !== undefined) visit(slots.left);
    if (slots.right !== undefined) visit(slots.right);
  };
  visit(rootMemberKey);
  return Object.freeze(result);
}

function branchFieldRefs(
  source: VerifiedAutomaticPlanCandidate,
  childSlots: ReadonlyMap<string, ChildSlots>,
  memberKey: string,
  side: BranchSide,
): readonly FieldRef[] {
  const childKey = side === 'LEFT'
    ? childSlots.get(memberKey)?.left
    : childSlots.get(memberKey)?.right;
  if (childKey === undefined) {
    const field = side === 'LEFT' ? 'selfLeft' : 'selfRight';
    const firstCell = source.allocations.find((cell) =>
      cell.memberKey === memberKey);
    return firstCell !== undefined && Object.hasOwn(firstCell, field)
      ? Object.freeze([Object.freeze({ memberKey, field })])
      : Object.freeze([]);
  }

  const refs: FieldRef[] = [];
  for (const subtreeMemberKey of collectSubtreeMemberKeys(childKey, childSlots)) {
    const firstCell = source.allocations.find((cell) =>
      cell.memberKey === subtreeMemberKey)!;
    refs.push(Object.freeze({ memberKey: subtreeMemberKey, field: 'pvp' }));
    if (Object.hasOwn(firstCell, 'selfLeft')) {
      refs.push(Object.freeze({ memberKey: subtreeMemberKey, field: 'selfLeft' }));
    }
    if (Object.hasOwn(firstCell, 'selfRight')) {
      refs.push(Object.freeze({ memberKey: subtreeMemberKey, field: 'selfRight' }));
    }
  }
  return Object.freeze(refs);
}

function assessedSideValue(
  source: VerifiedAutomaticPlanCandidate,
  date: string,
  memberKey: string,
  side: BranchSide,
): number {
  const settlement = source.calculation.dailySettlementByDateAndMember[date]![
    memberKey
  ]!;
  return (side === 'LEFT'
    ? settlement.assessedLeft
    : settlement.assessedRight)!;
}

function nextBoundary(currentTier: number | null): number | null {
  const tier = currentTier ?? 0;
  return COMMISSION_BOUNDARIES.find((boundary) => boundary > tier) ?? null;
}

function transferSignature(plan: TransferPlan): string {
  return JSON.stringify(plan.map((item) => [
    item.sourceIndex,
    item.targetIndex,
    item.field,
    item.amount,
  ]));
}

function legalTransfer(
  donor: DonorCoordinate,
  amount: number,
): boolean {
  return (
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= donor.donorValue &&
    amount <= donor.slack &&
    legalAutomaticValue(donor.donorValue - amount) &&
    legalAutomaticValue(donor.targetValue + amount)
  );
}

function preferredAmounts(deficit: number, donorValue: number): readonly number[] {
  return Object.freeze([...new Set([
    deficit,
    Math.ceil(deficit / 100) * 100,
    100,
    200,
    300,
    400,
    donorValue,
  ])].filter((amount) => amount > 0));
}

function buildGreedyTransferPlan(
  donors: readonly DonorCoordinate[],
  deficit: number,
): TransferPlan | null {
  let remaining = deficit;
  const remainingSlackByDate = new Map<number, number>();
  const transfers: Transfer[] = [];
  for (const donor of donors) {
    if (remaining <= 0) break;
    const dateSlack = remainingSlackByDate.get(donor.dateIndex) ?? donor.slack;
    let amount = Math.min(remaining, donor.donorValue, dateSlack);
    if (donor.donorValue - amount > 0 && donor.donorValue - amount < 30) {
      amount = donor.donorValue <= dateSlack
        ? donor.donorValue
        : donor.donorValue - 30;
    }
    if (donor.targetValue === 0 && amount < 30) {
      amount = Math.min(donor.donorValue, dateSlack, 30);
    }
    if (!legalTransfer({ ...donor, slack: dateSlack }, amount)) continue;
    transfers.push(Object.freeze({
      sourceIndex: donor.sourceIndex,
      targetIndex: donor.targetIndex,
      field: donor.ref.field,
      amount,
    }));
    remaining -= amount;
    remainingSlackByDate.set(donor.dateIndex, dateSlack - amount);
  }
  return remaining <= 0 ? Object.freeze(transfers) : null;
}

function transferPlansForSide(
  source: VerifiedAutomaticPlanCandidate,
  refs: readonly FieldRef[],
  focusMemberKey: string,
  side: BranchSide,
  targetDate: string,
  deficit: number,
  businessDates: readonly string[],
  allocationIndexByCell: ReadonlyMap<string, number>,
): readonly TransferPlan[] {
  if (deficit <= 0) return Object.freeze([Object.freeze([])]);
  const donors: DonorCoordinate[] = [];
  for (let dateIndex = 0; dateIndex < businessDates.length; dateIndex += 1) {
    const date = businessDates[dateIndex]!;
    if (date === targetDate) continue;
    const settlement = source.calculation.dailySettlementByDateAndMember[date]![
      focusMemberKey
    ]!;
    const protectedTier = settlement.commissionTier ?? 0;
    const slack = Math.max(
      0,
      assessedSideValue(source, date, focusMemberKey, side) - protectedTier,
    );
    if (slack <= 0) continue;
    for (const ref of refs) {
      const sourceIndex = allocationIndexByCell.get(cellKey(date, ref.memberKey));
      const targetIndex = allocationIndexByCell.get(cellKey(targetDate, ref.memberKey));
      if (sourceIndex === undefined || targetIndex === undefined) continue;
      const donorValue = fieldValue(source.allocations[sourceIndex]!, ref.field);
      if (donorValue <= 0) continue;
      donors.push(Object.freeze({
        ref,
        sourceIndex,
        targetIndex,
        donorValue,
        targetValue: fieldValue(source.allocations[targetIndex]!, ref.field),
        dateIndex,
        slack,
      }));
    }
  }

  const plans: TransferPlan[] = [];
  const seen = new Set<string>();
  const add = (plan: TransferPlan | null): void => {
    if (plan === null || plan.length === 0) return;
    const signature = transferSignature(plan);
    if (seen.has(signature)) return;
    seen.add(signature);
    plans.push(plan);
  };

  const singlePlans = donors.flatMap((donor) =>
    preferredAmounts(deficit, donor.donorValue).flatMap((amount) =>
      legalTransfer(donor, amount)
        ? [Object.freeze([Object.freeze({
            sourceIndex: donor.sourceIndex,
            targetIndex: donor.targetIndex,
            field: donor.ref.field,
            amount,
          })])]
        : []));
  singlePlans.sort((left, right) => {
    const leftAmount = left.reduce((total, item) => total + item.amount, 0);
    const rightAmount = right.reduce((total, item) => total + item.amount, 0);
    return Math.abs(leftAmount - deficit) - Math.abs(rightAmount - deficit) ||
      Number(left[0]!.field === 'pvp') - Number(right[0]!.field === 'pvp') ||
      left[0]!.sourceIndex - right[0]!.sourceIndex;
  });
  for (const plan of singlePlans.slice(0, TRANSFER_PLAN_LIMIT)) add(plan);

  const donorOrders = [
    [...donors].sort((left, right) =>
      right.slack - left.slack || right.donorValue - left.donorValue ||
      left.sourceIndex - right.sourceIndex),
    [...donors].sort((left, right) =>
      Number(left.ref.field === 'pvp') - Number(right.ref.field === 'pvp') ||
      right.donorValue - left.donorValue || left.sourceIndex - right.sourceIndex),
    [...donors].sort((left, right) =>
      right.dateIndex - left.dateIndex || left.sourceIndex - right.sourceIndex),
    [...donors].sort((left, right) =>
      left.dateIndex - right.dateIndex || left.sourceIndex - right.sourceIndex),
  ];
  for (const order of donorOrders) add(buildGreedyTransferPlan(order, deficit));
  return Object.freeze(plans.slice(0, TRANSFER_PLAN_LIMIT));
}

function applyTransferPlans(
  request: AutomaticPlanRequest,
  source: VerifiedAutomaticPlanCandidate,
  plans: readonly TransferPlan[],
): RawAutomaticPlanCandidate | null {
  const values = new Map<string, number>();
  const valueAt = (index: number, field: AllocationField): number => {
    const key = JSON.stringify([index, field]);
    return values.get(key) ?? fieldValue(source.allocations[index]!, field);
  };
  const setValue = (index: number, field: AllocationField, value: number): void => {
    values.set(JSON.stringify([index, field]), value);
  };
  for (const transfer of plans.flat()) {
    const nextSource = valueAt(transfer.sourceIndex, transfer.field) - transfer.amount;
    const nextTarget = valueAt(transfer.targetIndex, transfer.field) + transfer.amount;
    if (!legalAutomaticValue(nextSource) || !legalAutomaticValue(nextTarget)) {
      return null;
    }
    setValue(transfer.sourceIndex, transfer.field, nextSource);
    setValue(transfer.targetIndex, transfer.field, nextTarget);
  }
  if (values.size === 0) return null;
  return Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(source.allocations.map((cell, index) => {
      let changed = cell;
      for (const field of ['pvp', 'selfLeft', 'selfRight'] as const) {
        const value = values.get(JSON.stringify([index, field]));
        if (value !== undefined) changed = withFieldValue(changed, field, value);
      }
      return changed;
    })),
  });
}

/**
 * Moves payout-preserving slack from donor dates in both descendant branches
 * into a date that is short of its next 300/700/1,500/2,400 boundary. Unlike
 * a one-cell move, each candidate can repair LEFT and RIGHT together.
 */
export function buildCommissionBoundaryCandidateVariants(
  request: AutomaticPlanRequest,
  source: VerifiedAutomaticPlanCandidate,
  requestedFocusMemberKeys?: readonly string[],
): readonly RawAutomaticPlanCandidate[] {
  const skippedDates = new Set(request.calendar.skipDateSet);
  const businessDates = request.calendar.dates.filter((date) =>
    !skippedDates.has(date));
  if (businessDates.length <= 1) return Object.freeze([]);
  const memberByKey = new Map(request.organization.members.map((member) => [
    member.memberKey,
    member,
  ] as const));
  const eligibleMemberKeys = request.canonicalMemberKeys.filter((memberKey) =>
    memberByKey.get(memberKey)?.parentMemberKey !== null);
  const eligibleSet = new Set(eligibleMemberKeys);
  const focusMemberKeys = requestedFocusMemberKeys === undefined
    ? eligibleMemberKeys
    : requestedFocusMemberKeys.filter((memberKey, index) =>
        eligibleSet.has(memberKey) &&
        requestedFocusMemberKeys.indexOf(memberKey) === index);
  const childSlots = deriveChildSlots(request);
  const allocationIndexByCell = new Map(source.allocations.map((cell, index) => [
    cellKey(cell.date, cell.memberKey),
    index,
  ] as const));
  const variants: RawAutomaticPlanCandidate[] = [];
  const seen = new Set([JSON.stringify(source.allocations)]);

  for (const memberKey of focusMemberKeys) {
    const leftRefs = branchFieldRefs(
      source,
      childSlots,
      memberKey,
      'LEFT',
    );
    const rightRefs = branchFieldRefs(
      source,
      childSlots,
      memberKey,
      'RIGHT',
    );
    for (const targetDate of businessDates) {
      const settlement = source.calculation.dailySettlementByDateAndMember[
        targetDate
      ]![memberKey]!;
      const boundary = nextBoundary(settlement.commissionTier);
      if (boundary === null) continue;
      const leftDeficit = Math.max(
        0,
        boundary - assessedSideValue(source, targetDate, memberKey, 'LEFT'),
      );
      const rightDeficit = Math.max(
        0,
        boundary - assessedSideValue(source, targetDate, memberKey, 'RIGHT'),
      );
      if (leftDeficit === 0 && rightDeficit === 0) continue;
      const leftPlans = transferPlansForSide(
        source,
        leftRefs,
        memberKey,
        'LEFT',
        targetDate,
        leftDeficit,
        businessDates,
        allocationIndexByCell,
      );
      const rightPlans = transferPlansForSide(
        source,
        rightRefs,
        memberKey,
        'RIGHT',
        targetDate,
        rightDeficit,
        businessDates,
        allocationIndexByCell,
      );
      for (const leftPlan of leftPlans) {
        for (const rightPlan of rightPlans) {
          const candidate = applyTransferPlans(
            request,
            source,
            [leftPlan, rightPlan],
          );
          if (candidate === null) continue;
          const signature = JSON.stringify(candidate.allocations);
          if (seen.has(signature)) continue;
          seen.add(signature);
          variants.push(candidate);
        }
      }
    }
  }
  return Object.freeze(variants);
}
