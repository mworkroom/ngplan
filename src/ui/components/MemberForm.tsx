import { useEffect, useState } from 'react';
import {
  memberFieldId,
  type MemberDraft,
  type ProjectSetupIssue,
} from '../../application/project-setup';
import { SHEET_MARKER_OPTIONS } from '../member-marker';

type Side = Exclude<MemberDraft['placement']['sideAtParent'], null>;
type IdentityPatch = Partial<Pick<MemberDraft, 'memberId' | 'name' | 'sheetMarker'>>;

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
    field: 'memberId' | 'name',
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
          inputMode={field === 'memberId' ? 'numeric' : undefined}
          pattern={field === 'memberId' ? '[0-9]*' : undefined}
          value={member[field]}
          aria-invalid={issue !== undefined}
          aria-describedby={issue === undefined ? undefined : errorId}
          onChange={(event) =>
            onIdentityChange({
              [field]:
                field === 'memberId'
                  ? event.currentTarget.value.replace(/\D/g, '')
                  : event.currentTarget.value,
            })
          }
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
              회원 정보 입력
            </h2>
          </div>
          <span className="status-badge">{isRoot ? '최상위 회원' : '등록된 회원'}</span>
        </div>
        <div className="form-grid form-grid--single">
          {renderIdentityField('name', '이름', nameIssue)}
          {renderIdentityField('memberId', 'ID', memberIdIssue)}
          <div className="field">
            <label htmlFor={memberFieldId(member.memberKey, 'sheetMarker')}>
              이름 강조
            </label>
            <select
              id={memberFieldId(member.memberKey, 'sheetMarker')}
              value={member.sheetMarker}
              onChange={(event) =>
                onIdentityChange({
                  sheetMarker: event.currentTarget.value as MemberDraft['sheetMarker'],
                })
              }
            >
              {SHEET_MARKER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!isRoot && isPlaced ? (
        <section className="member-form__section" aria-labelledby="member-move-title">
          <hr className="section-divider" />
          <h2 id="member-move-title" className="panel__title">위치 바꾸기</h2>
          <p className="help-text">
            이 회원과 아래에 연결된 회원들을 함께 옮깁니다.
          </p>
          <div className="member-move-row">
            <div className="field">
              <label htmlFor={memberFieldId(member.memberKey, 'parentMemberKey')}>
                상위 회원 선택
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
                {candidateParents.map((candidate) => (
                  <option key={candidate.memberKey} value={candidate.memberKey}>
                    {candidate.name.trim() || candidate.memberKey}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={memberFieldId(member.memberKey, 'sideAtParent')}>
                위치 선택
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
            <button
              type="button"
              className="secondary-button member-move-row__button"
              disabled={!canMove}
              onClick={() => {
                if (canMove) {
                  onMove(targetParentMemberKey, targetSide);
                }
              }}
            >
              이동
            </button>
          </div>
          {placementIssue === undefined ? null : (
            <p id={placementErrorId} className="field-error">
              {placementIssue.message}
            </p>
          )}
          {targetParentMemberKey !== '' && !targetAvailable && !isCurrentPlacement ? (
            <p className="field-error">선택한 자리는 이미 다른 회원이 사용하고 있습니다.</p>
          ) : null}
          <div className="member-storage-actions">
            <button type="button" className="text-button" onClick={onDetach}>
              보관함에 넣기
            </button>
            <button type="button" className="danger-button" onClick={onExclude}>
              삭제하기
            </button>
          </div>
        </section>
      ) : null}

      {!isRoot && !isPlaced ? (
        <>
          <p className="storage-notice">
            이 회원과 아래 회원들의 새 위치를 정해야 합니다. 조직도의 빈 자리에 다시 연결해 주세요.
          </p>
          <div className="member-storage-actions member-storage-actions--single">
            <button type="button" className="danger-button" onClick={onExclude}>
              삭제하기
            </button>
          </div>
        </>
      ) : null}

      {isRoot ? (
        <div className="member-storage-actions member-storage-actions--single">
          <button type="button" className="danger-button" onClick={onExclude}>
            삭제하기
          </button>
        </div>
      ) : null}
    </section>
  );
}
