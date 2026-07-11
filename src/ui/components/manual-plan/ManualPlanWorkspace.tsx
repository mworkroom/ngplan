import { useMemo, useRef, useState } from 'react';
import {
  calculateManualPlan,
  createManualPlanDraft,
  deriveAllManualPlanMemberSummaryRows,
  deriveManualPlanDailyAuditView,
  deriveManualPlanMemberSummaryView,
  deriveManualPlanSchema,
  editManualPlanField,
  isManualPlanDraftModified,
  type ManualPlanCalculationState,
  type ManualPlanDraft,
  type ManualPlanField,
  type ManualPlanIssue,
} from '../../../application/manual-plan';
import type { ProjectSetupBundle } from '../../../application/project-setup';
import { DiscardManualPlanDialog } from './DiscardManualPlanDialog';
import { DailyResultDetails } from './DailyResultDetails';
import { MemberFortnightSummary } from './MemberFortnightSummary';
import {
  ManualPlanTable,
  type ManualPlanSelection,
} from './ManualPlanTable';
import {
  ManualPlanSelectedContextIssues,
  ManualPlanValidationSummary,
} from './ManualPlanValidationSummary';

export type ManualPlanDisplayDensity = 'COMPACT' | 'COMFORTABLE';

export interface ManualPlanWorkspaceProps {
  readonly bundle: ProjectSetupBundle;
  readonly setupWarnings: readonly ManualPlanIssue[];
  readonly displayDensity: ManualPlanDisplayDensity;
  readonly onDisplayDensityChange: (density: ManualPlanDisplayDensity) => void;
  readonly onReturnToSetup: () => void;
}

interface ManualPlanSession {
  readonly draft: ManualPlanDraft;
  readonly calculation: ManualPlanCalculationState;
}

function formatDateRange(startDate: string, endDate: string): string {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  if (
    startYear === undefined ||
    startMonth === undefined ||
    startDay === undefined ||
    endYear === undefined ||
    endMonth === undefined ||
    endDay === undefined
  ) {
    return `${startDate} ~ ${endDate}`;
  }
  if (startYear === endYear && startMonth === endMonth) {
    return `${startYear}년 ${startMonth}월 ${startDay}일 ~ ${endDay}일`;
  }
  return `${startYear}년 ${startMonth}월 ${startDay}일 ~ ${endYear}년 ${endMonth}월 ${endDay}일`;
}

