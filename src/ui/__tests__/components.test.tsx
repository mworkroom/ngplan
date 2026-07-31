import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  addMemberToSlot,
  addRootMember,
  createProjectDraft,
  deriveTopology,
  getChildSlotState,
  type IdGenerator,
  type MemberDraft,
  type ProjectSetupIssue,
  type ProjectSetupValidation,
} from '../../application/project-setup';
import { ChildSlot } from '../components/ChildSlot';
import { ExcludeMemberDialog } from '../components/ExcludeMemberDialog';
import { MemberCard } from '../components/MemberCard';
import { MemberForm } from '../components/MemberForm';
import { OpeningStateForm } from '../components/OpeningStateForm';
import { OrganizationTree } from '../components/OrganizationTree';
import { ProjectPeriodForm } from '../components/ProjectPeriodForm';
import { ReassignmentQueue } from '../components/ReassignmentQueue';
import { ValidationSummary } from '../components/ValidationSummary';

afterEach(() => cleanup());

const generateId: IdGenerator = (() => {
  let value = 0;
  return (kind) => `${kind.toLowerCase()}-${++value}`;
})();

function member(
  memberKey: string,
  patch: Partial<MemberDraft> = {},
): MemberDraft {
  return {
    memberKey,
    participation: 'ACTIVE',
    memberId: `${memberKey}-id`,
    name: memberKey,
    pvpTarget: '700',
    fortnightSideTarget: '2500',
    sheetMarker: 'NONE',
    placement: { parentMemberKey: null, sideAtParent: null },
    openingState: {
      cumulativePvp: '0',
      dailyCarryLeft: '0',
      dailyCarryRight: '0',
      openingStateConfirmed: true,
    },
    ...patch,
  };
}

function issue(
  code: ProjectSetupIssue['code'],
  severity: ProjectSetupIssue['severity'],
  field: string,
  memberKey?: string,
): ProjectSetupIssue {
  return {
    code,
    severity,
    location:
      memberKey === undefined
        ? { area: 'PROJECT', field }
        : { area: 'MEMBER', memberKey, field },
    message: `${field} 문제`,
    suggestion: '수정 안내',
  };
}

