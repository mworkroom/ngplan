import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpeningStateInput } from '../../../../engine';
import {
  createManualPlanDraft,
  type ManualPlanDraft,
  type ManualPlanIssue,
} from '../../../../application/manual-plan';
import type { ProjectSetupBundle } from '../../../../application/project-setup';
import { ManualPlanWorkspace } from '../ManualPlanWorkspace';

const ZERO_OPENING: OpeningStateInput = {
  openingQualificationPvp: 0,
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
};

function createTreeBundle(childOpeningPvp = 0): ProjectSetupBundle {
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '7월 수동 계획',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'America/Sao_Paulo' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-1',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-1',
      members: Object.freeze([
        Object.freeze({
          memberKey: 'child',
          memberId: '',
          name: '하위',
          pvpTarget: 700,
          fortnightSideTarget: 2500,
          sheetMarker: 'NONE',
          parentMemberKey: 'root',
          sideAtParent: 'LEFT' as const,
        }),
        Object.freeze({
          memberKey: 'root',
          memberId: '1000',
          name: '루트',
          pvpTarget: 700,
          fortnightSideTarget: 2500,
          sheetMarker: 'PINK_1',
          parentMemberKey: null,
          sideAtParent: null,
        }),
      ]),
      openingStateByMember: Object.freeze({
        root: Object.freeze({ ...ZERO_OPENING }),
        child: Object.freeze({
          ...ZERO_OPENING,
          openingQualificationPvp: childOpeningPvp,
          fortnightPvpOpeningCredit: childOpeningPvp,
        }),
      }),
    }),
  });
}

function createLinearBundle(memberCount: number): ProjectSetupBundle {
  const members = Array.from({ length: memberCount }, (_, index) =>
    Object.freeze({
      memberKey: `member-${index + 1}`,
      memberId: String(1000 + index),
      name: `회원 ${index + 1}`,
      pvpTarget: 700 as const,
      fortnightSideTarget: 2500 as const,
      sheetMarker: 'NONE' as const,
      parentMemberKey: index === 0 ? null : `member-${index}`,
      sideAtParent: index === 0 ? null : 'LEFT' as const,
    }),
  );
  const openingStateByMember = Object.fromEntries(
    members.map((member) => [member.memberKey, Object.freeze({ ...ZERO_OPENING })]),
  );
  return Object.freeze({
    project: Object.freeze({
      projectId: `project-${memberCount}`,
      title: `${memberCount}명 고정 폭 계획`,
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'America/Sao_Paulo' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: `snapshot-${memberCount}`,
    }),
    organization: Object.freeze({
      snapshotId: `snapshot-${memberCount}`,
      members: Object.freeze(members),
      openingStateByMember: Object.freeze(openingStateByMember),
    }),
  });
}

function renderWorkspace(
  onReturnToSetup = vi.fn(),
  setupWarnings: readonly ManualPlanIssue[] = [],
  bundle = createTreeBundle(),
) {
  const user = userEvent.setup();
  function Harness() {
    const [draft, setDraft] = useState<ManualPlanDraft>(() => createManualPlanDraft(bundle));
    return (
      <ManualPlanWorkspace
        bundle={bundle}
        draft={draft}
        setupWarnings={setupWarnings}
        onDraftChange={setDraft}
        onReturnToSetup={onReturnToSetup}
      />
    );
  }
  render(
    <Harness />,
  );
  return { user, onReturnToSetup };
}

