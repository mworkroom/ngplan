import type { DailySettlement } from '../engine';
import {
  checkedAddScore,
  checkedMultiplyScore,
  checkedSubtractScore,
} from './checked-integer';

type QualificationAwareSettlement = DailySettlement & {
  readonly settlementKind?:
    | 'SKIPPED'
    | 'NO_COMMISSION'
    | 'BELOW_QUALIFICATION_SETTLEMENT'
    | 'FULL_COMMISSION';
};

export function discardedExcessForSettlement(
  settlement: DailySettlement,
): number {
  const qualified = settlement as QualificationAwareSettlement;
  if (qualified.settlementKind !== 'FULL_COMMISSION') {
    return 0;
  }
  if (settlement.commissionTier === null) {
    throw new TypeError('FULL_COMMISSION settlement must contain a commission tier');
  }
  const preTotal = checkedAddScore(
    checkedAddScore(settlement.preSettlement.pvp, settlement.preSettlement.left),
    settlement.preSettlement.right,
  );
  const required = checkedMultiplyScore(settlement.commissionTier, 2);
  return checkedSubtractScore(preTotal, required);
}
