import type { ManualPlanMemberSummaryView } from '../../../application/manual-plan';

export interface MemberFortnightSummaryProps {
  readonly selected: ManualPlanMemberSummaryView | null;
  readonly rows: readonly ManualPlanMemberSummaryView[] | null;
  readonly blocked: boolean;
}

const PV_FORMATTER = new Intl.NumberFormat('ko-KR');
const pv = (value: number): string => `${PV_FORMATTER.format(value)} PV`;

function occurrenceDateLabel(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return month === undefined || day === undefined ? date : `${month}월 ${day}일`;
}

function SummaryValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function MemberFortnightSummary({
  selected,
  rows,
  blocked,
}: MemberFortnightSummaryProps) {
  if (blocked || selected === null || rows === null) {
    return (
      <section className="panel manual-result-panel" aria-labelledby="member-summary-title">
        <h2 id="member-summary-title" className="panel__title">
          보름 목표 요약
        </h2>
        <p className="manual-result-unavailable">현재 입력을 수정하면 보름 결과를 다시 표시합니다.</p>
      </section>
    );
  }

  return (
    <section className="panel manual-result-panel" aria-labelledby="member-summary-title">
      <div className="panel__header">
        <div>
          <h2 id="member-summary-title" className="panel__title">
            보름 목표 요약
          </h2>
          <p className="panel__description">
            {selected.memberLabel} · 목표 {pv(selected.pvpTarget)}
          </p>
        </div>
        <span className={`status-badge ${selected.allTargetsMet ? 'status-badge--ready' : 'status-badge--warning'}`}>
          {selected.allTargetsLabel}
        </span>
      </div>

      <dl className="manual-summary-grid">
        <SummaryValue label="자격 PVP 시작" value={pv(selected.openingQualificationPvp)} />
        <SummaryValue label="자격 PVP 마감" value={pv(selected.closingQualificationPvp)} />
        <SummaryValue label="보름 PVP 시작" value={pv(selected.fortnightPvpOpeningCredit)} />
        <SummaryValue label="신규 PVP" value={pv(selected.newPvpTotal)} />
        <SummaryValue label="개인 PVP 합계" value={pv(selected.personalPvpTotal)} />
        <SummaryValue label="개인 PVP 목표" value={pv(selected.personalPvpTarget)} />
        <SummaryValue label="추가 필요 PVP" value={pv(selected.remainingPvp)} />
        <SummaryValue label="개인 PVP 상태" value={selected.personalPvpStatusLabel} />
        <SummaryValue label="누적 좌" value={pv(selected.rawLeftTotal)} />
        <SummaryValue label="누적 우" value={pv(selected.rawRightTotal)} />
        <SummaryValue label="마감 PVP 적용" value={`${pv(selected.periodPvpForSide)} · ${selected.pvpApplicationLabel}`} />
        <SummaryValue label="판정 좌" value={`${pv(selected.assessedLeft)} · ${selected.leftTargetLabel}`} />
        <SummaryValue label="판정 우" value={`${pv(selected.assessedRight)} · ${selected.rightTargetLabel}`} />
        <SummaryValue label="커미션 발생일" value={`${selected.commissionDays}일`} />
        <SummaryValue label="자격 미달 정산" value={`${selected.belowQualificationSettlementDays}일`} />
        <SummaryValue label="분산 권장" value={selected.recommendationLabel} />
      </dl>

      <div className="manual-commission-occurrences">
        <h3>커미션 발생 상세</h3>
        {selected.commissionOccurrences.length === 0 ? (
          <p>이 기간에 발생한 커미션이 없습니다.</p>
        ) : (
          <ol>
            {selected.commissionOccurrences.map((occurrence) => (
              <li key={`${occurrence.date}-${occurrence.tier}`}>
                <time dateTime={occurrence.date}>
                  {occurrenceDateLabel(occurrence.date)}
                </time>
                <span>{PV_FORMATTER.format(occurrence.tier)} PV 단계</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <h3 className="manual-summary-overview-title">전체 회원 마감 현황</h3>
      <div className="manual-summary-overview-scroll">
        <table className="manual-summary-overview">
          <thead>
            <tr>
              <th scope="col">회원</th>
              <th scope="col">개인 PVP</th>
              <th scope="col">추가 필요</th>
              <th scope="col">누적 좌 / 우</th>
              <th scope="col">목표 상태</th>
              <th scope="col">커미션</th>
              <th scope="col">권장 상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.memberKey}>
                <th scope="row">{row.memberLabel}</th>
                <td>{pv(row.personalPvpTotal)} / {pv(row.personalPvpTarget)}</td>
                <td>{pv(row.remainingPvp)}</td>
                <td>{pv(row.rawLeftTotal)} / {pv(row.rawRightTotal)}</td>
                <td>{row.allTargetsLabel}</td>
                <td>{row.commissionDays}일</td>
                <td>{row.recommendationLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
