import { checkedSum } from '../domain/pv';
import type {
  IsoDate,
  MemberSnapshot,
  NormalizedAllocationCell,
  Pv,
  RawPerformance,
} from '../domain/types';

export interface OrganizationChildren {
  readonly left: string | null;
  readonly right: string | null;
}

export interface OrganizationIndex {
  readonly membersByKey: ReadonlyMap<string, MemberSnapshot>;
  readonly childrenByMemberKey: ReadonlyMap<string, OrganizationChildren>;
  readonly orderedMemberKeys: readonly string[];
  readonly postOrderMemberKeys: readonly string[];
}

export interface DeriveRawPerformanceInput {
  readonly date: IsoDate;
  readonly organization: OrganizationIndex;
  readonly allocations: readonly NormalizedAllocationCell[];
}

type MutableChildren = { left: string | null; right: string | null };

const compareMemberKey = (left: MemberSnapshot, right: MemberSnapshot): number => {
  if (left.memberKey < right.memberKey) {
    return -1;
  }
  return left.memberKey > right.memberKey ? 1 : 0;
};

/**
 * 검증이 끝난 회원 배치를 날짜별 계산에 재사용할 수 있는 인덱스로 만든다.
 * LEFT를 먼저 방문하고 RIGHT를 방문하므로 입력 배열 순서와 무관하게
 * 후위 순서가 결정된다.
 */
export function buildOrganizationIndex(
  members: readonly MemberSnapshot[],
): OrganizationIndex {
  const orderedMembers = [...members].sort(compareMemberKey);
  const membersByKey = new Map(
    orderedMembers.map((member) => [member.memberKey, member] as const),
  );
  const mutableChildrenByMemberKey = new Map<string, MutableChildren>(
    orderedMembers.map((member) => [
      member.memberKey,
      { left: null, right: null },
    ]),
  );

  for (const member of orderedMembers) {
    if (member.parentMemberKey === null) {
      continue;
    }
    const children = mutableChildrenByMemberKey.get(member.parentMemberKey)!;
    if (member.sideAtParent === 'LEFT') {
      children.left = member.memberKey;
    } else {
      children.right = member.memberKey;
    }
  }

  const rootKey = orderedMembers.find(
    (member) => member.parentMemberKey === null,
  )!.memberKey;
  const postOrderMemberKeys: string[] = [];
  const stack: Array<readonly [memberKey: string, expanded: boolean]> = [
    [rootKey, false],
  ];

  while (stack.length > 0) {
    const [memberKey, expanded] = stack.pop()!;
    if (expanded) {
      postOrderMemberKeys.push(memberKey);
      continue;
    }

    const children = mutableChildrenByMemberKey.get(memberKey)!;
    stack.push([memberKey, true]);
    if (children.right !== null) {
      stack.push([children.right, false]);
    }
    if (children.left !== null) {
      stack.push([children.left, false]);
    }
  }

  return {
    membersByKey,
    childrenByMemberKey: mutableChildrenByMemberKey,
    orderedMemberKeys: orderedMembers.map((member) => member.memberKey),
    postOrderMemberKeys,
  };
}

/** 날짜별 직접 원본만 사용해 모든 회원의 P/L/R/T를 한 번씩 계산한다. */
export function deriveRawPerformance(
  input: DeriveRawPerformanceInput,
): Readonly<Record<string, RawPerformance>> {
  const allocationByMemberKey = new Map(
    input.allocations.map((allocation) => [allocation.memberKey, allocation] as const),
  );
  const rawByMemberKey = new Map<string, RawPerformance>();

  for (const memberKey of input.organization.postOrderMemberKeys) {
    const allocation = allocationByMemberKey.get(memberKey)!;
    const children = input.organization.childrenByMemberKey.get(memberKey)!;
    const directPvp = allocation.pvp as Pv;
    const organizationLeft = children.left === null
      ? allocation.selfLeft as Pv
      : rawByMemberKey.get(children.left)!.subtreeTotal;
    const organizationRight = children.right === null
      ? allocation.selfRight as Pv
      : rawByMemberKey.get(children.right)!.subtreeTotal;
    const subtreeTotal = checkedSum(
      [directPvp, organizationLeft, organizationRight],
      { date: input.date, memberKey, field: 'subtreeTotal' },
    );

    rawByMemberKey.set(memberKey, {
      date: input.date,
      memberKey,
      directPvp,
      organizationLeft,
      organizationRight,
      subtreeTotal,
    });
  }

  return Object.fromEntries(
    input.organization.orderedMemberKeys.map((memberKey) => [
      memberKey,
      rawByMemberKey.get(memberKey)!,
    ]),
  );
}
