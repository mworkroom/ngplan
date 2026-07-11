import { describe, expect, it } from 'vitest';

import {
  activateProjectSetupBundle,
  addMemberToSlot,
  attachSubtree,
  detachSubtree,
  editMemberIdentity,
  editOpeningState,
  excludeMember,
  normalizeProjectSetup,
  validateProjectSetupDraft,
} from '../index';
import type {
  NormalizeProjectSetupOutcome,
  ProjectSetupDraft,
} from '../index';
import {
  addCompletedChild,
  completeMember,
  createDeepTreeDraft,
  createSingleMemberDraft,
  expectNormalizeSuccess,
  expectTopologySuccess,
} from './fixtures';

function expectNormalizeFailure(
  outcome: NormalizeProjectSetupOutcome,
): Extract<NormalizeProjectSetupOutcome, { readonly status: 'FAILURE' }> {
  expect(outcome.status).toBe('FAILURE');
  if (outcome.status === 'SUCCESS') {
    throw new Error('정규화 실패를 예상했지만 번들이 생성되었습니다.');
  }
  expect('bundle' in outcome).toBe(false);
  return outcome;
}

function member(draft: ProjectSetupDraft, memberKey: string) {
  return draft.members.find((candidate) => candidate.memberKey === memberKey)!;
}

describe('P2-NORM 정본 Setup Bundle', () => {
  it('P2-NORM-001 / P2-OPEN-002: 확인된 0을 포함한 유효 Draft를 정확히 정규화한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = editMemberIdentity(draft, 'A', {
      memberId: '  COMPANY-A  ',
      name: '  루트 회원  ',
      level: '1',
    });
    draft = editOpeningState(draft, 'A', {
      fortnightPvpOpeningCredit: '100',
      dailyCarryPvp: '200',
      dailyCarryLeft: '300',
      dailyCarryRight: '400',
    });
    const before = structuredClone(draft);
    const outcome = expectNormalizeSuccess(normalizeProjectSetup(draft));

    expect(outcome.bundle).toEqual({
      project: {
        projectId: 'project-1',
        title: '2026년 7월 상반기 직급 플랜',
        period: { year: 2026, month: 7, half: 'FIRST_HALF' },
        timezone: 'Asia/Seoul',
        projectStatus: 'IN_PROGRESS',
        organizationSnapshotId: 'snapshot-1',
      },
      organization: {
        snapshotId: 'snapshot-1',
        members: [
          {
            memberKey: 'A',
            memberId: 'COMPANY-A',
            name: '루트 회원',
            level: 1,
            parentMemberKey: null,
            sideAtParent: null,
          },
          {
            memberKey: 'B',
            memberId: 'ID-B',
            name: '회원 B',
            level: 3,
            parentMemberKey: 'A',
            sideAtParent: 'LEFT',
          },
        ],
        openingStateByMember: {
          A: {
            fortnightPvpOpeningCredit: 100,
            dailyCarryPvp: 200,
            dailyCarryLeft: 300,
            dailyCarryRight: 400,
          },
          B: {
            fortnightPvpOpeningCredit: 0,
            dailyCarryPvp: 0,
            dailyCarryLeft: 0,
            dailyCarryRight: 0,
          },
        },
      },
    });
    expect(draft).toEqual(before);
    expect(outcome.validation.isReady).toBe(true);
    expect(outcome.warnings).toEqual([]);
    expect('allocations' in outcome.bundle).toBe(false);
    expect('allocations' in outcome.bundle.organization).toBe(false);
  });

  it('번들 전체와 모든 중첩 프로젝트·기간·회원·시작값을 심층 동결한다', () => {
    const bundle = expectNormalizeSuccess(
      normalizeProjectSetup(createDeepTreeDraft()),
    ).bundle;

    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.project)).toBe(true);
    expect(Object.isFrozen(bundle.project.period)).toBe(true);
    expect(Object.isFrozen(bundle.organization)).toBe(true);
    expect(Object.isFrozen(bundle.organization.members)).toBe(true);
    expect(bundle.organization.members.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(bundle.organization.openingStateByMember)).toBe(true);
    expect(
      Object.values(bundle.organization.openingStateByMember).every(Object.isFrozen),
    ).toBe(true);

    expect(() => {
      (bundle.project as { title: string }).title = '변조';
    }).toThrow(TypeError);
    expect(() => {
      (bundle.organization.members as unknown as { memberId: string }[])[0]!.memberId =
        '변조';
    }).toThrow(TypeError);
  });

  it("'__proto__' 회원 키의 시작값을 own property로 안전하게 보존한다", () => {
    const outcome = expectNormalizeSuccess(
      normalizeProjectSetup(createSingleMemberDraft('__proto__')),
    );
    const openings = outcome.bundle.organization.openingStateByMember;

    expect(Object.getPrototypeOf(openings)).toBeNull();
    expect(Object.hasOwn(openings, '__proto__')).toBe(true);
    expect(openings.__proto__).toEqual({
      fortnightPvpOpeningCredit: 0,
      dailyCarryPvp: 0,
      dailyCarryLeft: 0,
      dailyCarryRight: 0,
    });
  });

  it('P2-NORM-003: 중복 이름 경고만 있으면 번들을 만들고 경고를 보존한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = completeMember(draft, 'A', { name: '같은 이름' });
    draft = completeMember(draft, 'B', { name: '같은 이름' });
    const outcome = expectNormalizeSuccess(normalizeProjectSetup(draft));

    expect(outcome.warnings).toEqual([
      expect.objectContaining({
        code: 'MEMBER_NAME_DUPLICATE',
        severity: 'WARNING',
      }),
    ]);
    expect(outcome.validation.isReady).toBe(true);
    expect(outcome.bundle.organization.members).toHaveLength(2);
  });

  it('여러 회원의 회사 회원 ID가 비어 있어도 번들을 만든다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = editMemberIdentity(draft, 'A', { memberId: '' });
    draft = editMemberIdentity(draft, 'B', { memberId: '' });

    const outcome = expectNormalizeSuccess(normalizeProjectSetup(draft));

    expect(outcome.bundle.organization.members.map(({ memberId }) => memberId)).toEqual([
      '',
      '',
    ]);
    expect(outcome.validation.isReady).toBe(true);
  });

  it('제외 회원은 members와 openingStateByMember에서 모두 빠지고 후손은 남는다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = addCompletedChild(draft, 'B', 'RIGHT', 'D');
    const excluded = expectTopologySuccess(
      excludeMember(draft, 'B', 'PROMOTE_ONLY_CHILD'),
    ).draft;
    const excludedWithInvalidData = editMemberIdentity(excluded, 'B', {
      memberId: '',
      name: '',
      level: '',
    });
    const outcome = expectNormalizeSuccess(
      normalizeProjectSetup(excludedWithInvalidData),
    );

    expect(outcome.bundle.organization.members.map(({ memberKey }) => memberKey)).toEqual([
      'A',
      'D',
    ]);
    expect(Object.hasOwn(outcome.bundle.organization.openingStateByMember, 'B')).toBe(
      false,
    );
    expect(member(excludedWithInvalidData, 'D').placement.parentMemberKey).toBe('A');
  });

  it('P2-NORM-004: 반복 검증은 Draft를 바꾸지 않고 결정적인 결과를 만든다', () => {
    const draft = createDeepTreeDraft();
    const before = structuredClone(draft);
    const first = expectNormalizeSuccess(normalizeProjectSetup(draft));
    const second = expectNormalizeSuccess(normalizeProjectSetup(draft));

    expect(first).toEqual(second);
    expect(first.bundle).not.toBe(second.bundle);
    expect(draft).toEqual(before);
  });
});

