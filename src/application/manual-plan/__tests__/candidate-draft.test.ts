import { describe, expect, it } from 'vitest';
import {
  calculatePlan,
  type MemberSnapshot,
  type NormalizedAllocationCell,
  type OpeningStateInput,
  type OrganizationSnapshotInput,
} from '../../../engine';
import type { ProjectSetupBundle } from '../../project-setup';
import {
  calculateManualPlan,
  convertVerifiedAllocationsToManualPlanDraft,
  createManualPlanDraft,
  deriveManualPlanSchema,
  editManualPlanField,
} from '../index';

const QUALIFIED_OPENING: OpeningStateInput = Object.freeze({
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
): MemberSnapshot {
  return Object.freeze({
    memberKey,
    memberId: '',
    name: memberKey,
    pvpTarget: 700,
    sheetMarker: 'NONE',
    parentMemberKey,
    sideAtParent,
  });
}

function bundle(
  members: readonly MemberSnapshot[] = Object.freeze([
    member('B', 'A', 'LEFT'),
    member('A', null, null),
  ]),
): ProjectSetupBundle {
  const openings = Object.create(null) as Record<string, OpeningStateInput>;
  for (const item of members) {
    Object.defineProperty(openings, item.memberKey, {
      value: QUALIFIED_OPENING,
      enumerable: true,
    });
  }
  const organization: OrganizationSnapshotInput = Object.freeze({
    snapshotId: 'candidate-snapshot',
    members,
    openingStateByMember: openings,
  });
  return Object.freeze({
    project: Object.freeze({
      projectId: 'candidate-project',
      title: '검증 후보 변환 테스트',
      period: Object.freeze({
        year: 2026,
        month: 7,
        half: 'FIRST_HALF' as const,
      }),
      timezone: 'Asia/Seoul' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: organization.snapshotId,
    }),
    organization,
  });
}

function zeroCandidateAllocations(
  setup: ProjectSetupBundle,
): readonly NormalizedAllocationCell[] {
  const schema = deriveManualPlanSchema(setup);
  return Object.freeze(
    schema.dates.flatMap((date) =>
      schema.members.map((member) =>
        Object.freeze({
          date: date.date,
          memberKey: member.memberKey,
          pvp: 0,
          ...(member.leftMode === 'SELF' ? { selfLeft: 0 } : {}),
          ...(member.rightMode === 'SELF' ? { selfRight: 0 } : {}),
        }),
      ),
    ),
  );
}

function candidateAllocations(
  setup: ProjectSetupBundle,
): readonly NormalizedAllocationCell[] {
  const schema = deriveManualPlanSchema(setup);
  const activeDate = schema.dates.find(
    (date) => date.settlementMode === 'SETTLE',
  )!.date;
  const allocations: NormalizedAllocationCell[] = [];
  for (const date of schema.dates) {
    const active = date.date === activeDate;
    allocations.push(
      Object.freeze({
        date: date.date,
        memberKey: 'A',
        pvp: active ? 100 : 0,
        selfRight: active ? 50 : 0,
      }),
      Object.freeze({
        date: date.date,
        memberKey: 'B',
        pvp: active ? 200 : 0,
        selfLeft: active ? 300 : 0,
        selfRight: active ? 400 : 0,
      }),
    );
  }
  return Object.freeze(allocations);
}

function issueCodes(
  setup: ProjectSetupBundle,
  allocations: readonly NormalizedAllocationCell[],
): readonly string[] {
  const outcome = convertVerifiedAllocationsToManualPlanDraft(setup, allocations);
  expect(outcome.status).toBe('FAILURE');
  if (outcome.status !== 'FAILURE') throw new Error('expected conversion failure');
  return outcome.issues.map((item) => item.code);
}

describe('Phase 4 verified allocation conversion', () => {
  it('P4-APPLY-001 converts canonical candidate order into exact UI-order strings', () => {
    const setup = bundle();
    const schema = deriveManualPlanSchema(setup);
    const allocations = candidateAllocations(setup);
    const blankDraft = createManualPlanDraft(setup);

    expect(allocations.slice(0, 2).map((cell) => cell.memberKey)).toEqual(['A', 'B']);
    expect(schema.members.map((member) => member.memberKey)).toEqual(['B', 'A']);

    const outcome = convertVerifiedAllocationsToManualPlanDraft(
      setup,
      allocations,
      blankDraft,
    );

    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status !== 'SUCCESS') throw new Error('expected conversion success');
    expect(outcome.replacesModifiedDraft).toBe(false);
    expect(outcome.draft.cells.slice(0, 2).map((cell) => cell.memberKey)).toEqual([
      'B',
      'A',
    ]);
    const activeDate = schema.dates.find(
      (date) => date.settlementMode === 'SETTLE',
    )!.date;
    expect(
      outcome.draft.cells.find(
        (cell) => cell.date === activeDate && cell.memberKey === 'B',
      ),
    ).toEqual({
      date: activeDate,
      memberKey: 'B',
      pvp: '200',
      selfLeft: '300',
      selfRight: '400',
    });
    expect(
      outcome.draft.cells.find(
        (cell) => cell.date === activeDate && cell.memberKey === 'A',
      ),
    ).toEqual({
      date: activeDate,
      memberKey: 'A',
      pvp: '100',
      selfRight: '50',
    });
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.draft)).toBe(true);
    expect(Object.isFrozen(outcome.draft.cells)).toBe(true);
    expect(outcome.draft.cells.every(Object.isFrozen)).toBe(true);
  });

  it('P4-REG-001 produces the same authoritative calculation after manual conversion', () => {
    const setup = bundle();
    const schema = deriveManualPlanSchema(setup);
    const allocations = candidateAllocations(setup);
    const converted = convertVerifiedAllocationsToManualPlanDraft(setup, allocations);
    if (converted.status !== 'SUCCESS') throw new Error('expected conversion success');

    const direct = calculatePlan(Object.freeze({
      period: setup.project.period,
      organization: setup.organization,
      allocations,
    }));
    const manual = calculateManualPlan(setup, converted.draft, schema);

    expect(direct.status).toBe('SUCCESS');
    expect(manual.status).toBe('CURRENT');
    if (direct.status !== 'SUCCESS' || manual.status !== 'CURRENT') {
      throw new Error('expected matching successful calculations');
    }
    expect(manual.result.rawPerformanceByDateAndMember).toEqual(
      direct.result.rawPerformanceByDateAndMember,
    );
    expect(manual.result.dailySettlementByDateAndMember).toEqual(
      direct.result.dailySettlementByDateAndMember,
    );
    expect(manual.result.runningFortnightByDateAndMember).toEqual(
      direct.result.runningFortnightByDateAndMember,
    );
    expect(manual.result.finalAssessmentByMember).toEqual(
      direct.result.finalAssessmentByMember,
    );
    expect(manual.result.closingDailyCarryByMember).toEqual(
      direct.result.closingDailyCarryByMember,
    );
  });

  it('P4-APPLY-002 reports when a successful conversion would replace manual work', () => {
    const setup = bundle();
    const schema = deriveManualPlanSchema(setup);
    const initial = createManualPlanDraft(setup);
    const activeDate = schema.dates.find(
      (date) => date.settlementMode === 'SETTLE',
    )!.date;
    const edited = editManualPlanField(schema, initial, {
      date: activeDate,
      memberKey: 'B',
      field: 'pvp',
      value: '1',
    });
    if (edited.status !== 'SUCCESS') throw new Error('expected manual edit');

    const outcome = convertVerifiedAllocationsToManualPlanDraft(
      setup,
      candidateAllocations(setup),
      edited.draft,
    );

    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status !== 'SUCCESS') throw new Error('expected conversion success');
    expect(outcome.replacesModifiedDraft).toBe(true);
  });

  it('P4-APPLY-004 rejects malformed allocations without mutating the prior draft', () => {
    const setup = bundle();
    const schema = deriveManualPlanSchema(setup);
    const allocations = candidateAllocations(setup);
    const previousDraft = createManualPlanDraft(setup);
    const previousJson = JSON.stringify(previousDraft);
    const activeDate = schema.dates.find(
      (date) => date.settlementMode === 'SETTLE',
    )!.date;
    const activeRootIndex = allocations.findIndex(
      (cell) => cell.date === activeDate && cell.memberKey === 'A',
    );
    const sundayChildIndex = allocations.findIndex(
      (cell) =>
        schema.dateByIso.get(cell.date)?.settlementMode === 'SKIP_NO_INPUT' &&
        cell.memberKey === 'B',
    );
    const replace = (
      index: number,
      value: unknown,
    ): readonly NormalizedAllocationCell[] => {
      const next = [...allocations];
      next[index] = value as NormalizedAllocationCell;
      return next;
    };
    const root = allocations[activeRootIndex]!;
    const sundayChild = allocations[sundayChildIndex]!;

    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, pvp: -0 })),
    ).toContain('PV_NEGATIVE');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, pvp: 1.5 })),
    ).toContain('PV_NOT_INTEGER');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, pvp: '1' })),
    ).toContain('PV_INVALID');
    const { pvp: removedPvp, ...withoutPvp } = root;
    expect(removedPvp).toBe(100);
    expect(issueCodes(setup, replace(activeRootIndex, withoutPvp))).toContain(
      'ALLOCATION_FIELD_MISSING',
    );
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, selfLeft: 0 })),
    ).toContain('CONNECTED_SIDE_ALLOCATION');
    const { selfRight: removedRight, ...withoutRight } = root;
    expect(removedRight).toBe(50);
    expect(issueCodes(setup, replace(activeRootIndex, withoutRight))).toContain(
      'SELF_SIDE_ALLOCATION_MISSING',
    );
    expect(
      issueCodes(setup, replace(sundayChildIndex, { ...sundayChild, pvp: 1 })),
    ).toContain('NON_ZERO_INPUT_ON_SKIPPED_DATE');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, derived: 1 })),
    ).toContain('INPUT_STRUCTURE_INVALID');
    expect(issueCodes(setup, allocations.slice(1))).toContain(
      'ALLOCATION_CELL_MISSING',
    );
    expect(issueCodes(setup, [...allocations, allocations[0]!])).toContain(
      'ALLOCATION_CELL_DUPLICATE',
    );
    expect(
      issueCodes(
        setup,
        replace(activeRootIndex, { ...root, memberKey: 'missing' }),
      ),
    ).toContain('ALLOCATION_MEMBER_NOT_FOUND');

    expect(JSON.stringify(previousDraft)).toBe(previousJson);
    expect(Object.isFrozen(previousDraft)).toBe(true);
  });

  it('covers malformed envelopes, identity fields, and every numeric rejection class', () => {
    const setup = bundle();
    const schema = deriveManualPlanSchema(setup);
    const allocations = candidateAllocations(setup);
    const activeRootIndex = allocations.findIndex(
      (cell) =>
        cell.memberKey === 'A' &&
        schema.dateByIso.get(cell.date)?.settlementMode === 'SETTLE',
    );
    const activeChildIndex = allocations.findIndex(
      (cell) =>
        cell.memberKey === 'B' &&
        schema.dateByIso.get(cell.date)?.settlementMode === 'SETTLE',
    );
    const sundayChildIndex = allocations.findIndex(
      (cell) =>
        cell.memberKey === 'B' &&
        schema.dateByIso.get(cell.date)?.settlementMode === 'SKIP_NO_INPUT',
    );
    const replace = (
      index: number,
      value: unknown,
    ): readonly NormalizedAllocationCell[] => {
      const next = [...allocations];
      next[index] = value as NormalizedAllocationCell;
      return next;
    };
    const root = allocations[activeRootIndex]!;
    const child = allocations[activeChildIndex]!;
    const sundayChild = allocations[sundayChildIndex]!;

    for (const malformed of [null, [], 'cell'] as const) {
      expect(issueCodes(setup, replace(activeRootIndex, malformed))).toContain(
        'INPUT_STRUCTURE_INVALID',
      );
    }
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, date: 20260701 })),
    ).toContain('INPUT_STRUCTURE_INVALID');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, memberKey: null })),
    ).toContain('INPUT_STRUCTURE_INVALID');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, date: '2099-01-01' })),
    ).toContain('DATE_OUTSIDE_PERIOD');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, pvp: Number.NaN })),
    ).toContain('PV_INVALID');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, pvp: Number.POSITIVE_INFINITY })),
    ).toContain('PV_INVALID');
    expect(
      issueCodes(
        setup,
        replace(activeRootIndex, {
          ...root,
          pvp: Number.MAX_SAFE_INTEGER + 1,
        }),
      ),
    ).toContain('PV_OUT_OF_RANGE');
    expect(
      issueCodes(setup, replace(activeRootIndex, { ...root, pvp: -1 })),
    ).toContain('PV_NEGATIVE');

    const { selfLeft: removedLeft, ...withoutLeft } = child;
    expect(removedLeft).toBe(300);
    expect(issueCodes(setup, replace(activeChildIndex, withoutLeft))).toContain(
      'SELF_SIDE_ALLOCATION_MISSING',
    );
    expect(
      issueCodes(
        setup,
        replace(sundayChildIndex, { ...sundayChild, selfLeft: 1 }),
      ),
    ).toContain('NON_ZERO_INPUT_ON_SKIPPED_DATE');

    const repeatedDuplicate = [
      ...allocations,
      allocations[0]!,
      allocations[0]!,
    ];
    expect(
      issueCodes(setup, repeatedDuplicate).filter(
        (code) => code === 'ALLOCATION_CELL_DUPLICATE',
      ),
    ).toHaveLength(2);
  });

  it('rejects a direct value on a connected right side as well as a connected left side', () => {
    const setup = bundle(Object.freeze([
      member('B', 'A', 'RIGHT'),
      member('A', null, null),
    ]));
    const schema = deriveManualPlanSchema(setup);
    const allocations = zeroCandidateAllocations(setup);
    const activeRootIndex = allocations.findIndex(
      (cell) =>
        cell.memberKey === 'A' &&
        schema.dateByIso.get(cell.date)?.settlementMode === 'SETTLE',
    );
    const corrupted = [...allocations];
    corrupted[activeRootIndex] = {
      ...corrupted[activeRootIndex]!,
      selfRight: 0,
    };

    const outcome = convertVerifiedAllocationsToManualPlanDraft(setup, corrupted);

    expect(outcome.status).toBe('FAILURE');
    if (outcome.status !== 'FAILURE') throw new Error('expected conversion failure');
    expect(outcome.issues).toContainEqual(
      expect.objectContaining({
        code: 'CONNECTED_SIDE_ALLOCATION',
        location: expect.objectContaining({
          memberKey: 'A',
          side: 'RIGHT',
          field: 'selfRight',
        }),
      }),
    );
  });
});
