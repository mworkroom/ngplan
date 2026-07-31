import { describe, expect, it } from 'vitest';

import {
  activateProjectSetupBundle,
  addMemberToSlot,
  addRootMember,
  attachSubtree,
  deriveCanonicalMemberSequence,
  deriveTopology,
  detachSubtree,
  excludeMember,
  getChildSlotState,
  getDescendantKeys,
  listEmptySlots,
  moveSubtree,
  setRootMember,
  topologySlotKey,
} from '../index';
import type {
  ProjectSetupDraft,
  TopologyCommandErrorCode,
  TopologyCommandOutcome,
} from '../index';
import {
  addCompletedChild,
  createDeepTreeDraft,
  createEmptyDraft,
  createSingleMemberDraft,
  expectTopologySuccess,
  normalizedBundle,
} from './fixtures';

function expectFailure(
  outcome: TopologyCommandOutcome,
  original: ProjectSetupDraft,
  code: TopologyCommandErrorCode,
): void {
  expect(outcome.status).toBe('FAILURE');
  if (outcome.status === 'FAILURE') {
    expect(outcome.error.code).toBe(code);
    expect(outcome.draft).toBe(original);
  }
}

function member(draft: ProjectSetupDraft, memberKey: string) {
  return draft.members.find((candidate) => candidate.memberKey === memberKey)!;
}

describe('P2-CARD 명시적 좌·우 슬롯', () => {
  it('P2-NORM-005: 정본 회원 순서는 입력 배열과 무관하게 root-first LEFT-before-RIGHT다', () => {
    const members = [
      {
        memberKey: 'C',
        memberId: '',
        name: '가장 먼저 보이는 이름',
        pvpTarget: 700 as const,
        fortnightSideTarget: 2500 as const,
        sheetMarker: 'NONE' as const,
        parentMemberKey: 'A',
        sideAtParent: 'RIGHT' as const,
      },
      {
        memberKey: 'D',
        memberId: '',
        name: 'D',
        pvpTarget: 700 as const,
        fortnightSideTarget: 2500 as const,
        sheetMarker: 'NONE' as const,
        parentMemberKey: 'B',
        sideAtParent: 'LEFT' as const,
      },
      {
        memberKey: 'B',
        memberId: '',
        name: 'B',
        pvpTarget: 700 as const,
        fortnightSideTarget: 2500 as const,
        sheetMarker: 'NONE' as const,
        parentMemberKey: 'A',
        sideAtParent: 'LEFT' as const,
      },
      {
        memberKey: 'A',
        memberId: '',
        name: '가장 나중에 보이는 이름',
        pvpTarget: 700 as const,
        fortnightSideTarget: 2500 as const,
        sheetMarker: 'NONE' as const,
        parentMemberKey: null,
        sideAtParent: null,
      },
    ];

    const sequence = deriveCanonicalMemberSequence({ members });

    expect(sequence).toEqual(['A', 'B', 'D', 'C']);
    expect(Object.isFrozen(sequence)).toBe(true);
    expect(members.map(({ memberKey }) => memberKey)).toEqual(['C', 'D', 'B', 'A']);
  });

  it('P2-CARD-001/003: 루트와 좌·우 회원을 추가하고 SELF를 CHILD로 파생한다', () => {
    const rootOutcome = expectTopologySuccess(addRootMember(createEmptyDraft(), 'A'));
    const leftOutcome = expectTopologySuccess(
      addMemberToSlot(rootOutcome.draft, 'A', 'LEFT', 'B'),
    );
    const rightOutcome = expectTopologySuccess(
      addMemberToSlot(leftOutcome.draft, 'A', 'RIGHT', 'C'),
    );
    const topology = deriveTopology(rightOutcome.draft);

    expect(rootOutcome.summary.command).toBe('ADD_ROOT');
    expect(leftOutcome.summary.command).toBe('ADD_MEMBER');
    expect(rightOutcome.summary.command).toBe('ADD_MEMBER');
    expect(topology.traversal).toEqual(['A', 'B', 'C']);
    expect(getChildSlotState(topology, 'A', 'LEFT')).toEqual({
      parentMemberKey: 'A',
      side: 'LEFT',
      kind: 'CHILD',
      childMemberKey: 'B',
    });
    expect(getChildSlotState(topology, 'B', 'RIGHT').kind).toBe('SELF');
    expect(member(rightOutcome.draft, 'B').openingState).toMatchObject({
      cumulativePvp: '0',
      openingStateConfirmed: false,
    });
    expect(topologySlotKey('A', 'LEFT')).toBe('A\u0000LEFT');
    expect(listEmptySlots(rightOutcome.draft)).toEqual([
      { parentMemberKey: 'B', side: 'LEFT' },
      { parentMemberKey: 'B', side: 'RIGHT' },
      { parentMemberKey: 'C', side: 'LEFT' },
      { parentMemberKey: 'C', side: 'RIGHT' },
    ]);
  });

  it('P2-CARD-002: 중복 키·기존 루트·없는 부모·점유 슬롯 실패가 모두 원본 참조를 보존한다', () => {
    const root = expectTopologySuccess(addRootMember(createEmptyDraft(), 'A')).draft;
    const left = expectTopologySuccess(addMemberToSlot(root, 'A', 'LEFT', 'B')).draft;

    expectFailure(addRootMember(root, 'A'), root, 'MEMBER_KEY_DUPLICATE');
    expectFailure(addRootMember(root, 'NEW'), root, 'ROOT_ALREADY_EXISTS');
    expectFailure(
      addMemberToSlot(left, 'A', 'RIGHT', 'B'),
      left,
      'MEMBER_KEY_DUPLICATE',
    );
    expectFailure(
      addMemberToSlot(left, 'UNKNOWN', 'RIGHT', 'C'),
      left,
      'MEMBER_NOT_FOUND',
    );
    expectFailure(
      addMemberToSlot(left, 'A', 'LEFT', 'C'),
      left,
      'SLOT_OCCUPIED',
    );
  });

  it('제외된 부모 아래에는 새 회원을 추가하지 않는다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'B', 'DETACH_CHILDREN'),
    ).draft;

    expectFailure(
      addMemberToSlot(excluded, 'B', 'LEFT', 'C'),
      excluded,
      'MEMBER_NOT_ACTIVE',
    );
  });
});

