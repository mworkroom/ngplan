export interface AutomaticPlanPreviewMetrics {
  readonly candidateId: string;
  readonly foundAtElapsedMs: number;
  readonly totalNewPv: number;
  readonly optimalityProven: boolean;
  readonly runStatusLabel: string;
  readonly discardedExcessPv: number;
  readonly target700MembersAtLeastEight: number;
  readonly target700TotalCommissionDays: number;
  readonly target700MemberDayCounts: readonly {
    readonly memberKey: string;
    readonly memberLabel: string;
    readonly days: number;
  }[];
  readonly nonHundredCellCount: number;
  readonly maxDirectPvp: number;
  readonly terminalCarryTotal: number;
  readonly allTargetsMet: boolean;
  readonly allCommissionsQualified: boolean;
}

export interface AutomaticPlanPreviewProps {
  readonly metrics: AutomaticPlanPreviewMetrics;
  readonly newerCandidateAvailable: boolean;
  readonly onSwitchToLatest: () => void;
  readonly onApply: () => void;
  readonly onClose: () => void;
}

function formatDiscoveryTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(totalSeconds / 60)}분 ${String(totalSeconds % 60).padStart(2, '0')}초`;
}

export function AutomaticPlanPreview({
  metrics,
  newerCandidateAvailable,
  onSwitchToLatest,
  onApply,
  onClose,
}: AutomaticPlanPreviewProps) {
  return (
    <section className="automatic-plan-preview" aria-labelledby="automatic-plan-preview-title">
      <div className="panel__header">
        <div>
          <p className="app-header__eyebrow">검증된 자동 계획</p>
          <h2 id="automatic-plan-preview-title" className="panel__title">적용 전 확인</h2>
          <p className="panel__description">
            {formatDiscoveryTime(metrics.foundAtElapsedMs)}에 찾음 ·{' '}
            {metrics.runStatusLabel}
          </p>
        </div>
      </div>

      {newerCandidateAvailable ? (
        <div className="automatic-plan-preview__newer" role="status">
          <span>더 나은 새 계획을 찾았습니다. 지금 보는 계획은 바뀌지 않았습니다.</span>
          <button type="button" className="text-button" onClick={onSwitchToLatest}>
            새 계획 보기
          </button>
        </div>
      ) : null}

      <dl className="automatic-plan-preview__metrics">
        <div><dt>총 신규 PV</dt><dd>{metrics.totalNewPv.toLocaleString('ko-KR')}</dd></div>
        <div><dt>정산 시 소멸 초과분</dt><dd>{metrics.discardedExcessPv.toLocaleString('ko-KR')}</dd></div>
        <div><dt>700 목표 중 8일 이상</dt><dd>{metrics.target700MembersAtLeastEight}명</dd></div>
        <div><dt>700 목표 총 발생일</dt><dd>{metrics.target700TotalCommissionDays}일 (표시용)</dd></div>
        <div><dt>100 단위가 아닌 입력칸</dt><dd>{metrics.nonHundredCellCount}칸</dd></div>
        <div><dt>가장 큰 직접 PVP</dt><dd>{metrics.maxDirectPvp.toLocaleString('ko-KR')}</dd></div>
        <div><dt>기간 말 잔액</dt><dd>{metrics.terminalCarryTotal.toLocaleString('ko-KR')} (폐기 아님)</dd></div>
      </dl>

      {metrics.target700MemberDayCounts.length === 0 ? null : (
        <ul className="automatic-plan-preview__days" aria-label="700 목표 회원별 발생일">
          {metrics.target700MemberDayCounts.map((member) => (
            <li key={member.memberKey}>{member.memberLabel}: {member.days}일</li>
          ))}
        </ul>
      )}

      <div className="automatic-plan-preview__checks">
        <span>{metrics.allTargetsMet ? '✓ 모든 회원 목표 충족' : '⚠ 목표 확인 필요'}</span>
        <span>{metrics.allCommissionsQualified ? '✓ 모든 정산일 자격 300 이상' : '⚠ 자격 확인 필요'}</span>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onClose}>닫기</button>
        <button type="button" className="primary-button" onClick={onApply}>이 계획을 계획표에 적용</button>
      </div>
      <span className="visually-hidden">후보 ID {metrics.candidateId}</span>
    </section>
  );
}
