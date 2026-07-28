import { useEffect, useMemo } from 'react';
import {
  deriveManualPlanAchievementTargets,
  deriveManualPlanWorksheetCellView,
  manualPlanCellKey,
  manualPlanColumnHeaderDomId,
  manualPlanDateHeaderDomId,
  manualPlanFieldDomId,
  manualPlanMemberGroupDomId,
  type ManualPlanCalculationState,
  type ManualPlanAchievementTargets,
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
  type ManualPlanCommissionLevel,
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
  readonly planMode?: 'MANUAL' | 'AUTOMATIC';
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

const DATE_COLUMN_WIDTH_PX = 50;
const PVP_COLUMN_WIDTH_PX = 60;
const SIDE_COLUMN_WIDTH_PX = 54;
const MEMBER_COLUMN_WIDTH_PX =
  PVP_COLUMN_WIDTH_PX + SIDE_COLUMN_WIDTH_PX * 2;

interface AchievementBalances {
  readonly pvp: number;
  readonly selfLeft: number;
  readonly selfRight: number;
}

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

function achievementBalancesFor(
  calculation: ManualPlanCalculationState,
  targetsByMember: ReadonlyMap<string, ManualPlanAchievementTargets>,
  memberKey: string,
): AchievementBalances | null {
  if (calculation.status === 'BLOCKED') {
    return null;
  }
  const assessment = calculation.result.finalAssessmentByMember[memberKey];
  if (assessment === undefined) {
    return null;
  }
  const targets = targetsByMember.get(memberKey);
  if (targets === undefined) {
    return null;
  }
  return {
    pvp: targets.pvp - assessment.newPvpTotal,
    selfLeft: targets.selfLeft - assessment.rawLeftTotal,
    selfRight: targets.selfRight - assessment.rawRightTotal,
  };
}

function formatAchievementBalance(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const formatted = Math.abs(value).toLocaleString('ko-KR');
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : '0';
}

function commissionLevelFor(
  calculation: ManualPlanCalculationState,
  date: string,
  memberKey: string,
): ManualPlanCommissionLevel | null {
  if (calculation.status === 'BLOCKED') {
    return null;
  }
  const settlement = calculation.result.dailySettlementByDateAndMember[date]?.[memberKey];
  if (settlement?.commissionOccurred !== true) {
    return null;
  }
  switch (settlement.commissionTier) {
    case 300:
    case 700:
    case 1500:
    case 2400:
      return settlement.commissionTier;
    default:
      return null;
  }
}

export function ManualPlanTable({
  schema,
  draft,
  calculation,
  selection,
  planMode = 'MANUAL',
  onSelect,
  onEdit,
}: ManualPlanTableProps) {
  const issues = calculation.status === 'CURRENT' ? [] : calculation.issues;
  const achievementTargetsByMember = useMemo(
    () => deriveManualPlanAchievementTargets(schema),
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
    <section
      className="manual-plan-sheet"
      aria-label={planMode === 'AUTOMATIC' ? '자동 계획표' : '수동 계획표'}
    >
      <div
        className="manual-plan-scroll"
        aria-label={`${planMode === 'AUTOMATIC' ? '자동' : '수동'} 계획표 가로 스크롤 영역`}
        tabIndex={0}
      >
        <table
          className="manual-plan-table"
          style={{
            width: `${DATE_COLUMN_WIDTH_PX * 2 + schema.members.length * MEMBER_COLUMN_WIDTH_PX}px`,
          }}
        >
          <colgroup>
            <col className="manual-plan-table__date-column" />
            {schema.members.flatMap((member) =>
              FIELD_DEFINITIONS.map(({ field }) => (
                <col
                  className={`manual-plan-table__value-column manual-plan-table__value-column--field-${field.toLowerCase()}`}
                  key={`${member.memberKey}-${field}-column`}
                />
              )),
            )}
            <col className="manual-plan-table__date-column" />
          </colgroup>
          <thead>
            <tr>
              <th className="manual-plan-table__date-heading" scope="col">
                ID
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
              >
                ID
              </th>
            </tr>
            <tr>
              <th className="manual-plan-table__date-heading" scope="col">
                목표값
              </th>
              {schema.members.flatMap((member, memberIndex) => {
                const targets = achievementTargetsByMember.get(member.memberKey);
                return FIELD_DEFINITIONS.map(({ field, label }) => {
                  const value = targets?.[field] ?? null;
                  const valueLabel = value === null ? '—' : value.toLocaleString('ko-KR');
                  return (
                    <th
                      className={`manual-plan-table__target-heading manual-plan-table__target-heading--field-${field.toLowerCase()} manual-plan-table__target-heading--${memberRegion(memberIndex).toLowerCase()}`}
                      key={`${member.memberKey}-${field}-target`}
                      scope="col"
                      aria-label={`${member.displayLabel} ${label} 목표값 ${valueLabel} PV`}
                    >
                      <strong className="manual-plan-table__target-value">
                        {valueLabel}
                      </strong>
                    </th>
                  );
                });
              })}
              <th
                className="manual-plan-table__date-heading manual-plan-table__date-heading--end"
                scope="col"
              >
                목표값
              </th>
            </tr>
            <tr>
              <th className="manual-plan-table__date-heading" scope="col">
                잔액
              </th>
              {schema.members.flatMap((member, memberIndex) => {
                const balances = achievementBalancesFor(
                  calculation,
                  achievementTargetsByMember,
                  member.memberKey,
                );
                return FIELD_DEFINITIONS.map(({ field, label }) => {
                  const value = balances?.[field] ?? null;
                  return (
                    <th
                      className={`manual-plan-table__achievement-heading manual-plan-table__achievement-heading--field-${field.toLowerCase()} manual-plan-table__achievement-heading--${memberRegion(memberIndex).toLowerCase()}`}
                      key={`${member.memberKey}-${field}-achievement`}
                      scope="col"
                      title={`${label} 목표값 - 현재 합계`}
                      aria-label={`${member.displayLabel} ${label} 잔액 ${formatAchievementBalance(value)} PV`}
                    >
                      <strong
                        className={
                          value !== null && value <= 0
                            ? 'manual-plan-table__achievement-value manual-plan-table__achievement-value--met'
                            : 'manual-plan-table__achievement-value'
                        }
                      >
                        {formatAchievementBalance(value)}
                      </strong>
                    </th>
                  );
                });
              })}
              <th
                className="manual-plan-table__date-heading manual-plan-table__date-heading--end"
                scope="col"
              >
                잔액
              </th>
            </tr>
            <tr>
              <th className="manual-plan-table__date-heading" scope="col">
                날짜
              </th>
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
                    className={`manual-plan-table__column-heading manual-plan-table__column-heading--field-${field.toLowerCase()} manual-plan-table__column-heading--${memberRegion(memberIndex).toLowerCase()}`}
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
              <th
                className="manual-plan-table__date-heading manual-plan-table__date-heading--end"
                scope="col"
              >
                날짜
              </th>
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
                        commissionLevel={
                          field === 'pvp'
                            ? commissionLevelFor(calculation, date.date, member.memberKey)
                            : null
                        }
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
                <span>합계</span>
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
                      className={`manual-plan-table__total-cell manual-plan-table__total-cell--field-${field.toLowerCase()} manual-plan-table__total-cell--${memberRegion(memberIndex).toLowerCase()}`}
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
                <span>합계</span>
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
