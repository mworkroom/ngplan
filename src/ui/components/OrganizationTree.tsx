import type { ReactNode } from 'react';
import {
  getChildSlotState,
  projectFieldId,
  type ChildSlotState,
  type DerivedTopology,
  type ProjectSetupDraft,
  type ProjectSetupIssue,
} from '../../application/project-setup';
import { MemberCard } from './MemberCard';

type Side = ChildSlotState['side'];

export interface OrganizationTreeProps {
  readonly draft: ProjectSetupDraft;
  readonly topology: DerivedTopology;
  readonly issues: readonly ProjectSetupIssue[];
  readonly collapsedMemberKeys: ReadonlySet<string>;
  readonly onAddRoot: () => void;
  readonly onSelectMember: (memberKey: string) => void;
  readonly onToggleCollapsed: (memberKey: string) => void;
  readonly onOpenSlot: (parentMemberKey: string, side: Side) => void;
  readonly onNavigateIssue: (issue: ProjectSetupIssue) => void;
  readonly onRemoveMember: (memberKey: string) => void;
}

export function OrganizationTree({
  draft,
  topology,
  issues,
  collapsedMemberKeys,
  onAddRoot,
  onSelectMember,
  onToggleCollapsed,
  onOpenSlot,
  onNavigateIssue,
  onRemoveMember,
}: OrganizationTreeProps) {
  const errors = issues.filter((issue) => issue.severity === 'ERROR');
  const root =
    draft.rootMemberKey === null
      ? undefined
      : topology.memberByKey.get(draft.rootMemberKey);

  const renderNode = (memberKey: string): ReactNode => {
    const member = topology.memberByKey.get(memberKey);
    if (member === undefined) {
      return null;
    }
    const leftSlot = getChildSlotState(topology, memberKey, 'LEFT');
    const rightSlot = getChildSlotState(topology, memberKey, 'RIGHT');
    const leftChild =
      leftSlot.childMemberKey === null
        ? undefined
        : topology.memberByKey.get(leftSlot.childMemberKey);
    const rightChild =
      rightSlot.childMemberKey === null
        ? undefined
        : topology.memberByKey.get(rightSlot.childMemberKey);
    const collapsed = collapsedMemberKeys.has(memberKey);
    const hasChildren = leftChild !== undefined || rightChild !== undefined;
    const childrenContainerId = `member-${memberKey.replace(/[^a-zA-Z0-9_-]/g, '_')}-children`;

    return (
      <div className="tree-node" key={memberKey}>
        <MemberCard
          member={member}
          issues={issues}
          leftSlot={leftSlot}
          rightSlot={rightSlot}
          leftChildName={leftChild?.name.trim() || null}
          rightChildName={rightChild?.name.trim() || null}
          selected={draft.selectedMemberKey === memberKey}
          collapsed={collapsed}
          hasChildren={hasChildren}
          childrenContainerId={childrenContainerId}
          onSelect={onSelectMember}
          onToggleCollapsed={onToggleCollapsed}
          onOpenSlot={onOpenSlot}
          onRemoveChild={onRemoveMember}
        />
        {hasChildren ? (
          <div id={childrenContainerId} className="tree-children" hidden={collapsed}>
            {leftChild === undefined ? (
              <div className="tree-branch-placeholder" aria-hidden="true" />
            ) : (
              renderNode(leftChild.memberKey)
            )}
            {rightChild === undefined ? (
              <div className="tree-branch-placeholder" aria-hidden="true" />
            ) : (
              renderNode(rightChild.memberKey)
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="panel organization-tree" aria-labelledby="organization-title">
      <div className="panel__header">
        <div>
          <h2 id="organization-title" className="panel__title">
            조직 구조
          </h2>
        </div>
        <span className="status-badge">
          등록된 회원 {topology.activeMembers.length}명
        </span>
      </div>

      {errors.length === 0 ? null : (
        <div className="organization-error-bar" role="alert">
          <span>⚠ 입력해야 할 항목이 {errors.length}개 있습니다</span>
          <button type="button" className="text-button" onClick={() => onNavigateIssue(errors[0]!)}>
            첫 번째 문제 보기
          </button>
        </div>
      )}

      <div
        id={projectFieldId('rootMemberKey')}
        className="organization-tree__viewport"
        aria-label="좌우 조직도"
        tabIndex={0}
      >
        {root === undefined ? (
          <div className="empty-state">
            <div>
              <p>맨 위에 놓을 회원 카드를 먼저 만들어 주세요.</p>
              <button type="button" className="primary-button" onClick={onAddRoot}>
                최상위 회원 만들기
              </button>
            </div>
          </div>
        ) : (
          <div className="organization-tree__canvas">{renderNode(root.memberKey)}</div>
        )}
      </div>
    </section>
  );
}
