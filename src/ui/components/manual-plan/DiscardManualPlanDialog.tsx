import { useEffect, useRef, type RefObject } from 'react';

export interface DiscardManualPlanDialogProps {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

export function DiscardManualPlanDialog({
  onCancel,
  onConfirm,
  returnFocusRef,
}: DiscardManualPlanDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const cancelAndRestoreFocus = (): void => {
    onCancel();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  useEffect(() => {
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelAndRestoreFocus();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, returnFocusRef]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          cancelAndRestoreFocus();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-manual-plan-title"
        aria-describedby="discard-manual-plan-description"
      >
        <h2 id="discard-manual-plan-title">수동 계획을 버릴까요?</h2>
        <p id="discard-manual-plan-description">
          지금 입력한 계획은 아직 저장되지 않았습니다. 회원 설정으로 돌아가면
          다시 불러올 수 없습니다.
        </p>
        <div className="dialog-panel__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="secondary-button"
            onClick={cancelAndRestoreFocus}
          >
            계속 계획하기
          </button>
          <button type="button" className="danger-button" onClick={onConfirm}>
            계획 버리고 설정으로 돌아가기
          </button>
        </div>
      </section>
    </div>
  );
}
