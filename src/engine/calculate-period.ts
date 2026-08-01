import { DEFAULT_RULE_SET, ENGINE_VERSION } from '../domain/constants';
import { derivePeriod } from '../domain/period';
import { checkedAdd, PvAggregateOutOfRangeError } from '../domain/pv';
import type {
  CalculatePlanInput,
  CalculationOutcome,
  DailySettlement,
  FortnightAssessment,
  NormalizedAllocationCell,
  OpeningStateInput,
  Pv,
  PvBalance,
  RawPerformance,
  RuleSet,
  RunningFortnightState,
  ValidationIssue,
  ValidationReport,
} from '../domain/types';
import {
  createValidationReport,
  isCalculatePlanInputStructure,
  validatePlan,
} from '../domain/validation';
import { settleDaily } from './daily-ledger';
import {
  accumulateFortnightDay,
  createFortnightAccumulator,
  evaluateFortnight,
  type FortnightAccumulator,
} from './half-month-ledger';
import { buildOrganizationIndex, deriveRawPerformance } from './organization';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function snapshotInput(input: CalculatePlanInput): CalculatePlanInput {
  const members = input.organization.members.map((member) => ({ ...member }));
  const openingStateByMember = Object.fromEntries(
    Object.entries(input.organization.openingStateByMember)
      .sort(([left], [right]) => compareText(left, right))
      .map(([memberKey, opening]) => [
        memberKey,
        opening === undefined ? opening : { ...opening },
      ]),
  ) as CalculatePlanInput['organization']['openingStateByMember'];
  const allocations = input.allocations.map((allocation) => ({ ...allocation }));

  return {
    period: { ...input.period },
    organization: {
      snapshotId: input.organization.snapshotId,
      members,
      openingStateByMember,
    },
    allocations,
  };
}

function canonicalizeValidatedInput(input: CalculatePlanInput): CalculatePlanInput {
  const organization = buildOrganizationIndex(input.organization.members);
  const memberOrder = new Map(
    organization.orderedMemberKeys.map((memberKey, index) => [memberKey, index]),
  );
  const members = organization.orderedMemberKeys.map((memberKey) => ({
    ...organization.membersByKey.get(memberKey)!,
  }));
  const openingStateByMember = Object.fromEntries(
    organization.orderedMemberKeys.map((memberKey) => [
      memberKey,
      { ...input.organization.openingStateByMember[memberKey]! },
    ]),
  ) as CalculatePlanInput['organization']['openingStateByMember'];
  const allocations = input.allocations
    .map((allocation) => ({ ...allocation }))
    .sort(
      (left, right) =>
        compareText(left.date, right.date) ||
        memberOrder.get(left.memberKey)! - memberOrder.get(right.memberKey)!,
    );

  return {
    period: { ...input.period },
    organization: {
      snapshotId: input.organization.snapshotId,
      members,
      openingStateByMember,
    },
    allocations,
  };
}

function toPvBalance(opening: OpeningStateInput): PvBalance {
  return {
    pvp: opening.dailyCarryPvp as Pv,
    left: opening.dailyCarryLeft as Pv,
    right: opening.dailyCarryRight as Pv,
  };
}

function reportFromIssue(issue: ValidationIssue): ValidationReport {
  return {
    isValid: false,
    issues: [issue],
    errors: [issue],
    warnings: [],
  };
}

function createSafeRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function belowQualificationWarning(
  settlement: DailySettlement,
): ValidationIssue {
  return Object.freeze({
    code: 'BELOW_QUALIFICATION_SETTLEMENT',
    severity: 'WARNING',
    location: Object.freeze({
      date: settlement.date,
      memberKey: settlement.memberKey,
      field: 'qualificationPvp',
    }),
    message: `누적 qualification PVP ${settlement.qualificationPvp} 상태에서 정산이 발생했습니다.`,
    suggestion: '정산일 당일까지 누적 qualification PVP를 300 이상으로 만들거나 좌우 계획을 조정해 주세요.',
  });
}

type CumulativePvpAllocationPolicy = 'BLOCK' | 'WARN';

function applyCumulativePvpAllocationPolicy(
  validation: ValidationReport,
  policy: CumulativePvpAllocationPolicy,
): ValidationReport {
  if (policy === 'BLOCK') {
    return validation;
  }
  return createValidationReport(
    validation.issues.map((issue) =>
      issue.code === 'CUMULATIVE_PVP_ALLOCATION_EXCEEDS_CAP'
        ? {
            ...issue,
            severity: 'WARNING' as const,
            suggestion:
              '입력한 값으로 계속 계산합니다. 2,400을 넘은 PVP는 개인 PVP 목표에 추가 도움이 되지 않아 손해가 될 수 있습니다.',
          }
        : issue,
    ),
  );
}

