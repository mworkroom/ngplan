import { useEffect, useState } from 'react';
import {
  memberFieldId,
  type MemberDraft,
  type ProjectSetupIssue,
} from '../../application/project-setup';

type Side = Exclude<MemberDraft['placement']['sideAtParent'], null>;
type IdentityPatch = Partial<Pick<MemberDraft, 'memberId' | 'name' | 'level'>>;

export interface MemberFormProps {
  readonly member: MemberDraft;
  readonly issues: readonly ProjectSetupIssue[];
  readonly isRoot: boolean;
  readonly candidateParents: readonly MemberDraft[];
  readonly isSlotAvailable: (parentMemberKey: string, side: Side) => boolean;
  readonly onIdentityChange: (patch: IdentityPatch) => void;
  readonly onMove: (parentMemberKey: string, side: Side) => void;
  readonly onDetach: () => void;
  readonly onExclude: () => void;
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

export function MemberForm({
  member,
  issues,
  isRoot,
  candidateParents,
  isSlotAvailable,
  onIdentityChange,
  onMove,
  onDetach,
  onExclude,
}: MemberFormProps) {
  const [targetParentMemberKey, setTargetParentMemberKey] = useState(
    member.placement.parentMemberKey ?? '',
  );
  const [targetSide, setTargetSide] = useState<Side>(
    member.placement.sideAtParent ?? 'LEFT',
  );

  useEffect(() => {
    setTargetParentMemberKey(member.placement.parentMemberKey ?? '');
    setTargetSide(member.placement.sideAtParent ?? 'LEFT');
  }, [member.memberKey, member.placement.parentMemberKey, member.placement.sideAtParent]);

  const memberIdIssue = issueFor(issues, member.memberKey, 'memberId');
  const nameIssue = issueFor(issues, member.memberKey, 'name');
  const levelIssue = issueFor(issues, member.memberKey, 'level');
  const placementIssue = issueFor(issues, member.memberKey, 'parentMemberKey');
  const placementErrorId = `${memberFieldId(member.memberKey, 'parentMemberKey')}-error`;
  const isPlaced =
    member.placement.parentMemberKey !== null &&
    member.placement.sideAtParent !== null;
  const isCurrentPlacement =
    member.placement.parentMemberKey === targetParentMemberKey &&
    member.placement.sideAtParent === targetSide;
  const targetAvailable =
    targetParentMemberKey !== '' &&
    isSlotAvailable(targetParentMemberKey, targetSide);
  const canMove = isPlaced && targetAvailable && !isCurrentPlacement;

  const renderIdentityField = (
    field: 'memberId' | 'name' | 'level',
    label: string,
    issue: ProjectSetupIssue | undefined,
  ) => {
    const fieldId = memberFieldId(member.memberKey, field);
    const errorId = `${fieldId}-error`;
    return (
      <div className="field">
        <label htmlFor={fieldId}>{label}</label>
        <input
          id={fieldId}
          inputMode={field === 'level' ? 'numeric' : undefined}
          value={member[field]}
          aria-invalid={issue !== undefined}
          aria-describedby={issue === undefined ? undefined : errorId}
          onChange={(event) => onIdentityChange({ [field]: event.currentTarget.value })}
        />
        {issue === undefined ? null : (
          <p id={errorId} className="field-error">
            {issue.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="member-form" aria-labelledby="member-form-title">
      <div>
        <div className="panel__header">
          <div>
            <h2 id="member-form-title" className="panel__title">
              회원 상세
            </h2>
            <p className="panel__description">
              내부 키 {member.memberKey}
            </p>
          </div>
          <span className="status-badge">{isRoot ? '루트 회원' : '활성 회원'}</span>
        </div>
        <div className="form-grid form-grid--single">
          {renderIdentityField('memberId', '회원 ID', memberIdIssue)}
          {renderIdentityField('name', '회원 이름', nameIssue)}
          {renderIdentityField('level', '사업 레벨', levelIssue)}
        </div>
      </div>

      {!isRoot && isPlaced ? (
        <fieldset className="member-form__section">
          <legend>서브트리 이동</legend>
          <p className="help-text">
            회원과 모든 하위 연결을 유지한 채 빈 슬롯으로 옮깁니다.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={memberFieldId(member.memberKey, 'parentMemberKey')}>
                새 상위 회원
              </label>
              <select
                id={memberFieldId(member.memberKey, 'parentMemberKey')}
                value={targetParentMemberKey}
                aria-invalid={placementIssue !== undefined}
                aria-describedby={
                  placementIssue === undefined ? undefined : placementErrorId
                }
                onChange={(event) => setTargetParentMemberKey(event.currentTarget.value)}
              >
                <option value="">상위 회원 선택</option>
                {candidateParents.map((candidate) => (
                  <option key={candidate.memberKey} value={candidate.memberKey}>
                    {candidate.name.trim() || candidate.memberKey}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={memberFieldId(member.memberKey, 'sideAtParent')}>
                새 배치 방향
              </label>
              <select
                id={memberFieldId(member.memberKey, 'sideAtParent')}
                value={targetSide}
                onChange={(event) => setTargetSide(event.currentTarget.value as Side)}
              >
                <option value="LEFT">왼쪽</option>
                <option value="RIGHT">오른쪽</option>
              </select>
            </div>
          </div>
          {placementIssue === undefined ? null : (
            <p id={placementErrorId} className="field-error">
              {placementIssue.message}
            </p>
          )}
          {targetParentMemberKey !== '' && !targetAvailable && !isCurrentPlacement ? (
            <p className="field-error">선택한 좌·우 슬롯은 이미 사용 중입니다.</p>
          ) : null}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!canMove}
              onClick={() => {
                if (canMove) {
                  onMove(targetParentMemberKey, targetSide);
                }
              }}
            >
              선택한 빈 슬롯으로 이동
            </button>
            <button type="button" className="text-button" onClick={onDetach}>
              현재 부모에서 분리
            </button>
          </div>
        </fieldset>
      ) : null}

      {!isRoot && !isPlaced ? (
        <p className="storage-notice">
          이 서브트리는 재배치 대기 중입니다. 조직 카드의 빈 좌·우 + 슬롯에서
          다시 연결할 수 있습니다.
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="danger-button" onClick={onExclude}>
          현재 프로젝트에서 회원 제외
        </button>
      </div>
    </section>
  );
}
