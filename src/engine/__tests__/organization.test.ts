import { describe, expect, it } from 'vitest';

import { PvAggregateOutOfRangeError } from '../../domain/pv';
import type {
  IsoDate,
  MemberSnapshot,
  NormalizedAllocationCell,
  Pv,
  PvBalance,
  PvpTarget,
} from '../../domain/types';
import { settleDaily } from '../daily-ledger';
import {
  buildOrganizationIndex,
  deriveRawPerformance,
} from '../organization';

const DATE = '2026-07-11' as IsoDate;
const NEXT_DATE = '2026-07-13' as IsoDate;

const balance = (pvp: number, left: number, right: number): PvBalance => ({
  pvp: pvp as Pv,
  left: left as Pv,
  right: right as Pv,
});

const member = (
  memberKey: string,
  parentMemberKey: string | null,
  sideAtParent: 'LEFT' | 'RIGHT' | null,
  pvpTarget: PvpTarget = 700,
): MemberSnapshot => ({
  memberKey,
  memberId: `ID-${memberKey}`,
  name: memberKey,
  pvpTarget,
  fortnightSideTarget: 2500,
  sheetMarker: 'NONE',
  parentMemberKey,
  sideAtParent,
});

const calculate = (
  members: readonly MemberSnapshot[],
  allocations: readonly NormalizedAllocationCell[],
) => deriveRawPerformance({
  date: DATE,
  organization: buildOrganizationIndex(members),
  allocations,
});