function calculatePlanWithPolicy(
  input: CalculatePlanInput,
  rules: RuleSet,
  cumulativePvpAllocationPolicy: CumulativePvpAllocationPolicy,
): CalculationOutcome {
  if (!isCalculatePlanInputStructure(input)) {
    return { status: 'FAILURE', validation: validatePlan(input, rules) };
  }
  const sourceSnapshot = snapshotInput(input);
  const validation = applyCumulativePvpAllocationPolicy(
    validatePlan(sourceSnapshot, rules),
    cumulativePvpAllocationPolicy,
  );
  if (!validation.isValid) {
    return { status: 'FAILURE', validation };
  }
  const inputSnapshot = canonicalizeValidatedInput(sourceSnapshot);
  const activeRules = DEFAULT_RULE_SET;

  try {
    const period = derivePeriod(inputSnapshot.period);
    const organization = buildOrganizationIndex(inputSnapshot.organization.members);
    const allocationsByDate = new Map<string, NormalizedAllocationCell[]>();
    for (const allocation of inputSnapshot.allocations) {
      const existing = allocationsByDate.get(allocation.date);
      if (existing === undefined) {
        allocationsByDate.set(allocation.date, [allocation]);
      } else {
        existing.push(allocation);
      }
    }

    const carryByMember = new Map<string, PvBalance>();
    const qualificationPvpByMember = new Map<string, Pv>();
    const accumulatorByMember = new Map<string, FortnightAccumulator>();
    for (const memberKey of organization.orderedMemberKeys) {
      const opening = inputSnapshot.organization.openingStateByMember[memberKey]!;
      carryByMember.set(memberKey, toPvBalance(opening));
      qualificationPvpByMember.set(
        memberKey,
        opening.openingQualificationPvp as Pv,
      );
      accumulatorByMember.set(memberKey, createFortnightAccumulator());
    }
    const warnings: ValidationIssue[] = [...validation.warnings];

    const rawPerformanceByDateAndMember: Record<
      string,
      Readonly<Record<string, RawPerformance>>
    > = createSafeRecord();
    const dailySettlementByDateAndMember: Record<
      string,
      Readonly<Record<string, DailySettlement>>
    > = createSafeRecord();
    const runningFortnightByDateAndMember: Record<
      string,
      Readonly<Record<string, RunningFortnightState>>
    > = createSafeRecord();

    for (const date of period.dates) {
      const rawByMember = deriveRawPerformance({
        date,
        organization,
        allocations: allocationsByDate.get(date)!,
      });
      rawPerformanceByDateAndMember[date] = rawByMember;

      const dailyByMember = createSafeRecord<DailySettlement>();
      const runningByMember = createSafeRecord<RunningFortnightState>();
      for (const memberKey of organization.orderedMemberKeys) {
        const raw = rawByMember[memberKey]!;
        const qualificationPvp = checkedAdd(
          qualificationPvpByMember.get(memberKey)!,
          raw.directPvp,
          {
            date,
            memberKey,
            field: 'qualificationPvp',
          },
        );
        qualificationPvpByMember.set(memberKey, qualificationPvp);
        const settlement = settleDaily({
          carryIn: carryByMember.get(memberKey)!,
          rawPerformance: raw,
          qualificationPvp,
          rules: activeRules,
        });
        dailyByMember[memberKey] = settlement;
        carryByMember.set(memberKey, settlement.carryOut);
        if (settlement.settlementKind === 'BELOW_QUALIFICATION_SETTLEMENT') {
          warnings.push(belowQualificationWarning(settlement));
        }

        const member = organization.membersByKey.get(memberKey)!;
        const opening = inputSnapshot.organization.openingStateByMember[memberKey]!;
        const accumulated = accumulateFortnightDay({
          previous: accumulatorByMember.get(memberKey)!,
          rawPerformance: raw,
          dailySettlement: settlement,
          member,
          openingState: opening,
          rules: activeRules,
        });
        accumulatorByMember.set(memberKey, accumulated.accumulator);
        runningByMember[memberKey] = accumulated.runningState;
      }
      dailySettlementByDateAndMember[date] = dailyByMember;
      runningFortnightByDateAndMember[date] = runningByMember;
    }

    const finalAssessmentByMember = createSafeRecord<FortnightAssessment>();
    const closingDailyCarryByMember = createSafeRecord<PvBalance>();
    for (const memberKey of organization.orderedMemberKeys) {
      finalAssessmentByMember[memberKey] = evaluateFortnight({
        accumulator: accumulatorByMember.get(memberKey)!,
        member: organization.membersByKey.get(memberKey)!,
        openingState: inputSnapshot.organization.openingStateByMember[memberKey]!,
        rules: activeRules,
      });
      const closingCarry = carryByMember.get(memberKey)!;
      closingDailyCarryByMember[memberKey] = {
        pvp: closingCarry.pvp,
        left: closingCarry.left,
        right: closingCarry.right,
      };
    }

    return {
      status: 'SUCCESS',
      result: {
        inputSnapshot,
        period,
        rulesetVersion: activeRules.rulesetVersion,
        engineVersion: ENGINE_VERSION,
        rawPerformanceByDateAndMember,
        dailySettlementByDateAndMember,
        runningFortnightByDateAndMember,
        finalAssessmentByMember,
        closingDailyCarryByMember,
        warnings: Object.freeze(warnings),
      },
    };
  } catch (error) {
    if (error instanceof PvAggregateOutOfRangeError) {
      return {
        status: 'FAILURE',
        validation: reportFromIssue(error.toIssue()),
      };
    }
    throw error;
  }
}

/** 검증부터 전체 반월의 조직·일일·보름 장부까지 한 번에 계산한다. */
export function calculatePlan(
  input: CalculatePlanInput,
  rules: RuleSet = DEFAULT_RULE_SET,
): CalculationOutcome {
  return calculatePlanWithPolicy(input, rules, 'BLOCK');
}

/** 수동 입력은 누적 PVP 상한 초과를 안내하면서 입력값 그대로 계산한다. */
export function calculatePlanForManualEditing(
  input: CalculatePlanInput,
  rules: RuleSet = DEFAULT_RULE_SET,
): CalculationOutcome {
  return calculatePlanWithPolicy(input, rules, 'WARN');
}
