import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { manualPlanCellDomId } from '../../../application/manual-plan';
import type { ManualPlanSelection } from './ManualPlanTable';

export interface ManualPlanSelectionActionsProps {
  readonly selection: ManualPlanSelection;
  readonly open: boolean;
  readonly dateLabel: string;
  readonly memberLabel: string;
  readonly marked: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly onDismiss: () => void;
}

interface ActionPosition {
  readonly top: number;
  readonly left: number;
  readonly visible: boolean;
}

const VIEWPORT_PADDING_PX = 12;
const CELL_GAP_PX = 8;

function selectedCells(selection: ManualPlanSelection): readonly HTMLElement[] {
  const anchor = document.getElementById(
    manualPlanCellDomId(selection.date, selection.memberKey),
  );
  if (!(anchor instanceof HTMLElement)) {
    return [];
  }

  return [anchor, anchor.nextElementSibling, anchor.nextElementSibling?.nextElementSibling]
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
}

export function ManualPlanSelectionActions({
  selection,
  open,
  dateLabel,
  memberLabel,
  marked,
  disabled,
  onToggle,
  onDismiss,
}: ManualPlanSelectionActionsProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ActionPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    const updatePosition = (): void => {
      const cells = selectedCells(selection);
      const actions = actionsRef.current;
      if (cells.length === 0 || actions === null) {
        setPosition(null);
        return;
      }

      const firstRect = cells[0]!.getBoundingClientRect();
      const lastRect = cells[cells.length - 1]!.getBoundingClientRect();
      const scrollArea = cells[0]!.closest('.manual-plan-scroll');
      const scrollRect = scrollArea?.getBoundingClientRect();
      const visibleLeft = Math.max(firstRect.left, scrollRect?.left ?? 0, 0);
      const visibleRight = Math.min(
        lastRect.right,
        scrollRect?.right ?? window.innerWidth,
        window.innerWidth,
      );
      const visibleTop = Math.max(firstRect.top, scrollRect?.top ?? 0, 0);
      const visibleBottom = Math.min(
        firstRect.bottom,
        scrollRect?.bottom ?? window.innerHeight,
        window.innerHeight,
      );
      const hasBrowserLayout = firstRect.width > 0 || firstRect.height > 0;
      const isVisible = !hasBrowserLayout
        || (visibleRight > visibleLeft && visibleBottom > visibleTop);
      const actionsRect = actions.getBoundingClientRect();
      const centeredLeft =
        visibleLeft + (visibleRight - visibleLeft - actionsRect.width) / 2;
      const maxLeft = Math.max(
        VIEWPORT_PADDING_PX,
        window.innerWidth - actionsRect.width - VIEWPORT_PADDING_PX,
      );
      const left = Math.min(
        Math.max(centeredLeft, VIEWPORT_PADDING_PX),
        maxLeft,
      );
      const below = firstRect.bottom + CELL_GAP_PX;
      const above = firstRect.top - actionsRect.height - CELL_GAP_PX;
      const top = below + actionsRect.height <= window.innerHeight - VIEWPORT_PADDING_PX
        ? below
        : Math.max(VIEWPORT_PADDING_PX, above);

      setPosition({ top, left, visible: isVisible });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, selection]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (actionsRef.current?.contains(target)) {
        return;
      }
      if (selectedCells(selection).some((cell) => cell.contains(target))) {
        return;
      }
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDismiss, open, selection]);

  if (!open) {
    return null;
  }

  const style: CSSProperties = {
    top: position?.top ?? VIEWPORT_PADDING_PX,
    left: position?.left ?? VIEWPORT_PADDING_PX,
    visibility: position?.visible === false ? 'hidden' : 'visible',
  };

  return createPortal(
    <div
      ref={actionsRef}
      className={`manual-plan-cell-actions${
        marked ? ' manual-plan-cell-actions--marked' : ''
      }`}
      role="region"
      aria-label="선택한 칸 작업"
      style={style}
    >
      <strong className="manual-plan-cell-actions__context">
        {dateLabel} · {memberLabel}
      </strong>
      {disabled ? (
        <p className="manual-plan-cell-actions__message">
          입력하지 않는 날은 표시할 수 없습니다.
        </p>
      ) : null}
      <button
        type="button"
        className="manual-plan-cell-actions__button"
        aria-pressed={marked}
        disabled={disabled}
        onClick={onToggle}
      >
        {marked ? '표시 지우기' : '계획과 달랐음 표시'}
      </button>
    </div>,
    document.body,
  );
}
