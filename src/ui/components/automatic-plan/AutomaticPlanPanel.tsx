import { AutomaticPlanControls } from './AutomaticPlanControls';
import {
  AutomaticPlanPreview,
  type AutomaticPlanPreviewMetrics,
} from './AutomaticPlanPreview';
import {
  AutomaticPlanProgress,
  type AutomaticPlanUiStatus,
} from './AutomaticPlanProgress';

export interface AutomaticPlanPanelProps {
  readonly status: AutomaticPlanUiStatus;
  readonly elapsedMs: number;
  readonly maximumMs: number;
  readonly phaseLabel: string;
  readonly latestCandidate: AutomaticPlanPreviewMetrics | null;
  readonly pinnedCandidate: AutomaticPlanPreviewMetrics | null;
  readonly errorMessage?: string | null;
  readonly proofOnlyFailure?: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onOpenPreview: () => void;
  readonly onSwitchToLatest: () => void;
  readonly onApplyPinned: () => void;
  readonly onClosePreview: () => void;
}

export function AutomaticPlanPanel({
  status,
  elapsedMs,
  maximumMs,
  phaseLabel,
  latestCandidate,
  pinnedCandidate,
  errorMessage = null,
  proofOnlyFailure = false,
  onStart,
  onStop,
  onOpenPreview,
  onSwitchToLatest,
  onApplyPinned,
  onClosePreview,
}: AutomaticPlanPanelProps) {
  return (
    <section className="automatic-plan-panel" aria-labelledby="automatic-plan-title">
      <div className="automatic-plan-panel__heading">
        <div>
          <h2 id="automatic-plan-title">자동 계획</h2>
          <p>현재 설정으로 검증 가능한 계획을 찾습니다. 한 번의 계산은 최대 30분입니다.</p>
        </div>
        <AutomaticPlanControls
          status={status}
          hasCandidate={latestCandidate !== null}
          onStart={onStart}
          onStop={onStop}
          onPreview={onOpenPreview}
        />
      </div>

      {status === 'IDLE' ? null : (
        <AutomaticPlanProgress
          status={status}
          elapsedMs={elapsedMs}
          maximumMs={maximumMs}
          hasCandidate={latestCandidate !== null}
          bestTotalNewPv={latestCandidate?.totalNewPv ?? null}
          phaseLabel={phaseLabel}
          errorMessage={errorMessage}
          proofOnlyFailure={proofOnlyFailure}
        />
      )}

      {latestCandidate === null || pinnedCandidate !== null ? null : (
        <p className="automatic-plan-panel__apply-notice" role="status">
          검증 계획을 찾았습니다. 아래 계획표와 확인 안내는 아직 기존 입력 기준입니다.{' '}
          <strong>검증 계획 확인·적용</strong>을 눌러 계획표에 넣어 주세요.
        </p>
      )}

      {pinnedCandidate === null ? null : (
        <AutomaticPlanPreview
          metrics={pinnedCandidate}
          newerCandidateAvailable={
            latestCandidate !== null &&
            latestCandidate.candidateId !== pinnedCandidate.candidateId
          }
          onSwitchToLatest={onSwitchToLatest}
          onApply={onApplyPinned}
          onClose={onClosePreview}
        />
      )}
    </section>
  );
}