describe('P2-QUEUE 분리·루트 지정·재연결', () => {
  it('P2-CARD-004 / P2-QUEUE-001: 분리한 서브트리를 빈 + 슬롯에 다시 연결한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = addCompletedChild(draft, 'A', 'RIGHT', 'C');
    const detached = expectTopologySuccess(detachSubtree(draft, 'B'));
    const detachedTopology = deriveTopology(detached.draft);

    expect(detached.summary).toMatchObject({
      command: 'DETACH_SUBTREE',
      detachedSubtreeRoots: ['B'],
      vacatedParentMemberKey: 'A',
      vacatedSide: 'LEFT',
    });
    expect(getChildSlotState(detachedTopology, 'A', 'LEFT').kind).toBe('SELF');
    expect(detachedTopology.reassignmentQueue.map((entry) => entry.memberKey)).toEqual([
      'B',
    ]);

    const attached = expectTopologySuccess(
      attachSubtree(detached.draft, 'B', 'C', 'LEFT'),
    );
    expect(attached.summary.command).toBe('ATTACH_SUBTREE');
    expect(member(attached.draft, 'B').placement).toEqual({
      parentMemberKey: 'C',
      sideAtParent: 'LEFT',
    });
    expect(deriveTopology(attached.draft).reassignmentQueue).toEqual([]);
  });

  it('루트 제외 뒤 대기 서브트리를 새 루트로 명시 지정한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    const excludedRoot = expectTopologySuccess(
      excludeMember(draft, 'A', 'DETACH_CHILDREN'),
    ).draft;
    const rooted = expectTopologySuccess(setRootMember(excludedRoot, 'B'));

    expect(rooted.summary.command).toBe('SET_ROOT');
    expect(rooted.draft.rootMemberKey).toBe('B');
    expect(deriveTopology(rooted.draft).reassignmentQueue).toEqual([]);
  });

  it('루트 지정 실패는 활성 루트·없는/제외된/배치된 회원마다 원본을 보존한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    expectFailure(setRootMember(draft, 'B'), draft, 'ROOT_ALREADY_EXISTS');

    const withoutRoot = { ...draft, rootMemberKey: null };
    expectFailure(setRootMember(withoutRoot, 'UNKNOWN'), withoutRoot, 'MEMBER_NOT_FOUND');
    expectFailure(setRootMember(withoutRoot, 'B'), withoutRoot, 'SUBTREE_NOT_UNPLACED');

    const excludedB = expectTopologySuccess(
      excludeMember(draft, 'B', 'DETACH_CHILDREN'),
    ).draft;
    const noRootWithExcluded = { ...excludedB, rootMemberKey: null };
    expectFailure(
      setRootMember(noRootWithExcluded, 'B'),
      noRootWithExcluded,
      'MEMBER_NOT_ACTIVE',
    );
  });

  it('재연결 실패는 루트·배치됨·점유·순환·없는/제외된 회원에서 원본을 보존한다', () => {
    let draft = createDeepTreeDraft();
    expectFailure(attachSubtree(draft, 'A', 'C', 'LEFT'), draft, 'ROOT_CANNOT_MOVE');
    expectFailure(
      attachSubtree(draft, 'B', 'C', 'LEFT'),
      draft,
      'SUBTREE_NOT_UNPLACED',
    );
    expectFailure(
      attachSubtree(draft, 'UNKNOWN', 'C', 'LEFT'),
      draft,
      'MEMBER_NOT_FOUND',
    );

    const detached = expectTopologySuccess(detachSubtree(draft, 'B')).draft;
    expectFailure(
      attachSubtree(detached, 'B', 'A', 'RIGHT'),
      detached,
      'SLOT_OCCUPIED',
    );
    expectFailure(
      attachSubtree(detached, 'B', 'E', 'LEFT'),
      detached,
      'ORGANIZATION_CYCLE',
    );

    const excludedC = expectTopologySuccess(
      excludeMember(detached, 'C', 'DETACH_CHILDREN'),
    ).draft;
    expectFailure(
      attachSubtree(excludedC, 'B', 'C', 'LEFT'),
      excludedC,
      'MEMBER_NOT_ACTIVE',
    );
    expectFailure(
      attachSubtree(excludedC, 'C', 'A', 'RIGHT'),
      excludedC,
      'MEMBER_NOT_ACTIVE',
    );
  });
});

