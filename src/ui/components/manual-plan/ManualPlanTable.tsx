import { useMemo } from 'react';
import {
  deriveManualPlanMemberJumpOptions,
  deriveManualPlanWorksheetCellView,
  manualPlanCellKey,
  manualPlanColumnHeaderDomId,
  manualPlanDateHeaderDomId,
  manualPlanFieldDomId,
  manualPlanMemberGroupDomId,
  type ManualPlanCalculationState,
  type ManualPlanDateDescriptor,
  type ManualPlanDraft,
  type ManualPlanField,
  type ManualPlanIssue,
  type ManualPlanMemberDescriptor,
  type ManualPlanSchema,
} from '../../../application/manual-plan';
import { ManualPlanCell, type ManualPlanCellMode } from './ManualPlanCell';
import {
  markedMemberName,
  sheetMarkerClassName,
} from '../../member-marker';

export interface ManualPlanSelection {
  readonly date: string;
  readonly memberKey: string;
}

export interface ManualPlanTableProps {
  readonly schema: ManualPlanSchema;
  readonly draft: ManualPlanDraft;
  readonly calculation: ManualPlanCalculationState;
  readonly selection: ManualPlanSelection;
  readonly onSelect: (selection: ManualPlanSelection) => void;
  readonly onEdit: (
    date: string,
    memberKey: string,
    field: ManualPlanField,
    value: string,
  ) => void;
}

const FIELD_DEFINITIONS = [
  { field: 'pvp', label: 'PVP' },
  { field: 'selfLeft', label: '좌' },
  { field: 'selfRight', label: '우' },
] as const;

function draftCell(
  schema: ManualPlanSchema,
  draft: ManualPlanDraft,
  date: string,
  memberKey: string,
) {
  const index = schema.cellIndexByKey.get(manualPlanCellKey(date, memberKey));
  return index === undefined ? undefined : draft.cells[index];
}

function worksheetView(
  calculation: ManualPlanCalculationState,
  date: string,
  memberKey: string,
 ) {
  if (calculation.status !== 'CURRENT') {
    return undefined;
  }
  return deriveManualPlanWorksheetCellView(calculation.result, date, memberKey) ?? undefined;
}

function modeFor(
  date: ManualPlanDateDescriptor,
  member: ManualPlanMemberDescriptor,
  field: ManualPlanField,
): ManualPlanCellMode {
  if (date.settlementMode === 'SKIP_NO_INPUT') {
    return 'SKIPPED';
  }
  if (field === 'pvp') {
    return 'EDITABLE';
  }
  const directionMode = field === 'selfLeft' ? member.leftMode : member.rightMode;
  return directionMode === 'SELF' ? 'EDITABLE' : 'CONNECTED';
}

function issueFor(
  issues: readonly ManualPlanIssue[],
  date: string,
  memberKey: string,
  field: ManualPlanField,
): ManualPlanIssue | undefined {
  return issues.find(
    (issue) =>
      issue.severity === 'ERROR' &&
      issue.location.date === date &&
      issue.location.memberKey === memberKey &&
      issue.location.field === field,
  );
}

