import { describe, expect, it } from 'vitest';

import { derivePeriod } from '../../../engine';
import {
  activateProjectSetupBundle,
  addRootMember,
  childSlotId,
  clearActiveProjectSetupBundle,
  createMemberDraft,
  createOpeningStateDraft,
  createProjectDraft,
  deriveDefaultProjectTitle,
  draftHasMemberData,
  editMemberIdentity,
  editOpeningState,
  editProjectPeriod,
  editProjectTitle,
  memberCardId,
  memberFieldId,
  parseDraftPvpTarget,
  parseDraftPeriod,
  parseDraftPv,
  parseMemberOpeningState,
  projectFieldId,
  queueEntryId,
  restoreDerivedProjectTitle,
  selectMember,
  validateProjectSetupDraft,
  validationIssueTargetId,
  validationLocationTargetId,
} from '../index';
import {
  createProjectSetupValidation,
  fromCanonicalIssue,
} from '../validate-draft';
import type {
  IdGenerator,
  ProjectSetupIssue,
  ProjectSetupIssueLocation,
} from '../index';
import {
  addCompletedChild,
  completeMember,
  createEmptyDraft,
  createSingleMemberDraft,
  expectTopologySuccess,
  fixedIdGenerator,
  normalizedBundle,
} from './fixtures';

describe('P2-PROJ 프로젝트 Draft', () => {
  it('P2-PROJ-001: 2026년 7월 상반기를 새 인메모리 프로젝트로 만든다', () => {
    const draft = createEmptyDraft();

    expect(draft).toMatchObject({
      projectId: 'project-1',
      organizationSnapshotId: 'snapshot-1',
      year: '2026',
      month: '7',
      half: 'FIRST_HALF',
      title: '202607A',
      titleSource: 'DERIVED',
      timezone: 'Asia/Seoul',
      projectStatus: 'IN_PROGRESS',
      rootMemberKey: null,
      selectedMemberKey: null,
      activeBundle: null,
    });
    expect(draft.members).toEqual([]);
    expect(draftHasMemberData(draft)).toBe(false);
  });

  it('P2-PROJ-003: 새 프로젝트끼리 회원·조직·시작값을 공유하거나 복사하지 않는다', () => {
    let counter = 0;
    const generateId: IdGenerator = (kind) => `${kind}-${++counter}`;
    const first = createProjectDraft({
      year: '2026',
      month: '7',
      half: 'FIRST_HALF',
      generateId,
    });
    const populated = expectTopologySuccess(addRootMember(first, 'A')).draft;
    const second = createProjectDraft({
      year: 2026,
      month: 8,
      half: 'SECOND_HALF',
      generateId,
    });

    expect(draftHasMemberData(populated)).toBe(true);
    expect(second.members).toEqual([]);
    expect(second.members).not.toBe(first.members);
    expect(second.rootMemberKey).toBeNull();
    expect(second.activeBundle).toBeNull();
    expect(second.projectId).not.toBe(first.projectId);
    expect(second.organizationSnapshotId).not.toBe(first.organizationSnapshotId);
  });

  it('P2-PROJ-004: 파생 제목은 기간과 함께 바뀌고 수동 제목은 보존된다', () => {
    const initial = createEmptyDraft();
    const changed = editProjectPeriod(initial, {
      year: '2028',
      month: '2',
      half: 'SECOND_HALF',
    });
    const manual = editProjectTitle(changed, '직접 정한 제목');
    const laterPeriod = editProjectPeriod(manual, { month: '3' });
    const restored = restoreDerivedProjectTitle(laterPeriod);

    expect(changed.title).toBe('202802B');
    expect(laterPeriod.title).toBe('직접 정한 제목');
    expect(laterPeriod.titleSource).toBe('MANUAL');
    expect(restored).toMatchObject({
      title: '202803B',
      titleSource: 'DERIVED',
    });
    expect(deriveDefaultProjectTitle('2026', '11', 'FIRST_HALF')).toBe(
      '202611A',
    );
  });

  it.each([
    ['2027', '2', 'SECOND_HALF', '2027-02-28'],
    ['2028', '2', 'SECOND_HALF', '2028-02-29'],
    ['2026', '4', 'SECOND_HALF', '2026-04-30'],
    ['2026', '7', 'SECOND_HALF', '2026-07-31'],
  ] as const)(
    'P2-PROJ-002: 28/29/30/31일 월의 기간 계약을 유지한다: %s-%s',
    (year, month, half, expectedEndDate) => {
      const draft = editProjectPeriod(createEmptyDraft(), { year, month, half });
      const period = parseDraftPeriod(draft);

      expect(period).not.toBeNull();
      expect(derivePeriod(period!).endDate).toBe(expectedEndDate);
    },
  );

  it('의미가 같은 프로젝트 편집은 원본 Draft 참조를 보존한다', () => {
    const draft = createEmptyDraft();
    const manual = editProjectTitle(draft, draft.title);

    expect(editProjectPeriod(draft, {})).toBe(draft);
    expect(editProjectTitle(manual, manual.title)).toBe(manual);
    expect(restoreDerivedProjectTitle(draft)).toBe(draft);
  });
});

