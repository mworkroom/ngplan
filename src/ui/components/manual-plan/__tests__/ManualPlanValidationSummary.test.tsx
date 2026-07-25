import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveManualPlanSchema,
  manualPlanCellDomId,
  manualPlanFieldDomId,
  manualPlanMemberGroupDomId,
  type ManualPlanIssue,
} from '../../../../application/manual-plan';
import type { ProjectSetupBundle } from '../../../../application/project-setup';
import {
  ManualPlanSelectedContextIssues,
  ManualPlanValidationSummary,
} from '../ManualPlanValidationSummary';

function createBundle(): ProjectSetupBundle {
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '오류 포커스 테스트',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'America/Sao_Paulo' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-1',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-1',
      members: Object.freeze([
        Object.freeze({
          memberKey: 'root',
          memberId: '',
          name: '루트',
          pvpTarget: 700,
          sheetMarker: 'NONE',
          parentMemberKey: null,
          sideAtParent: null,
        }),
      ]),
      openingStateByMember: Object.freeze({
        root: Object.freeze({
          openingQualificationPvp: 0,
          fortnightPvpOpeningCredit: 0,
          dailyCarryPvp: 0,
          dailyCarryLeft: 0,
          dailyCarryRight: 0,
        }),
      }),
    }),
  });
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

describe('WP6 manual-plan validation and focus', () => {
  it('keeps warning-only guidance quiet and moves an individual item to its member', async () => {
    const user = userEvent.setup();
    const schema = deriveManualPlanSchema(createBundle());
    const warning: ManualPlanIssue = {
      code: 'MEMBER_NAME_DUPLICATE',
      severity: 'WARNING',
      location: { memberKey: 'root', field: 'name' },
      message: '동명이인 여부를 확인해 주세요.',
    };
    render(
      <>
        <ManualPlanValidationSummary
          issues={[warning]}
          schema={schema}
          blocked={false}
          onSelectContext={vi.fn()}
        />
        <h3 id={manualPlanMemberGroupDomId('root')} tabIndex={-1}>
          루트 회원 머리글
        </h3>
      </>,
    );

    expect(screen.getByText('확인이 필요한 안내 1개')).toBeDefined();
    expect(screen.queryByRole('button', { name: '첫 오류로 이동' })).toBeNull();
    await user.click(
      screen.getByRole('button', {
        name: '루트 · 계산 항목 문제 위치로 이동',
      }),
    );
    expect(document.activeElement?.id).toBe(manualPlanMemberGroupDomId('root'));
  });

  it('P3-UI-001 focuses the exact invalid field and updates selected context', async () => {
    const user = userEvent.setup();
    const schema = deriveManualPlanSchema(createBundle());
    const date = '2026-07-01';
    const issue: ManualPlanIssue = {
      code: 'PV_INVALID',
      severity: 'ERROR',
      location: { date, memberKey: 'root', field: 'pvp' },
      message: '잘못된 PV',
    };
    const onSelectContext = vi.fn();
    render(
      <>
        <ManualPlanValidationSummary
          issues={[issue]}
          schema={schema}
          blocked
          onSelectContext={onSelectContext}
        />
        <input id={manualPlanFieldDomId(date, 'root', 'pvp')} aria-label="대상 입력" />
      </>,
    );

    await user.click(screen.getByRole('button', { name: '첫 오류로 이동' }));
    expect(document.activeElement).toBe(screen.getByLabelText('대상 입력'));
    expect(onSelectContext).toHaveBeenCalledWith(date, 'root');
  });

  it('falls back from a missing field target to the stable cell and global anchors', async () => {
    const user = userEvent.setup();
    const schema = deriveManualPlanSchema(createBundle());
    const date = '2026-07-01';
    const fieldIssue: ManualPlanIssue = {
      code: 'PV_INVALID',
      severity: 'ERROR',
      location: { date, memberKey: 'root', field: 'selfLeft' },
      message: '필드 오류',
    };
    const globalIssue: ManualPlanIssue = {
      code: 'MANUAL_PLAN_CALCULATION_FAILED',
      severity: 'ERROR',
      location: {},
      message: '전체 오류',
    };
    render(
      <>
        <ManualPlanValidationSummary
          issues={[fieldIssue, globalIssue]}
          schema={schema}
          blocked
          onSelectContext={vi.fn()}
        />
        <div id={manualPlanCellDomId(date, 'root')} tabIndex={-1}>
          셀 대상
        </div>
        <main id="manual-plan-workspace" tabIndex={-1}>
          전체 대상
        </main>
      </>,
    );

    await user.click(
      screen.getByRole('button', { name: '1 (수) · 루트 · 좌 문제 위치로 이동' }),
    );
    expect(document.activeElement?.id).toBe(manualPlanCellDomId(date, 'root'));
    await user.click(
      screen.getByRole('button', { name: '전체 계획 문제 위치로 이동' }),
    );
    expect(document.activeElement?.id).toBe('manual-plan-workspace');
  });

  it('shows only issues for the selected date and member beside the result context', () => {
    const schema = deriveManualPlanSchema(createBundle());
    const issues: ManualPlanIssue[] = [
      {
        code: 'PV_INVALID',
        severity: 'ERROR',
        location: { date: '2026-07-01', memberKey: 'root', field: 'pvp' },
        message: '선택 오류',
      },
      {
        code: 'PV_INVALID',
        severity: 'ERROR',
        location: { date: '2026-07-02', memberKey: 'root', field: 'pvp' },
        message: '다른 오류',
      },
    ];
    const { rerender } = render(
      <ManualPlanSelectedContextIssues
        issues={issues}
        schema={schema}
        selectedDate="2026-07-01"
        selectedMemberKey="root"
      />,
    );
    expect(screen.getByText('선택 오류')).toBeDefined();
    expect(screen.queryByText('다른 오류')).toBeNull();

    rerender(
      <ManualPlanSelectedContextIssues
        issues={issues}
        schema={schema}
        selectedDate="2026-07-03"
        selectedMemberKey="root"
      />,
    );
    expect(screen.queryByRole('heading', { name: '선택한 입력 확인' })).toBeNull();
  });
});
