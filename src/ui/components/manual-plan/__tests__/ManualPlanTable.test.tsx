import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpeningStateInput } from '../../../../engine';
import type { ManualPlanIssue } from '../../../../application/manual-plan';
import type { ProjectSetupBundle } from '../../../../application/project-setup';
import { ManualPlanWorkspace } from '../ManualPlanWorkspace';

const ZERO_OPENING: OpeningStateInput = {
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
};

function createTreeBundle(): ProjectSetupBundle {
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '7월 수동 계획',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'Asia/Seoul' as const,
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
          sheetMarker: 'NONE',
          parentMemberKey: 'root',
          sideAtParent: 'LEFT' as const,
        }),
        Object.freeze({
          memberKey: 'root',
          memberId: '1000',
          name: '루트',
          pvpTarget: 700,
          sheetMarker: 'PINK_1',
          parentMemberKey: null,
          sideAtParent: null,
        }),
      ]),
      openingStateByMember: Object.freeze({
        root: Object.freeze({ ...ZERO_OPENING }),
        child: Object.freeze({ ...ZERO_OPENING }),
      }),
    }),
  });
}

function renderWorkspace(
  onReturnToSetup = vi.fn(),
  setupWarnings: readonly ManualPlanIssue[] = [],
) {
  const user = userEvent.setup();
  render(
    <ManualPlanWorkspace
      bundle={createTreeBundle()}
      setupWarnings={setupWarnings}
      displayDensity="COMPACT"
      onDisplayDensityChange={vi.fn()}
      onReturnToSetup={onReturnToSetup}
    />,
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
  it('P3-GRID-001/002 renders deterministic semantic headers, editable fields, connected totals, and locked Sundays', () => {
    renderWorkspace();
    const table = within(
      screen.getByLabelText('수동 계획표 가로 스크롤 영역'),
    ).getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      '날짜',
      '1. 루트목표 700 PV · ID 1000',
      '하위목표 700 PV',
      'PVP시작 0',
      '좌시작 0',
      '우시작 0',
      'PVP시작 0',
      '좌시작 0',
      '우시작 0',
    ]);

    expect(pvInput('7월 1일 (수) 1. 루트 · 회원 ID 1000 PVP 계획 PV').disabled).toBe(false);
    expect(pvInput('7월 1일 (수) 1. 루트 · 회원 ID 1000 우 계획 PV').disabled).toBe(false);
    expect(
      screen.queryByRole('textbox', {
        name: '7월 1일 (수) 1. 루트 · 회원 ID 1000 좌 계획 PV',
      }),
    ).toBeNull();
    expect(
      screen.getByLabelText('7월 1일 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 0 PV'),
    ).toBeDefined();

    expect(screen.getAllByText('일요일 · 정산 제외')).toHaveLength(2);
    expect(
      screen.queryByRole('textbox', {
        name: '7월 5일 (일) 하위 PVP 계획 PV',
      }),
    ).toBeNull();
    expect(screen.getAllByLabelText(/7월 5일 \(일\).*정산 제외 0/)).toHaveLength(6);
    expect(document.querySelectorAll('.manual-plan-scroll')).toHaveLength(1);
    expect(document.querySelectorAll('.manual-plan-table thead tr')).toHaveLength(2);

    const input = pvInput('7월 1일 (수) 하위 PVP 계획 PV');
    const parent = input.closest('td');
    expect(parent?.getAttribute('headers')).toContain('manual-plan-date-');
    expect(parent?.getAttribute('headers')).toContain('manual-plan-member-');
    expect(parent?.getAttribute('headers')).toContain('manual-plan-column-');
  });

  it('P3-UI-001 updates ancestors, removes stale results, and focuses the exact first error', async () => {
    const { user } = renderWorkspace();
    const pvp = pvInput('7월 1일 (수) 하위 PVP 계획 PV');
    const left = pvInput('7월 1일 (수) 하위 좌 계획 PV');
    const right = pvInput('7월 1일 (수) 하위 우 계획 PV');
    await user.type(pvp, '100');
    await user.type(left, '200');
    await user.type(right, '300');

    expect(
      screen.getByLabelText('7월 1일 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 600 PV'),
    ).toBeDefined();

    await user.clear(pvp);
    await user.type(pvp, 'bad');
    expect(screen.getByText('⚠ 입력 확인 필요')).toBeDefined();
    expect(screen.getAllByText(/0 이상의 숫자만/)).toHaveLength(3);
    expect(screen.getByRole('heading', { name: '선택한 입력 확인' })).toBeDefined();
    expect(
      screen.getByLabelText(
        '7월 1일 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 현재 결과 없음',
      ),
    ).toBeDefined();
    expect(
      screen.queryByLabelText('7월 1일 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 600 PV'),
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
    expect(screen.getByText('✓ 계산 완료')).toBeDefined();
    expect(screen.queryByRole('heading', { name: '선택한 입력 확인' })).toBeNull();
    expect(
      screen.getByLabelText('7월 1일 (수) 1. 루트 · 회원 ID 1000 좌 조직 합계 501 PV'),
    ).toBeDefined();
  });

  it('P3-GRID-003 moves Enter vertically and skips Sunday in both directions', async () => {
    const { user } = renderWorkspace();
    const firstPvp = pvInput('7월 1일 (수) 1. 루트 · 회원 ID 1000 PVP 계획 PV');
    const rootRight = pvInput('7월 1일 (수) 1. 루트 · 회원 ID 1000 우 계획 PV');
    const childPvp = pvInput('7월 1일 (수) 하위 PVP 계획 PV');
    firstPvp.focus();
    await user.tab();
    expect(document.activeElement).toBe(rootRight);
    await user.tab();
    expect(document.activeElement).toBe(childPvp);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(rootRight);

    const julyEleven = pvInput('7월 11일 (토) 하위 PVP 계획 PV');
    julyEleven.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      pvInput('7월 13일 (월) 하위 PVP 계획 PV'),
    );
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(document.activeElement).toBe(julyEleven);

    const julyOne = pvInput('7월 1일 (수) 하위 PVP 계획 PV');
    julyOne.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(julyOne);
  });

  it('P3-GRID-004 member jump scrolls the group and focuses its first editable cell', async () => {
    const { user } = renderWorkspace();
    await user.selectOptions(screen.getByLabelText('회원으로 이동'), 'child');
    await waitFor(() => {
      expect(document.activeElement).toBe(
        pvInput('7월 1일 (수) 하위 PVP 계획 PV'),
      );
    });
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByText('선택: 7월 1일 (수) · 하위')).toBeDefined();
  });

  it('selects and focuses a locked Sunday audit context using only the keyboard', async () => {
    const { user } = renderWorkspace();
    const dateSelect = screen.getByLabelText('날짜 결과 보기');
    dateSelect.focus();
    await user.selectOptions(dateSelect, '2026-07-05');

    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain('7월 5일 (일)');
    });
    expect(screen.getByText('선택: 7월 5일 (일) · 1. 루트 · 회원 ID 1000')).toBeDefined();
    expect(screen.getAllByText('정산 제외').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('정산 제외 · 커미션 없음')).toBeDefined();
  });

  it('requires explicit discard after an edit, preserves on cancel, and confirms removal', async () => {
    const onReturnToSetup = vi.fn();
    const { user } = renderWorkspace(onReturnToSetup);
    const input = pvInput('7월 1일 (수) 하위 PVP 계획 PV');
    await user.type(input, '1');
    const back = screen.getByRole('button', { name: '설정으로 돌아가기' });
    await user.click(back);
    expect(screen.getByRole('dialog', { name: '수동 계획을 버릴까요?' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '계속 계획하기' }));
    await waitFor(() => expect(document.activeElement).toBe(back));
    expect(input.value).toBe('1');
    expect(onReturnToSetup).not.toHaveBeenCalled();

    await user.click(back);
    await user.click(
      screen.getByRole('button', { name: '계획 버리고 설정으로 돌아가기' }),
    );
    expect(onReturnToSetup).toHaveBeenCalledOnce();
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

    const input = pvInput('7월 1일 (수) 하위 PVP 계획 PV');
    await user.type(input, 'bad');
    expect(screen.getByText('입력 확인 필요 1개 · 안내 1개')).toBeDefined();
    expect(screen.getByText('설정에서 확인한 동명이인 안내')).toBeDefined();
  });
});
