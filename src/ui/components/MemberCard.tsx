import {
  memberCardId,
  type ChildSlotState,
  type MemberDraft,
  type ProjectSetupIssue,
} from '../../application/project-setup';
import { ChildSlot } from './ChildSlot';

export interface MemberCardProps {
  readonly member: MemberDraft;
  readonly issues: readonly ProjectSetupIssue[];
  readonly leftSlot: ChildSlotState;
  readonly rightSlot: ChildSlotState;
  readonly leftChildName: string | null;
  readonly rightChildName: string | null;
  readonly selected: boolean;
  readonly collapsed: boolean;
  readonly hasChildren: boolean;
  readonly childrenContainerId: string;
  readonly onSelect: (memberKey: string) => void;
  readonly onToggleCollapsed: (memberKey: string) => void;
  readonly onOpenSlot: (parentMemberKey: string, side: ChildSlotState['side']) => void;
}

export function MemberCard({
  member,
  issues,
  leftSlot,
  rightSlot,
  leftChildName,
  rightChildName,
  selected,
  collapsed,
  hasChildren,
  childrenContainerId,
  onSelect,
  onToggleCollapsed,
  onOpenSlot,
}: MemberCardProps) {
  const hasError = issues.some(
    (issue) =>
      issue.severity === 'ERROR' && issue.location.memberKey === member.memberKey,
  );
  const complete = !hasError;
  const displayName = member.name.trim() || '이름 미입력 회원';

  return (
    <article
      id={memberCardId(member.memberKey)}
      className={`member-card${selected ? ' member-card--selected' : ''}${
        complete ? ' member-card--complete' : ' member-card--incomplete'
      }`}
      aria-current={selected ? 'true' : undefined}
      tabIndex={-1}
    >
      <div className="member-card__header">
        <button
          type="button"
          className="member-card__select"
          aria-label={`${displayName} 회원 상세 편집`}
          onClick={() => onSelect(member.memberKey)}
        >
          <h3 className="member-card__name">{displayName}</h3>
          <p className="member-card__meta">
            ID {member.memberId.trim() || '미입력'} · 레벨 {member.level.trim() || '미입력'}
          </p>
        </button>
        <span
          className={`status-badge ${
            complete ? 'status-badge--complete' : 'status-badge--incomplete'
          }`}
        >
          {complete ? '입력 완료' : '입력 필요'}
        </span>
      </div>

      <p className="member-card__opening" aria-label="일일 시작 잔액">
        PVP {member.openingState.dailyCarryPvp || '0'}
        <span aria-hidden="true"> | </span>
        좌 {member.openingState.dailyCarryLeft || '0'}
        <span aria-hidden="true"> | </span>
        우 {member.openingState.dailyCarryRight || '0'}
      </p>

      <div className="member-card__slots">
        <ChildSlot
          slot={leftSlot}
          parentName={displayName}
          childName={leftChildName}
          onOpen={() => onOpenSlot(member.memberKey, 'LEFT')}
          onSelectChild={onSelect}
        />
        <ChildSlot
          slot={rightSlot}
          parentName={displayName}
          childName={rightChildName}
          onOpen={() => onOpenSlot(member.memberKey, 'RIGHT')}
          onSelectChild={onSelect}
        />
      </div>

      {hasChildren ? (
        <div className="member-card__footer">
          <button
            type="button"
            className="text-button"
            aria-expanded={!collapsed}
            aria-controls={childrenContainerId}
            onClick={() => onToggleCollapsed(member.memberKey)}
          >
            {collapsed ? '하위 조직 펼치기' : '하위 조직 접기'}
          </button>
        </div>
      ) : null}
    </article>
  );
}
