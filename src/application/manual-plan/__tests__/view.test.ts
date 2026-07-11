import { describe, expect, it } from 'vitest';
import type { MemberSnapshot, OpeningStateInput, PvpTarget } from '../../../engine';
import type { ProjectSetupBundle } from '../../project-setup';
import {
  calculateManualPlan,
  createManualPlanDraft,
  deriveAllManualPlanMemberSummaryRows,
  deriveManualPlanDailyAuditView,
  deriveManualPlanMemberJumpOptions,
  deriveManualPlanMemberSummaryView,
  deriveManualPlanSchema,
  deriveManualPlanValidationSummaryItems,
  deriveManualPlanWorksheetCellView,
  editManualPlanField,
  type ManualPlanDraft,
  type ManualPlanField,
  type ManualPlanIssue,
  type ManualPlanSchema,
} from '../index';

const ZERO_OPENING: OpeningStateInput = {
  fortnightPvpOpeningCredit: 0,
  dailyCarryPvp: 0,
  dailyCarryLeft: 0,
  dailyCarryRight: 0,
};

function member(
  memberKey: string,
  parentMemberKey: string | null = null,
  sideAtParent: 'LEFT' | 'RIGHT' | null = null,
  pvpTarget: PvpTarget = 700,
): MemberSnapshot {
  return {
    memberKey,
    memberId: '',
    name: memberKey === '__proto__' ? '특수 회원' : memberKey,
    pvpTarget,
    sheetMarker: 'NONE',
    parentMemberKey,
    sideAtParent,
  };
}

function bundle(
  members: readonly MemberSnapshot[] = [member('A')],
  openingOverrides: Readonly<Record<string, Partial<OpeningStateInput>>> = {},
): ProjectSetupBundle {
  const openings = Object.create(null) as Record<string, OpeningStateInput>;
  for (const item of members) {
    Object.defineProperty(openings, item.memberKey, {
      value: Object.freeze({
        ...ZERO_OPENING,
        ...(Object.hasOwn(openingOverrides, item.memberKey)
          ? openingOverrides[item.memberKey]
          : {}),
      }),
      enumerable: true,
    });
  }
  return Object.freeze({
    project: Object.freeze({
      projectId: 'p',
      title: 'view test',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'Asia/Seoul' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 's',
    }),
    organization: Object.freeze({
      snapshotId: 's',
      members: Object.freeze([...members]),
      openingStateByMember: openings,
    }),
  });
}

function edit(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
  field: ManualPlanField,
  value: number,
): ManualPlanDraft {
  const outcome = editManualPlanField(schema, draft, {
    date,
    memberKey,
    field,
    value: String(value),
  });
  if (outcome.status !== 'SUCCESS') throw new Error(outcome.message);
  return outcome.draft;
}

function currentResult(
  setup: ProjectSetupBundle,
  apply?: (schema: ManualPlanSchema, draft: ManualPlanDraft) => ManualPlanDraft,
) {
  const schema = deriveManualPlanSchema(setup);
  const initial = createManualPlanDraft(setup);
  const draft = apply?.(schema, initial) ?? initial;
  const state = calculateManualPlan(setup, draft, schema);
  if (state.status !== 'CURRENT') throw new Error('expected current result');
  return { schema, result: state.result };
}

