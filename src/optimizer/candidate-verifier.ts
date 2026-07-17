import {
  calculatePlan,
  DEFAULT_RULE_SET,
  type CalculationResult,
  type DailySettlement,
} from '../engine';
import { checkedAddScore, isCanonicalNonNegativeSafeInteger } from './checked-integer';
import { validateAutomaticPlanCandidateShape } from './candidate-shape';
import {
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
} from './constants';
import { automaticPlanError, errorFromUnknown } from './errors';
import {
  automaticPlanObjectivesEqual,
  evaluateAutomaticPlanObjective,
} from './objective';
import type {
  AutomaticPlanCandidateIdentity,
  AutomaticPlanRequest,
  AutomaticPlanVerificationOutcome,
  RawAutomaticPlanCandidate,
  VerifiedAutomaticPlanCandidate,
} from './types';

type QualificationAwareSettlement = DailySettlement & {
  readonly qualificationPvp?: number;
  readonly qualificationThresholdMet?: boolean;
  readonly settlementKind?:
    | 'SKIPPED'
    | 'NO_COMMISSION'
    | 'BELOW_QUALIFICATION_SETTLEMENT'
    | 'FULL_COMMISSION';
};

function validateIdentity(
  identity: AutomaticPlanCandidateIdentity,
): AutomaticPlanVerificationOutcome | null {
  if (
    identity.candidateId.trim() === '' ||
    !isCanonicalNonNegativeSafeInteger(identity.sequence) ||
    !isCanonicalNonNegativeSafeInteger(identity.foundAtElapsedMs)
  ) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_REQUEST_INVALID',
        '자동 계획 후보 식별자 또는 순서가 올바르지 않습니다.',
      ),
    };
  }
  return null;
}

function settlementAt(
  calculation: CalculationResult,
  date: string,
  memberKey: string,
): QualificationAwareSettlement | undefined {
  return calculation.dailySettlementByDateAndMember[date]?.[
    memberKey
  ] as QualificationAwareSettlement | undefined;
}

