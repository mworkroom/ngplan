export interface AutomaticPlanPreviewMetrics {
  readonly candidateId: string;
  readonly foundAtElapsedMs: number;
  readonly totalNewPv: number;
  readonly confirmedPayoutWon: number;
  readonly optimalityProven: boolean;
  readonly runStatusLabel: string;
  readonly discardedExcessPv: number;
  readonly rootCommissionGoal: {
    readonly rootMemberKey: string;
    readonly rootMemberLabel: string;
    readonly businessDayCount: number;
    readonly targetCommissionDays: number;
    readonly actualCommissionDays: number;
    readonly shortfallDays: number;
    readonly capacityLimited: boolean;
    readonly met: boolean;
  };
  readonly priorityDepthMemberDayCounts: readonly {
    readonly memberKey: string;
    readonly memberLabel: string;
    readonly organizationDepth: 2 | 3;
    readonly days: number;
  }[];
  readonly highTargetMemberDayCounts: readonly {
    readonly memberKey: string;
    readonly memberLabel: string;
    readonly pvpTarget: 1500 | 2400;
    readonly days: number;
  }[];
  readonly target700MembersAtLeastEight: number;
  readonly target700TotalCommissionDays: number;
  readonly target700MemberDayCounts: readonly {
    readonly memberKey: string;
    readonly memberLabel: string;
    readonly days: number;
  }[];
  readonly futureCumulativePvpInvestmentPv: number;
  readonly nonHundredCellCount: number;
  readonly maxDirectPvp: number;
  readonly terminalCarryTotal: number;
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
        <div><dt>확인된 수당 합계</dt><dd>{metrics.confirmedPayoutWon.toLocaleString('ko-KR')}원</dd></div>
        <div><dt>정산 시 소멸 초과분</dt><dd>{metrics.discardedExcessPv.toLocaleString('ko-KR')}</dd></div>
        <div>
          <dt>맨 위 회원 수당</dt>
          <dd>
            {metrics.rootCommissionGoal.actualCommissionDays} /{' '}
            {metrics.rootCommissionGoal.targetCommissionDays}영업일
          </dd>
        </div>
        <div>
          <dt>계획 영업일</dt>
          <dd>{metrics.rootCommissionGoal.businessDayCount}일</dd>
        </div>
        <div><dt>그 외 700 목표 중 8일 이상</dt><dd>{metrics.target700MembersAtLeastEight}명</dd></div>
        <div><dt>그 외 700 목표 총 발생일</dt><dd>{metrics.target700TotalCommissionDays}일 (표시용)</dd></div>
        <div><dt>미래 누적 PVP 투자</dt><dd>{metrics.futureCumulativePvpInvestmentPv.toLocaleString('ko-KR')}</dd></div>
        <div><dt>100 단위가 아닌 입력칸</dt><dd>{metrics.nonHundredCellCount}칸</dd></div>
        <div><dt>가장 큰 직접 PVP</dt><dd>{metrics.maxDirectPvp.toLocaleString('ko-KR')}</dd></div>
        <div><dt>기간 말 잔액</dt><dd>{metrics.terminalCarryTotal.toLocaleString('ko-KR')} (폐기 아님)</dd></div>
      </dl>

      <p className="automatic-plan-preview__goal-note">
        전체 영업일을 계획 범위로 사용합니다. 모든 회원이 매일 직접 입력해야 한다는 뜻은 아닙니다.
      </p>

      {metrics.rootCommissionGoal.capacityLimited ? (
        <p className="automatic-plan-preview__goal-note">
          현재 총량 기준 목표 {metrics.rootCommissionGoal.targetCommissionDays}일
        </p>
      ) : null}

      {metrics.rootCommissionGoal.met ? null : (
        <p className="automatic-plan-preview__goal-note" role="status">
          맨 위 회원 수당 목표가 {metrics.rootCommissionGoal.shortfallDays}일 부족합니다.{' '}
          보름 목표와 자격은 확인된 계획이지만{' '}
          {metrics.rootCommissionGoal.capacityLimited
            ? '현재 총량 기준 목표는 아직 채우지 못했습니다.'
            : '전체 영업일 목표는 아직 채우지 못했습니다.'}
        </p>
      )}

      {metrics.priorityDepthMemberDayCounts.length === 0 ? null : (
        <ul className="automatic-plan-preview__days" aria-label="조직 2·3번 우선 회원별 발생일">
          {metrics.priorityDepthMemberDayCounts.map((member) => (
            <li key={member.memberKey}>
              {member.memberLabel} (조직 {member.organizationDepth}번):{' '}
              {member.days}/{metrics.rootCommissionGoal.businessDayCount}일
            </li>
          ))}
        </ul>
      )}

      {metrics.highTargetMemberDayCounts.length === 0 ? null : (
        <ul className="automatic-plan-preview__days" aria-label="고목표 회원별 발생일">
          {metrics.highTargetMemberDayCounts.map((member) => (
            <li key={member.memberKey}>
              {member.memberLabel} (목표 {member.pvpTarget.toLocaleString('ko-KR')}):{' '}
              {member.days}/{metrics.rootCommissionGoal.businessDayCount}일
            </li>
          ))}
        </ul>
      )}

      {metrics.target700MemberDayCounts.length === 0 ? null : (
        <ul className="automatic-plan-preview__days" aria-label="그 외 700 목표 회원별 발생일">
          {metrics.target700MemberDayCounts.map((member) => (
            <li key={member.memberKey}>
              {member.memberLabel}: {member.days}/{metrics.rootCommissionGoal.businessDayCount}일
            </li>
          ))}
        </ul>
      )}

      <div className="automatic-plan-preview__checks">
        <span>✓ 모든 회원의 보름 목표를 확인했습니다.</span>
        <span>✓ 모든 정산일의 수당 자격을 확인했습니다.</span>
      </div>

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onClose}>닫기</button>
        <button type="button" className="primary-button" onClick={onApply}>이 계획을 계획표에 적용</button>
      </div>
      <span className="visually-hidden">후보 ID {metrics.candidateId}</span>
    </section>
  );
}
