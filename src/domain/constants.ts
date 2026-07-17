import type { CommissionTier, PvpTarget, Pv, RuleSet } from './types';

const pvLiteral = (value: number): Pv => value as Pv;

export const ENGINE_VERSION = '6.0.0';
export const CALENDAR_VERSION = '1.0.0';

export const RULE_SET_6_0_0: RuleSet = Object.freeze({
  rulesetVersion: '6.0.0',
  commissionTiers: Object.freeze([
    300,
    700,
    1500,
    2400,
    6000,
    20000,
    60000,
  ] satisfies CommissionTier[]),
  allowedPvpTargets: Object.freeze([2400, 1500, 700] satisfies PvpTarget[]),
  cumulativePvpCap: pvLiteral(2400),
  fortnightSideTarget: pvLiteral(2500),
  businessCalendarPolicy: 'SUNDAY_SKIP_NO_INPUT',
  pvpTiePolicy: 'LEFT',
  fortnightPvpSourcePolicy: 'NEW_ONLY_EXCLUDING_OPENING_AND_DAILY_CARRY',
  target700CommissionPreference: Object.freeze({
    eligiblePvpTarget: 700,
    recommendedDays: 8,
  }),
  qualificationPolicy: Object.freeze({
    threshold: 300,
    accumulation: 'OPENING_PLUS_DIRECT_INCLUSIVE_NON_RESETTING',
    belowThresholdSettlement: 'RESET_AND_WARN_NOT_FULL_COMMISSION',
  }),
});

export const DEFAULT_RULE_SET = RULE_SET_6_0_0;

export function isAllowedPvpTarget(
  value: number,
  rules: RuleSet = DEFAULT_RULE_SET,
): value is PvpTarget {
  return rules.allowedPvpTargets.includes(value as PvpTarget);
}

export function commissionTierFor(
  assessedLeft: Pv,
  assessedRight: Pv,
  rules: RuleSet = DEFAULT_RULE_SET,
): CommissionTier | null {
  const minimum = Math.min(assessedLeft, assessedRight);
  let matched: CommissionTier | null = null;
  for (const tier of rules.commissionTiers) {
    if (tier > minimum) {
      break;
    }
    matched = tier;
  }
  return matched;
}
