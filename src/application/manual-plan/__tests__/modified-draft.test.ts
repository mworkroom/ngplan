import { describe, expect, it } from 'vitest';
import type { ProjectSetupBundle } from '../../project-setup';
import {
  createManualPlanDraft,
  deriveManualPlanSchema,
  editManualPlanField,
  hasManualPlanActualDifference,
  isManualPlanDraftModified,
  toggleManualPlanActualDifference,
} from '../index';
import type { ManualPlanDraft } from '../types';

function createBundle(): ProjectSetupBundle {
  const opening = Object.freeze({
    openingQualificationPvp: 0,
    fortnightPvpOpeningCredit: 0,
    dailyCarryPvp: 0,
    dailyCarryLeft: 0,
    dailyCarryRight: 0,
  });
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '수정 판정 테스트',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'America/Sao_Paulo' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-1',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-1',
      members: Object.freeze([
        Object.freeze({
          memberKey: 'root',
          memberId: '',
          name: '루트',
          pvpTarget: 700,
          fortnightSideTarget: 2500,
          sheetMarker: 'PINK_1',
          parentMemberKey: null,
          sideAtParent: null,
        }),
        Object.freeze({
          memberKey: 'child',
          memberId: '',
          name: '자식',
          pvpTarget: 700,
          fortnightSideTarget: 2500,
          sheetMarker: 'BLUE_3',
          parentMemberKey: 'root',
          sideAtParent: 'LEFT' as const,
        }),
      ]),
      openingStateByMember: Object.freeze({ root: opening, child: opening }),
    }),
  });
}

describe('WP3 manual draft modified detection', () => {
  it('treats the complete blank/zero draft as unmodified and a repaired edit as blank again', () => {
    const bundle = createBundle();
    const schema = deriveManualPlanSchema(bundle);
    const initial = createManualPlanDraft(bundle);
    const weekday = schema.dates.find((date) => date.settlementMode === 'SETTLE')!;

    expect(isManualPlanDraftModified(schema, initial)).toBe(false);
    const edited = editManualPlanField(schema, initial, {
      date: weekday.date,
      memberKey: 'root',
      field: 'pvp',
      value: '1',
    });
    if (edited.status !== 'SUCCESS') throw new Error('expected editable PVP');
    expect(isManualPlanDraftModified(schema, edited.draft)).toBe(true);

    const repaired = editManualPlanField(schema, edited.draft, {
      date: weekday.date,
      memberKey: 'root',
      field: 'pvp',
      value: '',
    });
    if (repaired.status !== 'SUCCESS') throw new Error('expected repair');
    expect(isManualPlanDraftModified(schema, repaired.draft)).toBe(false);
  });

  it('treats malformed shape, connected fields, and changed Sunday locks as modified', () => {
    const bundle = createBundle();
    const schema = deriveManualPlanSchema(bundle);
    const initial = createManualPlanDraft(bundle);
    const weekdayIndex = initial.cells.findIndex((cell) => {
      const date = schema.dateByIso.get(cell.date);
      return cell.memberKey === 'root' && date?.settlementMode === 'SETTLE';
    });
    const sundayIndex = initial.cells.findIndex((cell) => {
      const date = schema.dateByIso.get(cell.date);
      return cell.memberKey === 'root' && date?.settlementMode === 'SKIP_NO_INPUT';
    });
    const weekdayCell = initial.cells[weekdayIndex]!;
    const sundayCell = initial.cells[sundayIndex]!;

    expect(
      isManualPlanDraftModified(schema, {
        cells: initial.cells.slice(1),
      }),
    ).toBe(true);
    const connectedFieldDraft: ManualPlanDraft = {
      cells: initial.cells.map((cell, index) =>
        index === weekdayIndex ? { ...weekdayCell, selfLeft: '' } : cell,
      ),
    };
    expect(isManualPlanDraftModified(schema, connectedFieldDraft)).toBe(true);
    const changedSundayDraft: ManualPlanDraft = {
      cells: initial.cells.map((cell, index) =>
        index === sundayIndex ? { ...sundayCell, pvp: '' } : cell,
      ),
    };
    expect(isManualPlanDraftModified(schema, changedSundayDraft)).toBe(true);
  });

  it('toggles one member-day difference marker and rejects input-free dates', () => {
    const bundle = createBundle();
    const schema = deriveManualPlanSchema(bundle);
    const initial = createManualPlanDraft(bundle);
    const weekday = schema.dates.find((date) => date.settlementMode === 'SETTLE')!;
    const sunday = schema.dates.find(
      (date) => date.settlementMode === 'SKIP_NO_INPUT',
    )!;

    const marked = toggleManualPlanActualDifference(
      schema,
      initial,
      weekday.date,
      'root',
    );
    expect(marked).not.toBe(initial);
    expect(marked.cells).toBe(initial.cells);
    expect(marked.actualDifferenceMarkers).toEqual([
      { date: weekday.date, memberKey: 'root' },
    ]);
    expect(hasManualPlanActualDifference(marked, weekday.date, 'root')).toBe(true);
    expect(isManualPlanDraftModified(schema, marked)).toBe(true);

    expect(
      toggleManualPlanActualDifference(schema, marked, sunday.date, 'root'),
    ).toBe(marked);
    expect(
      toggleManualPlanActualDifference(schema, marked, weekday.date, 'missing'),
    ).toBe(marked);

    const cleared = toggleManualPlanActualDifference(
      schema,
      marked,
      weekday.date,
      'root',
    );
    expect(cleared.actualDifferenceMarkers).toEqual([]);
    expect(isManualPlanDraftModified(schema, cleared)).toBe(false);
  });
});
