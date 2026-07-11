import { useMemo } from 'react';
import {
  deriveManualPlanValidationSummaryItems,
  manualPlanCellDomId,
  manualPlanMemberGroupDomId,
  type ManualPlanIssue,
  type ManualPlanSchema,
  type ManualPlanValidationSummaryItem,
} from '../../../application/manual-plan';

export interface ManualPlanValidationSummaryProps {
  readonly issues: readonly ManualPlanIssue[];
  readonly schema: ManualPlanSchema;
  readonly blocked: boolean;
  readonly onSelectContext: (date: string, memberKey: string) => void;
}

export interface ManualPlanSelectedContextIssuesProps {
  readonly issues: readonly ManualPlanIssue[];
  readonly schema: ManualPlanSchema;
  readonly selectedDate: string;
  readonly selectedMemberKey: string;
}

function targetCandidates(item: ManualPlanValidationSummaryItem): readonly string[] {
  const { date, memberKey } = item.issue.location;
  return [
    item.targetId,
    ...(date === undefined || memberKey === undefined
      ? []
      : [manualPlanCellDomId(date, memberKey)]),
    ...(memberKey === undefined ? [] : [manualPlanMemberGroupDomId(memberKey)]),
    'manual-plan-workspace',
  ];
}

function focusIssueTarget(
  item: ManualPlanValidationSummaryItem,
  schema: ManualPlanSchema,
  onSelectContext: (date: string, memberKey: string) => void,
): void {
  const { date, memberKey } = item.issue.location;
  if (
    date !== undefined &&
    memberKey !== undefined &&
    schema.dateByIso.has(date) &&
    schema.memberByKey.has(memberKey)
  ) {
    onSelectContext(date, memberKey);
  }

  for (const targetId of targetCandidates(item)) {
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLElement)) {
      continue;
    }
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    target.focus();
    return;
  }
}

export function ManualPlanValidationSummary({
  issues,
  schema,
  blocked,
  onSelectContext,
}: ManualPlanValidationSummaryProps) {
  const items = useMemo(
    () => deriveManualPlanValidationSummaryItems(issues, schema),
    [issues, schema],
  );
  const firstError = items.find((item) => item.issue.severity === 'ERROR');
  const errorCount = items.filter((item) => item.issue.severity === 'ERROR').length;
  const warningCount = items.length - errorCount;
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className={`validation-summary${blocked ? ' validation-summary--error' : ''}`}
      aria-labelledby="manual-plan-validation-title"
    >
        <div className="manual-plan-validation__heading">
          <h2 id="manual-plan-validation-title" className="validation-summary__title">
            {blocked
              ? `입력 확인 필요 ${errorCount}개${
                  warningCount === 0 ? '' : ` · 안내 ${warningCount}개`
                }`
              : `확인이 필요한 안내 ${items.length}개`}
          </h2>
          {firstError === undefined ? null : (
            <button
              type="button"
              className="secondary-button manual-plan-validation__first-error"
              onClick={() => focusIssueTarget(firstError, schema, onSelectContext)}
            >
              첫 오류로 이동
            </button>
          )}
        </div>
        <ul className="validation-summary__list manual-plan-validation__list">
          {items.map((item, index) => (
            <li key={`${item.targetId}-${item.issue.code}-${index}`}>
              <div>
                <strong>{item.contextLabel}</strong>
                <span>{item.issue.message}</span>
                {item.issue.suggestion === undefined ? null : (
                  <small>{item.issue.suggestion}</small>
                )}
              </div>
              <button
                type="button"
                className="text-button"
                aria-label={`${item.contextLabel} 문제 위치로 이동`}
                onClick={() => focusIssueTarget(item, schema, onSelectContext)}
              >
                위치로 이동
              </button>
            </li>
          ))}
        </ul>
    </section>
  );
}

export function ManualPlanSelectedContextIssues({
  issues,
  schema,
  selectedDate,
  selectedMemberKey,
}: ManualPlanSelectedContextIssuesProps) {
  const selectedItems = useMemo(
    () =>
      deriveManualPlanValidationSummaryItems(issues, schema).filter(
        (item) =>
          item.issue.location.date === selectedDate &&
          item.issue.location.memberKey === selectedMemberKey,
      ),
    [issues, schema, selectedDate, selectedMemberKey],
  );
  if (selectedItems.length === 0) {
    return null;
  }
  return (
    <aside
      className="manual-plan-context-errors"
      aria-labelledby="manual-plan-context-errors-title"
    >
      <h2 id="manual-plan-context-errors-title">선택한 입력 확인</h2>
      <ul>
        {selectedItems.map((item, index) => (
          <li key={`${item.targetId}-${item.issue.code}-selected-${index}`}>
            {item.issue.message}
          </li>
        ))}
      </ul>
    </aside>
  );
}