export function ManualPlanTable({
  schema,
  draft,
  calculation,
  selection,
  onSelect,
  onEdit,
}: ManualPlanTableProps) {
  const issues = calculation.status === 'BLOCKED' ? calculation.issues : [];
  const firstEditableDate = schema.dates.find(
    (date) => date.settlementMode === 'SETTLE',
  );
  const memberJumpOptions = useMemo(
    () => deriveManualPlanMemberJumpOptions(schema),
    [schema],
  );
  const cellByKey = useMemo(
    () =>
      new Map(
        draft.cells.map((cell) => [manualPlanCellKey(cell.date, cell.memberKey), cell] as const),
      ),
    [draft],
  );

  const focusMember = (memberKey: string): void => {
    const date = firstEditableDate;
    if (date === undefined) {
      return;
    }
    onSelect({ date: date.date, memberKey });
    document.getElementById(manualPlanMemberGroupDomId(memberKey))?.scrollIntoView?.({
      block: 'nearest',
      inline: 'start',
    });
    window.setTimeout(() => {
      document.getElementById(manualPlanFieldDomId(date.date, memberKey, 'pvp'))?.focus();
    }, 0);
  };

  const focusDate = (dateValue: string): void => {
    const date = schema.dateByIso.get(dateValue);
    if (date === undefined) {
      return;
    }
    onSelect({ date: date.date, memberKey: selection.memberKey });
    document.getElementById(manualPlanDateHeaderDomId(date.date))?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
    window.setTimeout(() => {
      const targetId =
        date.settlementMode === 'SETTLE'
          ? manualPlanFieldDomId(date.date, selection.memberKey, 'pvp')
          : manualPlanDateHeaderDomId(date.date);
      document.getElementById(targetId)?.focus();
    }, 0);
  };

  const navigateVertical = (
    currentDate: string,
    memberKey: string,
    field: ManualPlanField,
    direction: -1 | 1,
  ): void => {
    let index = schema.dates.findIndex((date) => date.date === currentDate) + direction;
    while (index >= 0 && index < schema.dates.length) {
      const candidate = schema.dates[index]!;
      if (candidate.settlementMode === 'SETTLE') {
        onSelect({ date: candidate.date, memberKey });
        document.getElementById(
          manualPlanFieldDomId(candidate.date, memberKey, field),
        )?.focus();
        return;
      }
      index += direction;
    }
  };

  return (
    <section className="manual-plan-sheet" aria-labelledby="manual-plan-table-title">
      <div className="manual-plan-toolbar">
        <div>
          <h2 id="manual-plan-table-title" className="panel__title">
            수동 계획표
          </h2>
          <p className="panel__description">
            날짜별 PVP와 직접 입력 가능한 좌·우 PV를 입력합니다.
          </p>
          <p className="help-text">
            {schema.dates.length}일 · {schema.members.length}명 계획 세션
          </p>
        </div>
        <div className="manual-plan-jump-controls">
          <label className="manual-plan-date-jump">
            날짜 결과 보기
            <select
              value={selection.date}
              onChange={(event) => focusDate(event.currentTarget.value)}
            >
              {schema.dates.map((date) => (
                <option key={date.date} value={date.date}>
                  {date.displayLabel}
                  {date.settlementMode === 'SKIP_NO_INPUT' ? ' · 정산 제외' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="manual-plan-member-jump">
            회원으로 이동
            <select
              value={selection.memberKey}
              onChange={(event) => focusMember(event.currentTarget.value)}
            >
              {memberJumpOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="manual-plan-scroll" aria-label="수동 계획표 가로 스크롤 영역" tabIndex={0}>
        <table className="manual-plan-table">
          <thead>
            <tr>
              <th className="manual-plan-table__date-heading" scope="col" rowSpan={2}>
                날짜
              </th>
              {schema.members.map((member) => (
                <th
                  id={manualPlanMemberGroupDomId(member.memberKey)}
                  className={`manual-plan-table__member-heading ${sheetMarkerClassName(member.sheetMarker)}`}
                  key={member.memberKey}
                  scope="colgroup"
                  colSpan={3}
                  tabIndex={-1}
                >
                  <strong>{markedMemberName(member.name, member.sheetMarker)}</strong>
                  <span>
                    목표 {member.pvpTarget.toLocaleString('ko-KR')} PV
                    {member.memberId === null ? '' : ` · ID ${member.memberId}`}
                    {member.duplicateLabel === null ? '' : ` · ${member.duplicateLabel}`}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {schema.members.flatMap((member) =>
                FIELD_DEFINITIONS.map(({ field, label }) => {
                  const openingValue =
                    field === 'pvp'
                      ? member.openingState.fortnightPvpOpeningCredit
                      : field === 'selfLeft'
                        ? member.openingState.dailyCarryLeft
                        : member.openingState.dailyCarryRight;
                  return (
                  <th
                    id={manualPlanColumnHeaderDomId(member.memberKey, field)}
                    key={`${member.memberKey}-${field}`}
                    scope="col"
                  >
                    <span>{label}</span>
                    <small>시작 {openingValue.toLocaleString('ko-KR')}</small>
                  </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {schema.dates.map((date) => (
              <tr
                className={
                  date.settlementMode === 'SKIP_NO_INPUT'
                    ? 'manual-plan-table__skipped-row'
                    : undefined
                }
                key={date.date}
              >
                <th
                  id={manualPlanDateHeaderDomId(date.date)}
                  className="manual-plan-table__date-cell"
                  scope="row"
                  tabIndex={-1}
                >
                  <span>{date.displayLabel}</span>
                  {date.settlementMode === 'SKIP_NO_INPUT' ? (
                    <small>일요일 · 정산 제외</small>
                  ) : null}
                </th>
                {schema.members.flatMap((member) => {
                  const cell =
                    cellByKey.get(manualPlanCellKey(date.date, member.memberKey)) ??
                    draftCell(schema, draft, date.date, member.memberKey);
                  const raw = worksheetView(calculation, date.date, member.memberKey);
                  const selected =
                    selection.date === date.date &&
                    selection.memberKey === member.memberKey;
                  return FIELD_DEFINITIONS.map(({ field, label }, fieldIndex) => {
                    const mode = modeFor(date, member, field);
                    const connectedValue =
                      field === 'selfLeft'
                        ? raw?.organizationLeft
                        : field === 'selfRight'
                          ? raw?.organizationRight
                          : undefined;
                    const headers = [
                      manualPlanDateHeaderDomId(date.date),
                      manualPlanMemberGroupDomId(member.memberKey),
                      manualPlanColumnHeaderDomId(member.memberKey, field),
                    ].join(' ');
                    return (
                      <ManualPlanCell
                        key={`${date.date}-${member.memberKey}-${field}`}
                        date={date.date}
                        dateLabel={date.displayLabel}
                        memberKey={member.memberKey}
                        memberLabel={member.displayLabel}
                        field={field}
                        fieldLabel={label}
                        headers={headers}
                        mode={mode}
                        draftValue={cell?.[field]}
                        connectedValue={connectedValue}
                        calculationBlocked={calculation.status === 'BLOCKED'}
                        selected={selected}
                        issue={issueFor(issues, date.date, member.memberKey, field)}
                        anchorCell={fieldIndex === 0}
                        onChange={(value) => onEdit(date.date, member.memberKey, field, value)}
                        onSelect={() => onSelect({ date: date.date, memberKey: member.memberKey })}
                        onNavigateVertical={(direction) =>
                          navigateVertical(date.date, member.memberKey, field, direction)
                        }
                      />
                    );
                  });
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