export function ManualPlanWorkspace({
  bundle,
  setupWarnings,
  displayDensity,
  onDisplayDensityChange,
  onReturnToSetup,
}: ManualPlanWorkspaceProps) {
  const schema = useMemo(() => deriveManualPlanSchema(bundle), [bundle]);
  const [session, setSession] = useState<ManualPlanSession>(() => {
    const draft = createManualPlanDraft(bundle);
    return {
      draft,
      calculation: calculateManualPlan(bundle, draft, schema, setupWarnings),
    };
  });
  const [selection, setSelection] = useState<ManualPlanSelection>(() => ({
    date: schema.dates[0]!.date,
    memberKey: schema.members[0]!.memberKey,
  }));
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const returnTriggerRef = useRef<HTMLButtonElement>(null);

  const handleEdit = (
    date: string,
    memberKey: string,
    field: ManualPlanField,
    value: string,
  ): void => {
    const outcome = editManualPlanField(schema, session.draft, {
      date,
      memberKey,
      field,
      value,
    });
    if (outcome.status !== 'SUCCESS' || outcome.draft === session.draft) {
      return;
    }
    setSession({
      draft: outcome.draft,
      calculation: calculateManualPlan(
        bundle,
        outcome.draft,
        schema,
        setupWarnings,
      ),
    });
  };

  const requestReturnToSetup = (): void => {
    if (!isManualPlanDraftModified(schema, session.draft)) {
      onReturnToSetup();
      return;
    }
    setDiscardDialogOpen(true);
  };

  const cancelDiscard = (): void => {
    setDiscardDialogOpen(false);
  };

  const visibleIssues =
    session.calculation.status === 'BLOCKED'
      ? [...session.calculation.issues, ...setupWarnings]
      : session.calculation.warnings;
  const resultViews = useMemo(() => {
    if (session.calculation.status !== 'CURRENT') {
      return { daily: null, selectedMember: null, allMembers: null };
    }
    return {
      daily: deriveManualPlanDailyAuditView(
        session.calculation.result,
        schema,
        selection.date,
        selection.memberKey,
      ),
      selectedMember: deriveManualPlanMemberSummaryView(
        session.calculation.result,
        schema,
        selection.memberKey,
      ),
      allMembers: deriveAllManualPlanMemberSummaryRows(
        session.calculation.result,
        schema,
      ),
    };
  }, [schema, selection, session.calculation]);

  return (
    <main
      id="manual-plan-workspace"
      className="app-shell"
      data-density={displayDensity === 'COMPACT' ? 'compact' : 'comfortable'}
      tabIndex={-1}
    >
      <header className="app-header">
        <div className="app-header__copy">
          <p className="app-header__eyebrow">ngplan · Phase 3</p>
          <h1>{bundle.project.title}</h1>
          <p className="app-header__description">
            {formatDateRange(schema.period.startDate, schema.period.endDate)}
          </p>
        </div>
        <div className="app-header__actions">
          <span
            className={`status-badge ${
              session.calculation.status === 'CURRENT'
                ? 'status-badge--ready'
                : 'status-badge--error'
            }`}
            role="status"
          >
            {session.calculation.status === 'CURRENT'
              ? '✓ 계산 완료'
              : '⚠ 입력 확인 필요'}
          </span>
          <label className="density-control">
            <select
              aria-label="화면 크기"
              value={displayDensity}
              onChange={(event) =>
                onDisplayDensityChange(
                  event.currentTarget.value as ManualPlanDisplayDensity,
                )
              }
            >
              <option value="COMPACT">작게</option>
              <option value="COMFORTABLE">편안하게</option>
            </select>
          </label>
          <button
            ref={returnTriggerRef}
            type="button"
            className="secondary-button"
            onClick={requestReturnToSetup}
          >
            설정으로 돌아가기
          </button>
        </div>
      </header>

      <aside className="storage-notice" aria-label="저장 안내">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>설정과 계획은 아직 저장되지 않습니다.</strong>
          <div>
            브라우저를 새로고침하거나 닫으면 모두 사라집니다. 화면 크기 설정만
            저장됩니다.
          </div>
        </div>
      </aside>

      <ManualPlanValidationSummary
        issues={visibleIssues}
        schema={schema}
        blocked={session.calculation.status === 'BLOCKED'}
        onSelectContext={(date, memberKey) => setSelection({ date, memberKey })}
      />

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {session.calculation.status === 'BLOCKED'
          ? `입력 오류 ${session.calculation.issues.length}개`
          : '현재 계획 계산 완료'}
      </p>

      <ManualPlanTable
        schema={schema}
        draft={session.draft}
        calculation={session.calculation}
        selection={selection}
        onSelect={setSelection}
        onEdit={handleEdit}
      />

      <p className="manual-plan-selection" aria-live="polite">
        선택: {schema.dateByIso.get(selection.date)?.displayLabel ?? selection.date} ·{' '}
        {schema.memberByKey.get(selection.memberKey)?.displayLabel ?? '회원'}
      </p>

      <ManualPlanSelectedContextIssues
        issues={visibleIssues}
        schema={schema}
        selectedDate={selection.date}
        selectedMemberKey={selection.memberKey}
      />

      <div className="manual-result-layout">
        <DailyResultDetails
          view={resultViews.daily}
          blocked={session.calculation.status === 'BLOCKED'}
        />
        <MemberFortnightSummary
          selected={resultViews.selectedMember}
          rows={resultViews.allMembers}
          blocked={session.calculation.status === 'BLOCKED'}
        />
      </div>

      {discardDialogOpen ? (
        <DiscardManualPlanDialog
          onCancel={cancelDiscard}
          onConfirm={onReturnToSetup}
          returnFocusRef={returnTriggerRef}
        />
      ) : null}
    </main>
  );
}
