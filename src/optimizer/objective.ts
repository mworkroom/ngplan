import type {
  CalculationResult,
  DailySettlement,
  NormalizedAllocationCell,
} from '../engine';
import { commissionEquivalentUnitsForTier } from '../engine';
import {
  assertCanonicalNonNegativeSafeInteger,
  checkedAddScore,
} from './checked-integer';
import { validateAutomaticPlanCandidateShape } from './candidate-shape';
import { AUTOMATIC_PLAN_TARGET_700_RECOMMENDED_EQUIVALENT_UNITS } from './constants';
import { discardedExcessForSettlement } from './discarded-excess';
import { automaticPlanError, errorFromUnknown } from './errors';
import { deriveRootCommissionGoalCapacity } from './root-commission-goal';
import type {
  AutomaticPlanDisplayMetrics,
  AutomaticPlanObjectiveVector,
  AutomaticPlanRequest,
  HighTargetMemberEquivalentUnitCount,
  PriorityDepthMemberEquivalentUnitCount,
  SafeAutomaticPlanError,
  Target700MemberEquivalentUnitCount,
  TerminalCarryMemberSummary,
} from './types';

type QualificationAwareSettlement = DailySettlement & {
  readonly settlementKind?:
    | 'SKIPPED'
    | 'NO_COMMISSION'
    | 'BELOW_QUALIFICATION_SETTLEMENT'
    | 'FULL_COMMISSION';
};

export type AutomaticPlanObjectiveEvaluationOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly objective: AutomaticPlanObjectiveVector;
      readonly display: AutomaticPlanDisplayMetrics;
    }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

function cellValues(cell: NormalizedAllocationCell): readonly number[] {
  return [
    cell.pvp,
    ...(Object.hasOwn(cell, 'selfLeft') ? [cell.selfLeft!] : []),
    ...(Object.hasOwn(cell, 'selfRight') ? [cell.selfRight!] : []),
  ];
}

function settlementAt(
  calculation: CalculationResult,
  date: string,
  memberKey: string,
): DailySettlement {
  const settlement = calculation.dailySettlementByDateAndMember[date]?.[memberKey];
  if (settlement === undefined) {
    throw new TypeError(`missing settlement for ${date}/${memberKey}`);
  }
  return settlement;
}

function isFullCommission(settlement: DailySettlement): boolean {
  return (settlement as QualificationAwareSettlement).settlementKind === 'FULL_COMMISSION';
}

function confirmedPayoutWonForTier(
  tier: NonNullable<DailySettlement['commissionTier']>,
): number | null {
  switch (tier) {
    case 300:
      return 60_000;
    case 700:
      return 120_000;
    case 1500:
      return 240_000;
    case 2400:
      return 480_000;
    default:
      return null;
  }
}

function compareMin(left: number, right: number): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareMax(left: number, right: number): -1 | 0 | 1 {
  return left > right ? -1 : left < right ? 1 : 0;
}

function compareMaxVector(
  left: readonly number[],
  right: readonly number[],
): -1 | 0 | 1 {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const compared = compareMax(left[index]!, right[index]!);
    if (compared !== 0) {
      return compared;
    }
  }
  return compareMax(left.length, right.length);
}

function assertAscendingEquivalentUnitVector(
  values: readonly number[],
  label: string,
): void {
  for (const value of values) {
    assertCanonicalNonNegativeSafeInteger(value, `${label} equivalent unit count`);
  }
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1]! > values[index]!) {
      throw new TypeError(`${label} equivalent unit vector must be sorted ascending`);
    }
  }
}

function organizationDepths(
  request: AutomaticPlanRequest,
): ReadonlyMap<string, number> {
  const memberByKey = new Map(
    request.organization.members.map((member) => [member.memberKey, member] as const),
  );
  const depthByMember = new Map<string, number>();
  const visiting = new Set<string>();
  const derive = (memberKey: string): number => {
    const cached = depthByMember.get(memberKey);
    if (cached !== undefined) return cached;
    if (visiting.has(memberKey)) {
      throw new TypeError('organization depth contains a cycle');
    }
    const member = memberByKey.get(memberKey);
    if (member === undefined) {
      throw new TypeError(`missing member ${memberKey}`);
    }
    visiting.add(memberKey);
    const depth = member.parentMemberKey === null
      ? 1
      : derive(member.parentMemberKey) + 1;
    visiting.delete(memberKey);
    depthByMember.set(memberKey, depth);
    return depth;
  };
  for (const memberKey of request.canonicalMemberKeys) derive(memberKey);
  return depthByMember;
}

