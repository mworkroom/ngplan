import type { CalculationResult, FortnightAssessment } from '../../engine';
import { manualPlanMemberGroupDomId } from './derive-manual-plan-schema';
import { manualPlanIssueTargetId } from './map-manual-plan-issues';
import type {
  ManualPlanDailyAuditView,
  ManualPlanIssue,
  ManualPlanMemberJumpOption,
  ManualPlanMemberSummaryView,
  ManualPlanSchema,
  ManualPlanValidationSummaryItem,
  ManualPlanWorksheetCellView,
} from './types';

function ownValue<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function dailyPvpApplicationLabel(
  settlementStatus: ManualPlanDailyAuditView['settlementStatus'],
  preSettlementPvp: number,
  reason: ManualPlanDailyAuditView['pvpApplicationReason'],
): string {
  if (settlementStatus === 'SKIPPED') {
    return '정산 제외';
  }
  if (preSettlementPvp === 0) {
    return '적용할 PVP 없음';
  }
  switch (reason) {
    case 'TIE_LEFT':
      return '동률 → 좌 적용';
    case 'SMALLER_LEFT':
      return '작은 쪽 좌에 PVP 적용';
    case 'SMALLER_RIGHT':
      return '작은 쪽 우에 PVP 적용';
    default:
      return 'PVP 적용 정보 없음';
  }
}

function finalPvpApplicationLabel(
  reason: FortnightAssessment['pvpApplicationReason'],
): string {
  switch (reason) {
    case 'TIE_LEFT':
      return '동률 → 좌 적용';
    case 'SMALLER_LEFT':
      return '작은 쪽 좌에 적용';
    case 'SMALLER_RIGHT':
      return '작은 쪽 우에 적용';
  }
}

function recommendationLabel(assessment: FortnightAssessment): string {
  switch (assessment.recommendationStatus) {
    case 'NOT_APPLICABLE':
      return '권장 대상 아님';
    case 'BELOW_RECOMMENDED':
      return assessment.recommendedCommissionDays === null
        ? '권장 기준 확인 필요'
        : `${assessment.recommendedCommissionDays}회 권장 미달`;
    case 'MET_OR_EXCEEDED':
      return assessment.recommendedCommissionDays === null
        ? '권장 기준 확인 필요'
        : `${assessment.recommendedCommissionDays}회 권장 달성`;
  }
}

export function deriveManualPlanWorksheetCellView(
  result: CalculationResult,
  date: string,
  memberKey: string,
): ManualPlanWorksheetCellView | null {
  const dateRow = ownValue(result.rawPerformanceByDateAndMember, date);
  const raw = dateRow === undefined ? undefined : ownValue(dateRow, memberKey);
  if (raw === undefined) {
    return null;
  }
  return Object.freeze({
    date: raw.date,
    memberKey: raw.memberKey,
    directPvp: raw.directPvp,
    organizationLeft: raw.organizationLeft,
    organizationRight: raw.organizationRight,
    subtreeTotal: raw.subtreeTotal,
  });
}

export function deriveManualPlanDailyAuditView(
  result: CalculationResult,
  schema: ManualPlanSchema,
  date: string,
  memberKey: string,
): ManualPlanDailyAuditView | null {
  const dateDescriptor = schema.dateByIso.get(date);
  const member = schema.memberByKey.get(memberKey);
  const dailyRow = ownValue(result.dailySettlementByDateAndMember, date);
  const runningRow = ownValue(result.runningFortnightByDateAndMember, date);
  const settlement = dailyRow === undefined ? undefined : ownValue(dailyRow, memberKey);
  const running = runningRow === undefined ? undefined : ownValue(runningRow, memberKey);
  if (
    dateDescriptor === undefined ||
    member === undefined ||
    settlement === undefined ||
    running === undefined
  ) {
    return null;
  }

  const commissionLabel = settlement.settlementStatus === 'SKIPPED'
    ? '정산 제외 · 커미션 없음'
    : settlement.commissionOccurred
      ? `${settlement.commissionTier} 단계 · 커미션 발생`
      : '커미션 없음';
  return Object.freeze({
    date,
    dateLabel: dateDescriptor.displayLabel,
    memberKey,
    memberLabel: member.displayLabel,
    settlementStatus: settlement.settlementStatus,
    settlementLabel:
      settlement.settlementStatus === 'SKIPPED' ? '정산 제외' : '정산 완료',
    carryIn: settlement.carryIn,
    rawPerformance: settlement.rawPerformance,
    preSettlement: settlement.preSettlement,
    pvpAppliedSide: settlement.pvpAppliedSide,
    pvpApplicationReason: settlement.pvpApplicationReason,
    pvpApplicationLabel: dailyPvpApplicationLabel(
      settlement.settlementStatus,
      settlement.preSettlement.pvp,
      settlement.pvpApplicationReason,
    ),
    assessedLeft: settlement.assessedLeft,
    assessedRight: settlement.assessedRight,
    commissionTier: settlement.commissionTier,
    commissionOccurred: settlement.commissionOccurred,
    commissionLabel,
    carryOut: settlement.carryOut,
    running,
    runningPvpStatusLabel: running.personalPvpTargetMet
      ? '개인 PVP 목표 달성'
      : '개인 PVP 목표 미달',
  });
}