describe('P2-OPEN / P2-MEMBER 회원 편집과 파싱', () => {
  it('P2-OPEN-001: 새 회원의 네 시작값은 독립된 0 문자열이며 미확인이다', () => {
    const firstOpening = createOpeningStateDraft();
    const secondOpening = createOpeningStateDraft();
    const member = createMemberDraft('A');

    expect(firstOpening).toEqual({
      fortnightPvpOpeningCredit: '0',
      dailyCarryPvp: '0',
      dailyCarryLeft: '0',
      dailyCarryRight: '0',
      openingStateConfirmed: false,
    });
    expect(member.openingState).toEqual(firstOpening);
    expect(member.openingState).not.toBe(firstOpening);
    expect(firstOpening).not.toBe(secondOpening);
  });

  it('P2-OPEN-002/005: 한 시작값과 확인 상태만 바꾸며 다른 필드는 유지한다', () => {
    const root = expectTopologySuccess(addRootMember(createEmptyDraft(), 'A')).draft;
    const edited = editOpeningState(root, 'A', {
      dailyCarryLeft: '39',
      openingStateConfirmed: true,
    });
    const opening = edited.members[0]!.openingState;

    expect(opening).toEqual({
      fortnightPvpOpeningCredit: '0',
      dailyCarryPvp: '0',
      dailyCarryLeft: '39',
      dailyCarryRight: '0',
      openingStateConfirmed: true,
    });
    expect(parseMemberOpeningState(edited.members[0]!)).toEqual({
      fortnightPvpOpeningCredit: 0,
      dailyCarryPvp: 0,
      dailyCarryLeft: 39,
      dailyCarryRight: 0,
    });
    expect(editOpeningState(edited, 'A', { dailyCarryLeft: '39' })).toBe(edited);
    expect(editOpeningState(edited, 'UNKNOWN', { dailyCarryLeft: '1' })).toBe(
      edited,
    );
  });

  it.each([
    ['0', { ok: true, value: 0 }],
    [' 39 ', { ok: true, value: 39 }],
    ['', { ok: false, code: 'PV_INVALID' }],
    ['text', { ok: false, code: 'PV_INVALID' }],
    ['Infinity', { ok: false, code: 'PV_INVALID' }],
    ['1e309', { ok: false, code: 'PV_OUT_OF_RANGE' }],
    ['-1', { ok: false, code: 'PV_NEGATIVE' }],
    ['1.5', { ok: false, code: 'PV_NOT_INTEGER' }],
    ['-1.5', { ok: false, code: 'PV_NOT_INTEGER' }],
    [String(Number.MAX_SAFE_INTEGER + 1), { ok: false, code: 'PV_OUT_OF_RANGE' }],
    [String(Number.MIN_SAFE_INTEGER - 1), { ok: false, code: 'PV_OUT_OF_RANGE' }],
  ] as const)('P2-OPEN-004: PV 문자열 %s를 안정적으로 파싱한다', (value, expected) => {
    expect(parseDraftPv(value)).toEqual(expected);
  });

  it.each([
    ['2400', { ok: true, value: 2400 }],
    ['1500', { ok: true, value: 1500 }],
    ['700', { ok: true, value: 700 }],
    ['', { ok: false, code: 'PVP_TARGET_INVALID' }],
    ['1000', { ok: false, code: 'PVP_TARGET_INVALID' }],
  ] as const)('PVP 목표 문자열 %s를 안정적으로 파싱한다', (value, expected) => {
    expect(parseDraftPvpTarget(value)).toEqual(expected);
  });

  it('기간 문자열을 빈칸의 암묵적 0 없이 파싱한다', () => {
    const draft = createEmptyDraft();

    expect(parseDraftPeriod(draft)).toEqual({
      year: 2026,
      month: 7,
      half: 'FIRST_HALF',
    });
    expect(parseDraftPeriod({ ...draft, year: '' })).toBeNull();
    expect(parseDraftPeriod({ ...draft, month: '13' })).toBeNull();
    expect(parseDraftPeriod({ ...draft, year: '1.5' })).toBeNull();
  });

  it('잘못된 시작값 하나가 있으면 부분 OpeningState를 만들지 않는다', () => {
    const member = {
      ...createMemberDraft('A'),
      openingState: {
        ...createOpeningStateDraft(),
        dailyCarryPvp: 'not-a-number',
      },
    };

    expect(parseMemberOpeningState(member)).toBeNull();
  });

  it('회원 ID·이름·목표·표지판 편집은 대상 회원만 바꾸고 미존재/동일 편집은 원본을 보존한다', () => {
    const root = expectTopologySuccess(addRootMember(createEmptyDraft(), 'A')).draft;
    const withChild = addCompletedChild(root, 'A', 'LEFT', 'B');
    const edited = editMemberIdentity(withChild, 'A', {
      memberId: 'ID-A',
      name: '회원 A',
      pvpTarget: '1500',
      sheetMarker: 'GREEN_2',
    });

    expect(edited.members[0]).toMatchObject({
      memberId: 'ID-A',
      name: '회원 A',
      pvpTarget: '1500',
      sheetMarker: 'GREEN_2',
    });
    expect(edited.members[1]).toBe(withChild.members[1]);
    expect(editMemberIdentity(edited, 'A', {})).toBe(edited);
    expect(editMemberIdentity(edited, 'UNKNOWN', { name: '없음' })).toBe(edited);
  });

  it('확인한 회원의 이름을 바꾸면 시작값 확인을 다시 받는다', () => {
    const root = expectTopologySuccess(addRootMember(createEmptyDraft(), 'A')).draft;
    const confirmed = editOpeningState(root, 'A', {
      openingStateConfirmed: true,
    });
    const renamed = editMemberIdentity(confirmed, 'A', { name: '새 이름' });

    expect(renamed.members[0]?.openingState.openingStateConfirmed).toBe(false);
    expect(editMemberIdentity(confirmed, 'A', { memberId: '1000' }).members[0]
      ?.openingState.openingStateConfirmed).toBe(true);
  });
});

