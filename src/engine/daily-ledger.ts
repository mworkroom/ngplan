import {
  commissionTierFor,
  DEFAULT_RULE_SET,
} from '../domain/constants';
import { settlementModeForDate } from '../domain/period';
import { checkedAdd, ZERO_PV } from '../domain/pv';
import type {
  DailySettlement,
  PvBalance,
  RawPerformance,
  RuleSet,
} from '../domain/types';

export interface SettleDailyInput {
  readonly carryIn: PvBalance;
  readonly rawPerformance: RawPerformance;
  readonly rules?: RuleSet;
}

export class NonZeroInputOnSkippedDateError extends Error {
  readonly code = 'NON_ZERO_INPUT_ON_SKIPPED_DATE' as const;

  constructor(readonly rawPerformance: RawPerformance) {
    super(`${rawPerformance.date}은 신규 입력이 금지된 날짜입니다.`);
    this.name = 'NonZeroInputOnSkippedDateError';
  }
}

const zeroBalance = (): PvBalance => ({
  pvp: ZERO_PV,
  left: ZERO_PV,
  right: ZERO_PV,
});

const copyBalance = (balance: PvBalance): PvBalance => ({
  pvp: balance.pvp,
  left: balance.left,
  right: balance.right,
});

const copyRawPerformance = (raw: RawPerformance): RawPerformance => ({
  date: raw.date,
  memberKey: raw.memberKey,
  directPvp: raw.directPvp,
  organizationLeft: raw.organizationLeft,
  organizationRight: raw.organizationRight,
  subtreeTotal: raw.subtreeTotal,
});

/** 한 회원의 하루 원본과 이월 잔액을 순수하게 정산한다. */
export function settleDaily(input: SettleDailyInput): DailySettlement {
  const rules = input.rules ?? DEFAULT_RULE_SET;
  const raw = input.rawPerformance;
  const carryIn = copyBalance(input.carryIn);
  const businessCalendarMode = settlementModeForDate(raw.date);

  if (
    businessCalendarMode === 'SKIP_NO_INPUT' &&
    (raw.directPvp !== ZERO_PV ||
      raw.organizationLeft !== ZERO_PV ||
      raw.organizationRight !== ZERO_PV ||
      raw.subtreeTotal !== ZERO_PV)
  ) {
    throw new NonZeroInputOnSkippedDateError(copyRawPerformance(raw));
  }

  const preSettlement: PvBalance = {
    pvp: checkedAdd(carryIn.pvp, raw.directPvp, {
      date: raw.date,
      memberKey: raw.memberKey,
      field: 'preSettlement.pvp',
    }),
    left: checkedAdd(carryIn.left, raw.organizationLeft, {
      date: raw.date,
      memberKey: raw.memberKey,
      field: 'preSettlement.left',
    }),
    right: checkedAdd(carryIn.right, raw.organizationRight, {
      date: raw.date,
      memberKey: raw.memberKey,
      field: 'preSettlement.right',
    }),
  };

  if (businessCalendarMode === 'SKIP_NO_INPUT') {
    return {
      date: raw.date,
      memberKey: raw.memberKey,
      businessCalendarMode,
      settlementStatus: 'SKIPPED',
      carryIn,
      rawPerformance: copyRawPerformance(raw),
      preSettlement,
      pvpAppliedSide: null,
      pvpApplicationReason: null,
      assessedLeft: null,
      assessedRight: null,
      commissionTier: null,
      commissionOccurred: false,
      carryOut: copyBalance(carryIn),
    };
  }

  const leftIsSmallerOrTied = preSettlement.left <= preSettlement.right;
  const pvpAppliedSide = leftIsSmallerOrTied ? 'LEFT' : 'RIGHT';
  const pvpApplicationReason = preSettlement.left === preSettlement.right
    ? 'TIE_LEFT'
    : leftIsSmallerOrTied
      ? 'SMALLER_LEFT'
      : 'SMALLER_RIGHT';
  const assessedLeft = leftIsSmallerOrTied
    ? checkedAdd(preSettlement.left, preSettlement.pvp, {
        date: raw.date,
        memberKey: raw.memberKey,
        field: 'assessedLeft',
      })
    : preSettlement.left;
  const assessedRight = leftIsSmallerOrTied
    ? preSettlement.right
    : checkedAdd(preSettlement.right, preSettlement.pvp, {
        date: raw.date,
        memberKey: raw.memberKey,
        field: 'assessedRight',
      });
  const commissionTier = commissionTierFor(assessedLeft, assessedRight, rules);
  const commissionOccurred = commissionTier !== null;

  return {
    date: raw.date,
    memberKey: raw.memberKey,
    businessCalendarMode,
    settlementStatus: 'SETTLED',
    carryIn,
    rawPerformance: copyRawPerformance(raw),
    preSettlement,
    pvpAppliedSide,
    pvpApplicationReason,
    assessedLeft,
    assessedRight,
    commissionTier,
    commissionOccurred,
    carryOut: commissionOccurred ? zeroBalance() : copyBalance(preSettlement),
  };
}