describe('project and opening forms', () => {
  it('edits period/title, shows compact hints, and restores a derived title', () => {
    const draft = createProjectDraft({
      year: 2026,
      month: 7,
      half: 'FIRST_HALF',
      generateId,
    });
    const onPeriodChange = vi.fn();
    const onTitleChange = vi.fn();
    const onRestore = vi.fn();
    const { rerender } = render(
      <ProjectPeriodForm
        draft={draft}
        issues={[
          issue('PERIOD_YEAR_INVALID', 'ERROR', 'period.year'),
          issue('PERIOD_MONTH_INVALID', 'ERROR', 'period.month'),
          issue('PROJECT_TITLE_REQUIRED', 'ERROR', 'title'),
        ]}
        onPeriodChange={onPeriodChange}
        onTitleChange={onTitleChange}
        onRestoreDerivedTitle={onRestore}
      />,
    );

    fireEvent.change(screen.getByLabelText('연도'), { target: { value: '2027' } });
    fireEvent.change(screen.getByLabelText('월'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('기간'), {
      target: { value: 'SECOND_HALF' },
    });
    fireEvent.change(screen.getByLabelText('프로젝트명'), {
      target: { value: '직접 제목' },
    });
    expect(onPeriodChange).toHaveBeenCalledWith({ year: '2027' });
    expect(onPeriodChange).toHaveBeenCalledWith({ month: '8' });
    expect(onPeriodChange).toHaveBeenCalledWith({ half: 'SECOND_HALF' });
    expect(onTitleChange).toHaveBeenCalledWith('직접 제목');
    expect(screen.queryByText('period.year 문제')).toBeNull();
    expect(screen.queryByText('period.month 문제')).toBeNull();
    expect(screen.getByPlaceholderText('예: 2026')).toBeTruthy();
    expect(screen.getByPlaceholderText('1~12')).toBeTruthy();
    expect(screen.getByLabelText('연도').getAttribute('aria-invalid')).toBe('true');

    rerender(
      <ProjectPeriodForm
        draft={{ ...draft, title: '직접 제목', titleSource: 'MANUAL' }}
        issues={[]}
        onPeriodChange={onPeriodChange}
        onTitleChange={onTitleChange}
        onRestoreDerivedTitle={onRestore}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '제목 초기화' }));
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it('edits cumulative PVP, left/right openings, and confirmation', () => {
    const current = member('member-a', {
      openingState: {
        cumulativePvp: '0',
        dailyCarryLeft: '0',
        dailyCarryRight: '0',
        openingStateConfirmed: false,
      },
    });
    const onChange = vi.fn();
    const onPvpTargetChange = vi.fn();
    const onFortnightSideTargetChange = vi.fn();
    render(
      <OpeningStateForm
        member={current}
        issues={[
          issue('PV_NEGATIVE', 'ERROR', 'dailyCarryLeft', current.memberKey),
          issue(
            'MEMBER_OPENING_STATE_UNCONFIRMED',
            'ERROR',
            'openingStateConfirmed',
            current.memberKey,
          ),
        ]}
        onChange={onChange}
        onPvpTargetChange={onPvpTargetChange}
        onFortnightSideTargetChange={onFortnightSideTargetChange}
      />,
    );

    expect((screen.getByLabelText('PVP 목표') as HTMLSelectElement).value).toBe('700');
    expect((screen.getByLabelText('좌우 목표') as HTMLSelectElement).value).toBe('2500');

    const openingPvp = screen.getByLabelText('PVP', { exact: true }) as HTMLInputElement;
    fireEvent.focus(openingPvp);
    expect(openingPvp.selectionStart).toBe(0);
    expect(openingPvp.selectionEnd).toBe(1);
    fireEvent.click(openingPvp);
    expect(openingPvp.selectionStart).toBe(0);
    expect(openingPvp.selectionEnd).toBe(1);
    fireEvent.change(openingPvp, { target: { value: '33' } });

    fireEvent.change(screen.getByLabelText('PVP 목표'), {
      target: { value: '1500' },
    });
    fireEvent.change(screen.getByLabelText('좌우 목표'), {
      target: { value: '1500' },
    });
    fireEvent.change(screen.getByLabelText('좌'), { target: { value: '39' } });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /시작값이 맞게 입력되었으면 확인 버튼을 클릭해주세요/ }),
    );
    expect(onChange).toHaveBeenCalledWith({ dailyCarryLeft: '39' });
    expect(onChange).toHaveBeenCalledWith({ cumulativePvp: '33' });
    expect(onPvpTargetChange).toHaveBeenCalledWith('1500');
    expect(onFortnightSideTargetChange).toHaveBeenCalledWith('1500');
    expect(onChange).toHaveBeenCalledWith({ openingStateConfirmed: true });
    expect(screen.getByText('dailyCarryLeft 문제')).toBeTruthy();
  });
});

