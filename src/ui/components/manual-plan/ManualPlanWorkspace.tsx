import { useMemo, useState, type ReactNode } from 'react';
import {
  calculateManualPlan,
  deriveAllManualPlanMemberSummaryRows,
  deriveManualPlanDailyAuditView,
  deriveManualPlanMemberJumpOptions,
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
  readonly planMode?: 'MANUAL' | 'AUTOMATIC';
  readonly automaticPlanPanel?: ReactNode;
  readonly announcement?: string;
  readonly storageMode?: 'LOCAL' | 'CLOUD';
}

export function ManualPlanWorkspace({
  bundle,
  draft,
  setupWarnings,
  onDraftChange,
  onReturnToSetup,
  planMode = 'MANUAL',
  automaticPlanPanel,
  announcement = '',
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
  const memberJumpOptions = useMemo(
    () => deriveManualPlanMemberJumpOptions(schema),
    [schema],
  );

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
      <header className="setup-command-header plan-command-header">
        <div className="setup-command-header__context plan-command-header__context">
          <h2 className="plan-command-header__eyebrow">
            {planMode === 'AUTOMATIC' ? '자동 계획표' : '수동 계획표'}
          </h2>
          <h1 id="manual-plan-title" tabIndex={-1}>
            {bundle.project.title}
          </h1>
        </div>
        <div className="setup-command-header__actions">
          <button
            type="button"
            className="setup-command-header__action"
            onClick={onReturnToSetup}
          >
            설정으로 돌아가기
          </button>
        </div>
      </header>

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
        planMode={planMode}
        onSelect={setSelection}
        onEdit={handleEdit}
      />

      <details className="manual-result-disclosure">
        <summary>상세 계산과 전체 현황 보기</summary>
        <p className="help-text">
          숫자가 계산된 과정이나 전체 회원의 보름 결과를 확인할 때만 열어보세요.
        </p>
        <div className="manual-plan-jump-controls">
          <label className="manual-plan-date-jump">
            날짜 선택
            <select
              value={selection.date}
              onChange={(event) =>
                setSelection({
                  date: event.currentTarget.value,
                  memberKey: selection.memberKey,
                })}
            >
              {schema.dates.map((date) => (
                <option key={date.date} value={date.date}>
                  {date.displayLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="manual-plan-member-jump">
            회원 선택
            <select
              value={selection.memberKey}
              onChange={(event) =>
                setSelection({
                  date: selection.date,
                  memberKey: event.currentTarget.value,
                })}
            >
              {memberJumpOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
      </details>

    </main>
  );
}
