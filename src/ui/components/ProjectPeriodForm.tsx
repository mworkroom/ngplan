import {
  projectFieldId,
  type ProjectSetupDraft,
  type ProjectSetupIssue,
} from '../../application/project-setup';

type ProjectPeriodPatch = Partial<
  Pick<ProjectSetupDraft, 'year' | 'month' | 'half'>
>;

export interface ProjectPeriodFormProps {
  readonly draft: ProjectSetupDraft;
  readonly issues: readonly ProjectSetupIssue[];
  readonly onPeriodChange: (patch: ProjectPeriodPatch) => void;
  readonly onTitleChange: (title: string) => void;
  readonly onRestoreDerivedTitle: () => void;
}

function issueFor(
  issues: readonly ProjectSetupIssue[],
  field: string,
): ProjectSetupIssue | undefined {
  return issues.find(
    (issue) => issue.location.memberKey === undefined && issue.location.field === field,
  );
}

export function ProjectPeriodForm({
  draft,
  issues,
  onPeriodChange,
  onTitleChange,
  onRestoreDerivedTitle,
}: ProjectPeriodFormProps) {
  const yearIssue = issueFor(issues, 'period.year');
  const monthIssue = issueFor(issues, 'period.month');
  const titleIssue = issueFor(issues, 'title');
  const yearErrorId = `${projectFieldId('period.year')}-error`;
  const monthErrorId = `${projectFieldId('period.month')}-error`;
  const titleErrorId = `${projectFieldId('title')}-error`;

  return (
    <section className="panel" aria-labelledby="project-period-title">
      <div className="panel__header">
        <div>
          <h2 id="project-period-title" className="panel__title">
            기간 설정
          </h2>
        </div>
        <span className="status-badge status-badge--editing">IN_PROGRESS</span>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor={projectFieldId('period.year')}>대상 연도</label>
          <input
            id={projectFieldId('period.year')}
            inputMode="numeric"
            value={draft.year}
            aria-invalid={yearIssue !== undefined}
            aria-describedby={yearIssue === undefined ? undefined : yearErrorId}
            onChange={(event) => onPeriodChange({ year: event.currentTarget.value })}
          />
          {yearIssue !== undefined ? (
            <p id={yearErrorId} className="field-error">
              {yearIssue.message}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor={projectFieldId('period.month')}>대상 월</label>
          <input
            id={projectFieldId('period.month')}
            inputMode="numeric"
            value={draft.month}
            aria-invalid={monthIssue !== undefined}
            aria-describedby={monthIssue === undefined ? undefined : monthErrorId}
            onChange={(event) => onPeriodChange({ month: event.currentTarget.value })}
          />
          {monthIssue !== undefined ? (
            <p id={monthErrorId} className="field-error">
              {monthIssue.message}
            </p>
          ) : null}
        </div>

        <div className="field field--full">
          <label htmlFor={projectFieldId('period.half')}>대상 반월</label>
          <select
            id={projectFieldId('period.half')}
            value={draft.half}
            onChange={(event) =>
              onPeriodChange({
                half: event.currentTarget.value as ProjectSetupDraft['half'],
              })
            }
          >
            <option value="FIRST_HALF">상반기 · 1일~15일</option>
            <option value="SECOND_HALF">하반기 · 16일~말일</option>
          </select>
        </div>

        <div className="field field--full">
          <label htmlFor={projectFieldId('title')}>프로젝트 제목</label>
          <input
            id={projectFieldId('title')}
            value={draft.title}
            aria-invalid={titleIssue !== undefined}
            aria-describedby={titleIssue === undefined ? undefined : titleErrorId}
            onChange={(event) => onTitleChange(event.currentTarget.value)}
          />
          {titleIssue !== undefined ? (
            <p id={titleErrorId} className="field-error">
              {titleIssue.message}
            </p>
          ) : null}
          <p className="field-help">
            {draft.titleSource === 'DERIVED'
              ? '기간을 바꾸면 제목도 함께 갱신됩니다.'
              : '직접 수정한 제목은 기간을 바꿔도 유지됩니다.'}
          </p>
          {draft.titleSource === 'MANUAL' ? (
            <button
              type="button"
              className="text-button"
              onClick={onRestoreDerivedTitle}
            >
              기간 기준 제목으로 되돌리기
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
