import type { ManualPlanDailyAuditView } from '../../../application/manual-plan';

export interface DailyResultDetailsProps {
  readonly view: ManualPlanDailyAuditView | null;
  readonly blocked: boolean;
}

const PV_FORMATTER = new Intl.NumberFormat('ko-KR');
const pv = (value: number | null): string =>
  value === null ? '—' : `${PV_FORMATTER.format(value)} PV`;

function BalanceValues({
  pvp,
  left,
  right,
}: {
  readonly pvp: number;
  readonly left: number;
  readonly right: number;
}) {
  return (
    <span className="manual-result-values">
      <span>PVP {pv(pvp)}</span>
      <span>좌 {pv(left)}</span>
      <span>우 {pv(right)}</span>
    </span>
  );
}

export function DailyResultDetails({ view, blocked }: DailyResultDetailsProps) {
  if (blocked || view === null) {
    return (
      <section className="panel manual-result-panel" aria-labelledby="daily-audit-title">
        <h2 id="daily-audit-title" className="panel__title">
          일일 계산 감사
        </h2>
        <p className="manual-result-unavailable">현재 입력을 수정하면 일일 결과를 다시 표시합니다.</p>
      </section>
    );
  }

  return (
    <section className="panel manual-result-panel" aria-labelledby="daily-audit-title">
      <div className="panel__header">
        <div>
          <h2 id="daily-audit-title" className="panel__title">
            일일 계산 감사
          </h2>
          <p className="panel__description">
            {view.dateLabel} · {view.memberLabel}
          </p>
        </div>
        <span className="status-badge">
          {view.settlementStatus === 'SKIPPED' ? '정산 제외' : '정산 완료'}
        </span>
      </div>

      <ol className="manual-audit-list">
        <li>
          <strong>1. 이월 시작값</strong>
          <BalanceValues {...view.carryIn} />
        </li>
        <li>
          <strong>2. 오늘 원본 실적</strong>
          <span className="manual-result-values">
            <span>직접 PVP {pv(view.rawPerformance.directPvp)}</span>
            <span>조직 좌 {pv(view.rawPerformance.organizationLeft)}</span>
            <span>조직 우 {pv(view.rawPerformance.organizationRight)}</span>
          </span>
        </li>
        <li>
          <strong>3. 정산 전 잔액</strong>
          <BalanceValues {...view.preSettlement} />
        </li>
        <li>
          <strong>4. PVP 적용</strong>
          <span>{view.pvpApplicationLabel}</span>
        </li>
        <li>
          <strong>5. 판정 좌·우</strong>
          <span className="manual-result-values">
            <span>좌 {pv(view.assessedLeft)}</span>
            <span>우 {pv(view.assessedRight)}</span>
          </span>
        </li>
        <li>
          <strong>6. 커미션</strong>
          <span>{view.commissionLabel}</span>
        </li>
        <li>
          <strong>7. 다음 이월</strong>
          <BalanceValues {...view.carryOut} />
        </li>
        <li>
          <strong>8. 이 날짜까지 보름 진행</strong>
          <span className="manual-result-values manual-result-values--wide">
            <span>개인 PVP {pv(view.running.personalPvpTotal)}</span>
            <span>목표 {pv(view.running.personalPvpTarget)}</span>
            <span>추가 필요 {pv(view.running.remainingPvp)}</span>
            <span>원본 좌 {pv(view.running.rawLeftTotal)}</span>
            <span>원본 우 {pv(view.running.rawRightTotal)}</span>
            <span>{view.runningPvpStatusLabel}</span>
          </span>
        </li>
      </ol>
    </section>
  );
}