export function verifyAutomaticPlanCandidate(
  request: AutomaticPlanRequest,
  raw: RawAutomaticPlanCandidate,
  identity: AutomaticPlanCandidateIdentity,
): AutomaticPlanVerificationOutcome {
  const identityFailure = validateIdentity(identity);
  if (identityFailure !== null) {
    return identityFailure;
  }
  if (raw.problemFingerprint !== request.problemFingerprint) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_FINGERPRINT_MISMATCH',
        '자동 계획 후보가 현재 설정과 일치하지 않습니다.',
      ),
    };
  }
  const shape = validateAutomaticPlanCandidateShape(request, raw.allocations);
  if (shape.status === 'FAILURE') {
    return shape;
  }
  try {
    const calculated = calculatePlan({
      period: request.period,
      organization: request.organization,
      allocations: shape.allocations,
    });
    if (calculated.status === 'FAILURE') {
      const causeCode = calculated.validation.errors[0]?.code;
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_ENGINE_REJECTED',
          '계산 엔진이 자동 계획 후보를 거부했습니다.',
          causeCode === undefined ? {} : { causeCode },
        ),
      };
    }
    const calculation = calculated.result;
    if (
      String(calculation.rulesetVersion) !== AUTOMATIC_PLAN_RULESET_VERSION ||
      calculation.engineVersion !== AUTOMATIC_PLAN_ENGINE_VERSION ||
      request.rulesetVersion !== AUTOMATIC_PLAN_RULESET_VERSION ||
      request.engineVersion !== AUTOMATIC_PLAN_ENGINE_VERSION
    ) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_VERSION_UNSUPPORTED',
          '후보를 계산한 엔진 버전이 자동 계획 요청과 일치하지 않습니다.',
        ),
      };
    }

    for (const memberKey of request.canonicalMemberKeys) {
      const assessment = calculation.finalAssessmentByMember[memberKey];
      if (assessment === undefined || !assessment.allTargetsMet) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_TARGET_UNMET',
            '모든 회원의 개인 PVP와 좌·우 목표를 충족하지 못했습니다.',
            { location: { memberKey } },
          ),
        };
      }
      const opening = request.openingPvpByMember[memberKey];
      if (opening === undefined) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_OPENING_STATE_INVALID',
            '회원의 자격 PVP 시작값을 찾을 수 없습니다.',
            { location: { memberKey } },
          ),
        };
      }
      let expectedQualification = opening.cumulativePvpOpening;
      let periodDirectPvp = 0;
      for (const date of request.calendar.dates) {
        const cellIndex =
          request.calendar.dates.indexOf(date) * request.canonicalMemberKeys.length +
          request.canonicalMemberKeys.indexOf(memberKey);
        const cell = shape.allocations[cellIndex];
        const settlement = settlementAt(calculation, date, memberKey);
        if (cell === undefined || settlement === undefined) {
          return {
            status: 'FAILURE',
            error: automaticPlanError(
              'AUTOMATIC_PLAN_QUALIFICATION_MISMATCH',
              '자격 PVP를 확인할 날짜·회원 결과가 없습니다.',
              { location: { date, memberKey } },
            ),
          };
        }
        periodDirectPvp = checkedAddScore(periodDirectPvp, cell.pvp);
        expectedQualification = checkedAddScore(expectedQualification, cell.pvp);
        if (
          settlement.qualificationPvp !== expectedQualification ||
          settlement.qualificationThresholdMet !== (expectedQualification >= 300)
        ) {
          return {
            status: 'FAILURE',
            error: automaticPlanError(
              'AUTOMATIC_PLAN_QUALIFICATION_MISMATCH',
              '당일 직접 PVP를 포함한 자격 PVP 누계가 계산 결과와 다릅니다.',
              { location: { date, memberKey, field: 'PVP' } },
            ),
          };
        }
        if (settlement.settlementKind === 'BELOW_QUALIFICATION_SETTLEMENT') {
          return {
            status: 'FAILURE',
            error: automaticPlanError(
              'AUTOMATIC_PLAN_BELOW_QUALIFICATION_SETTLEMENT',
              '자격 PVP 300 미만에서 정산되는 계획은 자동 후보로 사용할 수 없습니다.',
              { location: { date, memberKey } },
            ),
          };
        }
      }
      if (
        periodDirectPvp >
        DEFAULT_RULE_SET.cumulativePvpCap - opening.cumulativePvpOpening
      ) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID',
            '회원의 신규 PVP 합계가 누적 PVP 2,400 상한의 남은 범위를 넘습니다.',
            { location: { memberKey, field: 'PVP' } },
          ),
        };
      }
    }

    const evaluated = evaluateAutomaticPlanObjective(
      request,
      shape.allocations,
      calculation,
    );
    if (evaluated.status === 'FAILURE') {
      return evaluated;
    }
    let claimedObjectiveMatches = true;
    if (raw.claimedObjective !== undefined) {
      try {
        claimedObjectiveMatches = automaticPlanObjectivesEqual(
          raw.claimedObjective,
          evaluated.objective,
        );
      } catch {
        claimedObjectiveMatches = false;
      }
    }
    if (!claimedObjectiveMatches) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_OBJECTIVE_MISMATCH',
          '후보가 보고한 목적값이 정본 계산 결과와 다릅니다.',
        ),
      };
    }
    const candidate: VerifiedAutomaticPlanCandidate = Object.freeze({
      ...identity,
      problemFingerprint: request.problemFingerprint,
      allocations: shape.allocations,
      calculation,
      objective: evaluated.objective,
      display: evaluated.display,
    });
    return { status: 'SUCCESS', candidate };
  } catch (error) {
    return { status: 'FAILURE', error: errorFromUnknown(error) };
  }
}
