import {
  commissionEquivalentUnitsForTier,
  DEFAULT_RULE_SET,
} from '../domain/constants';
import { checkedAdd, subtractFloorZero, ZERO_PV } from '../domain/pv';
import type {
  BelowQualificationSettlementOccurrence,
  CommissionOccurrence,
  DailySettlement,
  FortnightAssessment,
  FortnightRawTotals,
  MemberSnapshot,
  OpeningStateInput,
  Pv,
  RawPerformance,
  RecommendationStatus,
  RuleSet,
  RunningFortnightState,
} from '../domain/types';

export interface FortnightAccumulator extends FortnightRawTotals {
  readonly commissionOccurrences: readonly CommissionOccurrence[];
  readonly belowQualificationSettlementOccurrences: readonly BelowQualificationSettlementOccurrence[];
}

export interface AccumulateFortnightDayInput {
  readonly previous: FortnightAccumulator;
  readonly rawPerformance: RawPerformance;
  readonly dailySettlement: DailySettlement;
  readonly member: MemberSnapshot;
  readonly openingState: OpeningStateInput;
  readonly rules?: RuleSet;
}

export interface AccumulateFortnightDayResult {
  readonly accumulator: FortnightAccumulator;
  readonly runningState: RunningFortnightState;
}

export interface EvaluateFortnightInput {
  readonly accumulator: FortnightAccumulator;
  readonly member: MemberSnapshot;
  readonly openingState: OpeningStateInput;
  readonly rules?: RuleSet;
}

interface PersonalPvpProgress {
  readonly personalPvpTotal: Pv;
  readonly personalPvpTarget: Pv;
  readonly remainingPvp: Pv;
  readonly personalPvpTargetMet: boolean;
}

function totalCommissionEquivalentUnits(
  occurrences: readonly CommissionOccurrence[],
): number | null {
  let total = 0;
  for (const occurrence of occurrences) {
    const units = commissionEquivalentUnitsForTier(occurrence.tier);
    if (units === null) return null;
    total += units;
  }
  return total;
}

export function createFortnightAccumulator(): FortnightAccumulator {
  return {
    newPvpTotal: ZERO_PV,
    rawLeftTotal: ZERO_PV,
    rawRightTotal: ZERO_PV,
    commissionOccurrences: [],
    belowQualificationSettlementOccurrences: [],
  };
}

function calculatePersonalPvpProgress(
  member: MemberSnapshot,
  openingState: OpeningStateInput,
  newPvpTotal: Pv,
  field: string,
  date?: RawPerformance['date'],
): PersonalPvpProgress {
  const personalPvpTotal = checkedAdd(
    openingState.fortnightPvpOpeningCredit as Pv,
    newPvpTotal,
    {
      ...(date === undefined ? {} : { date }),
      memberKey: member.memberKey,
      field,
    },
  );
  const personalPvpTarget = member.pvpTarget as Pv;
  const remainingPvp = subtractFloorZero(personalPvpTarget, personalPvpTotal);

  return {
    personalPvpTotal,
    personalPvpTarget,
    remainingPvp,
    personalPvpTargetMet: remainingPvp === ZERO_PV,
  };
}

/** 날짜 원본을 보름 원본 장부에 더하고 그날 종료 시점의 진행 상태를 만든다. */
export function accumulateFortnightDay(
  input: AccumulateFortnightDayInput,
): AccumulateFortnightDayResult {
  const raw = input.rawPerformance;
  const newPvpTotal = checkedAdd(input.previous.newPvpTotal, raw.directPvp, {
    date: raw.date,
    memberKey: raw.memberKey,
    field: 'newPvpTotal',
  });
  const rawLeftTotal = checkedAdd(
    input.previous.rawLeftTotal,
    raw.organizationLeft,
    { date: raw.date, memberKey: raw.memberKey, field: 'rawLeftTotal' },
  );
  const rawRightTotal = checkedAdd(
    input.previous.rawRightTotal,
    raw.organizationRight,
    { date: raw.date, memberKey: raw.memberKey, field: 'rawRightTotal' },
  );
  const commissionOccurrences = input.dailySettlement.settlementKind === 'FULL_COMMISSION'
    ? [
        ...input.previous.commissionOccurrences,
        {
          date: input.dailySettlement.date,
          tier: input.dailySettlement.commissionTier!,
        },
      ]
    : [...input.previous.commissionOccurrences];
  const belowQualificationSettlementOccurrences =
    input.dailySettlement.settlementKind === 'BELOW_QUALIFICATION_SETTLEMENT'
      ? [
          ...input.previous.belowQualificationSettlementOccurrences,
          {
            date: input.dailySettlement.date,
            tier: input.dailySettlement.commissionTier!,
            qualificationPvp: input.dailySettlement.qualificationPvp,
          },
        ]
      : [...input.previous.belowQualificationSettlementOccurrences];
  const accumulator: FortnightAccumulator = {
    newPvpTotal,
    rawLeftTotal,
    rawRightTotal,
    commissionOccurrences,
    belowQualificationSettlementOccurrences,
  };
  const progress = calculatePersonalPvpProgress(
    input.member,
    input.openingState,
    newPvpTotal,
    'runningFortnight.personalPvpTotal',
    raw.date,
  );

  return {
    accumulator,
    runningState: {
      date: raw.date,
      memberKey: raw.memberKey,
      newPvpTotal,
      rawLeftTotal,
      rawRightTotal,
      ...progress,
      qualificationPvp: input.dailySettlement.qualificationPvp,
      qualificationThresholdMet:
        input.dailySettlement.qualificationThresholdMet,
    },
  };
}