describe('tree cards and child slots', () => {
  it('operates SELF and CHILD slots with explicit labels', () => {
    const onOpen = vi.fn();
    const onRemoveChild = vi.fn();
    const selfSlot = {
      parentMemberKey: 'parent',
      side: 'LEFT' as const,
      kind: 'SELF' as const,
      childMemberKey: null,
    };
    const { container, rerender } = render(
      <ChildSlot
        slot={selfSlot}
        parentName="부모"
        childName={null}
        onOpen={onOpen}
        onRemoveChild={onRemoveChild}
      />,
    );
    expect(screen.getByText('스스로')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: '부모의 왼쪽 빈 자리에 회원 연결',
      }),
    );
    expect(onOpen).toHaveBeenCalledOnce();

    rerender(
      <ChildSlot
        slot={{ ...selfSlot, kind: 'CHILD', childMemberKey: 'child' }}
        parentName="부모"
        childName="자식"
        onOpen={onOpen}
        onRemoveChild={onRemoveChild}
      />,
    );
    expect(container.querySelector('.child-slot__state--placeholder')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '자식 위치 바꾸기 또는 명단에서 빼기' }));
    expect(onRemoveChild).toHaveBeenCalledWith('child');

    rerender(
      <ChildSlot
        slot={{ ...selfSlot, kind: 'CHILD', childMemberKey: null }}
        parentName="부모"
        childName={null}
        onOpen={onOpen}
        onRemoveChild={onRemoveChild}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '하위 회원 위치 바꾸기 또는 명단에서 빼기' }));
    expect(onRemoveChild).toHaveBeenCalledTimes(1);
  });

  it('shows card completion, selection, collapse controls, and slot actions', () => {
    const current = member('root');
    const topologyDraft = {
      ...createProjectDraft({ year: 2026, month: 7, half: 'FIRST_HALF', generateId }),
      members: [current],
      rootMemberKey: current.memberKey,
      selectedMemberKey: current.memberKey,
    };
    const topology = deriveTopology(topologyDraft);
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onOpenSlot = vi.fn();
    const { container } = render(
      <MemberCard
        member={current}
        issues={[issue('MEMBER_NAME_REQUIRED', 'ERROR', 'name', current.memberKey)]}
        leftSlot={getChildSlotState(topology, current.memberKey, 'LEFT')}
        rightSlot={getChildSlotState(topology, current.memberKey, 'RIGHT')}
        leftChildName={null}
        rightChildName={null}
        selected
        collapsed
        hasChildren
        childrenContainerId="root-children"
        onSelect={onSelect}
        onToggleCollapsed={onToggle}
        onOpenSlot={onOpenSlot}
        onRemoveChild={vi.fn()}
      />,
    );
    expect(container.querySelector('.member-card__summary')).toBeTruthy();
    expect(screen.getByText('확인')).toBeTruthy();
    expect(screen.getByText('ID: root-id')).toBeTruthy();
    expect(screen.getByLabelText('회원 목표').textContent).toBe(
      '목표: PVP 700 | 좌/우 2500',
    );
    expect(screen.getByLabelText('세 시작값').textContent).toBe(
      '시작값: PVP 0 | 좌 0 | 우 0',
    );
    expect(screen.getAllByText('스스로')).toHaveLength(2);
    const collapse = screen.getByRole('button', { name: '펼치기' });
    expect(collapse.getAttribute('aria-controls')).toBe('root-children');
    fireEvent.click(collapse);
    fireEvent.click(screen.getByRole('button', { name: 'root 회원 상세 편집' }));
    fireEvent.click(screen.getByRole('button', { name: /root의 왼쪽 빈 자리/ }));
    expect(onToggle).toHaveBeenCalledWith('root');
    expect(onSelect).toHaveBeenCalledWith('root');
    expect(onOpenSlot).toHaveBeenCalledWith('root', 'LEFT');
  });

  it('renders an empty tree then a left/right hierarchy and toggles collapse', () => {
    let draft = createProjectDraft({
      year: 2026,
      month: 7,
      half: 'FIRST_HALF',
      generateId,
    });
    const onAddRoot = vi.fn();
    const sharedProps = {
      issues: [] as readonly ProjectSetupIssue[],
      collapsedMemberKeys: new Set<string>(),
      scale: 1,
      onAddRoot,
      onSelectMember: vi.fn(),
      onToggleCollapsed: vi.fn(),
      onScaleChange: vi.fn(),
      onOpenSlot: vi.fn(),
      onNavigateIssue: vi.fn(),
      onRemoveMember: vi.fn(),
    };
    const { rerender, container } = render(
      <OrganizationTree draft={draft} topology={deriveTopology(draft)} {...sharedProps} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '최상위 회원 만들기' }));
    expect(onAddRoot).toHaveBeenCalledOnce();

    const rootOutcome = addRootMember(draft, 'root-tree');
    if (rootOutcome.status !== 'SUCCESS') throw new Error('root setup failed');
    draft = rootOutcome.draft;
    const childOutcome = addMemberToSlot(draft, 'root-tree', 'RIGHT', 'right-child');
    if (childOutcome.status !== 'SUCCESS') throw new Error('child setup failed');
    draft = childOutcome.draft;
    rerender(
      <OrganizationTree draft={draft} topology={deriveTopology(draft)} {...sharedProps} />,
    );
    expect(screen.getByLabelText('좌우 조직도')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'right-child 위치 바꾸기 또는 명단에서 빼기' })).toBeTruthy();
    expect(container.querySelector('.tree-children')?.getAttribute('data-child-layout')).toBe(
      'right',
    );
    expect(container.querySelectorAll('.tree-node--connected')).toHaveLength(1);
    expect(container.querySelector('.organization-tree__connectors')).toBeTruthy();
    expect(
      container.querySelector('.tree-node[data-member-key="root-tree"]'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '작게' }));
    expect(sharedProps.onScaleChange).toHaveBeenCalledWith(0.9);
    fireEvent.click(screen.getByRole('button', { name: '크게' }));
    expect(sharedProps.onScaleChange).toHaveBeenCalledWith(1.1);
    fireEvent.click(screen.getByRole('button', { name: '처음 위치' }));
    expect(sharedProps.onScaleChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(sharedProps.onToggleCollapsed).toHaveBeenCalledWith('root-tree');
  });
});

