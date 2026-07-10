import { useEffect, useRef, useState } from 'react';
import type {
  ExclusionStrategy,
  MemberDraft,
} from '../../application/project-setup';

export interface ExcludeMemberDialogProps {
  readonly member: MemberDraft;
  readonly directChildren: readonly MemberDraft[];
  readonly isRoot: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (strategy: ExclusionStrategy) => void;
}

export function ExcludeMemberDialog({
  member,
  directChildren,
  isRoot,
  onCancel,
  onConfirm,
}: ExcludeMemberDialogProps) {
  const canPromote =
    !isRoot &&
    directChildren.length === 1 &&
    member.placement.parentMemberKey !== null &&
    member.placement.sideAtParent !== null;
  const [strategy, setStrategy] = useState<ExclusionStrategy>(
    canPromote ? 'PROMOTE_ONLY_CHILD' : 'DETACH_CHILDREN',
  );
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setStrategy(canPromote ? 'PROMOTE_ONLY_CHILD' : 'DETACH_CHILDREN');
  }, [canPromote, member.memberKey]);

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
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
  }, [onCancel]);

  const displayName = member.name.trim() || member.memberKey;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exclude-dialog-title"
        aria-describedby="exclude-dialog-description"
      >
        <h2 id="exclude-dialog-title">{displayName} 회원 제외</h2>
        <p id="exclude-dialog-description">
          회원 기록은 삭제하지 않고 현재 프로젝트의 활성 조직에서만 제외합니다.
        </p>

        {directChildren.length === 0 ? (
          <p>
            {isRoot
              ? '직계 자식이 없어 현재 루트 지정만 해제됩니다.'
              : '직계 자식이 없어 기존 부모의 슬롯만 비워집니다.'}
          </p>
        ) : null}

        {canPromote ? (
          <fieldset className="member-form__section">
            <legend>한 개의 직계 자식 처리</legend>
            <label className="checkbox-field">
              <input
                type="radio"
                name="exclusion-strategy"
                value="PROMOTE_ONLY_CHILD"
                checked={strategy === 'PROMOTE_ONLY_CHILD'}
                onChange={() => setStrategy('PROMOTE_ONLY_CHILD')}
              />
              <span>
                <strong>자식을 기존 슬롯으로 승격</strong>
                <span className="help-text">
                  {directChildren[0]?.name.trim() || directChildren[0]?.memberKey} 서브트리가
                  현재 회원의 자리를 이어받습니다.
                </span>
              </span>
            </label>
            <label className="checkbox-field">
              <input
                type="radio"
                name="exclusion-strategy"
                value="DETACH_CHILDREN"
                checked={strategy === 'DETACH_CHILDREN'}
                onChange={() => setStrategy('DETACH_CHILDREN')}
              />
              <span>
                <strong>서브트리를 재배치 대기로 이동</strong>
                <span className="help-text">
                  내부 연결은 유지하고 빈 좌·우 슬롯을 다시 선택합니다.
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        {directChildren.length === 1 && !canPromote && !isRoot ? (
          <p className="storage-notice">
            이 회원은 현재 부모 슬롯에 연결되지 않아 자식이 승격할 자리가 없습니다.
            자식 서브트리는 재배치 대기 목록으로 이동합니다.
          </p>
        ) : null}

        {directChildren.length >= 2 ? (
          <p className="storage-notice">
            두 직계 자식 중 어느 쪽도 자동 승격하지 않습니다. 두 서브트리 모두
            재배치 대기 목록으로 이동합니다.
          </p>
        ) : null}

        {isRoot && directChildren.length > 0 ? (
          <p className="storage-notice">
            루트를 제외하면 현재 루트 지정이 해제됩니다. 남은 서브트리 중 하나를
            새 루트로 명시적으로 지정해야 합니다.
          </p>
        ) : null}

        <div className="dialog-panel__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="secondary-button"
            onClick={onCancel}
          >
            취소
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => onConfirm(strategy)}
          >
            선택한 방식으로 제외
          </button>
        </div>
      </section>
    </div>
  );
}
