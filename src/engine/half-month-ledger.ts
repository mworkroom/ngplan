import {
  DEFAULT_RULE_SET,
} from '../domain/constants';
import { checkedAdd, subtractFloorZero, ZERO_PV } from '../domain/pv';
import type {
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

export function createFortnightAccumulator(): FortnightAccumulator {
  return {
    newPvpTotal: ZERO_PV,
    rawLeftTotal: ZERO_PV,
    rawRightTotal: ZERO_PV,
    commissionOccurrences: [],
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
  const commissionOccurrences = input.dailySettlement.commissionOccurred
    ? [
        ...input.previous.commissionOccurrences,
        {
          date: input.dailySettlement.date,
          tier: input.dailySettlement.commissionTier!,
        },
      ]
    : [...input.previous.commissionOccurrences];
  const accumulator: FortnightAccumulator = {
    newPvpTotal,
    rawLeftTotal,
    rawRightTotal,
    commissionOccurrences,
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
    },
  };
}

/** 누적 원본과 보름 시작 PVP로 개인·좌·우 목표를 최종 판정한다. */
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
  const periodPvpForSide = progress.personalPvpTotal;
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
  const leftTargetMet = assessedLeft >= rules.fortnightSideTarget;
  const rightTargetMet = assessedRight >= rules.fortnightSideTarget;
  const sideTargetsMet = leftTargetMet && rightTargetMet;
  const recommendationApplies =
    input.member.pvpTarget ===
    rules.target700CommissionPreference.eligiblePvpTarget;
  const commissionDays = input.accumulator.commissionOccurrences.length;
  const recommendationStatus: RecommendationStatus = recommendationApplies
    ? commissionDays >= rules.target700CommissionPreference.recommendedDays
      ? 'MET_OR_EXCEEDED'
      : 'BELOW_RECOMMENDED'
    : 'NOT_APPLICABLE';

  return {
    memberKey: input.member.memberKey,
    pvpTarget: input.member.pvpTarget,
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
    recommendationStatus,
    recommendedCommissionDays: recommendationApplies
      ? rules.target700CommissionPreference.recommendedDays
      : null,
  };
}
