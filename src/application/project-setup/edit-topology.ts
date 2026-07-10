import type { Side } from '../../engine';
import { createMemberDraft } from './create-project-draft';
import {
  deriveTopology,
  getDescendantKeys,
  topologySlotKey,
} from './derive-topology';
import { replaceDraftMembers } from './edit-member';
import type {
  ExclusionStrategy,
  MemberDraft,
  OrganizationChangeSummary,
  ProjectSetupDraft,
  TopologyCommandErrorCode,
  TopologyCommandOutcome,
} from './types';

function failure(
  draft: ProjectSetupDraft,
  code: TopologyCommandErrorCode,
  message: string,
): TopologyCommandOutcome {
  return { status: 'FAILURE', draft, error: { code, message } };
}

function summary(
  command: OrganizationChangeSummary['command'],
  patch: Partial<OrganizationChangeSummary> = {},
): OrganizationChangeSummary {
  return {
    command,
    excludedMemberKey: null,
    detachedSubtreeRoots: [],
    promotedMemberKey: null,
    vacatedParentMemberKey: null,
    vacatedSide: null,
    ...patch,
  };
}

function success(
  draft: ProjectSetupDraft,
  changeSummary: OrganizationChangeSummary,
): TopologyCommandOutcome {
  return { status: 'SUCCESS', draft, summary: changeSummary };
}

function activeMember(
  draft: ProjectSetupDraft,
  memberKey: string,
): MemberDraft | undefined {
  return draft.members.find(
    (member) =>
      member.memberKey === memberKey && member.participation === 'ACTIVE',
  );
}

function requireActiveMember(
  draft: ProjectSetupDraft,
  memberKey: string,
): TopologyCommandOutcome | MemberDraft {
  const member = draft.members.find((candidate) => candidate.memberKey === memberKey);
  if (member === undefined) {
    return failure(draft, 'MEMBER_NOT_FOUND', `회원 ${memberKey}을 찾을 수 없습니다.`);
  }
  if (member.participation !== 'ACTIVE') {
    return failure(draft, 'MEMBER_NOT_ACTIVE', `회원 ${memberKey}은 현재 프로젝트에서 제외되었습니다.`);
  }
  return member;
}

function isFailure(
  value: TopologyCommandOutcome | MemberDraft,
): value is TopologyCommandOutcome {
  return 'status' in value;
}

function slotOccupant(
  draft: ProjectSetupDraft,
  parentMemberKey: string,
  side: Side,
): string | undefined {
  return deriveTopology(draft).childBySlot.get(
    topologySlotKey(parentMemberKey, side),
  );
}

function replaceOneMember(
  members: readonly MemberDraft[],
  memberKey: string,
  update: (member: MemberDraft) => MemberDraft,
): readonly MemberDraft[] {
  return members.map((member) =>
    member.memberKey === memberKey ? update(member) : member,
  );
}

function validateTargetSlot(
  draft: ProjectSetupDraft,
  movingMemberKey: string | null,
  parentMemberKey: string,
  side: Side,
): TopologyCommandOutcome | MemberDraft {
  const parent = requireActiveMember(draft, parentMemberKey);
  if (isFailure(parent)) {
    return parent;
  }
  const occupant = slotOccupant(draft, parentMemberKey, side);
  if (occupant !== undefined) {
    return failure(
      draft,
      'SLOT_OCCUPIED',
      `회원 ${parentMemberKey}의 ${side} 슬롯은 회원 ${occupant}가 사용 중입니다.`,
    );
  }
  if (movingMemberKey !== null) {
    const topology = deriveTopology(draft);
    if (
      movingMemberKey === parentMemberKey ||
      getDescendantKeys(topology, movingMemberKey).has(parentMemberKey)
    ) {
      return failure(
        draft,
        'ORGANIZATION_CYCLE',
        '서브트리를 자기 자신 또는 자신의 하위 회원 아래로 이동할 수 없습니다.',
      );
    }
  }
  return parent;
}

