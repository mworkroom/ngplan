import { describe, expect, it, vi } from 'vitest';
import * as engine from '../../../engine';
import type {
  MemberSnapshot,
  OpeningStateInput,
  OrganizationSnapshotInput,
  PvpTarget,
  ValidationIssue,
} from '../../../engine';
import type {
  ProjectSetupBundle,
  ProjectSetupIssue,
} from '../../project-setup';
import {
  calculateManualPlan,
  createManualPlanDraft,
  deriveManualPlanSchema,
  editManualPlanField,
  manualPlanCellDomId,
  manualPlanFieldDomId,
  manualPlanIssueTargetId,
  manualPlanMemberGroupDomId,
  mapEngineIssueToManualPlanIssue,
  mapProjectSetupIssueToManualPlanIssue,
  normalizeManualPlanDraft,
  parseManualPlanPv,
  type ManualPlanDraft,
  type ManualPlanField,
  type ManualPlanIssue,
  type ManualPlanSchema,
} from '../index';

const DEFAULT_OPENING: OpeningStateInput = Object.freeze({
  openingQualificationPvp: 300,
  fortnightPvpOpeningCredit: 300,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
});

function member(
  memberKey: string,
  parentMemberKey: string | null,
  sideAtParent: 'LEFT' | 'RIGHT' | null,
  pvpTarget: PvpTarget = 700,
): MemberSnapshot {
  return Object.freeze({
    memberKey,
    memberId: '',
    name: memberKey,
    pvpTarget,
    fortnightSideTarget: 2500,
    sheetMarker: 'NONE',
    parentMemberKey,
    sideAtParent,
  });
}