export function deriveManualPlanMemberSummaryView(
  result: CalculationResult,
  schema: ManualPlanSchema,
  memberKey: string,
): ManualPlanMemberSummaryView | null {
  const member = schema.memberByKey.get(memberKey);
  const assessment = ownValue(result.finalAssessmentByMember, memberKey);
  if (member === undefined || assessment === undefined) {
    return null;
  }
  return Object.freeze({
    memberKey,
    memberLabel: member.displayLabel,
    level: assessment.level,
    fortnightPvpOpeningCredit: assessment.fortnightPvpOpeningCredit,
    newPvpTotal: assessment.newPvpTotal,
    personalPvpTotal: assessment.personalPvpTotal,
    personalPvpTarget: assessment.personalPvpTarget,
    remainingPvp: assessment.remainingPvp,
    personalPvpTargetMet: assessment.personalPvpTargetMet,
    personalPvpStatusLabel: assessment.personalPvpTargetMet
      ? '개인 PVP 목표 달성'
      : '개인 PVP 목표 미달',
    rawLeftTotal: assessment.rawLeftTotal,
    rawRightTotal: assessment.rawRightTotal,
    periodPvpForSide: assessment.periodPvpForSide,
    pvpAppliedSide: assessment.pvpAppliedSide,
    pvpApplicationReason: assessment.pvpApplicationReason,
    pvpApplicationLabel: finalPvpApplicationLabel(assessment.pvpApplicationReason),
    assessedLeft: assessment.assessedLeft,
    assessedRight: assessment.assessedRight,
    leftTargetMet: assessment.leftTargetMet,
    rightTargetMet: assessment.rightTargetMet,
    leftTargetLabel: assessment.leftTargetMet ? '좌 목표 달성' : '좌 목표 미달',
    rightTargetLabel: assessment.rightTargetMet ? '우 목표 달성' : '우 목표 미달',
    sideTargetsMet: assessment.sideTargetsMet,
    allTargetsMet: assessment.allTargetsMet,
    allTargetsLabel: assessment.allTargetsMet ? '전체 목표 달성' : '추가 계획 필요',
    commissionDays: assessment.commissionDays,
    commissionOccurrences: assessment.commissionOccurrences,
    recommendationStatus: assessment.recommendationStatus,
    recommendedCommissionDays: assessment.recommendedCommissionDays,
    recommendationLabel: recommendationLabel(assessment),
  });
}

export function deriveAllManualPlanMemberSummaryRows(
  result: CalculationResult,
  schema: ManualPlanSchema,
): readonly ManualPlanMemberSummaryView[] | null {
  const rows: ManualPlanMemberSummaryView[] = [];
  for (const member of schema.members) {
    const row = deriveManualPlanMemberSummaryView(result, schema, member.memberKey);
    if (row === null) {
      return null;
    }
    rows.push(row);
  }
  return Object.freeze(rows);
}

export function deriveManualPlanMemberJumpOptions(
  schema: ManualPlanSchema,
): readonly ManualPlanMemberJumpOption[] {
  return Object.freeze(
    schema.members.map((member) =>
      Object.freeze({
        value: member.memberKey,
        label: member.displayLabel,
        targetId: manualPlanMemberGroupDomId(member.memberKey),
      }),
    ),
  );
}

const FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  pvp: 'PVP',
  selfLeft: '좌',
  selfRight: '우',
});

export function deriveManualPlanValidationSummaryItems(
  issues: readonly ManualPlanIssue[],
  schema: ManualPlanSchema,
): readonly ManualPlanValidationSummaryItem[] {
  return Object.freeze(
    issues.map((issue) => {
      const context: string[] = [];
      if (issue.location.date !== undefined) {
        context.push(
          schema.dateByIso.get(issue.location.date)?.displayLabel ?? issue.location.date,
        );
      }
      if (issue.location.memberKey !== undefined) {
        context.push(
          schema.memberByKey.get(issue.location.memberKey)?.displayLabel ?? '회원',
        );
      }
      if (issue.location.field !== undefined) {
        context.push(FIELD_LABELS[issue.location.field] ?? '계산 항목');
      }
      return Object.freeze({
        issue,
        contextLabel: context.length === 0 ? '전체 계획' : context.join(' · '),
        targetId: manualPlanIssueTargetId(issue),
      });
    }),
  );
}
