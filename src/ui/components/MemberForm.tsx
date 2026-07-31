import { useEffect, useState } from 'react';
import {
  memberFieldId,
  type MemberDraft,
  type ProjectSetupIssue,
} from '../../application/project-setup';
import type {
  MemberDirectory,
  MemberDirectoryEntry,
} from '../../cloud/member-directory';
import { SHEET_MARKER_OPTIONS } from '../member-marker';
import {
  MemberDirectoryPicker,
  type MemberDirectorySelectionResult,
} from './MemberDirectoryPicker';

type Side = Exclude<MemberDraft['placement']['sideAtParent'], null>;
type IdentityPatch = Partial<
  Pick<MemberDraft, 'sourceMemberId' | 'memberId' | 'name' | 'sheetMarker'>
>;

export interface MemberFormProps {
  readonly member: MemberDraft;
  readonly memberDirectory?: MemberDirectory | null;
  readonly planMembers?: readonly MemberDraft[];
  readonly issues: readonly ProjectSetupIssue[];
  readonly isRoot: boolean;
  readonly candidateParents: readonly MemberDraft[];
  readonly isSlotAvailable: (parentMemberKey: string, side: Side) => boolean;
  readonly onIdentityChange: (patch: IdentityPatch) => void;
  readonly onDirectoryAssign?: (
    entry: MemberDirectoryEntry,
    displayName: string,
  ) => MemberDirectorySelectionResult;
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
  memberDirectory = null,
  planMembers = [],
  issues,
  isRoot,
  candidateParents,
  isSlotAvailable,
  onIdentityChange,
  onDirectoryAssign,
  onMove,
  onDetach,
  onExclude,
}: MemberFormProps) {
  const [manualEntryOpen, setManualEntryOpen] = useState(
    () =>
      memberDirectory === null ||
      ((member.sourceMemberId?.trim() ?? '') === '' &&
        (member.name.trim() !== '' || member.memberId.trim() !== '')),
  );
  const [targetParentMemberKey, setTargetParentMemberKey] = useState(
    member.placement.parentMemberKey ?? '',
  );
  const [targetSide, setTargetSide] = useState<Side>(
    member.placement.sideAtParent ?? 'LEFT',
  );

  useEffect(() => {
    setManualEntryOpen(
      memberDirectory === null ||
        ((member.sourceMemberId?.trim() ?? '') === '' &&
          (member.name.trim() !== '' || member.memberId.trim() !== '')),
    );
    setTargetParentMemberKey(member.placement.parentMemberKey ?? '');
    setTargetSide(member.placement.sideAtParent ?? 'LEFT');
  }, [member.memberKey, member.placement.parentMemberKey, member.placement.sideAtParent, memberDirectory]);

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
    const showMessage = field !== 'name' && issue !== undefined;
    return (
      <div className="field">
        <label htmlFor={fieldId}>{label}</label>
        <input
          id={fieldId}
          inputMode={field === 'memberId' ? 'numeric' : undefined}
          pattern={field === 'memberId' ? '[0-9]*' : undefined}
          placeholder={field === 'name' ? '계획에 표시할 이름' : undefined}
          value={member[field]}
          aria-invalid={issue !== undefined}
          aria-describedby={showMessage ? errorId : undefined}
          onChange={(event) =>
            onIdentityChange({
              [field]:
                field === 'memberId'
                  ? event.currentTarget.value.replace(/\D/g, '')
                  : event.currentTarget.value,
            })
          }
        />
        {!showMessage ? null : (
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
          <h2 id="member-form-title" className="panel__title">
            회원 정보 입력
          </h2>
        </div>
        {memberDirectory === null || onDirectoryAssign === undefined ? null : (
          <MemberDirectoryPicker
            directory={memberDirectory}
            member={member}
            planMembers={planMembers}
            onAssign={(entry, displayName) => {
              const outcome = onDirectoryAssign(entry, displayName);
              if (outcome.status === 'SUCCESS') setManualEntryOpen(false);
              return outcome;
            }}
            onDisplayNameChange={(displayName) =>
              onIdentityChange({
                sourceMemberId: member.sourceMemberId ?? null,
                name: displayName,
              })
            }
            onChooseManualEntry={() => setManualEntryOpen(true)}
          />
        )}
        {manualEntryOpen ? (
          <section
            className="member-form__manual-entry"
            aria-labelledby={
              memberDirectory === null ? undefined : 'member-manual-entry-title'
            }
          >
            {memberDirectory === null ? null : (
              <div>
                <h3 id="member-manual-entry-title">직접 입력</h3>
                <p className="help-text">검색에 없는 회원만 직접 입력해 주세요.</p>
              </div>
            )}
            <div className="form-grid form-grid--single">
              {renderIdentityField('name', '이름', nameIssue)}
              {renderIdentityField('memberId', 'ID', memberIdIssue)}
            </div>
          </section>
        ) : null}
        <div className="form-grid form-grid--single member-form__marker">
          <div className="field">
            <label htmlFor={memberFieldId(member.memberKey, 'sheetMarker')}>
              이름 강조색
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
          <aside
            className="storage-notice member-storage-notice"
            aria-labelledby={`${memberFieldId(member.memberKey, 'parentMemberKey')}-storage-title`}
          >
            <div>
              <h3
                className="member-storage-notice__title"
                id={`${memberFieldId(member.memberKey, 'parentMemberKey')}-storage-title`}
              >
                보관함에 있는 회원
              </h3>
              <div>
                조직도에서 원하는 빈 자리의 + 버튼을 누른 뒤, 회원 이름이
                적힌 ‘이 자리에 넣기’ 버튼을 선택하세요.
              </div>
            </div>
          </aside>
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