describe('Draft 검증, 준비 상태와 공개 위치 매핑', () => {
  it('빈 필드·잘못된 기간·미확인 시작값을 위치가 있는 오류로 반환한다', () => {
    const root = expectTopologySuccess(addRootMember(createEmptyDraft(), 'A')).draft;
    const invalid = {
      ...root,
      year: '',
      month: '13',
      title: ' ',
    };
    const validation = validateProjectSetupDraft(invalid);
    const codes = validation.errors.map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'PERIOD_YEAR_INVALID',
        'PERIOD_MONTH_INVALID',
        'PROJECT_TITLE_REQUIRED',
        'MEMBER_NAME_REQUIRED',
        'PVP_TARGET_INVALID',
        'MEMBER_OPENING_STATE_UNCONFIRMED',
      ]),
    );
    expect(validation.isReady).toBe(false);
    expect(Object.isFrozen(validation)).toBe(true);
    expect(Object.isFrozen(validation.issues)).toBe(true);
    expect(Object.isFrozen(validation.issues[0]!.location)).toBe(true);
  });

  it('P2-MEMBER-001 / P2-NORM-003: 중복 이름은 경고만 남기고 준비를 막지 않는다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    draft = completeMember(draft, 'A', { name: '같은 이름' });
    draft = completeMember(draft, 'B', { name: '같은 이름' });
    const validation = validateProjectSetupDraft(draft);

    expect(validation.isReady).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([
      expect.objectContaining({
        code: 'MEMBER_NAME_DUPLICATE',
        severity: 'WARNING',
        location: expect.objectContaining({ memberKey: 'B', field: 'name' }),
      }),
    ]);
  });

  it('P2-OPEN-003: 확인하지 않은 0 기본값은 완료를 막는다', () => {
    let draft = createSingleMemberDraft('A');
    draft = editOpeningState(draft, 'A', { openingStateConfirmed: false });

    expect(validateProjectSetupDraft(draft).errors).toContainEqual(
      expect.objectContaining({ code: 'MEMBER_OPENING_STATE_UNCONFIRMED' }),
    );
  });

  it('루트 배치와 비루트의 한쪽만 있는 배치를 Draft 단계에서 식별한다', () => {
    let draft = createSingleMemberDraft('A');
    draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
    const invalid = {
      ...draft,
      members: draft.members.map((candidate) => {
        if (candidate.memberKey === 'A') {
          return {
            ...candidate,
            placement: { parentMemberKey: 'X', sideAtParent: 'RIGHT' as const },
          };
        }
        return {
          ...candidate,
          placement: { parentMemberKey: 'A', sideAtParent: null },
        };
      }),
    };
    const validation = validateProjectSetupDraft(invalid);

    expect(validation.errors).toContainEqual(
      expect.objectContaining({ code: 'ROOT_PLACEMENT_INVALID' }),
    );
    expect(validation.errors).toContainEqual(
      expect.objectContaining({ code: 'PLACEMENT_INCOMPLETE' }),
    );
  });

  it('활성 번들 뒤 의미 있는 편집은 준비 상태를 해제하고 선택만 바꾸는 동작은 유지한다', () => {
    const ready = createSingleMemberDraft('A');
    const bundle = normalizedBundle(ready);
    const active = activateProjectSetupBundle(ready, bundle);
    const selected = selectMember(active, null);

    expect(active.activeBundle).toBe(bundle);
    expect(selected.activeBundle).toBe(bundle);
    expect(selectMember(selected, null)).toBe(selected);
    expect(editProjectPeriod(active, { month: '8' }).activeBundle).toBeNull();
    expect(editProjectTitle(active, '새 제목').activeBundle).toBeNull();
    expect(editMemberIdentity(active, 'A', { pvpTarget: '1500' }).activeBundle).toBeNull();
    expect(editOpeningState(active, 'A', { dailyCarryPvp: '1' }).activeBundle).toBeNull();
    expect(clearActiveProjectSetupBundle(active).activeBundle).toBeNull();
    expect(clearActiveProjectSetupBundle(ready)).toBe(ready);
  });

  it('정본 이슈 변환은 제안 유무를 보존하고 검증 보고서는 결정적으로 정렬한다', () => {
    const withoutSuggestion = fromCanonicalIssue({
      code: 'MEMBER_ID_REQUIRED',
      severity: 'ERROR',
      location: { memberKey: 'B', field: 'memberId' },
      message: '오류',
    });
    const withSuggestion = fromCanonicalIssue({
      code: 'PV_NEGATIVE',
      severity: 'WARNING',
      location: { memberKey: 'A', field: 'dailyCarryPvp' },
      message: '경고',
      suggestion: '수정',
    });
    const report = createProjectSetupValidation(
      [withoutSuggestion, withSuggestion],
      [
        {
          memberKey: 'Q',
          memberName: '대기',
          reason: 'ACTIVE_SUBTREE_UNPLACED',
          message: '재배치',
        },
      ],
    );

    expect(report.issues.map((issue) => issue.location.memberKey)).toEqual(['A', 'B']);
    expect(report.warnings[0]!.suggestion).toBe('수정');
    expect(report.reassignmentQueue).toHaveLength(1);
    expect(Object.isFrozen(report.reassignmentQueue)).toBe(true);
  });

  it('프로젝트·회원·슬롯·큐 오류 위치를 접근 가능한 대상 ID로 매핑한다', () => {
    const locations: readonly [ProjectSetupIssueLocation, string][] = [
      [{ area: 'PROJECT', field: 'period.year' }, 'project-year'],
      [{ area: 'MEMBER', memberKey: 'A/B' }, 'member-A_B-card'],
      [
        { area: 'MEMBER', memberKey: 'A/B', field: 'dailyCarryPvp' },
        'member-A_B-dailyCarryPvp',
      ],
      [{ area: 'SLOT', memberKey: 'A', side: 'LEFT' }, 'member-A-left-slot'],
      [{ area: 'QUEUE', memberKey: 'B' }, 'queue-B'],
      [{}, 'project-setup'],
    ];

    for (const [location, expected] of locations) {
      expect(validationLocationTargetId(location)).toBe(expected);
    }
    const issue: ProjectSetupIssue = {
      code: 'PROJECT_TITLE_REQUIRED',
      severity: 'ERROR',
      location: { area: 'PROJECT', field: 'title' },
      message: '제목',
    };
    expect(validationIssueTargetId(issue)).toBe('project-title');
    expect(projectFieldId('period.month')).toBe('project-month');
    expect(memberCardId('A')).toBe('member-A-card');
    expect(memberFieldId('A', 'name')).toBe('member-A-name');
    expect(childSlotId('A', 'RIGHT')).toBe('member-A-right-slot');
    expect(queueEntryId('B')).toBe('queue-B');
  });

  it('고정 ID 생성기도 새 프로젝트 계약을 만족한다', () => {
    const draft = createProjectDraft({
      year: 2026,
      month: 7,
      half: 'FIRST_HALF',
      generateId: fixedIdGenerator,
    });
    expect(draft.projectId).toBe('project-1');
  });
});
