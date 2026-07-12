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
          오늘 계산 결과
        </h2>
        <p className="manual-result-unavailable">잘못 입력한 값을 고치면 오늘 결과가 다시 나타납니다.</p>
      </section>
    );
  }

  return (
    <section className="panel manual-result-panel" aria-labelledby="daily-audit-title">
      <div className="panel__header">
        <div>
          <h2 id="daily-audit-title" className="panel__title">
            오늘 계산 결과
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
          <strong>1. 전날에서 넘어온 값</strong>
          <BalanceValues {...view.carryIn} />
        </li>
        <li>
          <strong>2. 오늘 들어온 실적</strong>
          <span className="manual-result-values">
            <span>직접 PVP {pv(view.rawPerformance.directPvp)}</span>
            <span>조직 좌 {pv(view.rawPerformance.organizationLeft)}</span>
            <span>조직 우 {pv(view.rawPerformance.organizationRight)}</span>
          </span>
        </li>
        <li>
          <strong>3. 수당 자격 PVP</strong>
          <span>
            {pv(view.qualificationPvp)} ·{' '}
            {view.qualificationThresholdMet ? '자격 300 이상' : '자격 300 미만'}
          </span>
        </li>
        <li>
          <strong>4. 오늘 계산에 사용할 합계</strong>
          <BalanceValues {...view.preSettlement} />
        </li>
        <li>
          <strong>5. PVP 적용</strong>
          <span>{view.pvpApplicationLabel}</span>
        </li>
        <li>
          <strong>6. PVP를 더한 좌·우</strong>
          <span className="manual-result-values">
            <span>좌 {pv(view.assessedLeft)}</span>
            <span>우 {pv(view.assessedRight)}</span>
          </span>
        </li>
        <li>
          <strong>7. 커미션</strong>
          <span>{view.commissionLabel}</span>
        </li>
        <li>
          <strong>8. 다음 날로 넘어가는 값</strong>
          <BalanceValues {...view.carryOut} />
        </li>
        <li>
          <strong>9. 오늘까지의 보름 합계</strong>
          <span className="manual-result-values manual-result-values--wide">
            <span>개인 PVP {pv(view.running.personalPvpTotal)}</span>
            <span>목표 {pv(view.running.personalPvpTarget)}</span>
            <span>추가 필요 {pv(view.running.remainingPvp)}</span>
            <span>누적 좌 {pv(view.running.rawLeftTotal)}</span>
            <span>누적 우 {pv(view.running.rawRightTotal)}</span>
            <span>{view.runningPvpStatusLabel}</span>
          </span>
        </li>
      </ol>
    </section>
  );
}
