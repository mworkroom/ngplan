import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  MemberSnapshot,
  OpeningStateInput,
  PvpTarget,
} from '../../../../engine';
import {
  calculateManualPlan,
  createManualPlanDraft,
  deriveAllManualPlanMemberSummaryRows,
  deriveManualPlanDailyAuditView,
  deriveManualPlanMemberSummaryView,
  deriveManualPlanSchema,
  editManualPlanField,
  type ManualPlanDraft,
  type ManualPlanField,
  type ManualPlanSchema,
} from '../../../../application/manual-plan';
import type { ProjectSetupBundle } from '../../../../application/project-setup';
import { DailyResultDetails } from '../DailyResultDetails';
import { MemberFortnightSummary } from '../MemberFortnightSummary';

const ZERO_OPENING: OpeningStateInput = {
  openingQualificationPvp: 300,
  fortnightPvpOpeningCredit: 300,
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
    name: memberKey,
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
      enumerable: true,
      value: Object.freeze({
        ...ZERO_OPENING,
        ...(Object.hasOwn(openingOverrides, item.memberKey)
          ? openingOverrides[item.memberKey]
          : {}),
      }),
    });
  }
  return Object.freeze({
    project: Object.freeze({
      projectId: 'results',
      title: '결과 표시 테스트',
      period: Object.freeze({ year: 2026, month: 7, half: 'FIRST_HALF' as const }),
      timezone: 'Asia/Seoul' as const,
      projectStatus: 'IN_PROGRESS' as const,
      organizationSnapshotId: 'results-snapshot',
    }),
    organization: Object.freeze({
      snapshotId: 'results-snapshot',
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
  if (outcome.status !== 'SUCCESS') {
    throw new Error(outcome.message);
  }
  return outcome.draft;
}

function currentResult(
  setup: ProjectSetupBundle,
  apply?: (schema: ManualPlanSchema, draft: ManualPlanDraft) => ManualPlanDraft,
) {
  const schema = deriveManualPlanSchema(setup);
  const initial = createManualPlanDraft(setup);
  const state = calculateManualPlan(
    setup,
    apply?.(schema, initial) ?? initial,
    schema,
  );
  if (state.status !== 'CURRENT') {
    throw new Error('expected current result');
  }
  return { schema, result: state.result };
}

afterEach(cleanup);

describe('WP5 daily and fortnight result presentation', () => {
  it('P3-RESULT-001 / DAY-001 renders all nine daily audit steps from engine values', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 100);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 200);
      return edit(schema, draft, '2026-07-01', 'A', 'selfRight', 300);
    });
    const view = deriveManualPlanDailyAuditView(result, schema, '2026-07-01', 'A');
    render(<DailyResultDetails view={view} blocked={false} />);

    const audit = screen.getByRole('list');
    expect(within(audit).getAllByRole('listitem')).toHaveLength(9);
    expect(screen.getByText('1. 전날에서 넘어온 값')).toBeDefined();
    expect(screen.getByText('2. 오늘 들어온 실적')).toBeDefined();
    expect(screen.getByText('3. 수당 자격 PVP')).toBeDefined();
    expect(screen.getByText('400 PV · 자격 300 이상')).toBeDefined();
    expect(screen.getByText('4. 오늘 계산에 사용할 합계')).toBeDefined();
    expect(screen.getByText('작은 쪽 좌에 PVP 적용')).toBeDefined();
    expect(screen.getByText('300 단계 · 커미션 발생')).toBeDefined();
    expect(screen.getByText('9. 오늘까지의 보름 합계')).toBeDefined();
  });

  it('P3-RESULT-004 / P3-SUN-001 distinguishes no PVP and a skipped Sunday with null values', () => {
    const { schema, result } = currentResult(bundle());
    const { rerender } = render(
      <DailyResultDetails
        view={deriveManualPlanDailyAuditView(result, schema, '2026-07-01', 'A')}
        blocked={false}
      />,
    );
    expect(screen.getByText('적용할 PVP 없음')).toBeDefined();

    const carried = currentResult(
      bundle([member('A')], {
        A: { dailyCarryLeft: 200, dailyCarryRight: 300 },
      }),
      (schema, initial) => edit(schema, initial, '2026-07-01', 'A', 'pvp', 100),
    );
    rerender(
      <DailyResultDetails
        view={deriveManualPlanDailyAuditView(
          carried.result,
          carried.schema,
          '2026-07-01',
          'A',
        )}
        blocked={false}
      />,
    );
    expect(screen.getByText('작은 쪽 좌에 PVP 적용')).toBeDefined();

    rerender(
      <DailyResultDetails
        view={deriveManualPlanDailyAuditView(result, schema, '2026-07-05', 'A')}
        blocked={false}
      />,
    );
    expect(screen.getAllByText('정산 제외').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('정산 제외 · 커미션 없음')).toBeDefined();
    expect(screen.getByText('좌 —')).toBeDefined();
    expect(screen.getByText('우 —')).toBeDefined();
  });

  it('P3-RESULT-002/003 / HALF-005 renders shortages and assessed target states', () => {
    const { schema, result } = currentResult(bundle(), (schema, initial) => {
      let draft = edit(schema, initial, '2026-07-01', 'A', 'pvp', 100);
      draft = edit(schema, draft, '2026-07-01', 'A', 'selfLeft', 2500);
      return edit(schema, draft, '2026-07-01', 'A', 'selfRight', 2400);
    });
    render(
      <MemberFortnightSummary
        selected={deriveManualPlanMemberSummaryView(result, schema, 'A')}
        rows={deriveAllManualPlanMemberSummaryRows(result, schema)}
        blocked={false}
      />,
    );

    expect(screen.getAllByText('추가 계획 필요').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('누적 PVP 시작').closest('div')?.textContent).toBe(
      '누적 PVP 시작300 PV',
    );
    expect(screen.getByText('신규 PVP').closest('div')?.textContent).toBe(
      '신규 PVP100 PV',
    );
    expect(screen.getByText('누적 PVP 마감').closest('div')?.textContent).toBe(
      '누적 PVP 마감400 PV',
    );
    expect(screen.queryByText('자격 PVP 시작')).toBeNull();
    expect(screen.queryByText('자격 PVP 마감')).toBeNull();
    expect(screen.queryByText('보름 PVP 시작')).toBeNull();
    expect(screen.queryByText('개인 PVP 합계')).toBeNull();
    expect(screen.getByText('2,500 PV · 좌 목표 달성')).toBeDefined();
    expect(screen.getByText('2,800 PV · 우 목표 달성')).toBeDefined();
    expect(screen.getByText('7월 1일')).toBeDefined();
    expect(screen.getByText('2,400 PV 단계')).toBeDefined();
  });

  it('COUNT-001 renders every commission occurrence date and tier plus the day count', () => {
    const tiers = [300, 300, 700, 1500, 2400, 6000, 20000, 60000] as const;
    const { schema, result } = currentResult(
      bundle([member('A', null, null, 700)]),
      (schema, initial) => {
        let draft = initial;
        const dates = schema.dates
          .filter((date) => date.settlementMode === 'SETTLE')
          .slice(0, tiers.length);
        for (const [index, tier] of tiers.entries()) {
          draft = edit(schema, draft, dates[index]!.date, 'A', 'selfLeft', tier);
          draft = edit(schema, draft, dates[index]!.date, 'A', 'selfRight', tier);
        }
        return draft;
      },
    );
    render(
      <MemberFortnightSummary
        selected={deriveManualPlanMemberSummaryView(result, schema, 'A')}
        rows={deriveAllManualPlanMemberSummaryRows(result, schema)}
        blocked={false}
      />,
    );

    expect(screen.getAllByText('8일').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('8회 권장 달성').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('7월 1일')).toBeDefined();
    expect(screen.getByText('7월 9일')).toBeDefined();
    expect(screen.getAllByText('300 PV 단계')).toHaveLength(2);
    expect(screen.getByText('60,000 PV 단계')).toBeDefined();
  });

  it('keeps all-member summary rows in deterministic tree order', () => {
    const setup = bundle([
      member('A'),
      member('B', 'A', 'LEFT'),
      member('C', 'A', 'RIGHT'),
    ]);
    const { schema, result } = currentResult(setup);
    const rows = deriveAllManualPlanMemberSummaryRows(result, schema);
    render(
      <MemberFortnightSummary
        selected={deriveManualPlanMemberSummaryView(result, schema, 'A')}
        rows={rows}
        blocked={false}
      />,
    );

    const overview = screen.getByRole('table');
    expect(within(overview).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'B',
      'A',
      'C',
    ]);
  });

  it('renders explicit unavailable panels while the calculation is blocked', () => {
    render(
      <>
        <DailyResultDetails view={null} blocked />
        <MemberFortnightSummary selected={null} rows={null} blocked />
      </>,
    );
    expect(screen.getByText('잘못 입력한 값을 고치면 오늘 결과가 다시 나타납니다.')).toBeDefined();
    expect(screen.getByText('현재 입력을 수정하면 보름 결과를 다시 표시합니다.')).toBeDefined();
  });
});
