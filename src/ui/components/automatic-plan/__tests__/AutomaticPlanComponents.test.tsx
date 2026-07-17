import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplyAutomaticPlanDialog } from '../ApplyAutomaticPlanDialog';
import { AutomaticPlanControls } from '../AutomaticPlanControls';
import { AutomaticPlanPanel } from '../AutomaticPlanPanel';
import { AutomaticPlanPreview } from '../AutomaticPlanPreview';
import { AutomaticPlanProgress } from '../AutomaticPlanProgress';

afterEach(cleanup);

const METRICS = {
  candidateId: 'candidate-1',
  foundAtElapsedMs: 90_000,
  totalNewPv: 5_000,
  confirmedPayoutWon: 480_000,
  optimalityProven: false,
  runStatusLabel: '최적성 확인 중',
  discardedExcessPv: 0,
  priorityDepthMemberDayCounts: [
    {
      memberKey: 'priority',
      memberLabel: '조직 우선 회원',
      organizationDepth: 2,
      days: 12,
    },
  ],
  highTargetMemberDayCounts: [
    { memberKey: 'high', memberLabel: '고목표 회원', pvpTarget: 2400, days: 10 },
  ],
  target700MembersAtLeastEight: 1,
  target700TotalCommissionDays: 8,
  target700MemberDayCounts: [
    { memberKey: 'root', memberLabel: '루트 회원', days: 8 },
  ],
  futureCumulativePvpInvestmentPv: 100,
  nonHundredCellCount: 0,
  maxDirectPvp: 300,
  terminalCarryTotal: 200,
  allTargetsMet: true,
  allCommissionsQualified: true,
} as const;

