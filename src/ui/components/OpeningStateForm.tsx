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
    help: '회사 시스템에 이미 있는 값으로, 개인 PVP 목표에서 차감합니다.',
  },
  {
    field: 'dailyCarryPvp',
    label: '일일 PVP 잔액',
    help: '첫 계산일의 일일 커미션 장부에 사용합니다.',
  },
  {
    field: 'dailyCarryLeft',
    label: '일일 좌 잔액',
    help: '첫 계산일의 왼쪽 이월 잔액입니다.',
  },
  {
    field: 'dailyCarryRight',
    label: '일일 우 잔액',
    help: '첫 계산일의 오른쪽 이월 잔액입니다.',
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
  const parsedLevel = Number(member.level);
  const target = Number.isInteger(parsedLevel) && parsedLevel > 0
    ? pvpTargetForLevel(parsedLevel)
    : null;
  const parsedOpening = Number(member.openingState.fortnightPvpOpeningCredit);
  const remaining =
    target !== null && Number.isSafeInteger(parsedOpening) && parsedOpening >= 0
      ? Math.max(0, target - parsedOpening)
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

      <dl className="pvp-target-summary" aria-label="레벨별 PVP 목표 안내">
        <div>
          <dt>레벨별 PVP 목표</dt>
          <dd>{target === null ? '레벨 확인 필요' : target.toLocaleString()}</dd>
        </div>
        <div>
          <dt>추가 필요 PVP</dt>
          <dd>{remaining === null ? '시작값 확인 필요' : remaining.toLocaleString()}</dd>
        </div>
      </dl>

      <div className="form-grid opening-state-form__fields">
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