export function addRootMember(
  draft: ProjectSetupDraft,
  memberKey: string,
): TopologyCommandOutcome {
  if (draft.members.some((member) => member.memberKey === memberKey)) {
    return failure(draft, 'MEMBER_KEY_DUPLICATE', `회원 키 ${memberKey}가 이미 존재합니다.`);
  }
  if (draft.rootMemberKey !== null && activeMember(draft, draft.rootMemberKey) !== undefined) {
    return failure(draft, 'ROOT_ALREADY_EXISTS', '활성 루트 회원이 이미 존재합니다.');
  }
  const members = [...draft.members, createMemberDraft(memberKey)];
  return success(
    replaceDraftMembers(draft, members, {
      rootMemberKey: memberKey,
      selectedMemberKey: memberKey,
    }),
    summary('ADD_ROOT'),
  );
}

export function setRootMember(
  draft: ProjectSetupDraft,
  memberKey: string,
): TopologyCommandOutcome {
  if (draft.rootMemberKey !== null && activeMember(draft, draft.rootMemberKey) !== undefined) {
    return failure(draft, 'ROOT_ALREADY_EXISTS', '활성 루트 회원이 이미 존재합니다.');
  }
  const member = requireActiveMember(draft, memberKey);
  if (isFailure(member)) {
    return member;
  }
  if (
    member.placement.parentMemberKey !== null ||
    member.placement.sideAtParent !== null
  ) {
    return failure(draft, 'SUBTREE_NOT_UNPLACED', '부모에서 먼저 분리한 서브트리만 루트로 지정할 수 있습니다.');
  }
  return success(
    replaceDraftMembers(draft, draft.members, {
      rootMemberKey: memberKey,
      selectedMemberKey: memberKey,
    }),
    summary('SET_ROOT'),
  );
}

export function addMemberToSlot(
  draft: ProjectSetupDraft,
  parentMemberKey: string,
  side: Side,
  memberKey: string,
): TopologyCommandOutcome {
  if (draft.members.some((member) => member.memberKey === memberKey)) {
    return failure(draft, 'MEMBER_KEY_DUPLICATE', `회원 키 ${memberKey}가 이미 존재합니다.`);
  }
  const target = validateTargetSlot(draft, null, parentMemberKey, side);
  if (isFailure(target)) {
    return target;
  }
  const member: MemberDraft = {
    ...createMemberDraft(memberKey),
    placement: { parentMemberKey, sideAtParent: side },
  };
  return success(
    replaceDraftMembers(draft, [...draft.members, member], {
      selectedMemberKey: memberKey,
    }),
    summary('ADD_MEMBER'),
  );
}

export function attachSubtree(
  draft: ProjectSetupDraft,
  memberKey: string,
  parentMemberKey: string,
  side: Side,
): TopologyCommandOutcome {
  const member = requireActiveMember(draft, memberKey);
  if (isFailure(member)) {
    return member;
  }
  if (member.memberKey === draft.rootMemberKey) {
    return failure(draft, 'ROOT_CANNOT_MOVE', '현재 루트 회원은 다른 슬롯에 연결할 수 없습니다.');
  }
  if (
    member.placement.parentMemberKey !== null ||
    member.placement.sideAtParent !== null
  ) {
    return failure(draft, 'SUBTREE_NOT_UNPLACED', '재배치 대기 중인 서브트리만 이 동작으로 연결할 수 있습니다.');
  }
  const target = validateTargetSlot(draft, memberKey, parentMemberKey, side);
  if (isFailure(target)) {
    return target;
  }
  const members = replaceOneMember(draft.members, memberKey, (current) => ({
    ...current,
    placement: { parentMemberKey, sideAtParent: side },
  }));
  return success(
    replaceDraftMembers(draft, members, { selectedMemberKey: memberKey }),
    summary('ATTACH_SUBTREE'),
  );
}

export function moveSubtree(
  draft: ProjectSetupDraft,
  memberKey: string,
  parentMemberKey: string,
  side: Side,
): TopologyCommandOutcome {
  const member = requireActiveMember(draft, memberKey);
  if (isFailure(member)) {
    return member;
  }
  if (member.memberKey === draft.rootMemberKey) {
    return failure(draft, 'ROOT_CANNOT_MOVE', '루트 회원은 일반 서브트리 이동으로 옮길 수 없습니다.');
  }
  if (
    member.placement.parentMemberKey === null ||
    member.placement.sideAtParent === null
  ) {
    return failure(draft, 'SUBTREE_NOT_UNPLACED', '부모가 없는 서브트리는 재배치 대기 연결 동작을 사용해야 합니다.');
  }
  const target = validateTargetSlot(draft, memberKey, parentMemberKey, side);
  if (isFailure(target)) {
    return target;
  }
  const vacatedParentMemberKey = member.placement.parentMemberKey;
  const vacatedSide = member.placement.sideAtParent;
  const members = replaceOneMember(draft.members, memberKey, (current) => ({
    ...current,
    placement: { parentMemberKey, sideAtParent: side },
  }));
  return success(
    replaceDraftMembers(draft, members, { selectedMemberKey: memberKey }),
    summary('MOVE_SUBTREE', { vacatedParentMemberKey, vacatedSide }),
  );
}

