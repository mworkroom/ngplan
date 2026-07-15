import { describe, expect, it } from 'vitest';
import type { MemberSnapshot, OpeningStateInput } from '../../../engine';
import type { ProjectSetupBundle } from '../../project-setup';
import {
  deriveManualPlanAchievementTargets,
  deriveManualPlanSchema,
} from '../index';

const ZERO_OPENING: OpeningStateInput = Object.freeze({
  openingQualificationPvp: 0,
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
});

function member(
  memberKey: string,
  parentMemberKey: string | null,
  sideAtParent: 'LEFT' | 'RIGHT' | null,
  pvpTarget: 700 | 1500 | 2400 = 700,
): MemberSnapshot {
  return Object.freeze({
    memberKey,
    memberId: memberKey,
    name: memberKey,
    pvpTarget,
    sheetMarker: 'NONE',
    parentMemberKey,
    sideAtParent,
  });
}

function bundle(members: readonly MemberSnapshot[]): ProjectSetupBundle {
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '목표 계산 테스트',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'Asia/Seoul' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-1',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-1',
      members: Object.freeze([...members]),
      openingStateByMember: Object.freeze(
        Object.fromEntries(members.map((item) => [item.memberKey, ZERO_OPENING])),
      ),
    }),
  });
}

describe('manual-plan achievement targets', () => {
  it('recreates the Excel pyramid target formula through the whole subtree', () => {
    const members = [
      member('root', null, null, 2400),
      member('min-left', 'root', 'LEFT'),
      member('a', 'min-left', 'LEFT'),
      member('b', 'min-left', 'RIGHT'),
      member('a-left', 'a', 'LEFT'),
      member('a-right', 'a', 'RIGHT'),
      member('b-left', 'b', 'LEFT'),
      member('b-right', 'b', 'RIGHT'),
    ];
    const schema = deriveManualPlanSchema(bundle(members));
    const targets = deriveManualPlanAchievementTargets(schema);

    expect(targets.get('a-left')).toEqual({
      pvp: 700,
      selfLeft: 2500,
      selfRight: 1800,
    });
    expect(targets.get('a')).toEqual({
      pvp: 700,
      selfLeft: 5000,
      selfRight: 5000,
    });
    expect(targets.get('min-left')).toEqual({
      pvp: 700,
      selfLeft: 10700,
      selfRight: 10700,
    });
    expect(targets.get('root')).toEqual({
      pvp: 2400,
      selfLeft: 22100,
      selfRight: 100,
    });
  });
});
