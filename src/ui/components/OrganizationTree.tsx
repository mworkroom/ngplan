import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
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

interface TreeConnector {
  readonly parentMemberKey: string;
  readonly childMemberKeys: readonly string[];
  readonly path: string;
}

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
  const [connectors, setConnectors] = useState<readonly TreeConnector[]>([]);
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

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      setConnectors([]);
      return;
    }

    const measureConnectors = (): void => {
      const canvasRect = canvas.getBoundingClientRect();
      const measuredScale = canvas.offsetWidth > 0
        ? canvasRect.width / canvas.offsetWidth
        : scale;
      const effectiveScale = measuredScale > 0 ? measuredScale : 1;
      const nextConnectors: TreeConnector[] = [];

      for (const node of canvas.querySelectorAll<HTMLElement>('.tree-node[data-member-key]')) {
        const memberKey = node.dataset.memberKey;
        const memberCard = Array.from(node.children).find((child) =>
          child.classList.contains('member-card'),
        );
        const childrenContainer = Array.from(node.children).find((child) =>
          child.classList.contains('tree-children'),
        );

        if (
          memberKey === undefined ||
          !(memberCard instanceof HTMLElement) ||
          !(childrenContainer instanceof HTMLElement) ||
          childrenContainer.hidden ||
          memberCard.getClientRects().length === 0
        ) {
          continue;
        }

        const childNodes = Array.from(childrenContainer.children).filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.classList.contains('tree-node'),
        );
        const childCards = childNodes
          .map((childNode) => {
            const card = Array.from(childNode.children).find((child) =>
              child.classList.contains('member-card'),
            );
            if (!(card instanceof HTMLElement) || card.getClientRects().length === 0) {
              return null;
            }
            return {
              memberKey: childNode.dataset.memberKey ?? '',
              rect: card.getBoundingClientRect(),
            };
          })
          .filter(
            (
              child,
            ): child is {
              readonly memberKey: string;
              readonly rect: DOMRect;
            } => child !== null && child.memberKey !== '',
          );

        if (childCards.length === 0) {
          continue;
        }

        const parentRect = memberCard.getBoundingClientRect();
        const parentX =
          (parentRect.left + parentRect.width / 2 - canvasRect.left) / effectiveScale;
        const parentBottom = (parentRect.bottom - canvasRect.top) / effectiveScale;
        const childPoints = childCards.map(({ memberKey: childMemberKey, rect }) => ({
          memberKey: childMemberKey,
          x: (rect.left + rect.width / 2 - canvasRect.left) / effectiveScale,
          top: (rect.top - canvasRect.top) / effectiveScale,
        }));
        const firstChildTop = Math.min(...childPoints.map(({ top }) => top));
        const junctionY = parentBottom + Math.max(12, (firstChildTop - parentBottom) / 2);
        const horizontalStart = Math.min(parentX, ...childPoints.map(({ x }) => x));
        const horizontalEnd = Math.max(parentX, ...childPoints.map(({ x }) => x));
        const pathParts = [
          `M ${parentX} ${parentBottom} V ${junctionY}`,
          `M ${horizontalStart} ${junctionY} H ${horizontalEnd}`,
          ...childPoints.map(({ x, top }) => `M ${x} ${junctionY} V ${top}`),
        ];

        nextConnectors.push({
          parentMemberKey: memberKey,
          childMemberKeys: childPoints.map(({ memberKey: childMemberKey }) => childMemberKey),
          path: pathParts.join(' '),
        });
      }

      setConnectors((current) => {
        const unchanged =
          current.length === nextConnectors.length &&
          current.every(
            (connector, index) =>
              connector.parentMemberKey === nextConnectors[index]?.parentMemberKey &&
              connector.path === nextConnectors[index]?.path,
          );
        return unchanged ? current : nextConnectors;
      });
    };

    measureConnectors();
    window.addEventListener('resize', measureConnectors);
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measureConnectors);
    resizeObserver?.observe(canvas);

    return () => {
      window.removeEventListener('resize', measureConnectors);
      resizeObserver?.disconnect();
    };
  }, [collapsedMemberKeys, draft, scale]);

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
        data-member-key={memberKey}
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
            {topology.activeMembers.length}명 참여중
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
            문제 보기
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
            <svg
              className="organization-tree__connectors"
              aria-hidden="true"
              focusable="false"
            >
              {connectors.map((connector) => (
                <path
                  key={connector.parentMemberKey}
                  data-connector-from={connector.parentMemberKey}
                  data-connector-to={connector.childMemberKeys.join(' ')}
                  d={connector.path}
                />
              ))}
            </svg>
            {renderNode(root.memberKey)}
          </div>
        )}
      </div>
    </section>
  );
}
