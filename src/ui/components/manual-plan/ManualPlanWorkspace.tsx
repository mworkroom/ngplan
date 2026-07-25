import { useMemo, useState, type ReactNode } from 'react';
import {
  calculateManualPlan,
  deriveAllManualPlanMemberSummaryRows,
  deriveManualPlanDailyAuditView,
  deriveManualPlanMemberSummaryView,
  deriveManualPlanSchema,
  editManualPlanField,
  type ManualPlanCalculationState,
  type ManualPlanDraft,
  type ManualPlanField,
  type ManualPlanIssue,
} from '../../../application/manual-plan';
import type { ProjectSetupBundle } from '../../../application/project-setup';
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

export interface ManualPlanWorkspaceProps {
  readonly bundle: ProjectSetupBundle;
  readonly draft: ManualPlanDraft;
  readonly setupWarnings: readonly ManualPlanIssue[];
  readonly onDraftChange: (draft: ManualPlanDraft) => void;
  readonly onReturnToSetup: () => void;
  readonly automaticPlanPanel?: ReactNode;
  readonly announcement?: string;
  readonly storageMode?: 'LOCAL' | 'CLOUD';
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
  draft,
  setupWarnings,
  onDraftChange,
  onReturnToSetup,
  automaticPlanPanel,
  announcement = '',
  storageMode = 'LOCAL',
}: ManualPlanWorkspaceProps) {
  const schema = useMemo(() => deriveManualPlanSchema(bundle), [bundle]);
  const calculation: ManualPlanCalculationState = useMemo(
    () => calculateManualPlan(bundle, draft, schema, setupWarnings),
    [bundle, draft, schema, setupWarnings],
  );
  const [selection, setSelection] = useState<ManualPlanSelection>(() => ({
    date: schema.dates[0]!.date,
    memberKey: schema.members[0]!.memberKey,
  }));

  const handleEdit = (
    date: string,
    memberKey: string,
    field: ManualPlanField,
    value: string,
  ): void => {
    const outcome = editManualPlanField(schema, draft, {
      date,
      memberKey,
      field,
      value,
    });
    if (outcome.status !== 'SUCCESS' || outcome.draft === draft) {
      return;
    }
    onDraftChange(outcome.draft);
  };

  const visibleIssues =
    calculation.status === 'BLOCKED'
      ? [...calculation.issues, ...setupWarnings]
      : calculation.status === 'AUDIT_BLOCKED'
        ? [...calculation.issues, ...calculation.warnings]
        : calculation.warnings;
  const resultViews = useMemo(() => {
    if (calculation.status === 'BLOCKED') {
      return { daily: null, selectedMember: null, allMembers: null };
    }
    return {
      daily: deriveManualPlanDailyAuditView(
        calculation.result,
        schema,
        selection.date,
        selection.memberKey,
      ),
      selectedMember: deriveManualPlanMemberSummaryView(
        calculation.result,
        schema,
        selection.memberKey,
      ),
      allMembers: deriveAllManualPlanMemberSummaryRows(
        calculation.result,
        schema,
      ),
    };
  }, [calculation, schema, selection]);

  return (
    <main
      id="manual-plan-workspace"
      className="app-shell"
      data-density="compact"
      tabIndex={-1}
    >
      <header className="app-header">
        <div className="app-header__copy">
          <p className="app-header__eyebrow">애터미 수당 계획표</p>
          <h1>{bundle.project.title}</h1>
          <p className="app-header__description">
            {formatDateRange(schema.period.startDate, schema.period.endDate)}
          </p>
        </div>
        <div className="app-header__actions">
          <span
            className={`status-badge ${
              calculation.status === 'CURRENT'
                ? 'status-badge--ready'
                : 'status-badge--error'
            }`}
            role="status"
          >
            {calculation.status === 'CURRENT'
              ? '✓ 계산 완료'
              : calculation.status === 'AUDIT_BLOCKED'
                ? '⚠ 정산 자격 확인 필요'
                : '⚠ 입력 확인 필요'}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={onReturnToSetup}
          >
            설정으로 돌아가기
          </button>
        </div>
      </header>

      <aside className="storage-notice" aria-label="저장 안내">
        <span aria-hidden="true">ⓘ</span>
        <div>
          {storageMode === 'CLOUD' ? (
            <>
              <strong>클라우드와 이 기기에 자동으로 저장됩니다.</strong>
              <div>인터넷이 잠시 끊겨도 이 기기에 보관한 뒤 자동으로 다시 저장합니다.</div>
            </>
          ) : (
            <>
              <strong>이 브라우저에 자동으로 저장됩니다.</strong>
              <div>
                브라우저를 닫아도 입력 내용이 유지됩니다. 사이트 데이터를 삭제하면 저장 자료도 삭제됩니다.
              </div>
            </>
          )}
        </div>
      </aside>

      {automaticPlanPanel}

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <ManualPlanValidationSummary
        issues={visibleIssues}
        schema={schema}
        blocked={calculation.status === 'BLOCKED'}
        onSelectContext={(date, memberKey) => setSelection({ date, memberKey })}
      />

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {calculation.status === 'BLOCKED'
          ? `입력 오류 ${calculation.issues.length}개`
          : calculation.status === 'AUDIT_BLOCKED'
            ? `정산 자격 경고 ${calculation.issues.length}개. 실제 초기화 결과를 표시합니다.`
          : '현재 계획 계산 완료'}
      </p>

      <ManualPlanTable
        schema={schema}
        draft={draft}
        calculation={calculation}
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
          blocked={calculation.status === 'BLOCKED'}
        />
        <MemberFortnightSummary
          selected={resultViews.selectedMember}
          rows={resultViews.allMembers}
          blocked={calculation.status === 'BLOCKED'}
        />
      </div>

    </main>
  );
}
