import type {
  ProjectSetupIssue,
  ProjectSetupValidation,
} from '../../application/project-setup';

export interface ValidationSummaryProps {
  readonly validation: ProjectSetupValidation;
  readonly onNavigate: (issue: ProjectSetupIssue) => void;
}

function IssueList({
  title,
  issues,
  onNavigate,
}: {
  readonly title: string;
  readonly issues: readonly ProjectSetupIssue[];
  readonly onNavigate: (issue: ProjectSetupIssue) => void;
}) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <section>
      <h3 className="validation-summary__title">{title}</h3>
      <ul className="validation-summary__list">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.location.memberKey ?? 'project'}-${index}`}>
            <button
              type="button"
              className="text-button validation-summary__link"
              onClick={() => onNavigate(issue)}
            >
              {issue.message}
            </button>
            {issue.suggestion === undefined ? null : (
              <p className="field-help">{issue.suggestion}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ValidationSummary({
  validation,
  onNavigate,
}: ValidationSummaryProps) {
  return (
    <section
      className={`validation-summary${
        validation.errors.length > 0 ? ' validation-summary--error' : ''
      }`}
      aria-label="설정 검증 결과"
      role={validation.errors.length > 0 ? 'alert' : 'status'}
    >
      {validation.issues.length === 0 ? (
        <p>현재 설정에서 발견된 오류나 경고가 없습니다.</p>
      ) : (
        <>
          <IssueList
            title={`완료를 막는 오류 ${validation.errors.length}개`}
            issues={validation.errors}
            onNavigate={onNavigate}
          />
          <IssueList
            title={`확인이 필요한 경고 ${validation.warnings.length}개`}
            issues={validation.warnings}
            onNavigate={onNavigate}
          />
        </>
      )}
    </section>
  );
}
