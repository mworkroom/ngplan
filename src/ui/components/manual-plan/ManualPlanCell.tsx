import type { KeyboardEvent } from 'react';
import {
  manualPlanCellDomId,
  manualPlanFieldDomId,
  type ManualPlanField,
  type ManualPlanIssue,
} from '../../../application/manual-plan';

export type ManualPlanCellMode = 'EDITABLE' | 'CONNECTED' | 'SKIPPED';
export type ManualPlanMemberRegion = 'LEFT' | 'ROOT' | 'RIGHT';
export type ManualPlanCommissionLevel = 300 | 700 | 1500 | 2400;

export interface ManualPlanCellProps {
  readonly date: string;
  readonly dateLabel: string;
  readonly memberKey: string;
  readonly memberLabel: string;
  readonly field: ManualPlanField;
  readonly fieldLabel: 'PVP' | '좌' | '우';
  readonly headers: string;
  readonly mode: ManualPlanCellMode;
  readonly draftValue: string | undefined;
  readonly connectedValue: number | undefined;
  readonly calculationBlocked: boolean;
  readonly selected: boolean;
  readonly actualDifferenceMarked: boolean;
  readonly issue: ManualPlanIssue | undefined;
  readonly anchorCell: boolean;
  readonly memberRegion: ManualPlanMemberRegion;
  readonly commissionLevel: ManualPlanCommissionLevel | null;
  readonly onChange: (value: string) => void;
  readonly onSelect: () => void;
  readonly onNavigateVertical: (direction: -1 | 1) => void;
}

const PV_FORMATTER = new Intl.NumberFormat('ko-KR');

export function ManualPlanCell({
  date,
  dateLabel,
  memberKey,
  memberLabel,
  field,
  fieldLabel,
  headers,
  mode,
  draftValue,
  connectedValue,
  calculationBlocked,
  selected,
  actualDifferenceMarked,
  issue,
  anchorCell,
  memberRegion,
  commissionLevel,
  onChange,
  onSelect,
  onNavigateVertical,
}: ManualPlanCellProps) {
  const inputId = manualPlanFieldDomId(date, memberKey, field);
  const errorId = `${inputId}-error`;
  const className = [
    'manual-plan-cell',
    `manual-plan-cell--${mode.toLowerCase()}`,
    `manual-plan-cell--field-${field.toLowerCase()}`,
    `manual-plan-cell--member-${memberRegion.toLowerCase()}`,
    selected ? 'manual-plan-cell--selected' : '',
    actualDifferenceMarked ? 'manual-plan-cell--actual-difference' : '',
    issue === undefined ? '' : 'manual-plan-cell--error',
  ]
    .filter(Boolean)
    .join(' ');
  const accessibleContext = `${dateLabel} ${memberLabel} ${fieldLabel}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    onNavigateVertical(event.shiftKey ? -1 : 1);
  };

  return (
    <td
      id={anchorCell ? manualPlanCellDomId(date, memberKey) : undefined}
      className={className}
      headers={headers}
      data-commission-level={commissionLevel ?? undefined}
      data-actual-difference={actualDifferenceMarked ? 'true' : undefined}
      tabIndex={anchorCell ? -1 : undefined}
      onClick={onSelect}
    >
      {mode === 'EDITABLE' ? (
        <>
          <input
            id={inputId}
            className="manual-plan-input"
            aria-label={`${accessibleContext} 계획 PV`}
            aria-invalid={issue !== undefined}
            aria-describedby={issue === undefined ? undefined : errorId}
            inputMode="numeric"
            value={draftValue ?? ''}
            onChange={(event) => onChange(event.currentTarget.value)}
            onFocus={onSelect}
            onKeyDown={handleKeyDown}
          />
          {issue === undefined ? null : (
            <span id={errorId} className="manual-plan-cell__error">
              {issue.message}
            </span>
          )}
        </>
      ) : mode === 'SKIPPED' ? (
        <span className="manual-plan-cell__locked" aria-label={`${accessibleContext} 정산 제외 0`}>
          <span aria-hidden="true">0</span>
        </span>
      ) : (
        <span
          className="manual-plan-cell__aggregate"
          aria-label={`${accessibleContext} 조직 합계 ${
            calculationBlocked || connectedValue === undefined
              ? '현재 결과 없음'
              : `${connectedValue} PV`
          }`}
        >
          <span aria-hidden="true">
            {calculationBlocked || connectedValue === undefined
              ? '—'
              : PV_FORMATTER.format(connectedValue)}
          </span>
        </span>
      )}
    </td>
  );
}
