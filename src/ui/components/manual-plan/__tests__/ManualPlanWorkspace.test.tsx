import { useRef, useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManualPlanDraft } from '../../../../application/manual-plan';
import type { ProjectSetupBundle } from '../../../../application/project-setup';
import { DiscardManualPlanDialog } from '../DiscardManualPlanDialog';
import { ManualPlanWorkspace } from '../ManualPlanWorkspace';

function createBundle(): ProjectSetupBundle {
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '2026년 7월 상반기 수당 계획',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'Asia/Seoul' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-1',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-1',
      members: Object.freeze([
        Object.freeze({
          memberKey: 'root',
          memberId: '',
          name: '루트 회원',
          pvpTarget: 700,
          sheetMarker: 'PINK_1',
          parentMemberKey: null,
          sideAtParent: null,
        }),
      ]),
      openingStateByMember: Object.freeze({
        root: Object.freeze({
          fortnightPvpOpeningCredit: 0,
          dailyCarryPvp: 0,
          dailyCarryLeft: 0,
          dailyCarryRight: 0,
        }),
      }),
    }),
  });
}

function createIdentityBundle(): ProjectSetupBundle {
  const openingStateByMember = Object.create(null) as Record<
    string,
    {
      readonly fortnightPvpOpeningCredit: number;
      readonly dailyCarryPvp: number;
      readonly dailyCarryLeft: number;
      readonly dailyCarryRight: number;
    }
  >;
  for (const memberKey of ['__proto__', 'A/B', 'A_B']) {
    Object.defineProperty(openingStateByMember, memberKey, {
      enumerable: true,
      value: Object.freeze({
        fortnightPvpOpeningCredit: 0,
        dailyCarryPvp: 0,
        dailyCarryLeft: 0,
        dailyCarryRight: 0,
      }),
    });
  }
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-identities',
      title: '동명이인 계획',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'Asia/Seoul' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-identities',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-identities',
      members: Object.freeze([
        Object.freeze({
          memberKey: '__proto__',
          memberId: '',
          name: '민지',
          pvpTarget: 700,
          sheetMarker: 'PINK_1',
          parentMemberKey: null,
          sideAtParent: null,
        }),
        Object.freeze({
          memberKey: 'A/B',
          memberId: '',
          name: '민지',
          pvpTarget: 1500,
          sheetMarker: 'GREEN_2',
          parentMemberKey: '__proto__',
          sideAtParent: 'LEFT' as const,
        }),
        Object.freeze({
          memberKey: 'A_B',
          memberId: '1004',
          name: '민지',
          pvpTarget: 700,
          sheetMarker: 'NONE',
          parentMemberKey: '__proto__',
          sideAtParent: 'RIGHT' as const,
        }),
      ]),
      openingStateByMember: Object.freeze(openingStateByMember),
    }),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WP3 manual-plan workspace boundary', () => {
  it('initializes a current blank session and shares density and return controls', async () => {
    const user = userEvent.setup();
    const onDensityChange = vi.fn();
    const onReturnToSetup = vi.fn();
    const { rerender } = render(
      <ManualPlanWorkspace
        bundle={createBundle()}
        draft={createManualPlanDraft(createBundle())}
        setupWarnings={[]}
        displayDensity="COMPACT"
        onDisplayDensityChange={onDensityChange}
        onDraftChange={vi.fn()}
        onReturnToSetup={onReturnToSetup}
      />,
    );

    expect(screen.getByRole('heading', { name: '2026년 7월 상반기 수당 계획' }))
      .toBeDefined();
    expect(screen.getByText('2026년 7월 1일 ~ 15일')).toBeDefined();
    expect(screen.getByText('✓ 계산 완료')).toBeDefined();
    expect(screen.getByText('15일 · 1명 계획표')).toBeDefined();
    expect(document.getElementById('manual-plan-workspace')?.dataset.density).toBe(
      'compact',
    );

    await user.selectOptions(screen.getByLabelText('화면 크기'), 'COMFORTABLE');
    expect(onDensityChange).toHaveBeenCalledWith('COMFORTABLE');
    rerender(
      <ManualPlanWorkspace
        bundle={createBundle()}
        draft={createManualPlanDraft(createBundle())}
        setupWarnings={[]}
        displayDensity="COMFORTABLE"
        onDisplayDensityChange={onDensityChange}
        onDraftChange={vi.fn()}
        onReturnToSetup={onReturnToSetup}
      />,
    );
    expect(document.getElementById('manual-plan-workspace')?.dataset.density).toBe(
      'comfortable',
    );

    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    expect(onReturnToSetup).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('P3-DRAFT-005/006 renders duplicate names, optional IDs, and special keys safely', () => {
    const { container } = render(
      <ManualPlanWorkspace
        bundle={createIdentityBundle()}
        draft={createManualPlanDraft(createIdentityBundle())}
        setupWarnings={[]}
        displayDensity="COMPACT"
        onDisplayDensityChange={vi.fn()}
        onDraftChange={vi.fn()}
        onReturnToSetup={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('textbox', {
        name: '1 (수) 1. 민지 · 동명이인 2 PVP 계획 PV',
      }),
    ).toBeDefined();
    expect(
      screen.getByRole('textbox', {
        name: '1 (수) 2. 민지 · 동명이인 1 PVP 계획 PV',
      }),
    ).toBeDefined();
    expect(
      screen.getByRole('textbox', {
        name: '1 (수) 민지 · 회원 ID 1004 PVP 계획 PV',
      }),
    ).toBeDefined();
    expect(container.textContent).not.toContain('__proto__');
    expect(container.textContent).not.toContain('A/B');
    expect(container.textContent).not.toContain('A_B');
  });
});

describe('DiscardManualPlanDialog focus behavior', () => {
  function DialogHarness({ onConfirm }: { readonly onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          설정으로 돌아가기
        </button>
        {open ? (
          <DiscardManualPlanDialog
            onCancel={() => setOpen(false)}
            onConfirm={onConfirm}
            returnFocusRef={triggerRef}
          />
        ) : null}
      </>
    );
  }

  it('traps focus and restores the return trigger after Escape cancellation', async () => {
    const user = userEvent.setup();
    render(<DialogHarness onConfirm={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '설정으로 돌아가기' });

    await user.click(trigger);
    const cancel = screen.getByRole('button', { name: '계속 계획하기' });
    const confirm = screen.getByRole('button', {
      name: '계획 버리고 설정으로 돌아가기',
    });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('supports backdrop cancellation and explicit discard confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { container } = render(<DialogHarness onConfirm={onConfirm} />);
    const trigger = screen.getByRole('button', { name: '설정으로 돌아가기' });

    await user.click(trigger);
    const backdrop = container.querySelector('.dialog-backdrop');
    if (!(backdrop instanceof HTMLElement)) {
      throw new Error('discard backdrop missing');
    }
    fireEvent.mouseDown(backdrop);
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    await user.click(trigger);
    await user.click(
      screen.getByRole('button', { name: '계획 버리고 설정으로 돌아가기' }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