/** 누적 원본과 이번 기간 신규 PVP로 개인·좌·우 목표를 최종 판정한다. */
export function evaluateFortnight(
  input: EvaluateFortnightInput,
): FortnightAssessment {
  const rules = input.rules ?? DEFAULT_RULE_SET;
  const progress = calculatePersonalPvpProgress(
    input.member,
    input.openingState,
    input.accumulator.newPvpTotal,
    'finalAssessment.personalPvpTotal',
  );
  const closingQualificationPvp = checkedAdd(
    input.openingState.openingQualificationPvp as Pv,
    input.accumulator.newPvpTotal,
    {
      memberKey: input.member.memberKey,
      field: 'finalAssessment.closingQualificationPvp',
    },
  );
  const periodPvpForSide = input.accumulator.newPvpTotal;
  const leftIsSmallerOrTied =
    input.accumulator.rawLeftTotal <= input.accumulator.rawRightTotal;
  const pvpAppliedSide = leftIsSmallerOrTied ? 'LEFT' : 'RIGHT';
  const pvpApplicationReason =
    input.accumulator.rawLeftTotal === input.accumulator.rawRightTotal
      ? 'TIE_LEFT'
      : leftIsSmallerOrTied
        ? 'SMALLER_LEFT'
        : 'SMALLER_RIGHT';
  const assessedLeft = leftIsSmallerOrTied
    ? checkedAdd(input.accumulator.rawLeftTotal, periodPvpForSide, {
        memberKey: input.member.memberKey,
        field: 'finalAssessment.assessedLeft',
      })
    : input.accumulator.rawLeftTotal;
  const assessedRight = leftIsSmallerOrTied
    ? input.accumulator.rawRightTotal
    : checkedAdd(input.accumulator.rawRightTotal, periodPvpForSide, {
        memberKey: input.member.memberKey,
        field: 'finalAssessment.assessedRight',
      });
  const fortnightSideTarget = input.member.fortnightSideTarget as Pv;
  const leftTargetMet = assessedLeft >= fortnightSideTarget;
  const rightTargetMet = assessedRight >= fortnightSideTarget;
  const sideTargetsMet = leftTargetMet && rightTargetMet;
  const recommendationApplies =
    input.member.pvpTarget ===
      rules.target700CommissionPreference.eligiblePvpTarget &&
    input.member.fortnightSideTarget ===
      rules.target700CommissionPreference.eligibleFortnightSideTarget;
  const commissionDays = input.accumulator.commissionOccurrences.length;
  const commissionEquivalentUnits = totalCommissionEquivalentUnits(
    input.accumulator.commissionOccurrences,
  );
  const belowQualificationSettlementDays =
    input.accumulator.belowQualificationSettlementOccurrences.length;
  const recommendationStatus: RecommendationStatus = recommendationApplies
    ? commissionEquivalentUnits === null
      ? 'UNCONFIRMED'
      : commissionEquivalentUnits >=
          rules.target700CommissionPreference.recommendedEquivalentUnits
        ? 'MET_OR_EXCEEDED'
        : 'BELOW_RECOMMENDED'
    : 'NOT_APPLICABLE';

  return {
    memberKey: input.member.memberKey,
    pvpTarget: input.member.pvpTarget,
    fortnightSideTarget: input.member.fortnightSideTarget,
    openingQualificationPvp:
      input.openingState.openingQualificationPvp as Pv,
    closingQualificationPvp,
    qualificationThresholdMet:
      closingQualificationPvp >= rules.qualificationPolicy.threshold,
    fortnightPvpOpeningCredit:
      input.openingState.fortnightPvpOpeningCredit as Pv,
    newPvpTotal: input.accumulator.newPvpTotal,
    rawLeftTotal: input.accumulator.rawLeftTotal,
    rawRightTotal: input.accumulator.rawRightTotal,
    ...progress,
    periodPvpForSide,
    pvpAppliedSide,
    pvpApplicationReason,
    assessedLeft,
    assessedRight,
    leftTargetMet,
    rightTargetMet,
    sideTargetsMet,
    allTargetsMet: progress.personalPvpTargetMet && sideTargetsMet,
    commissionOccurrences: input.accumulator.commissionOccurrences.map(
      (occurrence) => ({ ...occurrence }),
    ),
    commissionDays,
    commissionEquivalentUnits,
    belowQualificationSettlementOccurrences:
      input.accumulator.belowQualificationSettlementOccurrences.map(
        (occurrence) => ({ ...occurrence }),
      ),
    belowQualificationSettlementDays,
    recommendationStatus,
    recommendedCommissionEquivalentUnits: recommendationApplies
      ? rules.target700CommissionPreference.recommendedEquivalentUnits
      : null,
  };
}
