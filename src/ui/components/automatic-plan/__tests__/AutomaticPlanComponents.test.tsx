import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  rootCommissionGoal: {
    rootMemberKey: 'root',
    rootMemberLabel: '맨 위 회원',
    businessDayCount: 13,
    targetCommissionDays: 13,
    actualCommissionDays: 12,
    shortfallDays: 1,
    capacityLimited: false,
    met: false,
  },
  highTargetMemberEquivalentUnitCounts: [
    {
      memberKey: 'high',
      memberLabel: '고목표 회원',
      pvpTarget: 2400,
      commissionDays: 6,
      equivalentUnits: 10,
      attainableEquivalentUnits: 12,
      equivalentUnitShortfall: 2,
    },
  ],
  target700MembersAtLeastEightEquivalentUnits: 1,
  target700TotalCommissionEquivalentUnits: 8,
  target700MemberEquivalentUnitCounts: [
    {
      memberKey: 'other-700',
      memberLabel: '그 외 700 회원',
      commissionDays: 4,
      equivalentUnits: 8,
      attainableEquivalentUnits: 8,
      equivalentUnitShortfall: 0,
    },
  ],
  futureCumulativePvpInvestmentPv: 100,
  nonHundredCellCount: 0,
  maxDirectPvp: 300,
  terminalCarryTotal: 200,
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
    await user.click(screen.getByRole('button', { name: '자동으로 계산하기' }));
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

    expect(
      screen.getByText(
        '자동 계산 결과를 찾았습니다. 더 나은 결과를 계산하고 있습니다.',
      ),
    ).toBeTruthy();
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
      ['RUNNING', false, '자동으로 계산하고 있습니다.'],
      ['OPTIMAL', true, '자동 계산이 끝났습니다.'],
      ['TIME_LIMIT', false, '계산 시간이 끝났지만 결과를 만들지 못했습니다.'],
      ['TIME_LIMIT', true, '자동 계산 결과가 준비되었습니다.'],
      ['CANCELLED', false, '계산을 멈췄습니다.'],
      ['CANCELLED', true, '계산을 멈췄습니다. 지금까지 찾은 결과를 사용할 수 있습니다.'],
      ['INFEASIBLE', false, '현재 조건으로 계획을 만들 수 없음'],
      ['FAILED', false, '계산을 완료하지 못했습니다.'],
      ['FAILED', true, '계산이 멈췄습니다. 지금까지 찾은 결과를 사용할 수 있습니다.'],
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

  it('scopes a proof-only failure to minimum checking while retaining the plan', () => {
    render(
      <AutomaticPlanProgress
        status="FAILED"
        elapsedMs={1_000}
        maximumMs={1_800_000}
        hasCandidate
        bestTotalNewPv={5_000}
        phaseLabel="최소값 확인만 중단됨"
        errorMessage="기술적인 증명 도구 오류"
        proofOnlyFailure
      />,
    );

    expect(screen.getByText(
      '계산이 멈췄습니다. 지금까지 찾은 결과를 사용할 수 있습니다.',
    )).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('기술적인 증명 도구 오류')).toBeNull();
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
    await user.click(screen.getByRole('button', { name: '자동으로 계산하기' }));
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
    await user.click(screen.getByRole('button', { name: '계산 멈추기' }));
    await user.click(screen.getByRole('button', { name: '결과 확인하기' }));
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
      expect(screen.getByRole('button', { name: '다시 계산하기' })).toBeTruthy();
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

    expect(screen.getByText('새 계산 결과가 준비되었습니다.')).toBeTruthy();
    expect(screen.getByText('200 (폐기 아님)')).toBeTruthy();
    expect(screen.getByText('그 외 700 목표 중 환산 8회 이상')).toBeTruthy();
    const memberResults = screen.getByRole('table', {
      name: '회원별 수당 발생일과 환산 횟수',
    });
    expect(within(memberResults).getByRole('row', { name: /고목표 회원 2,400 6일 10회 12회 -2회/ })).toBeTruthy();
    expect(within(memberResults).getByRole('row', { name: /그 외 700 회원 700 4일 8회 8회 달성/ })).toBeTruthy();
    const rootGoalMetric = screen.getByText('맨 위 회원 수당').closest('div');
    expect(rootGoalMetric).not.toBeNull();
    expect(within(rootGoalMetric!).getByText('12 / 13영업일')).toBeTruthy();
    expect(screen.getByText('계획 영업일').nextElementSibling?.textContent).toBe('13일');
    expect(
      screen.getByText(/맨 위 회원 수당 목표가 1일 부족합니다/),
    ).toBeTruthy();
    expect(
      screen.getByText(/모든 회원이 매일 직접 입력해야 한다는 뜻은 아닙니다/),
    ).toBeTruthy();
    expect(
      screen.getByText(/기준 상한은 현재 목표 총량으로 계산한 이론상 최대치/),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '새 결과 보기' }));
    await user.click(screen.getByRole('button', { name: '이 결과를 계획표에 넣기' }));
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('renders a proven empty-fairness preview and confirmed checks without a newer plan', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AutomaticPlanPreview
        metrics={{
          ...METRICS,
          optimalityProven: true,
          runStatusLabel: '최소값 확인 완료',
          highTargetMemberEquivalentUnitCounts: [],
          target700MemberEquivalentUnitCounts: [],
          rootCommissionGoal: {
            ...METRICS.rootCommissionGoal,
            actualCommissionDays: 13,
            shortfallDays: 0,
            met: true,
          },
        }}
        newerCandidateAvailable={false}
        onSwitchToLatest={vi.fn()}
        onApply={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('heading', { name: '자동 계산 결과' })).toBeTruthy();
    expect(screen.getByText('✓ 모든 회원의 보름 목표를 확인했습니다.')).toBeTruthy();
    expect(screen.getByText('✓ 모든 정산일의 수당 자격을 확인했습니다.')).toBeTruthy();
    expect(screen.queryByText(/수당 목표가 .* 부족합니다/)).toBeNull();
    expect(screen.queryByRole('table', {
      name: '회원별 수당 발생일과 환산 횟수',
    })).toBeNull();
    await user.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses a dynamic business-day denominator and explains a capacity-limited goal', () => {
    render(
      <AutomaticPlanPreview
        metrics={{
          ...METRICS,
          rootCommissionGoal: {
            ...METRICS.rootCommissionGoal,
            businessDayCount: 14,
            targetCommissionDays: 10,
            actualCommissionDays: 10,
            shortfallDays: 0,
            capacityLimited: true,
            met: true,
          },
        }}
        newerCandidateAvailable={false}
        onSwitchToLatest={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const rootGoalMetric = screen.getByText('맨 위 회원 수당').closest('div');
    expect(rootGoalMetric).not.toBeNull();
    expect(within(rootGoalMetric!).getByText('10 / 10영업일')).toBeTruthy();
    expect(screen.getByText('계획 영업일').nextElementSibling?.textContent).toBe('14일');
    expect(screen.getByText('현재 총량 기준 목표 10일')).toBeTruthy();
    expect(
      screen.getByRole('row', {
        name: '고목표 회원 2,400 6일 10회 12회 -2회',
      }),
    ).toBeTruthy();
  });

  it('describes a capacity-limited shortfall against the aggregate goal', () => {
    render(
      <AutomaticPlanPreview
        metrics={{
          ...METRICS,
          rootCommissionGoal: {
            ...METRICS.rootCommissionGoal,
            businessDayCount: 14,
            targetCommissionDays: 10,
            actualCommissionDays: 9,
            shortfallDays: 1,
            capacityLimited: true,
            met: false,
          },
        }}
        newerCandidateAvailable={false}
        onSwitchToLatest={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/현재 총량 기준 목표는 아직 채우지 못했습니다/),
    ).toBeTruthy();
    expect(screen.queryByText(/전체 영업일 목표는 아직 채우지 못했습니다/)).toBeNull();
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
    await user.click(screen.getByRole('button', { name: '새 결과 보기' }));
    await user.click(screen.getByRole('button', { name: '이 결과를 계획표에 넣기' }));
    await user.click(screen.getByRole('button', { name: '돌아가기' }));
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
    expect(screen.getByText(/직접 입력한 값이 자동 계산 결과로 바뀝니다/)).toBeTruthy();
    expect(screen.getByText(/현재 내용이 자동으로 저장됩니다/)).toBeTruthy();
    expect(screen.getByText(/‘이전 내용 보기’/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '계획표에 넣기' }));
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
    expect(screen.getByText('확인한 자동 계산 결과가 계획표에 들어갑니다.')).toBeTruthy();
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