describe('P2-MOVE 원자적 서브트리 이동', () => {
  it('P2-MOVE-001: 서브트리 전체를 옮기고 내부 연결을 그대로 둔다', () => {
    const ready = createDeepTreeDraft();
    const active = activateProjectSetupBundle(ready, normalizedBundle(ready));
    const moved = expectTopologySuccess(moveSubtree(active, 'B', 'C', 'LEFT'));

    expect(moved.summary).toMatchObject({
      command: 'MOVE_SUBTREE',
      vacatedParentMemberKey: 'A',
      vacatedSide: 'LEFT',
    });
    expect(moved.draft.activeBundle).toBeNull();
    expect(member(moved.draft, 'B').placement).toEqual({
      parentMemberKey: 'C',
      sideAtParent: 'LEFT',
    });
    expect(member(moved.draft, 'D').placement.parentMemberKey).toBe('B');
    expect(member(moved.draft, 'E').placement.parentMemberKey).toBe('D');
    expect(getDescendantKeys(deriveTopology(moved.draft), 'B')).toEqual(
      new Set(['D', 'E']),
    );
  });

  it('P2-MOVE-002: 루트·대기·점유·자기/하위 이동을 거부하고 원본을 보존한다', () => {
    const draft = createDeepTreeDraft();
    expectFailure(moveSubtree(draft, 'A', 'C', 'LEFT'), draft, 'ROOT_CANNOT_MOVE');
    expectFailure(moveSubtree(draft, 'B', 'A', 'RIGHT'), draft, 'SLOT_OCCUPIED');
    expectFailure(moveSubtree(draft, 'B', 'B', 'RIGHT'), draft, 'ORGANIZATION_CYCLE');
    expectFailure(moveSubtree(draft, 'B', 'E', 'LEFT'), draft, 'ORGANIZATION_CYCLE');
    expectFailure(
      moveSubtree(draft, 'UNKNOWN', 'C', 'LEFT'),
      draft,
      'MEMBER_NOT_FOUND',
    );

    const detached = expectTopologySuccess(detachSubtree(draft, 'B')).draft;
    expectFailure(
      moveSubtree(detached, 'B', 'C', 'LEFT'),
      detached,
      'SUBTREE_NOT_UNPLACED',
    );
    const excluded = expectTopologySuccess(
      excludeMember(detached, 'C', 'DETACH_CHILDREN'),
    ).draft;
    expectFailure(moveSubtree(excluded, 'C', 'A', 'RIGHT'), excluded, 'MEMBER_NOT_ACTIVE');
  });

  it('분리 실패도 루트·이미 대기·없는/제외된 회원에서 원본을 보존한다', () => {
    const draft = createDeepTreeDraft();
    expectFailure(detachSubtree(draft, 'A'), draft, 'ROOT_CANNOT_MOVE');
    expectFailure(detachSubtree(draft, 'UNKNOWN'), draft, 'MEMBER_NOT_FOUND');
    const detached = expectTopologySuccess(detachSubtree(draft, 'B')).draft;
    expectFailure(detachSubtree(detached, 'B'), detached, 'SUBTREE_NOT_UNPLACED');
    const excluded = expectTopologySuccess(
      excludeMember(detached, 'C', 'DETACH_CHILDREN'),
    ).draft;
    expectFailure(detachSubtree(excluded, 'C'), excluded, 'MEMBER_NOT_ACTIVE');
  });
});

