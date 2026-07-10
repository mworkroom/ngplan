import type { Side } from '../../engine';
import type {
  ChildSlotState,
  DerivedTopology,
  MemberDraft,
  ProjectSetupDraft,
  ReassignmentQueueEntry,
} from './types';

export function topologySlotKey(parentMemberKey: string, side: Side): string {
  return `${parentMemberKey}\u0000${side}`;
}

function childOrder(left: MemberDraft, right: MemberDraft): number {
  if (left.placement.sideAtParent === right.placement.sideAtParent) {
    return left.memberKey < right.memberKey
      ? -1
      : left.memberKey > right.memberKey
        ? 1
        : 0;
  }
  return left.placement.sideAtParent === 'LEFT' ? -1 : 1;
}

export function deriveTopology(draft: ProjectSetupDraft): DerivedTopology {
  const activeMembers = draft.members.filter(
    (member) => member.participation === 'ACTIVE',
  );
  const memberByKey = new Map(activeMembers.map((member) => [member.memberKey, member]));
  const childBySlot = new Map<string, string>();
  const mutableChildren = new Map<string, MemberDraft[]>();

  for (const member of activeMembers) {
    const { parentMemberKey, sideAtParent } = member.placement;
    if (parentMemberKey === null || sideAtParent === null) {
      continue;
    }
    const key = topologySlotKey(parentMemberKey, sideAtParent);
    if (!childBySlot.has(key)) {
      childBySlot.set(key, member.memberKey);
    }
    const children = mutableChildren.get(parentMemberKey) ?? [];
    children.push(member);
    mutableChildren.set(parentMemberKey, children);
  }

  const childrenByParent = new Map<string, readonly string[]>();
  for (const [parentMemberKey, children] of mutableChildren) {
    childrenByParent.set(
      parentMemberKey,
      children.sort(childOrder).map((child) => child.memberKey),
    );
  }

  const traversal: string[] = [];
  const visited = new Set<string>();
  const visit = (memberKey: string): void => {
    if (visited.has(memberKey) || !memberByKey.has(memberKey)) {
      return;
    }
    visited.add(memberKey);
    traversal.push(memberKey);
    for (const childKey of childrenByParent.get(memberKey) ?? []) {
      visit(childKey);
    }
  };
  if (draft.rootMemberKey !== null) {
    visit(draft.rootMemberKey);
  }

  const reassignmentQueue: ReassignmentQueueEntry[] = activeMembers
    .filter(
      (member) =>
        member.memberKey !== draft.rootMemberKey &&
        member.placement.parentMemberKey === null &&
        member.placement.sideAtParent === null,
    )
    .map((member) => ({
      memberKey: member.memberKey,
      memberName: member.name,
      reason: 'ACTIVE_SUBTREE_UNPLACED' as const,
      message: '활성 서브트리가 루트 또는 부모의 좌·우 슬롯에 연결되지 않았습니다.',
    }));

  return {
    activeMembers,
    memberByKey,
    childBySlot,
    childrenByParent,
    traversal,
    reassignmentQueue,
  };
}

export function getChildSlotState(
  topology: DerivedTopology,
  parentMemberKey: string,
  side: Side,
): ChildSlotState {
  const childMemberKey = topology.childBySlot.get(
    topologySlotKey(parentMemberKey, side),
  );
  return {
    parentMemberKey,
    side,
    kind: childMemberKey === undefined ? 'SELF' : 'CHILD',
    childMemberKey: childMemberKey ?? null,
  };
}

export function getDescendantKeys(
  topology: DerivedTopology,
  memberKey: string,
): ReadonlySet<string> {
  const descendants = new Set<string>();
  const stack = [...(topology.childrenByParent.get(memberKey) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (descendants.has(current)) {
      continue;
    }
    descendants.add(current);
    stack.push(...(topology.childrenByParent.get(current) ?? []));
  }
  return descendants;
}

export function listEmptySlots(
  draft: ProjectSetupDraft,
): readonly { readonly parentMemberKey: string; readonly side: Side }[] {
  const topology = deriveTopology(draft);
  return topology.activeMembers.flatMap((member) =>
    (['LEFT', 'RIGHT'] as const)
      .filter(
        (side) =>
          !topology.childBySlot.has(topologySlotKey(member.memberKey, side)),
      )
      .map((side) => ({ parentMemberKey: member.memberKey, side })),
  );
}
