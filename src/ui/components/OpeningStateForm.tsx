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
    field: 'cumulativePvp',
    label: 'PVP 시작값',
  },
  {
    field: 'dailyCarryLeft',
    label: '좌 시작값',
  },
  {
    field: 'dailyCarryRight',
    label: '우 시작값',
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
        <hr className="section-divider" />
        <h2 id="opening-state-title">시작값</h2>
      </div>

      <div className="form-grid opening-state-form__fields">
        <div className="field">
          <label htmlFor={memberFieldId(member.memberKey, 'pvpTarget')}>
            이번 기간 PVP 목표
          </label>
          <select
            id={memberFieldId(member.memberKey, 'pvpTarget')}
            value={member.pvpTarget}
            aria-invalid={pvpTargetIssue !== undefined}
            onChange={(event) => onPvpTargetChange(event.currentTarget.value)}
          >
            <option value="">선택해 주세요</option>
            <option value="2400">2,400 PV</option>
            <option value="1500">1,500 PV</option>
            <option value="700">700 PV</option>
          </select>
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
                onFocus={(event) => {
                  if (event.currentTarget.value === '0') {
                    event.currentTarget.select();
                  }
                }}
                onClick={(event) => {
                  if (event.currentTarget.value === '0') {
                    event.currentTarget.select();
                  }
                }}
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



      <label className="confirmation-field" htmlFor={confirmationId}>
        <input
          id={confirmationId}
          type="checkbox"
          checked={member.openingState.openingStateConfirmed}
          aria-invalid={confirmationIssue !== undefined}
          onChange={(event) =>
            onChange({ openingStateConfirmed: event.currentTarget.checked })
          }
        />
        <span>
          <strong>시작값이 맞게 입력되었으면 확인 버튼을 클릭해주세요.</strong>
        </span>
      </label>
    </section>
  );
}