export function assertValidAutomaticPlanObjective(
  objective: AutomaticPlanObjectiveVector,
): void {
  for (const [label, value] of [
    [
      'rootCommissionGoalShortfallDays',
      objective.rootCommissionGoalShortfallDays,
    ],
    ['totalNewPv', objective.totalNewPv],
    ['confirmedPayoutWon', objective.confirmedPayoutWon],
    ['discardedExcessPv', objective.discardedExcessPv],
    [
      'futureCumulativePvpInvestmentPv',
      objective.futureCumulativePvpInvestmentPv,
    ],
    ['nonHundredCellCount', objective.nonHundredCellCount],
    ['maxDirectPvp', objective.maxDirectPvp],
  ] as const) {
    assertCanonicalNonNegativeSafeInteger(value, label);
  }
  assertAscendingEquivalentUnitVector(
    objective.priorityDepthAscendingEquivalentUnitVector,
    'priorityDepth',
  );
  assertAscendingEquivalentUnitVector(
    objective.highTargetAscendingEquivalentUnitVector,
    'highTarget',
  );
  assertAscendingEquivalentUnitVector(
    objective.target700AscendingEquivalentUnitVector,
    'target700',
  );
  for (const value of objective.deterministicAllocationVector) {
    assertCanonicalNonNegativeSafeInteger(value, 'deterministic allocation value');
  }
}

/** Best-first comparator: -1 means left is preferred to right. */
export function compareAutomaticPlanObjectives(
  left: AutomaticPlanObjectiveVector,
  right: AutomaticPlanObjectiveVector,
): -1 | 0 | 1 {
  assertValidAutomaticPlanObjective(left);
  assertValidAutomaticPlanObjective(right);
  return (
    compareMin(left.totalNewPv, right.totalNewPv) ||
    compareMin(
      left.rootCommissionGoalShortfallDays,
      right.rootCommissionGoalShortfallDays,
    ) ||
    compareMax(left.confirmedPayoutWon, right.confirmedPayoutWon) ||
    compareMin(left.discardedExcessPv, right.discardedExcessPv) ||
    compareMaxVector(
      left.priorityDepthAscendingEquivalentUnitVector,
      right.priorityDepthAscendingEquivalentUnitVector,
    ) ||
    compareMaxVector(
      left.highTargetAscendingEquivalentUnitVector,
      right.highTargetAscendingEquivalentUnitVector,
    ) ||
    compareMaxVector(
      left.target700AscendingEquivalentUnitVector,
      right.target700AscendingEquivalentUnitVector,
    ) ||
    compareMax(
      left.futureCumulativePvpInvestmentPv,
      right.futureCumulativePvpInvestmentPv,
    ) ||
    compareMin(left.nonHundredCellCount, right.nonHundredCellCount) ||
    compareMin(left.maxDirectPvp, right.maxDirectPvp) ||
    compareMaxVector(
      left.deterministicAllocationVector,
      right.deterministicAllocationVector,
    )
  );
}

export function automaticPlanObjectivesEqual(
  left: AutomaticPlanObjectiveVector,
  right: AutomaticPlanObjectiveVector,
): boolean {
  return compareAutomaticPlanObjectives(left, right) === 0;
}

