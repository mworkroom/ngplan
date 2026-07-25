import { describe, expect, it } from 'vitest';
import type {
  MemberSnapshot,
  OpeningStateInput,
  OrganizationSnapshotInput,
} from '../../../engine';
import type { ProjectSetupBundle } from '../../project-setup';
import {
  calculateManualPlan,
  createManualPlanDraft,
  deriveManualPlanSchema,
  editManualPlanField,
} from '../index';

const MEMBER_COUNT = 31;
const DATE_COUNT = 16;
const DRAFT_CELL_COUNT = MEMBER_COUNT * DATE_COUNT;
const DIRECT_FIELD_SLOT_COUNT_PER_DATE = MEMBER_COUNT + 32;
const ENGINEERING_SMOKE_LIMIT_MS = 2_000;

const ZERO_OPENING: OpeningStateInput = Object.freeze({
  openingQualificationPvp: 0,
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
});

function createMember(index: number): MemberSnapshot {
  const parentIndex = index === 1 ? null : Math.floor(index / 2);
  return Object.freeze({
    memberKey: `member-${index}`,
    memberId: String(100_000 + index),
    name: `규모 검증 회원 ${index}`,
    pvpTarget: index % 5 === 0 ? 1500 : 700,
    sheetMarker: 'NONE',
    parentMemberKey: parentIndex === null ? null : `member-${parentIndex}`,
    sideAtParent: parentIndex === null ? null : index % 2 === 0 ? 'LEFT' : 'RIGHT',
  });
}

function createOpeningStateRecord(
  members: readonly MemberSnapshot[],
): OrganizationSnapshotInput['openingStateByMember'] {
  const openings = Object.create(null) as Record<string, OpeningStateInput>;
  for (const member of members) {
    Object.defineProperty(openings, member.memberKey, {
      value: ZERO_OPENING,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(openings);
}

function createScaleBundle(): ProjectSetupBundle {
  const treeMembers = Array.from(
    { length: MEMBER_COUNT },
    (_, index) => createMember(index + 1),
  );
  const organization: OrganizationSnapshotInput = Object.freeze({
    snapshotId: 'scale-smoke-snapshot',
    // Worksheet order must come from topology rather than this intentionally reversed array.
    members: Object.freeze([...treeMembers].reverse()),
    openingStateByMember: createOpeningStateRecord(treeMembers),
  });

  return Object.freeze({
    project: Object.freeze({
      projectId: 'scale-smoke-project',
      title: '2026년 7월 하반기 규모 검증',
      period: Object.freeze({
        year: 2026,
        month: 7,
        half: 'SECOND_HALF' as const,
      }),
      timezone: 'America/Sao_Paulo' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: organization.snapshotId,
    }),
    organization,
  });
}

describe('WP7 manual-plan engineering scale smoke', () => {
  it(
    'creates and calculates a 31-member by 16-date second-half worksheet',
    () => {
      const startedAt = performance.now();
      const bundle = createScaleBundle();
      const schema = deriveManualPlanSchema(bundle);
      let draft = createManualPlanDraft(bundle);

      expect(schema.period.startDate).toBe('2026-07-16');
      expect(schema.period.endDate).toBe('2026-07-31');
      expect(schema.dates).toHaveLength(DATE_COUNT);
      expect(schema.members).toHaveLength(MEMBER_COUNT);
      expect(schema.members[0]?.memberKey).toBe('member-16');
      expect(schema.members[15]?.memberKey).toBe('member-1');
      expect(schema.members[16]?.memberKey).toBe('member-24');
      expect(draft.cells).toHaveLength(DRAFT_CELL_COUNT);

      const directFieldSlotCount = draft.cells.reduce(
        (count, cell) =>
          count +
          1 +
          Number(Object.hasOwn(cell, 'selfLeft')) +
          Number(Object.hasOwn(cell, 'selfRight')),
        0,
      );
      expect(directFieldSlotCount).toBe(
        DIRECT_FIELD_SLOT_COUNT_PER_DATE * DATE_COUNT,
      );

      const settlementDate = schema.dates.find(
        (date) => date.settlementMode === 'SETTLE',
      )!.date;
      for (const [field, value] of [
        ['pvp', '1'],
        ['selfLeft', '2'],
        ['selfRight', '3'],
      ] as const) {
        const edit = editManualPlanField(schema, draft, {
          date: settlementDate,
          memberKey: 'member-31',
          field,
          value,
        });
        expect(edit.status).toBe('SUCCESS');
        if (edit.status !== 'SUCCESS') {
          throw new Error(`${edit.code}: ${edit.message}`);
        }
        draft = edit.draft;
      }

      const calculation = calculateManualPlan(bundle, draft, schema);
      expect(calculation.status).toBe('CURRENT');
      if (calculation.status !== 'CURRENT') {
        throw new Error('31명 규모 계획이 현재 계산 결과를 만들지 못했습니다.');
      }

      expect(calculation.input.allocations).toHaveLength(DRAFT_CELL_COUNT);
      expect(calculation.result.period.dates).toHaveLength(DATE_COUNT);
      expect(Object.keys(calculation.result.finalAssessmentByMember)).toHaveLength(
        MEMBER_COUNT,
      );
      expect(
        Object.values(calculation.result.rawPerformanceByDateAndMember).reduce(
          (count, byMember) => count + Object.keys(byMember).length,
          0,
        ),
      ).toBe(DRAFT_CELL_COUNT);
      expect(
        Object.values(calculation.result.dailySettlementByDateAndMember).reduce(
          (count, byMember) => count + Object.keys(byMember).length,
          0,
        ),
      ).toBe(DRAFT_CELL_COUNT);

      expect(
        calculation.result.rawPerformanceByDateAndMember[settlementDate]?.[
          'member-31'
        ],
      ).toMatchObject({
        directPvp: 1,
        organizationLeft: 2,
        organizationRight: 3,
        subtreeTotal: 6,
      });
      expect(
        calculation.result.rawPerformanceByDateAndMember[settlementDate]?.[
          'member-1'
        ],
      ).toMatchObject({
        organizationRight: 6,
        subtreeTotal: 6,
      });

      const elapsedMs = performance.now() - startedAt;
      expect(
        elapsedMs,
        `31명×16일 생성·계산이 ${elapsedMs.toFixed(1)}ms 걸렸습니다.`,
      ).toBeLessThan(ENGINEERING_SMOKE_LIMIT_MS);
    },
    10_000,
  );
});