export function detachSubtree(
  draft: ProjectSetupDraft,
  memberKey: string,
): TopologyCommandOutcome {
  const member = requireActiveMember(draft, memberKey);
  if (isFailure(member)) {
    return member;
  }
  if (member.memberKey === draft.rootMemberKey) {
    return failure(draft, 'ROOT_CANNOT_MOVE', '루트는 서브트리 분리 동작으로 분리할 수 없습니다.');
  }
  if (
    member.placement.parentMemberKey === null ||
    member.placement.sideAtParent === null
  ) {
    return failure(draft, 'SUBTREE_NOT_UNPLACED', '이미 재배치 대기 중인 서브트리입니다.');
  }
  const vacatedParentMemberKey = member.placement.parentMemberKey;
  const vacatedSide = member.placement.sideAtParent;
  const members = replaceOneMember(draft.members, memberKey, (current) => ({
    ...current,
    placement: { parentMemberKey: null, sideAtParent: null },
  }));
  return success(
    replaceDraftMembers(draft, members, { selectedMemberKey: memberKey }),
    summary('DETACH_SUBTREE', {
      detachedSubtreeRoots: [memberKey],
      vacatedParentMemberKey,
      vacatedSide,
    }),
  );
}

export function excludeMember(
  draft: ProjectSetupDraft,
  memberKey: string,
  strategy: ExclusionStrategy,
): TopologyCommandOutcome {
  const member = requireActiveMember(draft, memberKey);
  if (isFailure(member)) {
    return member;
  }
  const topology = deriveTopology(draft);
  const directChildren = [...(topology.childrenByParent.get(memberKey) ?? [])];
  const isRoot = draft.rootMemberKey === memberKey;
  const vacatedParentMemberKey = member.placement.parentMemberKey;
  const vacatedSide = member.placement.sideAtParent;

  if (
    strategy === 'PROMOTE_ONLY_CHILD' &&
    (isRoot ||
      directChildren.length !== 1 ||
      vacatedParentMemberKey === null ||
      vacatedSide === null)
  ) {
    return failure(
      draft,
      'PROMOTION_NOT_AVAILABLE',
      '루트가 아니고 직계 자식이 정확히 한 명일 때만 명시적으로 승격할 수 있습니다.',
    );
  }

  const promotedMemberKey =
    strategy === 'PROMOTE_ONLY_CHILD' ? directChildren[0] ?? null : null;
  const detachedSubtreeRoots = promotedMemberKey === null ? directChildren : [];

  const members = draft.members.map((current) => {
    if (current.memberKey === memberKey) {
      return {
        ...current,
        participation: 'EXCLUDED' as const,
        placement: { parentMemberKey: null, sideAtParent: null },
      };
    }
    if (!directChildren.includes(current.memberKey)) {
      return current;
    }
    if (current.memberKey === promotedMemberKey) {
      return {
        ...current,
        placement: {
          parentMemberKey: vacatedParentMemberKey,
          sideAtParent: vacatedSide,
        },
      };
    }
    return {
      ...current,
      placement: { parentMemberKey: null, sideAtParent: null },
    };
  });

  const nextSelected =
    promotedMemberKey ?? detachedSubtreeRoots[0] ?? vacatedParentMemberKey ?? null;
  return success(
    replaceDraftMembers(draft, members, {
      rootMemberKey: isRoot ? null : draft.rootMemberKey,
      selectedMemberKey: nextSelected,
    }),
    summary('EXCLUDE_MEMBER', {
      excludedMemberKey: memberKey,
      detachedSubtreeRoots,
      promotedMemberKey,
      vacatedParentMemberKey,
      vacatedSide,
    }),
  );
}
