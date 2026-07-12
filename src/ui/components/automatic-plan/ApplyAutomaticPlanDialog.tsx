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
          {manualDraftModified ? '입력한 계획을 자동 계획으로 바꿀까요?' : '자동 계획을 계획표에 넣을까요?'}
        </h2>
        <p>
          {manualDraftModified
            ? '현재 수동 입력은 자동 계획 값으로 교체됩니다. 취소하면 지금 입력은 그대로 유지됩니다.'
            : '선택한 검증 계획만 계획표에 들어갑니다.'}
        </p>
        <div className="form-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel}>취소</button>
          <button type="button" className="primary-button" onClick={onConfirm}>적용</button>
        </div>
      </section>
    </div>
  );
}
