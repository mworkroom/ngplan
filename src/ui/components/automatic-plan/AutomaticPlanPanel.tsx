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
          <h2 id="automatic-plan-title">계획표 만드는 중</h2>
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
