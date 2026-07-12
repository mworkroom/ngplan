import { useRef, type CSSProperties, type ReactNode } from 'react';
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
  readonly scale: number;
  readonly onAddRoot: () => void;
  readonly onSelectMember: (memberKey: string) => void;
  readonly onToggleCollapsed: (memberKey: string) => void;
  readonly onScaleChange: (scale: number) => void;
  readonly onOpenSlot: (parentMemberKey: string, side: Side) => void;
  readonly onNavigateIssue: (issue: ProjectSetupIssue) => void;
  readonly onRemoveMember: (memberKey: string) => void;
}

export function OrganizationTree({
  draft,
  topology,
  issues,
  collapsedMemberKeys,
  scale,
  onAddRoot,
  onSelectMember,
  onToggleCollapsed,
  onScaleChange,
  onOpenSlot,
  onNavigateIssue,
  onRemoveMember,
}: OrganizationTreeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const errors = issues.filter((issue) => issue.severity === 'ERROR');
  const root =
    draft.rootMemberKey === null
      ? undefined
      : topology.memberByKey.get(draft.rootMemberKey);

  const changeScale = (change: number): void => {
    onScaleChange(Math.min(1.5, Math.max(0.25, Math.round((scale + change) * 10) / 10)));
  };

  const fitTreeToViewport = (): void => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (viewport === null || canvas === null || canvas.scrollWidth === 0) {
      return;
    }
    const availableWidth = Math.max(1, viewport.clientWidth - 24);
    const fittedScale = Math.min(1, availableWidth / canvas.scrollWidth);
    onScaleChange(Math.max(0.25, Math.floor(fittedScale * 20) / 20));
    viewport.scrollTo?.({ left: 0, behavior: 'smooth' });
  };

  const renderNode = (memberKey: string, connectedToParent = false): ReactNode => {
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
      <div
        className={`tree-node${connectedToParent ? ' tree-node--connected' : ''}`}
        key={memberKey}
      >
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
          <div
            id={childrenContainerId}
            className="tree-children"
            data-child-layout={
              leftChild !== undefined && rightChild !== undefined
                ? 'both'
                : leftChild !== undefined
                  ? 'left'
                  : 'right'
            }
            hidden={collapsed}
          >
            {leftChild === undefined ? (
              <div className="tree-branch-placeholder" aria-hidden="true" />
            ) : (
              renderNode(leftChild.memberKey, true)
            )}
            {rightChild === undefined ? (
              <div className="tree-branch-placeholder" aria-hidden="true" />
            ) : (
              renderNode(rightChild.memberKey, true)
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
        <div className="organization-tree__header-actions">
          <span className="status-badge">
            등록된 회원 {topology.activeMembers.length}명
          </span>
          <div className="organization-zoom" aria-label="조직 그림 크기">
            <button type="button" onClick={() => changeScale(-0.1)} disabled={scale <= 0.25}>
              − 작게
            </button>
            <button type="button" onClick={() => onScaleChange(1)}>
              100%
            </button>
            <button type="button" onClick={() => changeScale(0.1)} disabled={scale >= 1.5}>
              + 크게
            </button>
            <button type="button" onClick={fitTreeToViewport} disabled={root === undefined}>
              화면에 맞추기
            </button>
            <output aria-live="polite">현재 {Math.round(scale * 100)}%</output>
          </div>
        </div>
      </div>

      {errors.length === 0 ? null : (
        <div className="organization-error-bar" role="alert">
          <span>⚠ 미입력 항목이 {errors.length}개 있습니다</span>
          <button type="button" className="text-button" onClick={() => onNavigateIssue(errors[0]!)}>
            첫 번째 문제 보기
          </button>
        </div>
      )}

      <div
        id={projectFieldId('rootMemberKey')}
        ref={viewportRef}
        className="organization-tree__viewport"
        aria-label="좌우 조직도"
        tabIndex={0}
      >
        {root === undefined ? (
          <div className="empty-state">
            <div>
              <p>맨 위에 놓을 회원 카드를 만들어 주세요.</p>
              <button type="button" className="primary-button" onClick={onAddRoot}>
                최상위 회원 만들기
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="organization-tree__canvas"
            style={{ '--organization-scale': scale } as CSSProperties}
          >
            {renderNode(root.memberKey)}
          </div>
        )}
      </div>
    </section>
  );
}
