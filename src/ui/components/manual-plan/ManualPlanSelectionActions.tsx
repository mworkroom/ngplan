import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { ManualPlanMarkerKind } from '../../../application/manual-plan';
import type { ManualPlanActionPoint } from './ManualPlanTable';

export interface ManualPlanSelectionActionsProps {
  readonly point: ManualPlanActionPoint;
  readonly markerKind: ManualPlanMarkerKind | null;
  readonly disabled: boolean;
  readonly onChange: (markerKind: ManualPlanMarkerKind | null) => void;
  readonly onDismiss: () => void;
}

interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

const VIEWPORT_PADDING_PX = 8;
const POINTER_GAP_PX = 4;

export function ManualPlanSelectionActions({
  point,
  markerKind,
  disabled,
  onChange,
  onDismiss,
}: ManualPlanSelectionActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    const maxLeft = Math.max(
      VIEWPORT_PADDING_PX,
      window.innerWidth - rect.width - VIEWPORT_PADDING_PX,
    );
    const left = Math.min(
      Math.max(point.x + POINTER_GAP_PX, VIEWPORT_PADDING_PX),
      maxLeft,
    );
    const below = point.y + POINTER_GAP_PX;
    const above = point.y - rect.height - POINTER_GAP_PX;
    const top = below + rect.height <= window.innerHeight - VIEWPORT_PADDING_PX
      ? below
      : Math.max(VIEWPORT_PADDING_PX, above);

    setPosition({ top, left });
  }, [point.x, point.y]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };
    const handleViewportChange = (): void => onDismiss();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [onDismiss]);

  const style: CSSProperties = {
    top: position?.top ?? point.y,
    left: position?.left ?? point.x,
    visibility: position === null ? 'hidden' : 'visible',
  };

  return createPortal(
    <div
      ref={menuRef}
      className="manual-plan-cell-actions"
      role="menu"
      aria-label="칸 표시 작업"
      style={style}
    >
      {disabled ? (
        <button
          type="button"
          role="menuitem"
          className="manual-plan-cell-actions__button"
          disabled
        >
          입력하지 않는 날
        </button>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className="manual-plan-cell-actions__button manual-plan-cell-actions__button--recalculate"
            data-active={markerKind === 'ACTUAL_DIFFERENCE' ? 'true' : undefined}
            onClick={() => onChange('ACTUAL_DIFFERENCE')}
          >
            다시 계산할 곳
          </button>
          <button
            type="button"
            role="menuitem"
            className="manual-plan-cell-actions__button manual-plan-cell-actions__button--reminder"
            data-active={markerKind === 'REMINDER' ? 'true' : undefined}
            onClick={() => onChange('REMINDER')}
          >
            나중에 확인할 곳
          </button>
          <button
            type="button"
            role="menuitem"
            className="manual-plan-cell-actions__button manual-plan-cell-actions__button--clear"
            disabled={markerKind === null}
            onClick={() => onChange(null)}
          >
            표시 지우기
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
