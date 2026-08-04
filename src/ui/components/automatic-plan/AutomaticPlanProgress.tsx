export type AutomaticPlanUiStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'OPTIMAL'
  | 'TIME_LIMIT'
  | 'CANCELLED'
  | 'INFEASIBLE'
  | 'FAILED';

export interface AutomaticPlanProgressProps {
  readonly status: AutomaticPlanUiStatus;
  readonly elapsedMs: number;
  readonly maximumMs: number;
  readonly hasCandidate: boolean;
  readonly bestTotalNewPv: number | null;
  readonly phaseLabel: string;
  readonly errorMessage?: string | null;
  readonly proofOnlyFailure?: boolean;
}

function formatElapsed(milliseconds: number): string {
  const safeMilliseconds = Number.isFinite(milliseconds)
    ? Math.max(0, Math.floor(milliseconds))
    : 0;
  const totalSeconds = Math.floor(safeMilliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
}

function statusLabel(status: AutomaticPlanUiStatus, hasCandidate: boolean): string {
  switch (status) {
    case 'IDLE':
      return '계산 전';
    case 'RUNNING':
      return hasCandidate
        ? '계획표가 준비되었습니다. 조금 더 정리하고 있습니다.'
        : '자동으로 계산하고 있습니다.';
    case 'OPTIMAL':
      return '자동 계산이 끝났습니다.';
    case 'TIME_LIMIT':
      return hasCandidate
        ? '자동 계산 결과가 준비되었습니다.'
        : '계산 시간이 끝났지만 결과를 만들지 못했습니다.';
    case 'CANCELLED':
      return hasCandidate
        ? '계산을 멈췄습니다. 지금까지 찾은 결과를 사용할 수 있습니다.'
        : '계산을 멈췄습니다.';
    case 'INFEASIBLE':
      return '현재 조건으로 계획을 만들 수 없음';
    case 'FAILED':
      return hasCandidate
        ? '계산이 멈췄습니다. 지금까지 찾은 결과를 사용할 수 있습니다.'
        : '계산을 완료하지 못했습니다.';
  }
}

export function AutomaticPlanProgress({
  status,
  elapsedMs,
  maximumMs,
  hasCandidate,
  bestTotalNewPv,
  errorMessage = null,
  proofOnlyFailure = false,
}: AutomaticPlanProgressProps) {
  const progress = maximumMs <= 0 ? 0 : Math.min(1, Math.max(0, elapsedMs / maximumMs));
  return (
    <div className="automatic-plan-progress" aria-live="polite">
      <div className="automatic-plan-progress__status">
        <strong>{statusLabel(status, hasCandidate)}</strong>
      </div>
      <progress
        aria-label="자동 계획 계산 시간"
        max={maximumMs}
        value={Math.min(maximumMs, Math.max(0, elapsedMs))}
      />
      <div className="automatic-plan-progress__metrics">
        <span>{formatElapsed(elapsedMs)} / 최대 {formatElapsed(maximumMs)}</span>
        {bestTotalNewPv === null ? null : (
          <span>현재 총 신규 PV {bestTotalNewPv.toLocaleString('ko-KR')}</span>
        )}
        <span className="visually-hidden">진행률 {Math.round(progress * 100)}%</span>
      </div>
      {errorMessage === null || (proofOnlyFailure && hasCandidate) ? null : (
        <p role="alert">{errorMessage}</p>
      )}
    </div>
  );
}