describe('automatic plan operator components', () => {
  it('combines the idle entry action without showing proof progress early', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <AutomaticPlanPanel
        status="IDLE"
        elapsedMs={0}
        maximumMs={1_800_000}
        phaseLabel="계산 전"
        latestCandidate={null}
        pinnedCandidate={null}
        onStart={onStart}
        onStop={vi.fn()}
        onOpenPreview={vi.fn()}
        onSwitchToLatest={vi.fn()}
        onApplyPinned={vi.fn()}
        onClosePreview={vi.fn()}
      />,
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
    await user.click(screen.getByRole('button', { name: '자동 계획 만들기' }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('shows the fixed 30-minute run and verified incumbent wording', () => {
    render(
      <AutomaticPlanProgress
        status="RUNNING"
        elapsedMs={125_000}
        maximumMs={1_800_000}
        hasCandidate
        bestTotalNewPv={5_000}
        phaseLabel="최소값인지 확인 중"
      />,
    );

    expect(screen.getByText('현재까지 찾은 가장 좋은 검증 계획')).toBeTruthy();
    expect(screen.getByText('2분 05초 / 최대 30분 00초')).toBeTruthy();
    expect(screen.getByText('현재 총 신규 PV 5,000')).toBeTruthy();
  });

  it('uses distinct honest copy for every run state and defensive elapsed values', () => {
    const base = {
      elapsedMs: 0,
      maximumMs: 1_800_000,
      hasCandidate: false,
      bestTotalNewPv: null,
      phaseLabel: '상태 확인',
    } as const;
    const { rerender } = render(<AutomaticPlanProgress status="IDLE" {...base} />);
    expect(screen.getByText('계산 전')).toBeTruthy();

    const cases = [
      ['RUNNING', false, '사용 가능한 계획 찾는 중'],
      ['OPTIMAL', true, '최소값 확인 완료'],
      ['TIME_LIMIT', false, '30분 안에 사용할 계획을 찾지 못함'],
      ['TIME_LIMIT', true, '30분 동안 찾은 검증 계획'],
      ['CANCELLED', false, '계산 중지됨'],
      ['CANCELLED', true, '중지 전까지 찾은 검증 계획'],
      ['INFEASIBLE', false, '현재 조건으로 계획을 만들 수 없음'],
      ['FAILED', false, '계산을 계속하지 못함'],
      ['FAILED', true, '계산은 멈췄지만 검증 계획은 사용 가능'],
    ] as const;
    for (const [status, hasCandidate, label] of cases) {
      rerender(
        <AutomaticPlanProgress
          {...base}
          status={status}
          hasCandidate={hasCandidate}
          errorMessage={status === 'FAILED' ? '안전한 오류' : null}
        />,
      );
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole('alert').textContent).toBe('안전한 오류');

    rerender(
      <AutomaticPlanProgress
        {...base}
        status="RUNNING"
        elapsedMs={Number.NaN}
        maximumMs={0}
      />,
    );
    expect(screen.getByText('0분 00초 / 최대 0분 00초')).toBeTruthy();
  });

  it('exposes start, stop, preview, and fresh restart without an extended mode', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onPreview = vi.fn();
    const { rerender } = render(
      <AutomaticPlanControls
        status="IDLE"
        hasCandidate={false}
        onStart={onStart}
        onStop={onStop}
        onPreview={onPreview}
      />,
    );
    await user.click(screen.getByRole('button', { name: '자동 계획 만들기' }));
    expect(onStart).toHaveBeenCalledOnce();

    rerender(
      <AutomaticPlanControls
        status="RUNNING"
        hasCandidate
        onStart={onStart}
        onStop={onStop}
        onPreview={onPreview}
      />,
    );
    await user.click(screen.getByRole('button', { name: '계산 중지' }));
    await user.click(screen.getByRole('button', { name: '검증 계획 확인·적용' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(onPreview).toHaveBeenCalledOnce();
    expect(screen.queryByText(/3시간|사용자 지정/)).toBeNull();

    for (const status of ['TIME_LIMIT', 'CANCELLED', 'FAILED'] as const) {
      rerender(
        <AutomaticPlanControls
          status={status}
          hasCandidate={false}
          onStart={onStart}
          onStop={onStop}
          onPreview={onPreview}
        />,
      );
      expect(screen.getByRole('button', { name: '다시 계산' })).toBeTruthy();
    }
    for (const status of ['OPTIMAL', 'INFEASIBLE'] as const) {
      rerender(
        <AutomaticPlanControls
          status={status}
          hasCandidate={false}
          onStart={onStart}
          onStop={onStop}
          onPreview={onPreview}
        />,
      );
      expect(screen.queryByRole('button')).toBeNull();
    }
  });

  it('keeps a pinned preview and offers an explicit switch to the latest candidate', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    const onApply = vi.fn();
    render(
      <AutomaticPlanPreview
        metrics={METRICS}
        newerCandidateAvailable
        onSwitchToLatest={onSwitch}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/지금 보는 계획은 바뀌지 않았습니다/)).toBeTruthy();
    expect(screen.getByText('200 (폐기 아님)')).toBeTruthy();
    expect(screen.getByText('그 외 700 목표 중 8일 이상')).toBeTruthy();
    expect(screen.getByRole('list', { name: '그 외 700 목표 회원별 발생일' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '새 계획 보기' }));
    await user.click(screen.getByRole('button', { name: '이 계획을 계획표에 적용' }));
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('renders a proven empty-fairness preview and warning checks without a newer plan', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AutomaticPlanPreview
        metrics={{
          ...METRICS,
          optimalityProven: true,
          runStatusLabel: '최소값 확인 완료',
          priorityDepthMemberDayCounts: [],
          highTargetMemberDayCounts: [],
          target700MemberDayCounts: [],
          allTargetsMet: false,
          allCommissionsQualified: false,
        }}
        newerCandidateAvailable={false}
        onSwitchToLatest={vi.fn()}
        onApply={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/최소값 확인 완료/)).toBeTruthy();
    expect(screen.getByText('⚠ 목표 확인 필요')).toBeTruthy();
    expect(screen.getByText('⚠ 자격 확인 필요')).toBeTruthy();
    expect(screen.queryByRole('list', { name: '그 외 700 목표 회원별 발생일' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('wires a running panel to its pinned preview actions', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <AutomaticPlanPanel
        status="RUNNING"
        elapsedMs={1}
        maximumMs={1_800_000}
        phaseLabel="최소값인지 확인 중"
        latestCandidate={{ ...METRICS, candidateId: 'candidate-2' }}
        pinnedCandidate={METRICS}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onOpenPreview={vi.fn()}
        onSwitchToLatest={onSwitch}
        onApplyPinned={onApply}
        onClosePreview={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: '새 계획 보기' }));
    await user.click(screen.getByRole('button', { name: '이 계획을 계획표에 적용' }));
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('requires plain confirmation before replacing modified manual values', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ApplyAutomaticPlanDialog
        manualDraftModified
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/현재 수동 입력은 자동 계획 값으로 교체됩니다/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '적용' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('closes an unmodified apply dialog from its backdrop', () => {
    const onCancel = vi.fn();
    render(
      <ApplyAutomaticPlanDialog
        manualDraftModified={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('선택한 검증 계획만 계획표에 들어갑니다.')).toBeTruthy();
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