function setupBundle(
  members: readonly MemberSnapshot[] = [
    member('A', null, null),
    member('B', 'A', 'LEFT'),
  ],
  openingOverrides: Readonly<Record<string, Partial<OpeningStateInput>>> = {},
): ProjectSetupBundle {
  const openings = Object.create(null) as Record<string, OpeningStateInput>;
  for (const item of members) {
    Object.defineProperty(openings, item.memberKey, {
      value: Object.freeze({
        ...DEFAULT_OPENING,
        ...(Object.hasOwn(openingOverrides, item.memberKey)
          ? openingOverrides[item.memberKey]
          : {}),
      }),
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  const organization: OrganizationSnapshotInput = Object.freeze({
    snapshotId: 'snapshot-1',
    members: Object.freeze([...members]),
    openingStateByMember: openings,
  });
  return Object.freeze({
    project: Object.freeze({
      projectId: 'project-1',
      title: '2026년 7월 상반기 수당 계획',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'America/Sao_Paulo' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: organization.snapshotId,
    }),
    organization,
  });
}

function edit(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
  field: ManualPlanField,
  value: string,
): ManualPlanDraft {
  const outcome = editManualPlanField(schema, draft, {
    date,
    memberKey,
    field,
    value,
  });
  if (outcome.status !== 'SUCCESS') {
    throw new Error(`${outcome.code}: ${outcome.message}`);
  }
  return outcome.draft;
}

describe('WP2 strict PV parsing and canonical normalization', () => {
  it.each([
    ['', 0],
    ['0', 0],
    ['1', 1],
    ['0001', 1],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('P3-PV-001/002 accepts %j as %d', (text, expected) => {
    expect(parseManualPlanPv(text)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['-0', 'PV_NEGATIVE'],
    ['-1', 'PV_NEGATIVE'],
    ['1.5', 'PV_NOT_INTEGER'],
    ['1e3', 'PV_INVALID'],
    ['+1', 'PV_INVALID'],
    [' 1', 'PV_INVALID'],
    ['1 ', 'PV_INVALID'],
    [' ', 'PV_INVALID'],
    ['text', 'PV_INVALID'],
    ['NaN', 'PV_INVALID'],
    ['Infinity', 'PV_INVALID'],
    ['9007199254740992', 'PV_OUT_OF_RANGE'],
    ['9'.repeat(400), 'PV_OUT_OF_RANGE'],
  ])('P3-PV-003 rejects %j at the draft boundary', (text, code) => {
    expect(parseManualPlanPv(text)).toEqual({ ok: false, code });
  });

  it('P3-NORM-001/002/003 builds a complete matrix and reuses frozen setup references', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const draft = createManualPlanDraft(bundle);
    const outcome = normalizeManualPlanDraft(bundle, draft, schema);

    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status !== 'SUCCESS') throw new Error('expected success');
    expect(outcome.input.period).toBe(bundle.project.period);
    expect(outcome.input.organization).toBe(bundle.organization);
    expect(outcome.input.allocations).toHaveLength(schema.dates.length * schema.members.length);
    const weekday = schema.dates.find((date) => date.settlementMode === 'SETTLE')!;
    const root = outcome.input.allocations.find(
      (cell) => cell.date === weekday.date && cell.memberKey === 'A',
    )!;
    const child = outcome.input.allocations.find(
      (cell) => cell.date === weekday.date && cell.memberKey === 'B',
    )!;
    expect(root).toEqual({ date: weekday.date, memberKey: 'A', pvp: 0, selfRight: 0 });
    expect(Object.hasOwn(root, 'selfLeft')).toBe(false);
    expect(child).toEqual({
      date: weekday.date,
      memberKey: 'B',
      pvp: 0,
      selfLeft: 0,
      selfRight: 0,
    });
  });

  it('P3-NORM-004 localizes one invalid field and returns no partial input', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    const invalid = edit(schema, createManualPlanDraft(bundle), date, 'B', 'selfRight', '1e3');
    const outcome = normalizeManualPlanDraft(bundle, invalid, schema);

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status !== 'FAILURE') throw new Error('expected failure');
    expect('input' in outcome).toBe(false);
    expect(outcome.issues).toEqual([
      expect.objectContaining({
        code: 'PV_INVALID',
        location: { date, memberKey: 'B', side: 'RIGHT', field: 'selfRight' },
      }),
    ]);
  });

  it('rejects missing, duplicate, unknown, and connected-side draft structure', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const draft = createManualPlanDraft(bundle);
    const first = draft.cells[0]!;
    const rootCellIndex = draft.cells.findIndex((cell) => cell.memberKey === 'A');
    const rootCell = draft.cells[rootCellIndex]!;
    const malformedRoot = { ...rootCell, selfLeft: '0' };
    const cells = [...draft.cells.slice(1), first, first, first, {
      date: '2099-01-01',
      memberKey: 'missing',
      pvp: '',
      selfLeft: '',
      selfRight: '',
    }];
    const replaceAt = cells.findIndex(
      (cell) => cell.date === rootCell.date && cell.memberKey === rootCell.memberKey,
    );
    cells[replaceAt] = malformedRoot;
    const outcome = normalizeManualPlanDraft(bundle, { cells }, schema);

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status !== 'FAILURE') throw new Error('expected failure');
    expect(outcome.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'ALLOCATION_CELL_DUPLICATE',
        'DATE_OUTSIDE_PERIOD',
        'CONNECTED_SIDE_ALLOCATION',
      ]),
    );

    const missing = normalizeManualPlanDraft(bundle, { cells: draft.cells.slice(1) }, schema);
    expect(missing.status).toBe('FAILURE');
    if (missing.status !== 'FAILURE') throw new Error('expected failure');
    expect(missing.issues.some((item) => item.code === 'ALLOCATION_CELL_MISSING')).toBe(true);

    const knownDate = schema.dates[0]!.date;
    const unknownMember = normalizeManualPlanDraft(
      bundle,
      {
        cells: [
          ...draft.cells,
          { date: knownDate, memberKey: 'missing', pvp: '' },
        ],
      },
      schema,
    );
    expect(unknownMember.status).toBe('FAILURE');
    if (unknownMember.status !== 'FAILURE') throw new Error('expected failure');
    expect(unknownMember.issues).toContainEqual(
      expect.objectContaining({ code: 'ALLOCATION_MEMBER_NOT_FOUND' }),
    );

    const bothChildrenBundle = setupBundle([
      member('A', null, null),
      member('B', 'A', 'LEFT'),
      member('C', 'A', 'RIGHT'),
    ]);
    const bothSchema = deriveManualPlanSchema(bothChildrenBundle);
    const bothDraft = createManualPlanDraft(bothChildrenBundle);
    const rootIndex = bothDraft.cells.findIndex((cell) => cell.memberKey === 'A');
    const bothCells = [...bothDraft.cells];
    bothCells[rootIndex] = {
      ...bothCells[rootIndex]!,
      selfLeft: '0',
      selfRight: '0',
    };
    const bothConnected = normalizeManualPlanDraft(
      bothChildrenBundle,
      { cells: bothCells },
      bothSchema,
    );
    expect(bothConnected.status).toBe('FAILURE');
    if (bothConnected.status !== 'FAILURE') throw new Error('expected failure');
    expect(bothConnected.issues.filter((item) => item.code === 'CONNECTED_SIDE_ALLOCATION'))
      .toHaveLength(2);
  });

  it('rejects runtime-missing and non-string editable fields without coercion', () => {
    const bundle = setupBundle([member('A', null, null)]);
    const schema = deriveManualPlanSchema(bundle);
    const draft = createManualPlanDraft(bundle);
    const weekdayIndex = draft.cells.findIndex(
      (cell) => schema.dateByIso.get(cell.date)?.settlementMode === 'SETTLE',
    );
    const weekday = draft.cells[weekdayIndex]!;
    const corrupt = {
      ...weekday,
      pvp: 1 as unknown as string,
    };
    delete (corrupt as { selfLeft?: string }).selfLeft;
    const cells = [...draft.cells];
    cells[weekdayIndex] = corrupt;
    const outcome = normalizeManualPlanDraft(bundle, { cells }, schema);

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status !== 'FAILURE') throw new Error('expected failure');
    expect(outcome.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(['PV_INVALID', 'SELF_SIDE_ALLOCATION_MISSING']),
    );

    const { pvp: removedPvp, ...withoutPvp } = weekday;
    expect(removedPvp).toBe('');
    const pvpCells = [...draft.cells];
    pvpCells[weekdayIndex] = withoutPvp as typeof weekday;
    const missingPvp = normalizeManualPlanDraft(bundle, { cells: pvpCells }, schema);
    expect(missingPvp.status).toBe('FAILURE');
    if (missingPvp.status !== 'FAILURE') throw new Error('expected failure');
    expect(missingPvp.issues).toContainEqual(
      expect.objectContaining({ code: 'ALLOCATION_FIELD_MISSING' }),
    );
  });

  it('P3-SUN-001 keeps Sunday canonical zero and rejects a corrupted nonzero Sunday', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const draft = createManualPlanDraft(bundle);
    const sunday = schema.dates.find((date) => date.settlementMode === 'SKIP_NO_INPUT')!;
    const valid = normalizeManualPlanDraft(bundle, draft, schema);
    expect(valid.status).toBe('SUCCESS');
    if (valid.status !== 'SUCCESS') throw new Error('expected success');
    expect(valid.input.allocations.filter((cell) => cell.date === sunday.date)).toEqual(
      expect.arrayContaining([
        { date: sunday.date, memberKey: 'A', pvp: 0, selfRight: 0 },
        { date: sunday.date, memberKey: 'B', pvp: 0, selfLeft: 0, selfRight: 0 },
      ]),
    );

    const cells = draft.cells.map((cell) =>
      cell.date === sunday.date && cell.memberKey === 'B'
        ? { ...cell, selfLeft: '1' }
        : cell,
    );
    const invalid = normalizeManualPlanDraft(bundle, { cells }, schema);
    expect(invalid.status).toBe('FAILURE');
    if (invalid.status !== 'FAILURE') throw new Error('expected failure');
    expect(invalid.issues).toContainEqual(
      expect.objectContaining({
        code: 'NON_ZERO_INPUT_ON_SKIPPED_DATE',
        location: { date: sunday.date, memberKey: 'B', side: 'LEFT', field: 'selfLeft' },
      }),
    );
  });
});