export function evaluateAutomaticPlanObjective(
  request: AutomaticPlanRequest,
  allocations: readonly NormalizedAllocationCell[],
  calculation: CalculationResult,
): AutomaticPlanObjectiveEvaluationOutcome {
  const shape = validateAutomaticPlanCandidateShape(request, allocations);
  if (shape.status === 'FAILURE') {
    return shape;
  }
  try {
    let totalNewPv = 0;
    let nonHundredCellCount = 0;
    let maxDirectPvp = 0;
    const deterministicAllocationVector: number[] = [];
    for (const cell of shape.allocations) {
      for (const value of cellValues(cell)) {
        totalNewPv = checkedAddScore(totalNewPv, value);
        if (value !== 0 && value % 100 !== 0) {
          nonHundredCellCount = checkedAddScore(nonHundredCellCount, 1);
        }
        deterministicAllocationVector.push(value);
      }
      maxDirectPvp = Math.max(maxDirectPvp, cell.pvp);
    }

    let confirmedPayoutWon = 0;
    let discardedExcessPv = 0;
    let futureCumulativePvpInvestmentPv = 0;
    const rootGoalCapacity = deriveRootCommissionGoalCapacity(request);
    let rootActualCommissionDays = 0;
    const depthByMember = organizationDepths(request);
    const priorityDepthMemberEquivalentUnitCounts:
      PriorityDepthMemberEquivalentUnitCount[] = [];
    const highTargetMemberEquivalentUnitCounts:
      HighTargetMemberEquivalentUnitCount[] = [];
    const target700MemberEquivalentUnitCounts:
      Target700MemberEquivalentUnitCount[] = [];
    let target700TotalCommissionEquivalentUnits = 0;
    for (const memberKey of request.canonicalMemberKeys) {
      const member = request.organization.members.find(
        (candidate) => candidate.memberKey === memberKey,
      );
      if (member === undefined) {
        throw new TypeError(`missing member ${memberKey}`);
      }
      let commissionEquivalentUnits = 0;
      for (const date of request.calendar.dates) {
        const settlement = settlementAt(calculation, date, memberKey);
        if (isFullCommission(settlement)) {
          if (settlement.commissionTier === null) {
            throw new TypeError('FULL_COMMISSION settlement must contain a tier');
          }
          const payoutWon = confirmedPayoutWonForTier(settlement.commissionTier);
          const equivalentUnits = commissionEquivalentUnitsForTier(
            settlement.commissionTier,
          );
          if (payoutWon === null || equivalentUnits === null) {
            return {
              status: 'FAILURE',
              error: automaticPlanError(
                'AUTOMATIC_PLAN_PAYOUT_TABLE_INCOMPLETE',
                `${settlement.commissionTier.toLocaleString('ko-KR')} 단계 수당 금액이 확정되지 않아 자동 계획 순위를 계산할 수 없습니다.`,
                {
                  location: { date, memberKey },
                  causeCode: `UNCONFIRMED_COMMISSION_TIER_${settlement.commissionTier}`,
                },
              ),
            };
          }
          confirmedPayoutWon = checkedAddScore(confirmedPayoutWon, payoutWon);
          commissionEquivalentUnits = checkedAddScore(
            commissionEquivalentUnits,
            equivalentUnits,
          );
          if (memberKey === rootGoalCapacity.rootMemberKey) {
            rootActualCommissionDays = checkedAddScore(rootActualCommissionDays, 1);
          }
        }
        discardedExcessPv = checkedAddScore(
          discardedExcessPv,
          discardedExcessForSettlement(settlement),
        );
      }
      const organizationDepth = depthByMember.get(memberKey);
      if (organizationDepth === undefined) {
        throw new TypeError(`missing organization depth for ${memberKey}`);
      }
      if (organizationDepth === 2 || organizationDepth === 3) {
        priorityDepthMemberEquivalentUnitCounts.push(
          Object.freeze({
            memberKey,
            organizationDepth,
            commissionEquivalentUnits,
          }),
        );
      } else if (
        organizationDepth > 1 &&
        (member.pvpTarget === 1500 || member.pvpTarget === 2400)
      ) {
        highTargetMemberEquivalentUnitCounts.push(
          Object.freeze({
            memberKey,
            pvpTarget: member.pvpTarget,
            commissionEquivalentUnits,
          }),
        );
      } else if (organizationDepth > 1 && member.pvpTarget === 700) {
        target700MemberEquivalentUnitCounts.push(
          Object.freeze({ memberKey, commissionEquivalentUnits }),
        );
        target700TotalCommissionEquivalentUnits = checkedAddScore(
          target700TotalCommissionEquivalentUnits,
          commissionEquivalentUnits,
        );
      }

      const opening = request.openingPvpByMember[memberKey];
      const assessment = calculation.finalAssessmentByMember[memberKey];
      if (opening === undefined || assessment === undefined) {
        throw new TypeError(`missing PVP summary for ${memberKey}`);
      }
      const futureInvestmentBaseline = Math.max(
        opening.cumulativePvpOpening,
        member.pvpTarget,
      );
      const futureInvestment = Math.max(
        0,
        assessment.personalPvpTotal - futureInvestmentBaseline,
      );
      futureCumulativePvpInvestmentPv = checkedAddScore(
        futureCumulativePvpInvestmentPv,
        futureInvestment,
      );
    }
    const priorityDepthAscendingEquivalentUnitVector =
      priorityDepthMemberEquivalentUnitCounts
      .map((item) => item.commissionEquivalentUnits)
      .sort((left, right) => left - right);
    const highTargetAscendingEquivalentUnitVector =
      highTargetMemberEquivalentUnitCounts
      .map((item) => item.commissionEquivalentUnits)
      .sort((left, right) => left - right);
    const target700AscendingEquivalentUnitVector =
      target700MemberEquivalentUnitCounts
      .map((item) => item.commissionEquivalentUnits)
      .sort((left, right) => left - right);
    const target700MembersAtLeastEightEquivalentUnits =
      target700AscendingEquivalentUnitVector.filter(
      (units) => units >= AUTOMATIC_PLAN_TARGET_700_RECOMMENDED_EQUIVALENT_UNITS,
    ).length;

    const finalDate = request.calendar.dates.at(-1);
    if (finalDate === undefined) {
      throw new TypeError('automatic plan calendar is empty');
    }
    const terminalByMember: TerminalCarryMemberSummary[] = [];
    let totalPvp = 0;
    let totalLeft = 0;
    let totalRight = 0;
    for (const memberKey of request.canonicalMemberKeys) {
      const carry = settlementAt(calculation, finalDate, memberKey).carryOut;
      totalPvp = checkedAddScore(totalPvp, carry.pvp);
      totalLeft = checkedAddScore(totalLeft, carry.left);
      totalRight = checkedAddScore(totalRight, carry.right);
      terminalByMember.push(
        Object.freeze({
          memberKey,
          pvp: carry.pvp,
          left: carry.left,
          right: carry.right,
        }),
      );
    }
    const totalCarryPv = checkedAddScore(
      checkedAddScore(totalPvp, totalLeft),
      totalRight,
    );
    const rootCommissionGoalShortfallDays = Math.max(
      0,
      rootGoalCapacity.targetCommissionDays - rootActualCommissionDays,
    );
    const objective: AutomaticPlanObjectiveVector = Object.freeze({
      rootCommissionGoalShortfallDays,
      totalNewPv,
      confirmedPayoutWon,
      discardedExcessPv,
      priorityDepthAscendingEquivalentUnitVector: Object.freeze(
        priorityDepthAscendingEquivalentUnitVector,
      ),
      highTargetAscendingEquivalentUnitVector: Object.freeze(
        highTargetAscendingEquivalentUnitVector,
      ),
      target700AscendingEquivalentUnitVector: Object.freeze(
        target700AscendingEquivalentUnitVector,
      ),
      futureCumulativePvpInvestmentPv,
      nonHundredCellCount,
      maxDirectPvp,
      deterministicAllocationVector: Object.freeze(deterministicAllocationVector),
    });
    const display: AutomaticPlanDisplayMetrics = Object.freeze({
      rootCommissionGoal: Object.freeze({
        rootMemberKey: rootGoalCapacity.rootMemberKey,
        businessDayCount: rootGoalCapacity.businessDayCount,
        targetCommissionDays: rootGoalCapacity.targetCommissionDays,
        actualCommissionDays: rootActualCommissionDays,
        shortfallDays: rootCommissionGoalShortfallDays,
        capacityLimited: rootGoalCapacity.capacityLimited,
        met: rootCommissionGoalShortfallDays === 0,
      }),
      priorityDepthMemberEquivalentUnitCounts: Object.freeze(
        priorityDepthMemberEquivalentUnitCounts,
      ),
      highTargetMemberEquivalentUnitCounts: Object.freeze(
        highTargetMemberEquivalentUnitCounts,
      ),
      target700MembersAtLeastEightEquivalentUnits,
      target700TotalCommissionEquivalentUnits,
      target700MemberEquivalentUnitCounts: Object.freeze(
        target700MemberEquivalentUnitCounts,
      ),
      terminalCarrySummary: Object.freeze({
        byMember: Object.freeze(terminalByMember),
        totalPvp,
        totalLeft,
        totalRight,
        totalCarryPv,
      }),
    });
    return { status: 'SUCCESS', objective, display };
  } catch (error) {
    const safeError = errorFromUnknown(error);
    return {
      status: 'FAILURE',
      error:
        safeError.code === 'AUTOMATIC_PLAN_INTERNAL_ERROR'
          ? automaticPlanError(
              'AUTOMATIC_PLAN_INTERNAL_ERROR',
              '자동 계획 목적값을 계산 결과에서 다시 만들 수 없습니다.',
            )
          : safeError,
    };
  }
}
