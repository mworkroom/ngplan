import {
  memberFieldId,
  type MemberDraft,
  type OpeningStateDraft,
  type OpeningStateField,
  type ProjectSetupIssue,
} from '../../application/project-setup';
import { pvpTargetForLevel } from '../../domain/constants';

const OPENING_FIELDS: readonly {
  readonly field: OpeningStateField;
  readonly label: string;
  readonly help: string;
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
}: OpeningStateFormProps) {
  const level = Number(member.level);
  const pvpTarget = Number.isInteger(level) && level > 0 ? pvpTargetForLevel(level) : '';
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
          <label htmlFor={memberFieldId(member.memberKey, 'pvpTarget')}>PVP 목표값</label>
          <input
            id={memberFieldId(member.memberKey, 'pvpTarget')}
            value={pvpTarget}
            readOnly
            aria-readonly="true"
          />
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
              <p className="field-help">{help}</p>
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
          aria-describedby={
            confirmationIssue === undefined ? undefined : `${confirmationId}-error`
          }
          onChange={(event) =>
            onChange({ openingStateConfirmed: event.currentTarget.checked })
          }
        />
        <span>
          <strong>시작값을 확인했습니다.</strong>
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