function pvInput(name: string): HTMLInputElement {
  const element = screen.getByRole('textbox', { name });
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`input missing: ${name}`);
  }
  return element;
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WP4 manual planning worksheet', () => {
  it.each([5, 17])(
    'keeps fixed column widths for a %i-member worksheet',
    (memberCount) => {
      const bundle = createLinearBundle(memberCount);
      render(
        <ManualPlanWorkspace
          bundle={bundle}
          draft={createManualPlanDraft(bundle)}
          setupWarnings={[]}
          onDraftChange={vi.fn()}
          onReturnToSetup={vi.fn()}
        />,
      );

      const table = within(
        screen.getByLabelText('수동 계획표 가로 스크롤 영역'),
      ).getByRole('table');
      expect(table.style.width).toBe(`${100 + memberCount * 168}px`);
      expect(table.querySelectorAll('col')).toHaveLength(memberCount * 3 + 2);
      expect(table.querySelectorAll('.manual-plan-table__date-column')).toHaveLength(2);
      expect(
        table.querySelectorAll('.manual-plan-table__value-column--field-pvp'),
      ).toHaveLength(memberCount);
    },
  );

  it('P3-GRID-001/002 renders deterministic semantic headers, editable fields, connected totals, and locked Sundays', () => {
    renderWorkspace();
    const table = within(
      screen.getByLabelText('수동 계획표 가로 스크롤 영역'),
    ).getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'ID',
      '하위미입력',
      '1. 루트1000',
      'ID',
      '목표값',
      '700',
      '2,500',
      '1,800',
      '700',
      '5,000',
      '1,800',
      '목표값',
      '잔액',
      '+700',
      '+2,500',
      '+1,800',
      '+700',
      '+5,000',
      '+1,800',
      '잔액',
      '날짜',
      'PVP0',
      '좌0',
      '우0',
      'PVP0',
      '좌0',
      '우0',
      '날짜',
    ]);
    expect(within(table).getAllByLabelText('PVP 시작값 0 PV')).toHaveLength(2);
    expect(within(table).getAllByText('합계')).toHaveLength(2);
    expect(document.querySelectorAll('.manual-plan-table tfoot tr')).toHaveLength(1);
    expect(within(table).getAllByText('1 (수)')).toHaveLength(2);

    expect(pvInput('1 (수) 1. 루트 · 회원 ID 1000 PVP 계획 PV').disabled).toBe(false);
    expect(pvInput('1 (수) 1. 루트 · 회원 ID 1000 우 계획 PV').disabled).toBe(false);
    expect(
      screen.queryByRole('textbox', {
        name: '1 (수) 1. 루트 · 회원 ID 1000 좌 계획 PV',
      }),
    ).toBeNull();
    expect(
      screen.getByLabelText('1 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 0 PV'),
    ).toBeDefined();

    expect(screen.queryByText('일요일 · 정산 제외')).toBeNull();
    expect(
      screen.queryByRole('textbox', {
        name: '5 (일) 하위 PVP 계획 PV',
      }),
    ).toBeNull();
    expect(screen.getAllByLabelText(/5 \(일\).*정산 제외 0/)).toHaveLength(6);
    expect(document.querySelectorAll('.manual-plan-scroll')).toHaveLength(1);
    expect(document.querySelectorAll('.manual-plan-table thead tr')).toHaveLength(4);
    expect(screen.getByLabelText('하위 PVP 목표값 700 PV')).toBeDefined();
    expect(
      screen.getByLabelText('1. 루트 · 회원 ID 1000 좌 목표값 5,000 PV'),
    ).toBeDefined();
    expect(within(table).getByText('하위').closest('th')?.className).toContain(
      'manual-plan-table__member-heading--left',
    );
    expect(within(table).getByText('1. 루트').closest('th')?.className).toContain(
      'manual-plan-table__member-heading--root',
    );
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'center',
    });

    const input = pvInput('1 (수) 하위 PVP 계획 PV');
    const parent = input.closest('td');
    expect(parent?.getAttribute('headers')).toContain('manual-plan-date-');
    expect(parent?.getAttribute('headers')).toContain('manual-plan-member-');
    expect(parent?.getAttribute('headers')).toContain('manual-plan-column-');
  });

  it.each([300, 700, 1500, 2400] as const)(
    'marks only the PVP cell with the %i commission level',
    async (tier) => {
      const { user } = renderWorkspace();
      const pvp = pvInput('1 (수) 하위 PVP 계획 PV');
      const left = pvInput('1 (수) 하위 좌 계획 PV');
      const right = pvInput('1 (수) 하위 우 계획 PV');

      await user.type(pvp, '300');
      await user.type(left, String(tier));
      await user.type(right, String(tier));

      expect(pvp.closest('td')?.dataset.commissionLevel).toBe(String(tier));
      expect(left.closest('td')?.dataset.commissionLevel).toBeUndefined();
      expect(right.closest('td')?.dataset.commissionLevel).toBeUndefined();
    },
  );

  it('marks and clears the selected member day across all three cells', async () => {
    const { user } = renderWorkspace();
    const pvp = pvInput('1 (수) 하위 PVP 계획 PV');
    const left = pvInput('1 (수) 하위 좌 계획 PV');
    const right = pvInput('1 (수) 하위 우 계획 PV');

    expect(screen.queryByRole('menu', { name: '빨간 표시 작업' })).toBeNull();
    await user.click(pvp);
    expect(screen.queryByRole('menu', { name: '빨간 표시 작업' })).toBeNull();

    fireEvent.contextMenu(pvp, { clientX: 180, clientY: 240 });
    const control = screen.getByRole('menu', { name: '빨간 표시 작업' });
    await user.click(
      within(control).getByRole('menuitem', { name: '계획과 달랐음 표시' }),
    );
    expect(screen.queryByRole('menu', { name: '빨간 표시 작업' })).toBeNull();

    for (const input of [pvp, left, right]) {
      expect(input.closest('td')?.dataset.actualDifference).toBe('true');
    }

    await user.type(pvp, '300');
    await user.type(left, '300');
    await user.type(right, '300');
    expect(pvp.closest('td')?.dataset.commissionLevel).toBe('300');
    expect(pvp.closest('td')?.dataset.actualDifference).toBe('true');

    fireEvent.contextMenu(pvp, { clientX: 180, clientY: 240 });
    const clearMenu = screen.getByRole('menu', { name: '빨간 표시 작업' });
    await user.click(
      within(clearMenu).getByRole('menuitem', { name: '빨간 표시 지우기' }),
    );
    for (const input of [pvp, left, right]) {
      expect(input.closest('td')?.dataset.actualDifference).toBeUndefined();
    }

    fireEvent.contextMenu(pvp, { clientX: 180, clientY: 240 });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: '빨간 표시 작업' })).toBeNull();
  });

  it('shows signed achievement balances and marks zero or negative values as met', async () => {
    const { user } = renderWorkspace();
    const pvp = pvInput('1 (수) 하위 PVP 계획 PV');

    await user.type(pvp, '800');

    const pvpBalance = screen.getByLabelText('하위 PVP 잔액 −100 PV');
    expect(pvpBalance.textContent).toBe('−100');
    expect(pvpBalance.querySelector('strong')?.className).toContain(
      'manual-plan-table__achievement-value--met',
    );
  });

  it('subtracts opening PVP once and shows the balance against current-period PVP', async () => {
    const { user } = renderWorkspace(vi.fn(), [], createTreeBundle(300));
    expect(screen.getByLabelText('하위 PVP 목표값 400 PV')).toBeDefined();
    expect(screen.getByLabelText('하위 PVP 잔액 +400 PV')).toBeDefined();

    await user.type(pvInput('1 (수) 하위 PVP 계획 PV'), '100');

    expect(screen.getByLabelText('하위 PVP 잔액 +300 PV')).toBeDefined();
  });

  it('keeps calculated totals visible and warns when manual PVP exceeds 2,400', async () => {
    const { user } = renderWorkspace(vi.fn(), [], createTreeBundle(2_400));
    const pvp = pvInput('1 (수) 하위 PVP 계획 PV');

    await user.type(pvp, '1');

    expect(pvp.value).toBe('1');
    expect(screen.getByText('확인이 필요한 안내 1개')).toBeDefined();
    expect(
      screen.getByText(
        '누적 PVP 2,400에 이번 기간 신규 PVP 1을 더하면 평생 상한 2,400을 넘습니다.',
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        '입력한 값으로 계속 계산합니다. 2,400을 넘은 PVP는 개인 PVP 목표에 추가 도움이 되지 않아 손해가 될 수 있습니다.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: '첫 오류로 이동' })).toBeNull();
    expect(
      screen.getByLabelText('1 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 1 PV'),
    ).toBeDefined();
    expect(screen.getByLabelText('하위 이번 기간 PVP 총합 1 PV')).toBeDefined();
  });

  it('selects the entire editable value when a number cell receives focus or is clicked', async () => {
    const { user } = renderWorkspace();
    const input = pvInput('1 (수) 하위 PVP 계획 PV');

    await user.type(input, '123');
    expect(input.value).toBe('123');

    await user.click(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);
  });

  it('P3-UI-001 updates ancestors, removes stale results, and focuses the exact first error', async () => {
    const { user } = renderWorkspace();
    const pvp = pvInput('1 (수) 하위 PVP 계획 PV');
    const left = pvInput('1 (수) 하위 좌 계획 PV');
    const right = pvInput('1 (수) 하위 우 계획 PV');
    await user.type(pvp, '100');
    await user.type(left, '200');
    await user.type(right, '300');

    expect(
      screen.getByLabelText('1 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 600 PV'),
    ).toBeDefined();
    expect(
      screen.getByLabelText('1. 루트 · 회원 ID 1000 좌 잔액 +4,400 PV'),
    ).toBeDefined();
    expect(screen.getByLabelText('하위 이번 기간 PVP 총합 100 PV')).toBeDefined();
    expect(screen.getByLabelText('하위 이번 기간 좌 총합 200 PV')).toBeDefined();
    expect(screen.getByLabelText('하위 이번 기간 우 총합 300 PV')).toBeDefined();
    expect(
      screen.getByLabelText(
        '1. 루트 · 회원 ID 1000 이번 기간 좌 총합 600 PV',
      ),
    ).toBeDefined();

    await user.clear(pvp);
    await user.type(pvp, 'bad');
    expect(screen.queryByText('⚠ 입력 확인 필요')).toBeNull();
    expect(screen.getAllByText(/0 이상의 숫자만/)).toHaveLength(3);
    expect(screen.getByRole('heading', { name: '선택한 입력 확인' })).toBeDefined();
    expect(
      screen.getByLabelText(
        '1 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 현재 결과 없음',
      ),
    ).toBeDefined();
    expect(
      screen.queryByLabelText('1 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 600 PV'),
    ).toBeNull();
    expect(
      screen.getByText('잘못 입력한 값을 고치면 오늘 결과가 다시 나타납니다.'),
    ).toBeDefined();
    expect(
      screen.getByText('현재 입력을 수정하면 보름 결과를 다시 표시합니다.'),
    ).toBeDefined();

    screen.getByRole('button', { name: '설정으로 돌아가기' }).focus();
    await user.click(screen.getByRole('button', { name: '첫 오류로 이동' }));
    expect(document.activeElement).toBe(pvp);

    await user.clear(pvp);
    await user.type(pvp, '1');
    expect(screen.queryByText('✓ 계산 완료')).toBeNull();
    expect(screen.queryByRole('heading', { name: '선택한 입력 확인' })).toBeNull();
    expect(
      screen.getByLabelText('1 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 501 PV'),
    ).toBeDefined();
  });

  it('P3-GRID-003 moves Enter vertically and skips Sunday in both directions', async () => {
    const { user } = renderWorkspace();
    const childPvp = pvInput('1 (수) 하위 PVP 계획 PV');
    const childLeft = pvInput('1 (수) 하위 좌 계획 PV');
    const childRight = pvInput('1 (수) 하위 우 계획 PV');
    const firstPvp = pvInput('1 (수) 1. 루트 · 회원 ID 1000 PVP 계획 PV');
    const rootRight = pvInput('1 (수) 1. 루트 · 회원 ID 1000 우 계획 PV');
    childPvp.focus();
    await user.tab();
    expect(document.activeElement).toBe(childLeft);
    await user.tab();
    expect(document.activeElement).toBe(childRight);
    await user.tab();
    expect(document.activeElement).toBe(firstPvp);
    await user.tab();
    expect(document.activeElement).toBe(rootRight);

    const julyEleven = pvInput('11 (토) 하위 PVP 계획 PV');
    julyEleven.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      pvInput('13 (월) 하위 PVP 계획 PV'),
    );
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(document.activeElement).toBe(julyEleven);

    const julyOne = pvInput('1 (수) 하위 PVP 계획 PV');
    julyOne.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(julyOne);
  });

  it('keeps the member selector inside the detail disclosure and updates the summary', async () => {
    const { user } = renderWorkspace();
    await user.click(screen.getByText('상세 계산과 전체 현황 보기'));
    const memberSelect = screen.getByLabelText('회원 선택');
    await user.selectOptions(memberSelect, 'child');
    expect((memberSelect as HTMLSelectElement).value).toBe('child');
    expect(screen.getByText(/하위 · PVP 700 PV · 좌\/우 각 2,500 PV/)).toBeDefined();
  });

  it('selects a locked Sunday audit context inside the detail disclosure', async () => {
    const { user } = renderWorkspace();
    await user.click(screen.getByText('상세 계산과 전체 현황 보기'));
    const dateSelect = screen.getByLabelText('날짜 선택');
    await user.selectOptions(dateSelect, '2026-07-05');

    expect((dateSelect as HTMLSelectElement).value).toBe('2026-07-05');
    expect(screen.getByText('5 (일) · 하위')).toBeDefined();
    expect(screen.getAllByText('정산 제외').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('정산 제외 · 커미션 없음')).toBeDefined();

    const sundayCell = screen.getByLabelText('5 (일) 하위 PVP 정산 제외 0');
    await user.click(sundayCell);
    expect(screen.queryByRole('menu', { name: '빨간 표시 작업' })).toBeNull();
    fireEvent.contextMenu(sundayCell, { clientX: 180, clientY: 240 });
    const control = screen.getByRole('menu', { name: '빨간 표시 작업' });
    expect(
      (within(control).getByRole('menuitem', {
        name: '입력하지 않는 날',
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('changes the detailed calculation date without moving focus back into the table', async () => {
    const { user } = renderWorkspace();
    await user.click(screen.getByText('상세 계산과 전체 현황 보기'));
    const dateSelect = screen.getByLabelText('날짜 선택');
    await user.selectOptions(dateSelect, '2026-07-10');

    expect(document.activeElement).toBe(dateSelect);
    expect(screen.getByText('10 (금) · 하위')).toBeDefined();
  });

  it('returns to setup immediately after an edit because the controlled draft is preserved', async () => {
    const onReturnToSetup = vi.fn();
    const { user } = renderWorkspace(onReturnToSetup);
    const input = pvInput('1 (수) 하위 PVP 계획 PV');
    await user.type(input, '1');
    const back = screen.getByRole('button', { name: '설정으로 돌아가기' });
    await user.click(back);
    expect(input.value).toBe('1');
    expect(onReturnToSetup).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('preserves nonblocking setup warnings while a plan input blocks calculation', async () => {
    const warning: ManualPlanIssue = {
      code: 'MEMBER_NAME_DUPLICATE',
      severity: 'WARNING',
      location: { memberKey: 'child', field: 'name' },
      message: '설정에서 확인한 동명이인 안내',
    };
    const { user } = renderWorkspace(vi.fn(), [warning]);
    expect(screen.getByText('설정에서 확인한 동명이인 안내')).toBeDefined();

    const input = pvInput('1 (수) 하위 PVP 계획 PV');
    await user.type(input, 'bad');
    expect(screen.getByText('입력 확인 필요 1개 · 안내 1개')).toBeDefined();
    expect(screen.getByText('설정에서 확인한 동명이인 안내')).toBeDefined();
  });
});