describe('P2-EXCL 비파괴 제외와 재배치', () => {
  it('P2-EXCL-001: 자식 없는 회원만 제외하고 이전 슬롯을 SELF로 만든다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'B', 'DETACH_CHILDREN'),
    );

    expect(excluded.summary).toMatchObject({
      excludedMemberKey: 'B',
      detachedSubtreeRoots: [],
      promotedMemberKey: null,
      vacatedParentMemberKey: 'A',
      vacatedSide: 'LEFT',
    });
    expect(member(excluded.draft, 'B').participation).toBe('EXCLUDED');
    expect(getChildSlotState(deriveTopology(excluded.draft), 'A', 'LEFT').kind).toBe(
      'SELF',
    );
  });

  it('P2-EXCL-002: 직계 자식 하나를 명시적으로 이전 슬롯에 승격한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = addCompletedChild(draft, 'B', 'RIGHT', 'D');
    draft = addCompletedChild(draft, 'D', 'LEFT', 'E');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'B', 'PROMOTE_ONLY_CHILD'),
    );

    expect(excluded.summary.promotedMemberKey).toBe('D');
    expect(member(excluded.draft, 'D').placement).toEqual({
      parentMemberKey: 'A',
      sideAtParent: 'LEFT',
    });
    expect(member(excluded.draft, 'E').placement).toEqual({
      parentMemberKey: 'D',
      sideAtParent: 'LEFT',
    });
    expect(deriveTopology(excluded.draft).reassignmentQueue).toEqual([]);
  });

  it('P2-EXCL-003/005: 한 자식과 깊은 후손을 내부 연결 그대로 큐에 둔다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = addCompletedChild(draft, 'B', 'RIGHT', 'D');
    draft = addCompletedChild(draft, 'D', 'LEFT', 'E');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'B', 'DETACH_CHILDREN'),
    );

    expect(excluded.summary.detachedSubtreeRoots).toEqual(['D']);
    expect(member(excluded.draft, 'D').placement).toEqual({
      parentMemberKey: null,
      sideAtParent: null,
    });
    expect(member(excluded.draft, 'E').placement.parentMemberKey).toBe('D');
    expect(deriveTopology(excluded.draft).reassignmentQueue.map((entry) => entry.memberKey)).toEqual([
      'D',
    ]);
  });

  it('P2-EXCL-004: 두 자식은 자동 선택 없이 각각 보존해 큐에 둔다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = addCompletedChild(draft, 'B', 'LEFT', 'D');
    draft = addCompletedChild(draft, 'B', 'RIGHT', 'F');
    draft = addCompletedChild(draft, 'D', 'RIGHT', 'E');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'B', 'DETACH_CHILDREN'),
    );

    expect(excluded.summary.promotedMemberKey).toBeNull();
    expect(excluded.summary.detachedSubtreeRoots).toEqual(['D', 'F']);
    expect(member(excluded.draft, 'E').placement.parentMemberKey).toBe('D');
    expect(deriveTopology(excluded.draft).reassignmentQueue.map((entry) => entry.memberKey)).toEqual([
      'D',
      'F',
    ]);
  });

  it('P2-EXCL-006: 루트 제외는 루트를 비우고 양쪽 서브트리를 큐에 둔다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = addCompletedChild(draft, 'A', 'RIGHT', 'C');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'A', 'DETACH_CHILDREN'),
    );

    expect(excluded.draft.rootMemberKey).toBeNull();
    expect(excluded.summary.detachedSubtreeRoots).toEqual(['B', 'C']);
    expect(deriveTopology(excluded.draft).reassignmentQueue.map((entry) => entry.memberKey)).toEqual([
      'B',
      'C',
    ]);
  });

  it('승격 불가와 미존재/이미 제외 실패는 항상 원본 Draft 참조를 보존한다', () => {
    let leafDraft = createSingleMemberDraft('A');
    leafDraft = addCompletedChild(leafDraft, 'A', 'LEFT', 'B');
    expectFailure(
      excludeMember(leafDraft, 'B', 'PROMOTE_ONLY_CHILD'),
      leafDraft,
      'PROMOTION_NOT_AVAILABLE',
    );
    expectFailure(
      excludeMember(leafDraft, 'A', 'PROMOTE_ONLY_CHILD'),
      leafDraft,
      'PROMOTION_NOT_AVAILABLE',
    );

    let twoChildren = addCompletedChild(leafDraft, 'B', 'LEFT', 'D');
    twoChildren = addCompletedChild(twoChildren, 'B', 'RIGHT', 'E');
    expectFailure(
      excludeMember(twoChildren, 'B', 'PROMOTE_ONLY_CHILD'),
      twoChildren,
      'PROMOTION_NOT_AVAILABLE',
    );

    const queuedB = expectTopologySuccess(detachSubtree(twoChildren, 'B')).draft;
    expectFailure(
      excludeMember(queuedB, 'B', 'PROMOTE_ONLY_CHILD'),
      queuedB,
      'PROMOTION_NOT_AVAILABLE',
    );
    expectFailure(
      excludeMember(leafDraft, 'UNKNOWN', 'DETACH_CHILDREN'),
      leafDraft,
      'MEMBER_NOT_FOUND',
    );
    const excludedB = expectTopologySuccess(
      excludeMember(leafDraft, 'B', 'DETACH_CHILDREN'),
    ).draft;
    expectFailure(
      excludeMember(excludedB, 'B', 'DETACH_CHILDREN'),
      excludedB,
      'MEMBER_NOT_ACTIVE',
    );
  });

  it('자식 없는 단독 루트 제외 뒤 선택 회원도 null로 정리한다', () => {
    const draft = createSingleMemberDraft('A');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'A', 'DETACH_CHILDREN'),
    );

    expect(excluded.draft.rootMemberKey).toBeNull();
    expect(excluded.draft.selectedMemberKey).toBeNull();
    expect(excluded.summary.detachedSubtreeRoots).toEqual([]);
  });
});