describe('member topology controls', () => {
  it('edits identity, moves to an available side, detaches, and excludes', () => {
    const current = member('child', {
      placement: { parentMemberKey: 'parent', sideAtParent: 'LEFT' },
    });
    const parent = member('parent');
    const onIdentityChange = vi.fn();
    const onMove = vi.fn();
    const onDetach = vi.fn();
    const onExclude = vi.fn();
    render(
      <MemberForm
        member={current}
        issues={[]}
        isRoot={false}
        candidateParents={[parent]}
        isSlotAvailable={(_key, side) => side === 'RIGHT'}
        onIdentityChange={onIdentityChange}
        onMove={onMove}
        onDetach={onDetach}
        onExclude={onExclude}
      />,
    );

    fireEvent.change(screen.getByLabelText('ID'), { target: { value: '12a34' } });
    fireEvent.change(screen.getByLabelText('이름 (닉네임이 표시됨)'), {
      target: { value: '새 이름' },
    });
    fireEvent.change(screen.getByLabelText('이름 강조색'), {
      target: { value: 'GREEN_2' },
    });
    expect(screen.getByRole('option', { name: '4 · 연보라색' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('상위 회원 선택'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('상위 회원 선택'), {
      target: { value: 'parent' },
    });
    fireEvent.change(screen.getByLabelText('위치 선택'), { target: { value: 'RIGHT' } });
    fireEvent.click(screen.getByRole('button', { name: '이동' }));
    fireEvent.click(screen.getByRole('button', { name: '보관함에 넣기' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
    expect(onIdentityChange).toHaveBeenCalledWith({ memberId: '1234' });
    expect(onIdentityChange).toHaveBeenCalledWith({ name: '새 이름' });
    expect(onIdentityChange).toHaveBeenCalledWith({ sheetMarker: 'GREEN_2' });
    expect(onMove).toHaveBeenCalledWith('parent', 'RIGHT');
    expect(onDetach).toHaveBeenCalledOnce();
    expect(onExclude).toHaveBeenCalledOnce();
  });

  it('distinguishes root and unplaced member controls', () => {
    const root = member('root');
    const props = {
      issues: [] as readonly ProjectSetupIssue[],
      candidateParents: [] as readonly MemberDraft[],
      isSlotAvailable: () => true,
      onIdentityChange: vi.fn(),
      onMove: vi.fn(),
      onDetach: vi.fn(),
      onExclude: vi.fn(),
    };
    const { rerender } = render(<MemberForm member={root} isRoot {...props} />);
    expect(screen.queryByText('이 회원의 위치 바꾸기')).toBeNull();
    expect(screen.queryByText('최상위 회원')).toBeNull();
    rerender(<MemberForm member={member('queued')} isRoot={false} {...props} />);
    expect(screen.queryByText('등록된 회원')).toBeNull();
    expect(
      screen.getByRole('heading', {
        name: '보관함에 있는 회원',
        level: 3,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/원하는 빈 자리의 \+ 버튼/)).toBeTruthy();
  });
});

describe('queue, dialog, and validation feedback', () => {
  it('selects queued subtrees and explicitly replaces a missing root', () => {
    const onSelect = vi.fn();
    const onSetRoot = vi.fn();
    const entry = {
      memberKey: 'queued',
      memberName: '대기 회원',
      reason: 'ACTIVE_SUBTREE_UNPLACED' as const,
      message: '다시 연결해야 합니다.',
    };
    const { rerender } = render(
      <ReassignmentQueue
        entries={[entry]}
        rootMissing
        selectedMemberKey="queued"
        onSelect={onSelect}
        onSetRoot={onSetRoot}
      />,
    );
    const queuedMemberButton = screen.getByRole('button', {
      name: '대기 회원 정보 보기',
    });
    expect(queuedMemberButton.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(queuedMemberButton);
    fireEvent.click(screen.getByRole('button', { name: '맨 위 회원으로 정하기' }));
    expect(onSelect).toHaveBeenCalledWith('queued');
    expect(onSetRoot).toHaveBeenCalledWith('queued');
    rerender(
      <ReassignmentQueue
        entries={[{ ...entry, memberName: '' }]}
        rootMissing={false}
        onSelect={onSelect}
        onSetRoot={onSetRoot}
      />,
    );
    expect(screen.queryByRole('button', { name: '맨 위 회원으로 정하기' })).toBeNull();
  });

  it('offers explicit one-child promotion and supports cancellation by Escape', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const parented = member('middle', {
      placement: { parentMemberKey: 'root', sideAtParent: 'LEFT' },
    });
    render(
      <ExcludeMemberDialog
        member={parented}
        directChildren={[member('child')]}
        isRoot={false}
        safetyBackupEnabled
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/현재 내용이 자동으로 저장됩니다/)).toBeTruthy();
    expect(screen.getByText(/‘이전 내용 보기’/)).toBeTruthy();
    expect(screen.getByLabelText(/아래 회원을 이 자리로 올리기/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/아래 회원들의 새 위치를 나중에 정하기/));
    fireEvent.click(screen.getByLabelText(/아래 회원을 이 자리로 올리기/));
    fireEvent.click(screen.getByLabelText(/아래 회원들의 새 위치를 나중에 정하기/));
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
    expect(onConfirm).toHaveBeenCalledWith('DETACH_CHILDREN');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('traps dialog focus, closes from the backdrop, and explains zero-child roots', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container, rerender } = render(
      <ExcludeMemberDialog
        member={member('single')}
        directChildren={[]}
        isRoot={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/현재 자리만 비게 됩니다/)).toBeTruthy();
    const cancel = screen.getByRole('button', { name: '취소' });
    const confirm = screen.getByRole('button', { name: '삭제하기' });
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(confirm);
    const backdrop = container.querySelector('.dialog-backdrop');
    if (!(backdrop instanceof HTMLElement)) throw new Error('backdrop missing');
    fireEvent.mouseDown(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(
      <ExcludeMemberDialog
        member={member('root-empty')}
        directChildren={[]}
        isRoot
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/맨 위 자리가 비게 됩니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }));
    expect(onConfirm).toHaveBeenCalledWith('DETACH_CHILDREN');
  });

  it('never auto-promotes two children or an unplaced subtree root', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ExcludeMemberDialog
        member={member('root')}
        directChildren={[member('left'), member('right')]}
        isRoot
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(/두 회원의 새 위치를 각각 정해 주세요/)).toBeTruthy();
    expect(screen.getByText(/새로운 최상위 회원으로 정해 주세요/)).toBeTruthy();
    rerender(
      <ExcludeMemberDialog
        member={member('queued')}
        directChildren={[member('child')]}
        isRoot={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.queryByLabelText(/아래 회원을 이 자리로 올리기/)).toBeNull();
    expect(screen.getByText(/어디에 둘지 다시 정해야 합니다/)).toBeTruthy();
  });

  it('navigates errors and warnings or reports an empty validation', () => {
    const onNavigate = vi.fn();
    const error = issue('PROJECT_TITLE_REQUIRED', 'ERROR', 'title');
    const warning = issue('MEMBER_NAME_DUPLICATE', 'WARNING', 'name', 'member');
    const validation: ProjectSetupValidation = {
      isReady: false,
      issues: [error, warning],
      errors: [error],
      warnings: [warning],
      reassignmentQueue: [],
    };
    const { rerender } = render(
      <ValidationSummary validation={validation} onNavigate={onNavigate} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'title 문제' }));
    fireEvent.click(screen.getByRole('button', { name: 'name 문제' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('수정 안내')).toHaveLength(2);
    rerender(
      <ValidationSummary
        validation={{
          isReady: false,
          issues: [error],
          errors: [error],
          warnings: [],
          reassignmentQueue: [],
        }}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.queryByText(/확인해 볼 내용/)).toBeNull();
    rerender(
      <ValidationSummary
        validation={{
          isReady: true,
          issues: [],
          errors: [],
          warnings: [],
          reassignmentQueue: [],
        }}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByText(/모든 필수 입력을 확인했습니다/)).toBeTruthy();
  });
});
