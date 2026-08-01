import { describe, expect, it } from 'vitest';
import { deriveMemberCommissionCapacities } from '..';
import type { MemberSnapshot } from '../../engine';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

function achievedOpening(pvpTarget: number) {
  return optimizerOpening({
    openingQualificationPvp: pvpTarget,
    fortnightPvpOpeningCredit: pvpTarget,
  });
}

describe('member commission capacity', () => {
  it('derives an eight-unit aggregate cap for an achieved target-700 leaf', () => {
    const request = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: achievedOpening(700) }),
    );

    expect(deriveMemberCommissionCapacities(request).byMember.get('root')).toMatchObject({
      businessDayCount: 13,
      minimumRawLeftPv: 2_500,
      minimumRawRightPv: 2_500,
      requiredPvp: 0,
      aggregateMatchedPvUpperBound: 2_500,
      attainableEquivalentUnitsUpperBound: 8,
    });
  });

  it('derives the five-unit aggregate cap from a 1,500 side target', () => {
    const request = createOptimizerRequest(
      [optimizerMember('root', null, null, 700, 1_500)],
      Object.freeze({ root: achievedOpening(700) }),
    );

    expect(deriveMemberCommissionCapacities(request).byMember.get('root')).toMatchObject({
      businessDayCount: 13,
      minimumRawLeftPv: 1_500,
      minimumRawRightPv: 1_500,
      requiredPvp: 0,
      aggregateMatchedPvUpperBound: 1_500,
      attainableEquivalentUnitsUpperBound: 5,
    });
  });

  it('does not let PVP above a 1,500 side target inflate the aggregate cap', () => {
    const request = createOptimizerRequest(
      [optimizerMember('root', null, null, 2_400, 1_500)],
      Object.freeze({ root: optimizerOpening() }),
    );

    expect(deriveMemberCommissionCapacities(request).byMember.get('root')).toMatchObject({
      minimumRawLeftPv: 1_500,
      minimumRawRightPv: 0,
      requiredPvp: 2_400,
      aggregateMatchedPvUpperBound: 1_500,
      attainableEquivalentUnitsUpperBound: 5,
    });
  });

  it('lets required PVP balance the smaller side without increasing the fixed target total', () => {
    const request = createOptimizerRequest(
      [optimizerMember('root', null, null, 1_500)],
      Object.freeze({ root: optimizerOpening() }),
    );

    expect(deriveMemberCommissionCapacities(request).byMember.get('root')).toMatchObject({
      minimumRawLeftPv: 2_500,
      minimumRawRightPv: 1_000,
      requiredPvp: 1_500,
      aggregateMatchedPvUpperBound: 2_500,
      attainableEquivalentUnitsUpperBound: 8,
    });
  });

  it('uses both child subtrees when deriving a high-target member cap', () => {
    const members = [
      optimizerMember('root', null, null, 2_400),
      optimizerMember('high', 'root', 'LEFT', 1_500),
      optimizerMember('left', 'high', 'LEFT', 700),
      optimizerMember('right', 'high', 'RIGHT', 700),
    ] as const;
    const request = createOptimizerRequest(
      members,
      Object.freeze({
        root: achievedOpening(2_400),
        high: achievedOpening(1_500),
        left: achievedOpening(700),
        right: achievedOpening(700),
      }),
    );

    expect(deriveMemberCommissionCapacities(request).byMember.get('high')).toMatchObject({
      minimumRawLeftPv: 5_000,
      minimumRawRightPv: 5_000,
      requiredPvp: 0,
      aggregateMatchedPvUpperBound: 5_000,
      attainableEquivalentUnitsUpperBound: 16,
    });
  });

  it('derives each member capacity from its own target in a mixed organization', () => {
    const members = [
      optimizerMember('root', null, null, 700, 2_500),
      optimizerMember('left', 'root', 'LEFT', 700, 1_500),
    ] as const;
    const request = createOptimizerRequest(
      members,
      Object.freeze({
        root: optimizerOpening(),
        left: optimizerOpening(),
      }),
    );
    const capacities = deriveMemberCommissionCapacities(request).byMember;

    expect(capacities.get('root')).toMatchObject({
      minimumRawLeftPv: 3_000,
      minimumRawRightPv: 1_800,
      requiredPvp: 700,
      aggregateMatchedPvUpperBound: 2_500,
      attainableEquivalentUnitsUpperBound: 8,
    });
    expect(capacities.get('left')).toMatchObject({
      minimumRawLeftPv: 1_500,
      minimumRawRightPv: 800,
      requiredPvp: 700,
      aggregateMatchedPvUpperBound: 1_500,
      attainableEquivalentUnitsUpperBound: 5,
    });
  });

  it('does not use sheet markers when deriving member caps', () => {
    const plainMembers = [
      optimizerMember('root', null, null, 2_400),
      optimizerMember('member', 'root', 'LEFT', 1_500),
    ] as const;
    const markedMembers: readonly MemberSnapshot[] = plainMembers.map((member, index) =>
      Object.freeze({
        ...member,
        sheetMarker: index === 0 ? 'PINK_1' : 'PURPLE_4',
      }),
    );
    const openings = Object.freeze({
      root: achievedOpening(2_400),
      member: achievedOpening(1_500),
    });

    const plain = deriveMemberCommissionCapacities(
      createOptimizerRequest(plainMembers, openings),
    ).byMember.get('member');
    const marked = deriveMemberCommissionCapacities(
      createOptimizerRequest(markedMembers, openings),
    ).byMember.get('member');

    expect(marked).toEqual(plain);
  });
});
