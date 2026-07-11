import {
  memberFieldId,
  type MemberDraft,
  type OpeningStateDraft,
  type OpeningStateField,
  type ProjectSetupIssue,
} from '../../application/project-setup';

const OPENING_FIELDS: readonly {
  readonly field: OpeningStateField;
  readonly label: string;
  readonly help?: string;
}[] = [
  {
    field: 'fortnightPvpOpeningCredit',
    label: '현재 보유 PVP',
  },
  {
    field: 'dailyCarryLeft',
    label: '현재 좌 잔액',
  },
  {
    field: 'dailyCarryRight',
    label: '현재 우 잔액',
  },
];

export interface OpeningStateFormProps {
  readonly member: MemberDraft;
  readonly issues: readonly ProjectSetupIssue[];
  readonly onChange: (patch: Partial<OpeningStateDraft>) => void;
  readonly onPvpTargetChange: (pvpTarget: string) => void;
}

function issueFor(
  issues: readonly ProjectSetupIssue[],
  memberKey: string,
  field: string,
): ProjectSetupIssue | undefined {
  return issues.find(
    (issue) =>
      issue.location.memberKey === memberKey && issue.location.field === field,
  );
}

export function OpeningStateForm({
  member,
  issues,
  onChange,
  onPvpTargetChange,
}: OpeningStateFormProps) {
  const pvpTargetIssue = issueFor(issues, member.memberKey, 'pvpTarget');
  const openingCredit = Number(member.openingState.fortnightPvpOpeningCredit);
  const target = Number(member.pvpTarget);
  const remainingPvp =
    Number.isFinite(openingCredit) && Number.isFinite(target)
      ? Math.max(0, target - openingCredit)
      : null;
  const confirmationIssue = issueFor(
    issues,
    member.memberKey,
    'openingStateConfirmed',
  );
  const confirmationId = memberFieldId(
    member.memberKey,
    'openingStateConfirmed',
  );

  return (
    <section className="opening-state-form" aria-labelledby="opening-state-title">
      <div>
        <h3 id="opening-state-title">시작값</h3>
      </div>

      <div className="form-grid opening-state-form__fields">
        <div className="field">
          <label htmlFor={memberFieldId(member.memberKey, 'pvpTarget')}>
            이번 보름 PVP 목표
          </label>
          <select
            id={memberFieldId(member.memberKey, 'pvpTarget')}
            value={member.pvpTarget}
            aria-invalid={pvpTargetIssue !== undefined}
            aria-describedby={
              pvpTargetIssue === undefined
                ? undefined
                : `${memberFieldId(member.memberKey, 'pvpTarget')}-error`
            }
            onChange={(event) => onPvpTargetChange(event.currentTarget.value)}
          >
            <option value="">선택해 주세요</option>
            <option value="2400">2,400 PV</option>
            <option value="1500">1,500 PV</option>
            <option value="700">700 PV</option>
          </select>
          {pvpTargetIssue === undefined ? null : (
            <p
              id={`${memberFieldId(member.memberKey, 'pvpTarget')}-error`}
              className="field-error"
            >
              {pvpTargetIssue.message}
            </p>
          )}
        </div>
        {OPENING_FIELDS.map(({ field, label, help }) => {
          const fieldIssue = issueFor(issues, member.memberKey, field);
          const fieldId = memberFieldId(member.memberKey, field);
          const errorId = `${fieldId}-error`;
          return (
            <div className="field" key={field}>
              <label htmlFor={fieldId}>{label}</label>
              <input
                id={fieldId}
                inputMode="numeric"
                value={member.openingState[field]}
                aria-invalid={fieldIssue !== undefined}
                aria-describedby={fieldIssue === undefined ? undefined : errorId}
                onChange={(event) => onChange({ [field]: event.currentTarget.value })}
              />
              {help === undefined ? null : <p className="field-help">{help}</p>}
              {fieldIssue !== undefined ? (
                <p id={errorId} className="field-error">
                  {fieldIssue.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {remainingPvp === null ? null : (
        <p className="opening-state-form__remaining" role="status">
          추가로 필요한 PVP <strong>{remainingPvp.toLocaleString('ko-KR')} PV</strong>
        </p>
      )}

      <label className="confirmation-field" htmlFor={confirmationId}>
        <input
          id={confirmationId}
          type="checkbox"
          checked={member.openingState.openingStateConfirmed}
          aria-invalid={confirmationIssue !== undefined}
          aria-describedby={
            confirmationIssue === undefined ? undefined : `${confirmationId}-error`
          }
          onChange={(event) =>
            onChange({ openingStateConfirmed: event.currentTarget.checked })
          }
        />
        <span>
          <strong>회사 시스템의 시작값을 확인했습니다.</strong>
        </span>
      </label>
      {confirmationIssue !== undefined ? (
        <p id={`${confirmationId}-error`} className="field-error">
          {confirmationIssue.message}
        </p>
      ) : null}
    </section>
  );
}