describe('WP2 whole-period calculation orchestration', () => {
  it('P3-CALC-000 opens an initial blank workspace with a current calculation', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const warning: ManualPlanIssue = {
      code: 'MEMBER_NAME_DUPLICATE',
      severity: 'WARNING',
      location: { memberKey: 'A', field: 'name' },
      message: '동명이인 확인',
    };
    const state = calculateManualPlan(
      bundle,
      createManualPlanDraft(bundle),
      schema,
      [warning],
    );

    expect(state.status).toBe('CURRENT');
    if (state.status !== 'CURRENT') throw new Error('expected current');
    expect(state.input.allocations).toHaveLength(schema.dates.length * schema.members.length);
    expect(state.result.inputSnapshot.allocations).toHaveLength(state.input.allocations.length);
    expect(state.warnings).toContain(warning);
  });

  it('P4-QUAL-002 allows a same-day crossing to qualification 300', () => {
    const bundle = setupBundle(
      [member('A', null, null)],
      {
        A: {
          openingQualificationPvp: 33,
          fortnightPvpOpeningCredit: 33,
        },
      },
    );
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    let draft = createManualPlanDraft(bundle);
    draft = edit(schema, draft, date, 'A', 'pvp', '267');
    draft = edit(schema, draft, date, 'A', 'selfLeft', '300');
    draft = edit(schema, draft, date, 'A', 'selfRight', '300');

    const state = calculateManualPlan(bundle, draft, schema);

    expect(state.status).toBe('CURRENT');
    if (state.status !== 'CURRENT') throw new Error('expected current');
    expect(state.result.dailySettlementByDateAndMember[date]?.A).toMatchObject({
      qualificationPvp: 300,
      qualificationThresholdMet: true,
      settlementKind: 'FULL_COMMISSION',
      commissionTier: 300,
      commissionOccurred: true,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(state.result.finalAssessmentByMember.A).toMatchObject({
      openingQualificationPvp: 33,
      closingQualificationPvp: 300,
      qualificationThresholdMet: true,
      commissionDays: 1,
      belowQualificationSettlementDays: 0,
    });
  });

  it('P4-QUAL-005 preserves a below-qualification reset trace but blocks CURRENT use', () => {
    const bundle = setupBundle(
      [member('A', null, null)],
      {
        A: {
          openingQualificationPvp: 33,
          fortnightPvpOpeningCredit: 33,
        },
      },
    );
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    let draft = createManualPlanDraft(bundle);
    draft = edit(schema, draft, date, 'A', 'pvp', '266');
    draft = edit(schema, draft, date, 'A', 'selfLeft', '300');
    draft = edit(schema, draft, date, 'A', 'selfRight', '300');

    const state = calculateManualPlan(bundle, draft, schema);

    expect(state.status).toBe('AUDIT_BLOCKED');
    if (state.status !== 'AUDIT_BLOCKED') throw new Error('expected audit blocked');
    expect(state.input.allocations).toHaveLength(schema.dates.length);
    expect(state.issues).toContainEqual(
      expect.objectContaining({
        code: 'BELOW_QUALIFICATION_SETTLEMENT',
        location: expect.objectContaining({ date, memberKey: 'A' }),
      }),
    );
    expect(state.result.dailySettlementByDateAndMember[date]?.A).toMatchObject({
      qualificationPvp: 299,
      qualificationThresholdMet: false,
      settlementKind: 'BELOW_QUALIFICATION_SETTLEMENT',
      commissionTier: 300,
      commissionOccurred: false,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(state.result.finalAssessmentByMember.A).toMatchObject({
      openingQualificationPvp: 33,
      closingQualificationPvp: 299,
      qualificationThresholdMet: false,
      commissionDays: 0,
      commissionOccurrences: [],
      belowQualificationSettlementDays: 1,
      belowQualificationSettlementOccurrences: [
        { date, tier: 300 },
      ],
    });
    expect(state.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'BELOW_QUALIFICATION_SETTLEMENT' }),
    );
  });

  it('P3-CALC-001 / ORG-001 recalculates one-level propagation exactly once', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    let draft = createManualPlanDraft(bundle);
    draft = edit(schema, draft, date, 'A', 'selfRight', '50');
    draft = edit(schema, draft, date, 'B', 'pvp', '100');
    draft = edit(schema, draft, date, 'B', 'selfLeft', '200');
    draft = edit(schema, draft, date, 'B', 'selfRight', '300');
    const state = calculateManualPlan(bundle, draft, schema);

    expect(state.status).toBe('CURRENT');
    if (state.status !== 'CURRENT') throw new Error('expected current');
    expect(state.result.rawPerformanceByDateAndMember[date]?.B).toMatchObject({
      directPvp: 100,
      organizationLeft: 200,
      organizationRight: 300,
      subtreeTotal: 600,
    });
    expect(state.result.rawPerformanceByDateAndMember[date]?.A).toMatchObject({
      directPvp: 0,
      organizationLeft: 600,
      organizationRight: 50,
      subtreeTotal: 650,
    });
  });

  it('ORG-002 reproduces the canonical three-level chain through the manual-plan path', () => {
    const bundle = setupBundle([
      member('A', null, null),
      member('B', 'A', 'LEFT'),
      member('C', 'B', 'LEFT'),
    ]);
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    let draft = createManualPlanDraft(bundle);
    for (const [memberKey, field, value] of [
      ['A', 'pvp', '25'],
      ['A', 'selfRight', '50'],
      ['B', 'pvp', '50'],
      ['B', 'selfRight', '100'],
      ['C', 'pvp', '100'],
      ['C', 'selfLeft', '200'],
      ['C', 'selfRight', '300'],
    ] as const) {
      draft = edit(schema, draft, date, memberKey, field, value);
    }
    const state = calculateManualPlan(bundle, draft, schema);

    expect(state.status).toBe('CURRENT');
    if (state.status !== 'CURRENT') throw new Error('expected current');
    expect(state.result.rawPerformanceByDateAndMember[date]?.C).toMatchObject({
      directPvp: 100,
      organizationLeft: 200,
      organizationRight: 300,
      subtreeTotal: 600,
    });
    expect(state.result.rawPerformanceByDateAndMember[date]?.B).toMatchObject({
      directPvp: 50,
      organizationLeft: 600,
      organizationRight: 100,
      subtreeTotal: 750,
    });
    expect(state.result.rawPerformanceByDateAndMember[date]?.A).toMatchObject({
      directPvp: 25,
      organizationLeft: 750,
      organizationRight: 50,
      subtreeTotal: 825,
    });
  });

  it('ORG-006 keeps descendant PVP out of the ancestor personal PVP target', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    const draft = edit(
      schema,
      createManualPlanDraft(bundle),
      date,
      'B',
      'pvp',
      '700',
    );
    const state = calculateManualPlan(bundle, draft, schema);

    expect(state.status).toBe('CURRENT');
    if (state.status !== 'CURRENT') throw new Error('expected current');
    expect(state.result.rawPerformanceByDateAndMember[date]?.B).toMatchObject({
      directPvp: 700,
      subtreeTotal: 700,
    });
    expect(state.result.rawPerformanceByDateAndMember[date]?.A?.organizationLeft).toBe(700);
    expect(state.result.finalAssessmentByMember.A?.newPvpTotal).toBe(0);
    expect(state.result.finalAssessmentByMember.A?.remainingPvp).toBe(400);
    expect(state.result.finalAssessmentByMember.B?.newPvpTotal).toBe(700);
  });

  it('P3-CALC-002/003 blocks invalid text with no stale result and repairs to fresh current', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    const initial = calculateManualPlan(bundle, createManualPlanDraft(bundle), schema);
    expect(initial.status).toBe('CURRENT');
    const invalidDraft = edit(
      schema,
      createManualPlanDraft(bundle),
      date,
      'B',
      'pvp',
      'bad',
    );
    const blocked = calculateManualPlan(bundle, invalidDraft, schema);
    expect(blocked.status).toBe('BLOCKED');
    expect('result' in blocked).toBe(false);

    const repaired = edit(schema, invalidDraft, date, 'B', 'pvp', '1');
    const current = calculateManualPlan(bundle, repaired, schema);
    expect(current.status).toBe('CURRENT');
    if (current.status !== 'CURRENT') throw new Error('expected current');
    expect(current.result.rawPerformanceByDateAndMember[date]?.B?.directPvp).toBe(1);
  });

  it('P3-CALC-004 keeps calculating with a warning when manual PVP exceeds the cumulative cap', () => {
    const bundle = setupBundle(
      [member('A', null, null)],
      {
        A: {
          openingQualificationPvp: 2_400,
          fortnightPvpOpeningCredit: 2_400,
        },
      },
    );
    const schema = deriveManualPlanSchema(bundle);
    const date = schema.dates.find((item) => item.settlementMode === 'SETTLE')!.date;
    let draft = createManualPlanDraft(bundle);
    draft = edit(schema, draft, date, 'A', 'pvp', '1');
    const state = calculateManualPlan(bundle, draft, schema);

    expect(state.status).toBe('CURRENT');
    if (state.status !== 'CURRENT') throw new Error('expected current');
    expect(state.result.rawPerformanceByDateAndMember[date]?.A?.directPvp).toBe(1);
    expect(state.result.finalAssessmentByMember.A).toMatchObject({
      newPvpTotal: 1,
      personalPvpTotal: 2_401,
    });
    expect(state.warnings).toContainEqual(
      expect.objectContaining({
        code: 'CUMULATIVE_PVP_ALLOCATION_EXCEEDS_CAP',
        severity: 'WARNING',
        location: expect.objectContaining({ memberKey: 'A', field: 'pvp' }),
        suggestion: expect.stringContaining('입력한 값으로 계속 계산합니다.'),
      }),
    );
  });

  it('P3-CALC-004 maps a thrown engine failure to one global blocking issue', () => {
    const bundle = setupBundle();
    const schema = deriveManualPlanSchema(bundle);
    const calculateSpy = vi
      .spyOn(engine, 'calculatePlanForManualEditing')
      .mockImplementationOnce(() => {
        throw new Error('simulated engine failure');
      });
    const state = calculateManualPlan(bundle, createManualPlanDraft(bundle), schema);
    calculateSpy.mockRestore();

    expect(state).toEqual({
      status: 'BLOCKED',
      issues: [
        {
          code: 'MANUAL_PLAN_CALCULATION_FAILED',
          severity: 'ERROR',
          location: {},
          message: '현재 계획을 계산하지 못했습니다.',
          suggestion: '입력값을 확인한 뒤 다시 시도해 주세요.',
        },
      ],
    });
    expect('result' in state).toBe(false);
    expect('input' in state).toBe(false);
  });

  it('P3-SUN-003 / CAL-004 carries Saturday through skipped Sunday into Monday', () => {
    const bundle = setupBundle([member('A', null, null)]);
    const schema = deriveManualPlanSchema(bundle);
    let draft = createManualPlanDraft(bundle);
    draft = edit(schema, draft, '2026-07-11', 'A', 'pvp', '100');
    draft = edit(schema, draft, '2026-07-11', 'A', 'selfLeft', '200');
    draft = edit(schema, draft, '2026-07-11', 'A', 'selfRight', '100');
    draft = edit(schema, draft, '2026-07-13', 'A', 'selfRight', '200');
    const state = calculateManualPlan(bundle, draft, schema);

    expect(state.status).toBe('CURRENT');
    if (state.status !== 'CURRENT') throw new Error('expected current');
    const sunday = state.result.dailySettlementByDateAndMember['2026-07-12']?.A;
    const monday = state.result.dailySettlementByDateAndMember['2026-07-13']?.A;
    expect(sunday).toMatchObject({
      settlementStatus: 'SKIPPED',
      carryIn: { pvp: 100, left: 200, right: 100 },
      carryOut: { pvp: 100, left: 200, right: 100 },
    });
    expect(monday).toMatchObject({
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
  });
});

