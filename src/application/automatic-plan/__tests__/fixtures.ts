import type { ProjectSetupBundle } from '../../project-setup';

export function createAutomaticPlanBundle(): ProjectSetupBundle {
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-auto',
      title: '2026년 7월 상반기 수당 계획',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'America/Sao_Paulo' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-auto',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-auto',
      members: Object.freeze([
        Object.freeze({
          memberKey: 'root',
          memberId: 'A-1',
          name: '루트 회원',
          pvpTarget: 700 as const,
          sheetMarker: 'NONE' as const,
          parentMemberKey: null,
          sideAtParent: null,
        }),
      ]),
      openingStateByMember: Object.freeze({
        root: Object.freeze({
          openingQualificationPvp: 0,
          fortnightPvpOpeningCredit: 0,
          dailyCarryPvp: 0,
          dailyCarryLeft: 0,
          dailyCarryRight: 0,
        }),
      }),
    }),
  });
}
