import type { CommissionTier, Pv, RuleSet } from './types';

const pvLiteral = (value: number): Pv => value as Pv;

export const ENGINE_VERSION = '1.0.0';

export const RULE_SET_1_0_0: RuleSet = Object.freeze({
  rulesetVersion: '1.0.0',
  commissionTiers: Object.freeze([
    300,
    700,
    1500,
    2400,
    6000,
    20000,
    60000,
  ] satisfies CommissionTier[]),
  pvpTargetByLevel: Object.freeze({
    level1: pvLiteral(2400),
    level2: pvLiteral(1500),
    level3OrAbove: pvLiteral(700),
  }),
  fortnightSideTarget: pvLiteral(2500),
  businessCalendarPolicy: 'SUNDAY_SKIP_NO_INPUT',
  pvpTiePolicy: 'LEFT',
  fortnightPvpSourcePolicy: 'OPENING_PLUS_NEW_EXCLUDING_DAILY_CARRY',
  lowerLevelCommissionPreference: Object.freeze({
    minimumLevel: 4,
    recommendedDays: 8,
  }),
});

export const DEFAULT_RULE_SET = RULE_SET_1_0_0;

export function pvpTargetForLevel(level: number, rules: RuleSet = DEFAULT_RULE_SET): Pv {
  if (level === 1) {
    return rules.pvpTargetByLevel.level1;
  }
  if (level === 2) {
    return rules.pvpTargetByLevel.level2;
  }
  return rules.pvpTargetByLevel.level3OrAbove;
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
