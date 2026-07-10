import { DEFAULT_RULE_SET, ENGINE_VERSION } from '../domain/constants';
import { derivePeriod } from '../domain/period';
import { PvAggregateOutOfRangeError } from '../domain/pv';
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

function canonicalizeInput(input: CalculatePlanInput): CalculatePlanInput {
  const members = [...input.organization.members]
    .sort((left, right) => compareText(left.memberKey, right.memberKey))
    .map((member) => ({ ...member }));
  const openingStateByMember = Object.fromEntries(
    Object.entries(input.organization.openingStateByMember)
      .sort(([left], [right]) => compareText(left, right))
      .map(([memberKey, opening]) => [
        memberKey,
        opening === undefined ? opening : { ...opening },
      ]),
  ) as CalculatePlanInput['organization']['openingStateByMember'];
  const allocations = [...input.allocations]
    .sort(
      (left, right) =>
        compareText(left.date, right.date) ||
        compareText(left.memberKey, right.memberKey),
    )
    .map((allocation) => ({ ...allocation }));

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

/** 검증부터 전체 반월의 조직·일일·보름 장부까지 한 번에 계산한다. */
export function calculatePlan(
  input: CalculatePlanInput,
  rules: RuleSet = DEFAULT_RULE_SET,
): CalculationOutcome {
  if (!isCalculatePlanInputStructure(input)) {
    return { status: 'FAILURE', validation: validatePlan(input, rules) };
  }
  const inputSnapshot = canonicalizeInput(input);
  const validation = validatePlan(inputSnapshot, rules);
  if (!validation.isValid) {
    return { status: 'FAILURE', validation };
  }
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
    const accumulatorByMember = new Map<string, FortnightAccumulator>();
    for (const memberKey of organization.orderedMemberKeys) {
      const opening = inputSnapshot.organization.openingStateByMember[memberKey]!;
      carryByMember.set(memberKey, toPvBalance(opening));
      accumulatorByMember.set(memberKey, createFortnightAccumulator());
    }

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
        const settlement = settleDaily({
          carryIn: carryByMember.get(memberKey)!,
          rawPerformance: raw,
          rules: activeRules,
        });
        dailyByMember[memberKey] = settlement;
        carryByMember.set(memberKey, settlement.carryOut);

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
    for (const memberKey of organization.orderedMemberKeys) {
      finalAssessmentByMember[memberKey] = evaluateFortnight({
        accumulator: accumulatorByMember.get(memberKey)!,
        member: organization.membersByKey.get(memberKey)!,
        openingState: inputSnapshot.organization.openingStateByMember[memberKey]!,
        rules: activeRules,
      });
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
        warnings: validation.warnings,
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
