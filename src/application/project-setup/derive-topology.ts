import type { OrganizationSnapshotInput, Side } from '../../engine';
import type {
  CanonicalMemberSequence,
  ChildSlotState,
  DerivedTopology,
  MemberDraft,
  ProjectSetupDraft,
  ReassignmentQueueEntry,
} from './types';

interface CanonicalChildren {
  readonly LEFT: string | null;
  readonly RIGHT: string | null;
}

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
    .map((member) => {
      const hasConnectedMembers =
        (childrenByParent.get(member.memberKey)?.length ?? 0) > 0;
      return {
        memberKey: member.memberKey,
        memberName: member.name,
        reason: 'ACTIVE_SUBTREE_UNPLACED' as const,
        message: hasConnectedMembers
          ? '아래에 연결된 회원들도 함께 이동합니다.'
          : '이 회원을 조직도에 다시 넣을 수 있습니다.',
      };
    });

  return {
    activeMembers,
    memberByKey,
    childBySlot,
    childrenByParent,
    traversal,
    reassignmentQueue,
  };
}

export function deriveCanonicalMemberSequence(
  organization: Pick<OrganizationSnapshotInput, 'members'>,
): CanonicalMemberSequence {
  const memberByKey = new Map(
    organization.members.map((member) => [member.memberKey, member] as const),
  );
  if (memberByKey.size !== organization.members.length) {
    throw new Error('정본 회원 순서를 만들려면 회원 키가 모두 달라야 합니다.');
  }

  const roots = organization.members.filter(
    (member) => member.parentMemberKey === null && member.sideAtParent === null,
  );
  if (roots.length !== 1) {
    throw new Error('정본 회원 순서를 만들려면 맨 위 회원이 한 명이어야 합니다.');
  }

  const childrenByMemberKey = new Map<string, { LEFT: string | null; RIGHT: string | null }>(
    organization.members.map((member) => [
      member.memberKey,
      { LEFT: null, RIGHT: null },
    ]),
  );
  for (const member of organization.members) {
    if (member.parentMemberKey === null || member.sideAtParent === null) {
      continue;
    }
    const children = childrenByMemberKey.get(member.parentMemberKey);
    if (children === undefined) {
      throw new Error('정본 회원 순서를 만들 수 없는 상위 회원 참조가 있습니다.');
    }
    if (children[member.sideAtParent] !== null) {
      throw new Error('정본 회원 순서를 만들 수 없는 중복 좌·우 자리가 있습니다.');
    }
    children[member.sideAtParent] = member.memberKey;
  }

  const sequence: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (memberKey: string): void => {
    if (visiting.has(memberKey)) {
      throw new Error('정본 회원 순서를 만들 수 없는 조직 순환이 있습니다.');
    }
    if (visited.has(memberKey)) {
      return;
    }
    const children = childrenByMemberKey.get(memberKey) as CanonicalChildren | undefined;
    if (children === undefined || !memberByKey.has(memberKey)) {
      throw new Error('정본 회원 순서를 만들 수 없는 회원 참조가 있습니다.');
    }

    visiting.add(memberKey);
    sequence.push(memberKey);
    if (children.LEFT !== null) {
      visit(children.LEFT);
    }
    if (children.RIGHT !== null) {
      visit(children.RIGHT);
    }
    visiting.delete(memberKey);
    visited.add(memberKey);
  };

  visit(roots[0]!.memberKey);
  if (sequence.length !== organization.members.length) {
    throw new Error('정본 회원 순서를 만들려면 모든 회원이 맨 위 회원과 연결되어야 합니다.');
  }
  return Object.freeze(sequence);
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
