import { describe, expect, it } from 'vitest';
import type {
  MemberSnapshot,
  OpeningStateInput,
  OrganizationSnapshotInput,
} from '../../../engine';
import type { ProjectSetupBundle } from '../../project-setup';
import {
  createManualPlanDraft,
  deriveManualPlanSchema,
  editManualPlanField,
  isManualPlanDraftModified,
  manualPlanCellDomId,
  manualPlanCellKey,
  manualPlanFieldDomId,
  manualPlanMemberGroupDomId,
  reconcileManualPlanDraft,
} from '../index';

const ZERO_OPENING: OpeningStateInput = Object.freeze({
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
});

function safeOpeningRecord(
  members: readonly MemberSnapshot[],
): OrganizationSnapshotInput['openingStateByMember'] {
  const record = Object.create(null) as Record<string, OpeningStateInput>;
  for (const member of members) {
    Object.defineProperty(record, member.memberKey, {
      value: ZERO_OPENING,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return record;
}

function member(
  memberKey: string,
  parentMemberKey: string | null,
  sideAtParent: 'LEFT' | 'RIGHT' | null,
  overrides: Partial<
    Pick<MemberSnapshot, 'memberId' | 'name' | 'pvpTarget' | 'sheetMarker'>
  > = {},
): MemberSnapshot {
  return Object.freeze({
    memberKey,
    memberId: overrides.memberId ?? '',
    name: overrides.name ?? memberKey,
    pvpTarget: overrides.pvpTarget ?? 700,
    sheetMarker: overrides.sheetMarker ?? 'NONE',
    parentMemberKey,
    sideAtParent,
  });
}

function bundle(
  members: readonly MemberSnapshot[],
  half: 'FIRST_HALF' | 'SECOND_HALF' = 'FIRST_HALF',
  month = 7,
): ProjectSetupBundle {
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '테스트 계획',
      period: Object.freeze({ year: 2026, month, half }),
      timezone: 'Asia/Seoul' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'snapshot-1',
    }),
    organization: Object.freeze({
      snapshotId: 'snapshot-1',
      members: Object.freeze([...members]),
      openingStateByMember: safeOpeningRecord(members),
    }),
  });
}

function treeBundle(half: 'FIRST_HALF' | 'SECOND_HALF' = 'FIRST_HALF') {
  const members = [
    member('C', 'A', 'RIGHT'),
    member('D', 'B', 'LEFT'),
    member('A', null, null),
    member('B', 'A', 'LEFT'),
  ];
  return bundle(members, half);
}