describe('파생 토폴로지의 방어적 순회', () => {
  it('잘못된 중복 슬롯도 결정적 순서로 파생하고 순환 후손 순회를 종료한다', () => {
    const base = createDeepTreeDraft();
    const malformed = {
      ...base,
      members: base.members.map((candidate) => {
        if (candidate.memberKey === 'C') {
          return {
            ...candidate,
            placement: { parentMemberKey: 'A', sideAtParent: 'LEFT' as const },
          };
        }
        if (candidate.memberKey === 'B') {
          return {
            ...candidate,
            placement: { parentMemberKey: 'D', sideAtParent: 'LEFT' as const },
          };
        }
        if (candidate.memberKey === 'D') {
          return {
            ...candidate,
            placement: { parentMemberKey: 'B', sideAtParent: 'LEFT' as const },
          };
        }
        return candidate;
      }),
    };
    const topology = deriveTopology(malformed);

    expect(topology.childBySlot.get(topologySlotKey('A', 'LEFT'))).toBe('C');
    expect(topology.traversal).toEqual(['A', 'C']);
    expect(getDescendantKeys(topology, 'B')).toEqual(new Set(['D', 'B', 'E']));
  });

  it('같은 방향의 중복 자식 키도 로캘과 무관한 키 순서로 정렬한다', () => {
    const draft = createDeepTreeDraft();
    const root = member(draft, 'A');
    const b = member(draft, 'B');
    const c = member(draft, 'C');
    const malformed = {
      ...draft,
      members: [
        root,
        { ...c, placement: { parentMemberKey: 'A', sideAtParent: 'LEFT' as const } },
        b,
        { ...b },
      ],
    };

    expect(deriveTopology(malformed).childrenByParent.get('A')).toEqual([
      'B',
      'B',
      'C',
    ]);
  });
});