describe('organization', () => {
  it('[ORG-001] 한 단계 왼쪽 전파', () => {
    const result = calculate(
      [member('A', null, null), member('B', 'A', 'LEFT')],
      [
        { date: DATE, memberKey: 'A', pvp: 0, selfRight: 50 },
        { date: DATE, memberKey: 'B', pvp: 100, selfLeft: 200, selfRight: 300 },
      ],
    );

    expect(result.B).toMatchObject({
      directPvp: 100,
      organizationLeft: 200,
      organizationRight: 300,
      subtreeTotal: 600,
    });
    expect(result.A).toMatchObject({
      directPvp: 0,
      organizationLeft: 600,
      organizationRight: 50,
      subtreeTotal: 650,
    });
  });

  it('[ORG-002] 다단계 연쇄 전파', () => {
    const members = [
      member('C', 'B', 'LEFT'),
      member('A', null, null),
      member('B', 'A', 'LEFT'),
    ];
    const allocations = [
      { date: DATE, memberKey: 'B', pvp: 50, selfRight: 100 },
      { date: DATE, memberKey: 'C', pvp: 100, selfLeft: 200, selfRight: 300 },
      { date: DATE, memberKey: 'A', pvp: 25, selfRight: 50 },
    ];
    const membersBefore = structuredClone(members);
    const allocationsBefore = structuredClone(allocations);

    const result = calculate(members, allocations);

    expect(result.C?.subtreeTotal).toBe(600);
    expect(result.B).toMatchObject({ organizationLeft: 600, subtreeTotal: 750 });
    expect(result.A).toMatchObject({ organizationLeft: 750, subtreeTotal: 825 });
    expect(Object.keys(result)).toEqual(['A', 'B', 'C']);
    expect(members).toEqual(membersBefore);
    expect(allocations).toEqual(allocationsBefore);
  });

  it('[ORG-002] 회원 입력 순서를 바꿔도 결과와 후위 순서가 같다', () => {
    const a = member('A', null, null);
    const b = member('B', 'A', 'LEFT');
    const c = member('C', 'A', 'RIGHT');
    const allocations = [
      { date: DATE, memberKey: 'A', pvp: 10 },
      { date: DATE, memberKey: 'B', pvp: 20, selfLeft: 30, selfRight: 40 },
      { date: DATE, memberKey: 'C', pvp: 50, selfLeft: 60, selfRight: 70 },
    ];

    const firstIndex = buildOrganizationIndex([a, b, c]);
    const secondIndex = buildOrganizationIndex([c, a, b]);

    expect(firstIndex.postOrderMemberKeys).toEqual(['B', 'C', 'A']);
    expect(secondIndex.postOrderMemberKeys).toEqual(firstIndex.postOrderMemberKeys);
    expect(deriveRawPerformance({ date: DATE, organization: firstIndex, allocations }))
      .toEqual(deriveRawPerformance({ date: DATE, organization: secondIndex, allocations }));
  });

  it('[ORG-P01] canonical 회원 순서는 루트부터 LEFT 서브트리, RIGHT 서브트리 순서임', () => {
    const members = [
      member('B', 'Z', 'RIGHT'),
      member('A', 'M', 'LEFT'),
      member('Z', null, null),
      member('M', 'Z', 'LEFT'),
    ];
    const organization = buildOrganizationIndex(members);
    const result = deriveRawPerformance({
      date: DATE,
      organization,
      allocations: [
        { date: DATE, memberKey: 'A', pvp: 0, selfLeft: 0, selfRight: 0 },
        { date: DATE, memberKey: 'B', pvp: 0, selfLeft: 0, selfRight: 0 },
        { date: DATE, memberKey: 'M', pvp: 0, selfRight: 0 },
        { date: DATE, memberKey: 'Z', pvp: 0 },
      ],
    });

    expect(organization.orderedMemberKeys).toEqual(['Z', 'M', 'A', 'B']);
    expect(organization.postOrderMemberKeys).toEqual(['A', 'M', 'B', 'Z']);
    expect(Object.keys(result)).toEqual(['Z', 'M', 'A', 'B']);
  });

  it('[ORG-006] 하위 실적은 상위의 PVP가 아님', () => {
    const result = calculate(
      [member('A', null, null), member('B', 'A', 'LEFT')],
      [
        { date: DATE, memberKey: 'A', pvp: 0, selfRight: 0 },
        { date: DATE, memberKey: 'B', pvp: 700, selfLeft: 0, selfRight: 0 },
      ],
    );

    expect(result.B).toMatchObject({ directPvp: 700, subtreeTotal: 700 });
    expect(result.A).toMatchObject({ directPvp: 0, organizationLeft: 700 });
  });

  it('[DAY-P01] 자식 이월 잔액을 다음 날 상위 원본에 재전파하지 않음', () => {
    const organization = buildOrganizationIndex([
      member('A', null, null),
      member('B', 'A', 'LEFT'),
    ]);
    const firstRaw = deriveRawPerformance({
      date: DATE,
      organization,
      allocations: [
        { date: DATE, memberKey: 'A', pvp: 0, selfRight: 0 },
        { date: DATE, memberKey: 'B', pvp: 100, selfLeft: 200, selfRight: 100 },
      ],
    });
    const childFirstDaily = settleDaily({
      carryIn: balance(0, 0, 0),
      rawPerformance: firstRaw.B!,
      qualificationPvp: 300 as Pv,
    });
    const parentFirstDaily = settleDaily({
      carryIn: balance(0, 0, 0),
      rawPerformance: firstRaw.A!,
      qualificationPvp: 300 as Pv,
    });
    const secondRaw = deriveRawPerformance({
      date: NEXT_DATE,
      organization,
      allocations: [
        { date: NEXT_DATE, memberKey: 'A', pvp: 0, selfRight: 0 },
        { date: NEXT_DATE, memberKey: 'B', pvp: 0, selfLeft: 0, selfRight: 0 },
      ],
    });
    const parentSecondDaily = settleDaily({
      carryIn: parentFirstDaily.carryOut,
      rawPerformance: secondRaw.A!,
      qualificationPvp: 300 as Pv,
    });

    expect(firstRaw.A?.organizationLeft).toBe(400);
    expect(childFirstDaily.carryOut).toEqual(balance(100, 200, 100));
    expect(secondRaw.A?.organizationLeft).toBe(0);
    expect(parentSecondDaily.preSettlement.left).toBe(400);
  });

  it('[DAY-P02] 자식의 당일 초기화가 부모의 날짜 원본을 바꾸지 않음', () => {
    const organization = buildOrganizationIndex([
      member('A', null, null),
      member('B', 'A', 'LEFT'),
    ]);
    const rawByMember = deriveRawPerformance({
      date: DATE,
      organization,
      allocations: [
        { date: DATE, memberKey: 'A', pvp: 0, selfRight: 0 },
        { date: DATE, memberKey: 'B', pvp: 100, selfLeft: 200, selfRight: 300 },
      ],
    });
    const childDaily = settleDaily({
      carryIn: balance(0, 0, 0),
      rawPerformance: rawByMember.B!,
      qualificationPvp: 300 as Pv,
    });

    expect(childDaily).toMatchObject({
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(rawByMember.B?.subtreeTotal).toBe(600);
    expect(rawByMember.A?.organizationLeft).toBe(600);
  });

  it('[VAL-004] 개별 입력이 안전해도 파생 합계가 넘으면 실패한다', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const organization = buildOrganizationIndex([
      member('A', null, null),
      member('B', 'A', 'LEFT'),
      member('C', 'A', 'RIGHT'),
    ]);

    try {
      deriveRawPerformance({
        date: DATE,
        organization,
        allocations: [
          { date: DATE, memberKey: 'A', pvp: 0 },
          { date: DATE, memberKey: 'B', pvp: maximum, selfLeft: 0, selfRight: 0 },
          { date: DATE, memberKey: 'C', pvp: 1, selfLeft: 0, selfRight: 0 },
        ],
      });
      expect.fail('범위 오류가 필요합니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(PvAggregateOutOfRangeError);
      expect(error).toMatchObject({
        code: 'PV_AGGREGATE_OUT_OF_RANGE',
        location: { date: DATE, memberKey: 'A', field: 'subtreeTotal' },
      });
    }
  });
});
