import type { CommissionTier, PvpTarget, Pv, RuleSet } from './types';

const pvLiteral = (value: number): Pv => value as Pv;

export const ENGINE_VERSION = '2.0.0';

export const RULE_SET_2_0_0: RuleSet = Object.freeze({
  rulesetVersion: '2.0.0',
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
  fortnightSideTarget: pvLiteral(2500),
  businessCalendarPolicy: 'SUNDAY_SKIP_NO_INPUT',
  pvpTiePolicy: 'LEFT',
  fortnightPvpSourcePolicy: 'OPENING_PLUS_NEW_EXCLUDING_DAILY_CARRY',
  target700CommissionPreference: Object.freeze({
    eligiblePvpTarget: 700,
    recommendedDays: 8,
  }),
});

export const DEFAULT_RULE_SET = RULE_SET_2_0_0;

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