describe('WP1 manual-plan draft and worksheet schema', () => {
  it('keeps matching manual entries when a setup bundle is reopened', () => {
    const originalBundle = bundle([
      member('root', null, null),
      member('left', 'root', 'LEFT'),
    ]);
    const draft = createManualPlanDraft(originalBundle);
    const schema = deriveManualPlanSchema(originalBundle);
    const edited = editManualPlanField(schema, draft, {
      date: schema.dates[0]!.date,
      memberKey: 'left',
      field: 'pvp',
      value: '321',
    });
    if (edited.status !== 'SUCCESS') throw new Error('manual edit failed');

    const reopened = reconcileManualPlanDraft(originalBundle, edited.draft);
    const firstLeftCell = reopened.cells.find(
      (cell) => cell.date === schema.dates[0]!.date && cell.memberKey === 'left',
    );
    expect(firstLeftCell?.pvp).toBe('321');
  });

  it('P3-DRAFT-001: first half centers the root between its left and right organizations', () => {
    const setup = treeBundle();
    const schema = deriveManualPlanSchema(setup);
    const draft = createManualPlanDraft(setup);

    expect(schema.dates).toHaveLength(15);
    expect(schema.members.map((item) => item.memberKey)).toEqual(['D', 'B', 'A', 'C']);
    expect(draft.cells).toHaveLength(15 * 4);
    expect(new Set(draft.cells.map((cell) => manualPlanCellKey(cell.date, cell.memberKey))).size)
      .toBe(15 * 4);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.cells)).toBe(true);
    expect(setup.organization.members.map((item) => item.memberKey)).toEqual([
      'C',
      'D',
      'A',
      'B',
    ]);
  });

  it('P3-DRAFT-002: a 31-day second half creates sixteen rows', () => {
    const setup = treeBundle('SECOND_HALF');
    const schema = deriveManualPlanSchema(setup);
    const draft = createManualPlanDraft(setup);

    expect(schema.dates).toHaveLength(16);
    expect(schema.period.startDate).toBe('2026-07-16');
    expect(schema.period.endDate).toBe('2026-07-31');
    expect(draft.cells).toHaveLength(16 * 4);
  });

  it('places every member between its own left and right organizations', () => {
    const setup = bundle([
      member('root', null, null),
      member('branch', 'root', 'LEFT'),
      member('branch-left', 'branch', 'LEFT'),
      member('branch-right', 'branch', 'RIGHT'),
      member('root-right', 'root', 'RIGHT'),
    ]);

    expect(deriveManualPlanSchema(setup).members.map((item) => item.memberKey)).toEqual([
      'branch-left',
      'branch',
      'branch-right',
      'root',
      'root-right',
    ]);
  });

  it('P3-DRAFT-003: SELF fields exist while connected fields are absent', () => {
    const setup = treeBundle();
    const schema = deriveManualPlanSchema(setup);
    const draft = createManualPlanDraft(setup);
    const weekday = schema.dates.find((date) => date.settlementMode === 'SETTLE')!;
    const cells = new Map(
      draft.cells
        .filter((cell) => cell.date === weekday.date)
        .map((cell) => [cell.memberKey, cell] as const),
    );

    expect(schema.memberByKey.get('A')).toMatchObject({
      leftMode: 'CHILD',
      rightMode: 'CHILD',
    });
    expect(cells.get('A')).toEqual({ date: weekday.date, memberKey: 'A', pvp: '' });
    expect(cells.get('B')).toEqual({
      date: weekday.date,
      memberKey: 'B',
      pvp: '',
      selfRight: '',
    });
    expect(cells.get('D')).toEqual({
      date: weekday.date,
      memberKey: 'D',
      pvp: '',
      selfLeft: '',
      selfRight: '',
    });
  });

  it('P3-DRAFT-004: editing is pure and rejects connected, Sunday, and unknown cells', () => {
    const setup = treeBundle();
    const schema = deriveManualPlanSchema(setup);
    const original = createManualPlanDraft(setup);
    const weekday = schema.dates.find((date) => date.settlementMode === 'SETTLE')!;
    const sunday = schema.dates.find((date) => date.settlementMode === 'SKIP_NO_INPUT')!;

    const edited = editManualPlanField(schema, original, {
      date: weekday.date,
      memberKey: 'D',
      field: 'selfLeft',
      value: '1',
    });
    expect(edited.status).toBe('SUCCESS');
    if (edited.status !== 'SUCCESS') throw new Error('expected success');
    expect(edited.draft).not.toBe(original);
    expect(original.cells.find((cell) => cell.date === weekday.date && cell.memberKey === 'D')?.selfLeft)
      .toBe('');
    expect(edited.draft.cells.find((cell) => cell.date === weekday.date && cell.memberKey === 'D')?.selfLeft)
      .toBe('1');

    const same = editManualPlanField(schema, edited.draft, {
      date: weekday.date,
      memberKey: 'D',
      field: 'selfLeft',
      value: '1',
    });
    expect(same.status).toBe('SUCCESS');
    expect(same.draft).toBe(edited.draft);

    expect(
      editManualPlanField(schema, original, {
        date: weekday.date,
        memberKey: 'A',
        field: 'selfLeft',
        value: '1',
      }),
    ).toMatchObject({ status: 'REJECTED', draft: original, code: 'FIELD_NOT_EDITABLE' });
    expect(
      editManualPlanField(schema, original, {
        date: sunday.date,
        memberKey: 'D',
        field: 'pvp',
        value: '1',
      }),
    ).toMatchObject({ status: 'REJECTED', draft: original, code: 'SKIPPED_DATE_LOCKED' });
    expect(
      editManualPlanField(schema, original, {
        date: '2099-01-01',
        memberKey: 'missing',
        field: 'pvp',
        value: '1',
      }),
    ).toMatchObject({ status: 'REJECTED', draft: original, code: 'CELL_NOT_FOUND' });
  });

  it('P3-DRAFT-005: optional IDs and duplicate visible identities get plain unique labels', () => {
    const setup = bundle([
      member('root', null, null, { name: '민지', memberId: '' }),
      member('left', 'root', 'LEFT', { name: '민지', memberId: '' }),
      member('right', 'root', 'RIGHT', { name: '민지', memberId: '1234' }),
    ]);
    const labels = deriveManualPlanSchema(setup).members.map((item) => item.displayLabel);

    expect(labels).toEqual([
      '민지 · 동명이인 1',
      '민지 · 동명이인 2',
      '민지 · 회원 ID 1234',
    ]);
    expect(labels.join(' ')).not.toContain('root');
  });

  it('keeps the canonical member ID as an opaque display value without revalidation', () => {
    const setup = bundle([
      member('root', null, null, { name: '민지', memberId: ' 007-A ' }),
    ]);

    expect(deriveManualPlanSchema(setup).members[0]).toMatchObject({
      memberId: ' 007-A ',
      displayLabel: '민지 · 회원 ID  007-A ',
    });
  });

  it('shows the optional purple number 4 marker without changing member identity', () => {
    const setup = bundle([
      member('root', null, null, { name: '민지', sheetMarker: 'PURPLE_4' }),
    ]);

    expect(deriveManualPlanSchema(setup).members[0]).toMatchObject({
      name: '민지',
      displayLabel: '4. 민지',
      sheetMarker: 'PURPLE_4',
    });
  });

  it('P3-DRAFT-006: special keys use safe Map lookup and collision-free DOM tuples', () => {
    const setup = bundle([
      member('__proto__', null, null, { name: '루트' }),
      member('A/B', '__proto__', 'LEFT', { name: '왼쪽' }),
      member('A_B', '__proto__', 'RIGHT', { name: '오른쪽' }),
    ]);
    const schema = deriveManualPlanSchema(setup);

    expect(schema.memberByKey.get('__proto__')?.name).toBe('루트');
    expect(manualPlanCellDomId('2026-07-01', 'A/B')).not.toBe(
      manualPlanCellDomId('2026-07-01', 'A_B'),
    );
    expect(manualPlanFieldDomId('2026-07-01', 'A/B', 'pvp')).not.toBe(
      manualPlanFieldDomId('2026-07-01', 'A_B', 'pvp'),
    );
    expect(manualPlanMemberGroupDomId('A/B')).not.toBe(manualPlanMemberGroupDomId('A_B'));
  });

  it('P3-SUN-001/002: Sunday rows are visible deterministic zero and locked', () => {
    const setup = treeBundle();
    const schema = deriveManualPlanSchema(setup);
    const draft = createManualPlanDraft(setup);
    const sunday = schema.dates.find((date) => date.settlementMode === 'SKIP_NO_INPUT')!;
    const sundayCells = draft.cells.filter((cell) => cell.date === sunday.date);

    expect(sunday.displayLabel).toContain('(일)');
    expect(sundayCells).toHaveLength(schema.members.length);
    for (const cell of sundayCells) {
      expect(cell.pvp).toBe('0');
      if (Object.hasOwn(cell, 'selfLeft')) expect(cell.selfLeft).toBe('0');
      if (Object.hasOwn(cell, 'selfRight')) expect(cell.selfRight).toBe('0');
    }
  });

  it('detects only exact deviations from the initial blank/locked draft shape', () => {
    const setup = treeBundle();
    const schema = deriveManualPlanSchema(setup);
    const initial = createManualPlanDraft(setup);
    expect(isManualPlanDraftModified(schema, initial)).toBe(false);

    const weekdayIndex = initial.cells.findIndex(
      (cell) =>
        cell.memberKey === 'D' &&
        schema.dateByIso.get(cell.date)?.settlementMode === 'SETTLE',
    );
    const weekday = initial.cells[weekdayIndex]!;
    const withCell = (replacement: typeof weekday, index = weekdayIndex) => {
      const cells = [...initial.cells];
      cells[index] = replacement;
      return { cells };
    };
    expect(
      isManualPlanDraftModified(schema, withCell({ ...weekday, pvp: '0' })),
    ).toBe(true);
    expect(
      isManualPlanDraftModified(
        schema,
        withCell({ ...weekday, selfLeft: undefined } as unknown as typeof weekday),
      ),
    ).toBe(true);
    expect(
      isManualPlanDraftModified(schema, withCell({ ...weekday, selfLeft: '1' })),
    ).toBe(true);
    expect(
      isManualPlanDraftModified(
        schema,
        withCell({ ...weekday, selfRight: undefined } as unknown as typeof weekday),
      ),
    ).toBe(true);
    expect(
      isManualPlanDraftModified(schema, withCell({ ...weekday, selfRight: '1' })),
    ).toBe(true);

    const rootIndex = initial.cells.findIndex(
      (cell) =>
        cell.memberKey === 'A' &&
        schema.dateByIso.get(cell.date)?.settlementMode === 'SETTLE',
    );
    const root = initial.cells[rootIndex]!;
    expect(
      isManualPlanDraftModified(schema, withCell({ ...root, selfLeft: '' }, rootIndex)),
    ).toBe(true);
    expect(
      isManualPlanDraftModified(schema, withCell({ ...root, selfRight: '' }, rootIndex)),
    ).toBe(true);

    expect(isManualPlanDraftModified(schema, { cells: initial.cells.slice(1) })).toBe(true);
    const swapped = [...initial.cells];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(isManualPlanDraftModified(schema, { cells: swapped })).toBe(true);
  });

  it('fails explicitly when the setup handoff is not a complete single tree', () => {
    expect(() => deriveManualPlanSchema(bundle([]))).toThrow(/맨 위 회원/);
    expect(() =>
      deriveManualPlanSchema(bundle([member('A', null, null), member('B', null, null)])),
    ).toThrow(/맨 위 회원/);

    const members = [member('A', null, null), member('B', 'A', 'LEFT')];
    const broken = bundle(members);
    const openings = Object.create(null) as Record<string, OpeningStateInput>;
    Object.defineProperty(openings, 'A', { value: ZERO_OPENING, enumerable: true });
    const missingOpening: ProjectSetupBundle = {
      ...broken,
      organization: { ...broken.organization, openingStateByMember: openings },
    };
    expect(() => deriveManualPlanSchema(missingOpening)).toThrow(/시작값/);

    const disconnectedMembers = [
      member('A', null, null),
      member('B', 'B', 'LEFT'),
    ];
    expect(() => deriveManualPlanSchema(bundle(disconnectedMembers))).toThrow(/모든 회원/);

    const undefinedOpenings = Object.create(null) as Record<
      string,
      OpeningStateInput | undefined
    >;
    Object.defineProperty(undefinedOpenings, 'A', {
      value: ZERO_OPENING,
      enumerable: true,
    });
    Object.defineProperty(undefinedOpenings, 'B', {
      value: undefined,
      enumerable: true,
    });
    const undefinedOpening: ProjectSetupBundle = {
      ...broken,
      organization: {
        ...broken.organization,
        openingStateByMember: undefinedOpenings as OrganizationSnapshotInput['openingStateByMember'],
      },
    };
    expect(() => deriveManualPlanSchema(undefinedOpening)).toThrow(/시작값/);
  });
});
