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
      return hasCandidate ? '현재까지 찾은 가장 좋은 검증 계획' : '사용 가능한 계획 찾는 중';
    case 'OPTIMAL':
      return '최소값 확인 완료';
    case 'TIME_LIMIT':
      return hasCandidate ? '30분 동안 찾은 검증 계획' : '30분 안에 사용할 계획을 찾지 못함';
    case 'CANCELLED':
      return hasCandidate ? '중지 전까지 찾은 검증 계획' : '계산 중지됨';
    case 'INFEASIBLE':
      return '현재 조건으로 계획을 만들 수 없음';
    case 'FAILED':
      return hasCandidate ? '계산은 멈췄지만 검증 계획은 사용 가능' : '계산을 계속하지 못함';
  }
}

export function AutomaticPlanProgress({
  status,
  elapsedMs,
  maximumMs,
  hasCandidate,
  bestTotalNewPv,
  phaseLabel,
  errorMessage = null,
}: AutomaticPlanProgressProps) {
  const progress = maximumMs <= 0 ? 0 : Math.min(1, Math.max(0, elapsedMs / maximumMs));
  return (
    <div className="automatic-plan-progress" aria-live="polite">
      <div className="automatic-plan-progress__status">
        <strong>{statusLabel(status, hasCandidate)}</strong>
        <span>{phaseLabel}</span>
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
      {errorMessage === null ? null : <p role="alert">{errorMessage}</p>}
    </div>
  );
}
