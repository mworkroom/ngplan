import { useEffect, useMemo } from 'react';
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
import {
  ManualPlanCell,
  type ManualPlanCellMode,
  type ManualPlanMemberRegion,
} from './ManualPlanCell';
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
  { field: 'pvp', label: 'PVP', openingLabel: 'PVP 시작값' },
  { field: 'selfLeft', label: '좌', openingLabel: '좌 시작값' },
  { field: 'selfRight', label: '우', openingLabel: '우 시작값' },
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
  if (calculation.status === 'BLOCKED') {
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

function periodTotalFor(
  calculation: ManualPlanCalculationState,
  memberKey: string,
  field: ManualPlanField,
): number | null {
  if (calculation.status === 'BLOCKED') {
    return null;
  }
  const assessment = calculation.result.finalAssessmentByMember[memberKey];
  if (assessment === undefined) {
    return null;
  }
  return field === 'pvp'
    ? assessment.newPvpTotal
    : field === 'selfLeft'
      ? assessment.rawLeftTotal
      : assessment.rawRightTotal;
}

export function ManualPlanTable({
  schema,
  draft,
  calculation,
  selection,
  onSelect,
  onEdit,
}: ManualPlanTableProps) {
  const issues = calculation.status === 'CURRENT' ? [] : calculation.issues;
  const firstEditableDate = schema.dates.find(
    (date) => date.settlementMode === 'SETTLE',
  );
  const memberJumpOptions = useMemo(
    () => deriveManualPlanMemberJumpOptions(schema),
    [schema],
  );
  const rootMemberIndex = schema.members.findIndex(
    (member) => member.memberKey === schema.rootMemberKey,
  );
  const memberRegion = (memberIndex: number): ManualPlanMemberRegion =>
    memberIndex < rootMemberIndex
      ? 'LEFT'
      : memberIndex === rootMemberIndex
        ? 'ROOT'
        : 'RIGHT';
  const cellByKey = useMemo(
    () =>
      new Map(
        draft.cells.map((cell) => [manualPlanCellKey(cell.date, cell.memberKey), cell] as const),
      ),
    [draft],
  );

  useEffect(() => {
    document.getElementById(manualPlanMemberGroupDomId(schema.rootMemberKey))?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
    });
  }, [schema.rootMemberKey]);

  const focusMember = (memberKey: string): void => {
    const date = firstEditableDate;
    if (date === undefined) {
      return;
    }
    onSelect({ date: date.date, memberKey });
    window.setTimeout(() => {
      const heading = document.getElementById(manualPlanMemberGroupDomId(memberKey));
      const field = document.getElementById(
        manualPlanFieldDomId(date.date, memberKey, 'pvp'),
      );
      field?.focus({ preventScroll: true });
      heading?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    }, 0);
  };

  const focusDate = (dateValue: string): void => {
    const date = schema.dateByIso.get(dateValue);
    if (date === undefined) {
      return;
    }
    onSelect({ date: date.date, memberKey: selection.memberKey });
    window.setTimeout(() => {
      const targetId =
        date.settlementMode === 'SETTLE'
          ? manualPlanFieldDomId(date.date, selection.memberKey, 'pvp')
          : manualPlanDateHeaderDomId(date.date);
      const target = document.getElementById(targetId);
      const dateHeading = document.getElementById(manualPlanDateHeaderDomId(date.date));
      target?.focus({ preventScroll: true });
      dateHeading?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
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
            {schema.dates.length}일 · {schema.members.length}명 계획표
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

      <div
        className="manual-plan-scroll"
        aria-label="수동 계획표 가로 스크롤 영역"
        tabIndex={0}
      >
        <table className="manual-plan-table">
          <thead>
            <tr>
              <th className="manual-plan-table__date-heading" scope="col" rowSpan={2}>
                날짜
              </th>
              {schema.members.map((member, memberIndex) => (
                <th
                  id={manualPlanMemberGroupDomId(member.memberKey)}
                  className={`manual-plan-table__member-heading manual-plan-table__member-heading--${memberRegion(memberIndex).toLowerCase()} ${sheetMarkerClassName(member.sheetMarker)}`}
                  key={member.memberKey}
                  scope="colgroup"
                  colSpan={3}
                  tabIndex={-1}
                >
                  <strong>{markedMemberName(member.name, member.sheetMarker)}</strong>
                  <span>
                    회원번호 {member.memberId ?? '미입력'}
                    {member.duplicateLabel === null ? '' : ` · ${member.duplicateLabel}`}
                  </span>
                </th>
              ))}
              <th
                className="manual-plan-table__date-heading manual-plan-table__date-heading--end"
                scope="col"
                rowSpan={2}
              >
                날짜
              </th>
            </tr>
            <tr>
              {schema.members.flatMap((member, memberIndex) =>
                FIELD_DEFINITIONS.map(({ field, label, openingLabel }) => {
                  const openingValue =
                    field === 'pvp'
                      ? member.openingState.fortnightPvpOpeningCredit
                      : field === 'selfLeft'
                      ? member.openingState.dailyCarryLeft
                      : member.openingState.dailyCarryRight;
                  return (
                  <th
                    id={manualPlanColumnHeaderDomId(member.memberKey, field)}
                    className={`manual-plan-table__column-heading--${memberRegion(memberIndex).toLowerCase()}`}
                    key={`${member.memberKey}-${field}`}
                    scope="col"
                  >
                    <span>{label}</span>
                    <small aria-label={`${openingLabel} ${openingValue.toLocaleString('ko-KR')} PV`}>
                      {openingValue.toLocaleString('ko-KR')}
                    </small>
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
                </th>
                {schema.members.flatMap((member, memberIndex) => {
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
                        memberRegion={memberRegion(memberIndex)}
                        onChange={(value) => onEdit(date.date, member.memberKey, field, value)}
                        onSelect={() => onSelect({ date: date.date, memberKey: member.memberKey })}
                        onNavigateVertical={(direction) =>
                          navigateVertical(date.date, member.memberKey, field, direction)
                        }
                      />
                    );
                  });
                })}
                <th
                  className="manual-plan-table__date-cell manual-plan-table__date-cell--end"
                  scope="row"
                  tabIndex={-1}
                >
                  <span>{date.displayLabel}</span>
                </th>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="manual-plan-table__total-row">
              <th className="manual-plan-table__date-cell" scope="row">
                <span>이번 기간 총합</span>
              </th>
              {schema.members.flatMap((member, memberIndex) =>
                FIELD_DEFINITIONS.map(({ field, label }) => {
                  const value = periodTotalFor(calculation, member.memberKey, field);
                  const valueLabel =
                    value === null
                      ? '현재 계산 결과 없음'
                      : `${value.toLocaleString('ko-KR')} PV`;
                  return (
                    <td
                      className={`manual-plan-table__total-cell manual-plan-table__total-cell--${memberRegion(memberIndex).toLowerCase()}`}
                      key={`${member.memberKey}-${field}-total`}
                      headers={`${manualPlanMemberGroupDomId(member.memberKey)} ${manualPlanColumnHeaderDomId(member.memberKey, field)}`}
                      aria-label={`${member.displayLabel} 이번 기간 ${label} 총합 ${valueLabel}`}
                    >
                      <strong>{value === null ? '—' : value.toLocaleString('ko-KR')}</strong>
                    </td>
                  );
                }),
              )}
              <th
                className="manual-plan-table__date-cell manual-plan-table__date-cell--end"
                scope="row"
              >
                <span>이번 기간 총합</span>
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
