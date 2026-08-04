import type { AutomaticPlanUiStatus } from './AutomaticPlanProgress';

export interface AutomaticPlanControlsProps {
  readonly status: AutomaticPlanUiStatus;
  readonly hasCandidate: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onPreview: () => void;
}

export function AutomaticPlanControls({
  status,
  hasCandidate,
  onStart,
  onStop,
  onPreview,
}: AutomaticPlanControlsProps) {
  const running = status === 'RUNNING';
  const canRestart =
    status === 'TIME_LIMIT' || status === 'CANCELLED' || status === 'FAILED';

  return (
    <div className="automatic-plan-controls">
      {status === 'IDLE' ? (
        <button type="button" className="primary-button" onClick={onStart}>
          자동으로 계산하기
        </button>
      ) : null}
      {running ? (
        <button type="button" className="secondary-button" onClick={onStop}>
          지금 내용으로 계획표 보기
        </button>
      ) : null}
      {hasCandidate ? (
        <button type="button" className="primary-button" onClick={onPreview}>
          완성된 계획표 보기
        </button>
      ) : null}
      {canRestart ? (
        <button type="button" className="secondary-button" onClick={onStart}>
          다시 계산하기
        </button>
      ) : null}
    </div>
  );
}
