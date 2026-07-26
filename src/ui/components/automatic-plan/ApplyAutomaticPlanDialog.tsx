import { useEffect, useRef } from 'react';

export interface ApplyAutomaticPlanDialogProps {
  readonly manualDraftModified: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ApplyAutomaticPlanDialog({
  manualDraftModified,
  onConfirm,
  onCancel,
}: ApplyAutomaticPlanDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-automatic-plan-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id="apply-automatic-plan-title">
          이 결과를 계획표에 넣을까요?
        </h2>
        <p>
          {manualDraftModified
            ? '직접 입력한 값이 자동 계산 결과로 바뀝니다. 취소하면 지금 입력은 그대로 유지됩니다.'
            : '확인한 자동 계산 결과가 계획표에 들어갑니다.'}
        </p>
        <div className="form-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel}>취소</button>
          <button type="button" className="primary-button" onClick={onConfirm}>계획표에 넣기</button>
        </div>
      </section>
    </div>
  );
}