describe('WP2 issue mapping and stable focus anchors', () => {
  it('maps engine fields to sides and the most specific stable target', () => {
    const engineIssue: ValidationIssue = {
      code: 'NON_ZERO_INPUT_ON_SKIPPED_DATE',
      severity: 'ERROR',
      location: {
        date: '2026-07-12',
        memberKey: 'A/B',
        field: 'selfRight',
      },
      message: '일요일 오류',
      suggestion: '0으로 변경',
    };
    const mapped = mapEngineIssueToManualPlanIssue(engineIssue);
    expect(mapped.location.side).toBe('RIGHT');
    expect(mapped.suggestion).toBe('0으로 변경');
    expect(manualPlanIssueTargetId(mapped)).toBe(
      manualPlanFieldDomId('2026-07-12', 'A/B', 'selfRight'),
    );

    expect(
      manualPlanIssueTargetId({
        ...mapped,
        location: { date: '2026-07-12', memberKey: 'A/B', field: 'pvp' },
      }),
    ).toBe(manualPlanFieldDomId('2026-07-12', 'A/B', 'pvp'));
    expect(
      manualPlanIssueTargetId({
        ...mapped,
        location: { date: '2026-07-12', memberKey: 'A/B', field: 'selfLeft' },
      }),
    ).toBe(manualPlanFieldDomId('2026-07-12', 'A/B', 'selfLeft'));

    expect(
      manualPlanIssueTargetId({
        ...mapped,
        location: { date: '2026-07-12', memberKey: 'A/B', field: 'subtreeTotal' },
      }),
    ).toBe(manualPlanCellDomId('2026-07-12', 'A/B'));
  });

  it('maps setup warnings and member/global fallbacks without exposing keys as copy', () => {
    const setupIssue: ProjectSetupIssue = {
      code: 'MEMBER_NAME_DUPLICATE',
      severity: 'WARNING',
      location: { area: 'MEMBER', memberKey: '__proto__', field: 'name' },
      message: '동명이인 확인',
    };
    const mapped = mapProjectSetupIssueToManualPlanIssue(setupIssue);
    expect(mapped).toMatchObject({ severity: 'WARNING', message: '동명이인 확인' });
    expect(manualPlanIssueTargetId(mapped)).toBe(manualPlanMemberGroupDomId('__proto__'));
    expect(
      manualPlanIssueTargetId({ ...mapped, location: {} }),
    ).toBe('manual-plan-workspace');

    const globalEngine = mapEngineIssueToManualPlanIssue({
      code: 'INPUT_STRUCTURE_INVALID',
      severity: 'ERROR',
      location: {},
      message: '전역 오류',
    });
    expect(globalEngine.location).toEqual({});
    expect(globalEngine).not.toHaveProperty('suggestion');

    const explicitSide = mapEngineIssueToManualPlanIssue({
      code: 'PV_INVALID',
      severity: 'ERROR',
      location: { memberKey: 'A', side: 'LEFT' },
      message: '회원 오류',
    });
    expect(explicitSide.location).toEqual({ memberKey: 'A', side: 'LEFT' });

    const projectWithSuggestion = mapProjectSetupIssueToManualPlanIssue({
      code: 'PROJECT_TITLE_REQUIRED',
      severity: 'WARNING',
      location: { area: 'PROJECT', side: 'RIGHT' },
      message: '설정 경고',
      suggestion: '확인',
    });
    expect(projectWithSuggestion).toMatchObject({
      location: { side: 'RIGHT' },
      suggestion: '확인',
    });
  });
});
