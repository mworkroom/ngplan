import { derivePeriod } from '../domain/period';
import type {
  CalculatePlanInput,
  Half,
  MemberSnapshot,
  NormalizedAllocationCell,
  OpeningStateInput,
  PeriodInput,
  PvpTarget,
  Side,
} from '../domain/types';

export const ZERO_OPENING_STATE: OpeningStateInput = Object.freeze({
  openingQualificationPvp: 0,
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
});

export function member(
  memberKey: string,
  parentMemberKey: string | null = null,
  sideAtParent: Side | null = null,
  pvpTarget: PvpTarget = 700,
): MemberSnapshot {
  return {
    memberKey,
    memberId: `ID-${memberKey}`,
    name: `회원 ${memberKey}`,
    pvpTarget,
    sheetMarker: 'NONE',
    parentMemberKey,
    sideAtParent,
  };
}

interface PlanFixtureOptions {
  readonly year?: number;
  readonly month?: number;
  readonly half?: Half;
  readonly members?: readonly MemberSnapshot[];
  readonly opening?: Readonly<Record<string, Partial<OpeningStateInput>>>;
  readonly allocations?: readonly (Partial<NormalizedAllocationCell> &
    Pick<NormalizedAllocationCell, 'date' | 'memberKey'>)[];
}

export function makePlanInput(options: PlanFixtureOptions = {}): CalculatePlanInput {
  const period: PeriodInput = {
    year: options.year ?? 2026,
    month: options.month ?? 7,
    half: options.half ?? 'FIRST_HALF',
  };
  const members = options.members ?? [member('A')];
  const childSlots = new Set(
    members
      .filter(
        (item): item is MemberSnapshot & {
          readonly parentMemberKey: string;
          readonly sideAtParent: Side;
        } => item.parentMemberKey !== null && item.sideAtParent !== null,
      )
      .map((item) => `${item.parentMemberKey}\u0000${item.sideAtParent}`),
  );
  const overrides = new Map(
    (options.allocations ?? []).map((allocation) => [
      `${allocation.date}\u0000${allocation.memberKey}`,
      allocation,
    ]),
  );
  const allocations: NormalizedAllocationCell[] = [];

  for (const date of derivePeriod(period).dates) {
    for (const item of members) {
      const base: NormalizedAllocationCell = {
        date,
        memberKey: item.memberKey,
        pvp: 0,
        ...(childSlots.has(`${item.memberKey}\u0000LEFT`) ? {} : { selfLeft: 0 }),
        ...(childSlots.has(`${item.memberKey}\u0000RIGHT`) ? {} : { selfRight: 0 }),
      };
      allocations.push({
        ...base,
        ...overrides.get(`${date}\u0000${item.memberKey}`),
      });
    }
  }

  const openingStateByMember = Object.fromEntries(
    members.map((item) => [
      item.memberKey,
      {
        ...ZERO_OPENING_STATE,
        ...options.opening?.[item.memberKey],
      },
    ]),
  );

  return {
    period,
    organization: {
      snapshotId: 'snapshot-test',
      members: members.map((item) => ({ ...item })),
      openingStateByMember,
    },
    allocations,
  };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