describe('P2-NORM-002 오류에는 부분 번들이 없다', () => {
  it('중복 회사 회원 ID를 정본 검증 위치와 함께 거부한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = completeMember(draft, 'B', { memberId: 'ID-A' });
    const outcome = expectNormalizeFailure(normalizeProjectSetup(draft));

    expect(outcome.errors).toContainEqual(
      expect.objectContaining({
        code: 'MEMBER_ID_DUPLICATE',
        location: expect.objectContaining({ memberKey: 'B', field: 'memberId' }),
      }),
    );
  });

  it('P2-QUEUE-002: 큐가 비어 있지 않으면 정본 후보를 발행하지 않는다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    const queued = expectTopologySuccess(detachSubtree(draft, 'B')).draft;
    const outcome = expectNormalizeFailure(normalizeProjectSetup(queued));

    expect(outcome.errors).toContainEqual(
      expect.objectContaining({
        code: 'REASSIGNMENT_REQUIRED',
        location: expect.objectContaining({ memberKey: 'B' }),
      }),
    );
    expect(outcome.validation.reassignmentQueue.map((entry) => entry.memberKey)).toEqual([
      'B',
    ]);
  });

  it('선택 루트가 없거나 활성 회원이 아니면 발행하지 않는다', () => {
    const draft = createSingleMemberDraft('A');
    const noRoot = { ...draft, rootMemberKey: null };
    const missingRoot = { ...draft, rootMemberKey: 'UNKNOWN' };

    for (const invalid of [noRoot, missingRoot]) {
      const outcome = expectNormalizeFailure(normalizeProjectSetup(invalid));
      expect(outcome.errors).toContainEqual(
        expect.objectContaining({ code: 'SELECTED_ROOT_INVALID' }),
      );
    }
  });

  it('확인 안 된 시작값과 잘못된 숫자는 필드 오류와 함께 발행을 막는다', () => {
    let draft = createSingleMemberDraft('A');
    draft = editOpeningState(draft, 'A', {
      dailyCarryPvp: '-1',
      dailyCarryLeft: '1.5',
      dailyCarryRight: 'text',
      fortnightPvpOpeningCredit: String(Number.MAX_SAFE_INTEGER + 1),
      openingStateConfirmed: false,
    });
    const outcome = expectNormalizeFailure(normalizeProjectSetup(draft));

    expect(outcome.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'PV_NEGATIVE',
        'PV_NOT_INTEGER',
        'PV_INVALID',
        'PV_OUT_OF_RANGE',
        'MEMBER_OPENING_STATE_UNCONFIRMED',
      ]),
    );
  });

  it('경고와 오류가 함께 있으면 경고를 보존하되 번들은 만들지 않는다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = completeMember(draft, 'A', { name: '같은 이름' });
    draft = completeMember(draft, 'B', { name: '같은 이름' });
    draft = editOpeningState(draft, 'B', { openingStateConfirmed: false });
    const outcome = expectNormalizeFailure(normalizeProjectSetup(draft));

    expect(outcome.errors).toContainEqual(
      expect.objectContaining({ code: 'MEMBER_OPENING_STATE_UNCONFIRMED' }),
    );
    expect(outcome.warnings).toContainEqual(
      expect.objectContaining({ code: 'MEMBER_NAME_DUPLICATE' }),
    );
  });

  it('점유 중복·부모 누락·순환 같은 정본 토폴로지도 Phase 1 검증으로 거부한다', () => {
    const base = createDeepTreeDraft();
    const variants: ProjectSetupDraft[] = [
      {
        ...base,
        members: base.members.map((candidate) =>
          candidate.memberKey === 'C'
            ? {
                ...candidate,
                placement: { parentMemberKey: 'A', sideAtParent: 'LEFT' },
              }
            : candidate,
        ),
      },
      {
        ...base,
        members: base.members.map((candidate) =>
          candidate.memberKey === 'C'
            ? {
                ...candidate,
                placement: { parentMemberKey: 'UNKNOWN', sideAtParent: 'RIGHT' },
              }
            : candidate,
        ),
      },
      {
        ...base,
        members: base.members.map((candidate) =>
          candidate.memberKey === 'B'
            ? {
                ...candidate,
                placement: { parentMemberKey: 'D', sideAtParent: 'LEFT' },
              }
            : candidate,
        ),
      },
    ];
    const expectedCodes = [
      'PARENT_SIDE_OCCUPIED',
      'PARENT_NOT_FOUND',
      'ORGANIZATION_CYCLE',
    ] as const;

    variants.forEach((variant, index) => {
      const outcome = expectNormalizeFailure(normalizeProjectSetup(variant));
      expect(outcome.errors.map((issue) => issue.code)).toContain(expectedCodes[index]);
    });
  });

  it('한 활성 비루트 회원이 배치되지 않으면 루트로 오인하지 않고 큐 오류를 낸다', () => {
    const root = createSingleMemberDraft('A');
    const added = expectTopologySuccess(addMemberToSlot(root, 'A', 'LEFT', 'B')).draft;
    const completed = completeMember(added, 'B');
    const queued = expectTopologySuccess(detachSubtree(completed, 'B')).draft;

    expect(validateProjectSetupDraft(queued).isReady).toBe(false);
    expectNormalizeFailure(normalizeProjectSetup(queued));
  });
});

describe('P2-READY 활성 번들 무효화', () => {
  it('P2-READY-001: 완료 뒤 제외·분리·재연결 같은 구조 변경은 활성 번들을 즉시 지운다', () => {
    const ready = createDeepTreeDraft();
    const normalized = expectNormalizeSuccess(normalizeProjectSetup(ready));
    const active = activateProjectSetupBundle(ready, normalized.bundle);
    const excluded = expectTopologySuccess(
      excludeMember(active, 'C', 'DETACH_CHILDREN'),
    );

    expect(excluded.draft.activeBundle).toBeNull();

    const detachedActive = activateProjectSetupBundle(ready, normalized.bundle);
    const detached = expectTopologySuccess(detachSubtree(detachedActive, 'B'));
    expect(detached.draft.activeBundle).toBeNull();

    const reactivatedQueued = activateProjectSetupBundle(
      detached.draft,
      normalized.bundle,
    );
    const attached = expectTopologySuccess(
      attachSubtree(reactivatedQueued, 'B', 'C', 'LEFT'),
    );
    expect(attached.draft.activeBundle).toBeNull();
  });
});