describe('WP5 pure result view models', () => {
  it('P3-RESULT-001 / DAY-001 maps the complete daily audit in engine order', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 100);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 200);
      return edit(schema, draft, '2026-07-01', 'A', 'selfRight', 300);
    });
    const view = deriveManualPlanDailyAuditView(result, schema, '2026-07-01', 'A');
    expect(view).toMatchObject({
      settlementStatus: 'SETTLED',
      carryIn: { pvp: 0, left: 0, right: 0 },
      rawPerformance: {
        directPvp: 100,
        organizationLeft: 200,
        organizationRight: 300,
      },
      preSettlement: { pvp: 100, left: 200, right: 300 },
      pvpAppliedSide: 'LEFT',
      pvpApplicationReason: 'SMALLER_LEFT',
      pvpApplicationLabel: '작은 쪽 좌에 PVP 적용',
      assessedLeft: 300,
      assessedRight: 300,
      commissionTier: 300,
      commissionOccurred: true,
      commissionLabel: '300 단계 · 커미션 발생',
      carryOut: { pvp: 0, left: 0, right: 0 },
      running: {
        newPvpTotal: 100,
        rawLeftTotal: 200,
        rawRightTotal: 300,
        remainingPvp: 600,
      },
      runningPvpStatusLabel: '개인 PVP 목표 미달',
    });
    expect(deriveManualPlanWorksheetCellView(result, '2026-07-01', 'A')).toEqual({
      date: '2026-07-01',
      memberKey: 'A',
      directPvp: 100,
      organizationLeft: 200,
      organizationRight: 300,
      subtreeTotal: 600,
    });
  });

  it('DAY-003 combines prior carry with the next day raw input', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 100);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 200);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfRight', 100);
      return edit(schema, draft, '2026-07-02', 'A', 'selfRight', 200);
    });
    expect(deriveManualPlanDailyAuditView(result, schema, '2026-07-01', 'A')).toMatchObject({
      carryOut: { pvp: 100, left: 200, right: 100 },
      commissionOccurred: false,
    });
    expect(deriveManualPlanDailyAuditView(result, schema, '2026-07-02', 'A')).toMatchObject({
      carryIn: { pvp: 100, left: 200, right: 100 },
      preSettlement: { pvp: 100, left: 200, right: 300 },
      commissionOccurred: true,
      carryOut: { pvp: 0, left: 0, right: 0 },
      running: { newPvpTotal: 100, rawLeftTotal: 200, rawRightTotal: 300 },
    });
  });

  it('DAY-010 retains raw fortnight totals after a daily commission reset', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 100);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 200);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfRight', 300);
      draft = edit(schema, draft, '2026-07-02', 'A', 'pvp', 100);
      return edit(schema, draft, '2026-07-02', 'A', 'selfLeft', 100);
    });
    expect(deriveManualPlanDailyAuditView(result, schema, '2026-07-01', 'A')).toMatchObject({
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
    });
    expect(deriveManualPlanDailyAuditView(result, schema, '2026-07-02', 'A')).toMatchObject({
      rawPerformance: { directPvp: 100, organizationLeft: 100, organizationRight: 0 },
      running: { newPvpTotal: 200, rawLeftTotal: 300, rawRightTotal: 300 },
    });
  });

  it('P3-RESULT-002 / HALF-005 exposes final progress and target fields without recomputing', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 400);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 2500);
      return edit(schema, draft, '2026-07-01', 'A', 'selfRight', 2100);
    });
    const summary = deriveManualPlanMemberSummaryView(result, schema, 'A');
    expect(summary).toMatchObject({
      pvpTarget: 700,
      sheetMarker: 'NONE',
      newPvpTotal: 400,
      personalPvpTotal: 400,
      personalPvpTarget: 700,
      remainingPvp: 300,
      personalPvpStatusLabel: '개인 PVP 목표 미달',
      rawLeftTotal: 2500,
      rawRightTotal: 2100,
      periodPvpForSide: 400,
      pvpAppliedSide: 'RIGHT',
      pvpApplicationReason: 'SMALLER_RIGHT',
      pvpApplicationLabel: '작은 쪽 우에 적용',
      assessedLeft: 2500,
      assessedRight: 2500,
      leftTargetLabel: '좌 목표 달성',
      rightTargetLabel: '우 목표 달성',
      sideTargetsMet: true,
      allTargetsMet: false,
      allTargetsLabel: '추가 계획 필요',
      recommendationLabel: '8회 권장 미달',
    });
  });

  it('HALF-006 keeps tied raw sides intact and applies all PVP to the left', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 400);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 2300);
      return edit(schema, draft, '2026-07-01', 'A', 'selfRight', 2300);
    });
    expect(deriveManualPlanMemberSummaryView(result, schema, 'A')).toMatchObject({
      rawLeftTotal: 2300,
      rawRightTotal: 2300,
      periodPvpForSide: 400,
      pvpAppliedSide: 'LEFT',
      pvpApplicationLabel: '동률 → 좌 적용',
      assessedLeft: 2700,
      assessedRight: 2300,
      leftTargetMet: true,
      rightTargetMet: false,
      sideTargetsMet: false,
    });
  });

  it('HALF-P01 includes opening fortnight PVP in target and side assessment', () => {
    const { schema, result } = currentResult(
      bundle([member('A')], { A: { fortnightPvpOpeningCredit: 300 } }),
      (schema, initial) => {
        let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 400);
        draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 2500);
        return edit(schema, draft, '2026-07-01', 'A', 'selfRight', 1800);
      },
    );
    expect(deriveManualPlanMemberSummaryView(result, schema, 'A')).toMatchObject({
      fortnightPvpOpeningCredit: 300,
      newPvpTotal: 400,
      personalPvpTotal: 700,
      remainingPvp: 0,
      periodPvpForSide: 700,
      pvpAppliedSide: 'RIGHT',
      assessedLeft: 2500,
      assessedRight: 2500,
      sideTargetsMet: true,
      allTargetsMet: true,
    });
  });

  it('HALF-P03 excludes opening daily PVP carry from fortnight totals', () => {
    const { schema, result } = currentResult(
      bundle([member('A')], { A: { dailyCarryPvp: 300 } }),
      (schema, initial) => edit(schema, initial, '2026-07-01', 'A', 'pvp', 400),
    );
    expect(deriveManualPlanMemberSummaryView(result, schema, 'A')).toMatchObject({
      fortnightPvpOpeningCredit: 0,
      newPvpTotal: 400,
      personalPvpTotal: 400,
      remainingPvp: 300,
      periodPvpForSide: 400,
      pvpAppliedSide: 'LEFT',
      assessedLeft: 400,
      assessedRight: 0,
      sideTargetsMet: false,
    });
  });

  it('P3-RESULT-003 keeps unmet goals as valid shortage values, not issues', () => {
    const { schema, result } = currentResult(bundle());
    const summary = deriveManualPlanMemberSummaryView(result, schema, 'A');
    expect(summary).toMatchObject({
      remainingPvp: 700,
      leftTargetMet: false,
      rightTargetMet: false,
      leftTargetLabel: '좌 목표 미달',
      rightTargetLabel: '우 목표 미달',
      allTargetsLabel: '추가 계획 필요',
      commissionDays: 0,
    });
  });

  it('P3-RESULT-004 distinguishes zero pre-settlement PVP from carried PVP application', () => {
    const zero = currentResult(bundle());
    expect(
      deriveManualPlanDailyAuditView(zero.result, zero.schema, '2026-07-01', 'A')
        ?.pvpApplicationLabel,
    ).toBe('적용할 PVP 없음');

    const carried = currentResult(
      bundle([member('A')], {
        A: { dailyCarryPvp: 100, dailyCarryLeft: 200, dailyCarryRight: 300 },
      }),
    );
    const carriedView = deriveManualPlanDailyAuditView(
      carried.result,
      carried.schema,
      '2026-07-01',
      'A',
    );
    expect(carriedView).toMatchObject({
      rawPerformance: { directPvp: 0 },
      preSettlement: { pvp: 100 },
      pvpApplicationLabel: '작은 쪽 좌에 PVP 적용',
    });
  });

  it('DAY-P03 / CAL-P01 maps Sunday skip, smaller-right, and tie presentation states', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 100);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 300);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfRight', 200);
      draft = edit(schema, draft, '2026-07-02', 'A', 'pvp', 100);
      draft = edit(schema, draft, '2026-07-02', 'A', 'selfLeft', 300);
      return edit(schema, draft, '2026-07-02', 'A', 'selfRight', 300);
    });
    expect(
      deriveManualPlanDailyAuditView(result, schema, '2026-07-01', 'A')
        ?.pvpApplicationLabel,
    ).toBe('작은 쪽 우에 PVP 적용');
    expect(
      deriveManualPlanDailyAuditView(result, schema, '2026-07-02', 'A')
    ).toMatchObject({
      pvpAppliedSide: 'LEFT',
      assessedLeft: 400,
      assessedRight: 300,
      commissionTier: 300,
      carryOut: { pvp: 0, left: 0, right: 0 },
      pvpApplicationLabel: '동률 → 좌 적용',
    });
    expect(deriveManualPlanDailyAuditView(result, schema, '2026-07-05', 'A')).toMatchObject({
      settlementStatus: 'SKIPPED',
      settlementLabel: '정산 제외',
      pvpApplicationLabel: '정산 제외',
      commissionLabel: '정산 제외 · 커미션 없음',
    });
  });

  it('COUNT-003 exposes below/met recommendation states as soft labels', () => {
    const below = currentResult(bundle([member('A', null, null, 700)]));
    expect(deriveManualPlanMemberSummaryView(below.result, below.schema, 'A')).toMatchObject({
      recommendationStatus: 'BELOW_RECOMMENDED',
      recommendedCommissionDays: 8,
      recommendationLabel: '8회 권장 미달',
    });

    const met = currentResult(bundle([member('A', null, null, 700)]), (schema, initial) => {
      let draft = initial;
      for (const date of schema.dates.filter((item) => item.settlementMode === 'SETTLE').slice(0, 8)) {
        draft = edit(schema, draft, date.date, 'A', 'pvp', 100);
        draft = edit(schema, draft, date.date, 'A', 'selfLeft', 200);
        draft = edit(schema, draft, date.date, 'A', 'selfRight', 300);
      }
      return draft;
    });
    expect(deriveManualPlanMemberSummaryView(met.result, met.schema, 'A')).toMatchObject({
      commissionDays: 8,
      recommendationStatus: 'MET_OR_EXCEEDED',
      recommendationLabel: '8회 권장 달성',
    });
  });

  it('does not invent a recommendation threshold when engine metadata is inconsistent', () => {
    const current = currentResult(bundle([member('A', null, null, 700)]));
    const assessment = current.result.finalAssessmentByMember.A!;
    for (const recommendationStatus of [
      'BELOW_RECOMMENDED',
      'MET_OR_EXCEEDED',
    ] as const) {
      const result = {
        ...current.result,
        finalAssessmentByMember: {
          A: {
            ...assessment,
            recommendationStatus,
            recommendedCommissionDays: null,
          },
        },
      };
      expect(
        deriveManualPlanMemberSummaryView(result, current.schema, 'A')
          ?.recommendationLabel,
      ).toBe('권장 기준 확인 필요');
    }
  });

  it('COUNT-001 preserves one dated occurrence for each canonical tier', () => {
    const tiers = [300, 300, 700, 1500, 2400, 6000, 20000, 60000] as const;
    const { schema, result } = currentResult(
      bundle([member('A', null, null, 700)]),
      (schema, initial) => {
        let draft = initial;
        const dates = schema.dates
          .filter((item) => item.settlementMode === 'SETTLE')
          .slice(0, tiers.length);
        for (const [index, tier] of tiers.entries()) {
          const date = dates[index]!.date;
          draft = edit(schema, draft, date, 'A', 'selfLeft', tier);
          draft = edit(schema, draft, date, 'A', 'selfRight', tier);
        }
        return draft;
      },
    );
    const summary = deriveManualPlanMemberSummaryView(result, schema, 'A');
    expect(summary?.commissionDays).toBe(8);
    expect(summary?.commissionOccurrences.map(({ tier }) => tier)).toEqual(tiers);
  });

  it('COUNT-003 keeps six commission days as a soft miss after required goals pass', () => {
    const { schema, result } = currentResult(
      bundle([member('A', null, null, 700)]),
      (schema, initial) => {
        let draft = initial;
        const dates = schema.dates
          .filter((item) => item.settlementMode === 'SETTLE')
          .slice(0, 6);
        draft = edit(schema, draft, dates[0]!.date, 'A', 'pvp', 700);
        draft = edit(schema, draft, dates[0]!.date, 'A', 'selfLeft', 2500);
        draft = edit(schema, draft, dates[0]!.date, 'A', 'selfRight', 1800);
        for (const date of dates.slice(1)) {
          draft = edit(schema, draft, date.date, 'A', 'selfLeft', 300);
          draft = edit(schema, draft, date.date, 'A', 'selfRight', 300);
        }
        return draft;
      },
    );
    expect(deriveManualPlanMemberSummaryView(result, schema, 'A')).toMatchObject({
      allTargetsMet: true,
      allTargetsLabel: '전체 목표 달성',
      commissionDays: 6,
      recommendationStatus: 'BELOW_RECOMMENDED',
      recommendationLabel: '8회 권장 미달',
    });
  });

  it('keeps tree order, special-key lookup, jump targets, and missing results explicit', () => {
    const setup = bundle([
      member('__proto__'),
      member('child', '__proto__', 'LEFT'),
    ]);
    const { schema, result } = currentResult(setup);
    expect(deriveAllManualPlanMemberSummaryRows(result, schema)?.map((row) => row.memberKey))
      .toEqual(['__proto__', 'child']);
    expect(deriveManualPlanMemberJumpOptions(schema).map((option) => option.label)).toEqual([
      '특수 회원',
      'child',
    ]);
    expect(deriveManualPlanWorksheetCellView(result, '2099-01-01', '__proto__')).toBeNull();
    expect(deriveManualPlanDailyAuditView(result, schema, '2026-07-01', 'missing')).toBeNull();
    expect(deriveManualPlanMemberSummaryView(result, schema, 'missing')).toBeNull();

    const missingAssessment = {
      ...result,
      finalAssessmentByMember: Object.create(null) as typeof result.finalAssessmentByMember,
    };
    expect(deriveAllManualPlanMemberSummaryRows(missingAssessment, schema)).toBeNull();
  });

  it('builds contextual validation summary items and stable targets', () => {
    const { schema } = currentResult(bundle());
    const issues: ManualPlanIssue[] = [
      {
        code: 'PV_INVALID',
        severity: 'ERROR',
        location: { date: '2026-07-01', memberKey: 'A', field: 'selfLeft' },
        message: '잘못된 PV',
      },
      {
        code: 'MANUAL_PLAN_CALCULATION_FAILED',
        severity: 'ERROR',
        location: {},
        message: '전체 계산 실패',
      },
      {
        code: 'PV_INVALID',
        severity: 'ERROR',
        location: { date: '2099-01-01', memberKey: 'missing', field: 'derived' },
        message: '알 수 없는 위치',
      },
    ];
    const items = deriveManualPlanValidationSummaryItems(issues, schema);
    expect(items[0]).toMatchObject({
      contextLabel: '7월 1일 (수) · A · 좌',
      targetId: expect.stringContaining('manual-plan-field-'),
    });
    expect(items[1]).toMatchObject({
      contextLabel: '전체 계획',
      targetId: 'manual-plan-workspace',
    });
    expect(items[2]?.contextLabel).toBe('2099-01-01 · 회원 · 계산 항목');
  });
});
