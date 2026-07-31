import { useEffect, useRef, useState } from 'react';
import type {
  ExclusionStrategy,
  MemberDraft,
} from '../../application/project-setup';

export interface ExcludeMemberDialogProps {
  readonly member: MemberDraft;
  readonly directChildren: readonly MemberDraft[];
  readonly isRoot: boolean;
  readonly pending?: boolean;
  readonly safetyBackupEnabled?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (strategy: ExclusionStrategy) => void;
}

export function ExcludeMemberDialog({
  member,
  directChildren,
  isRoot,
  pending = false,
  safetyBackupEnabled = false,
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
        if (!pending) onCancel();
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
  }, [onCancel, pending]);

  const displayName = member.name.trim() || member.memberKey;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          if (!pending) onCancel();
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
        <h2 id="exclude-dialog-title">{displayName}님을 삭제할까요?</h2>
        <p id="exclude-dialog-description">
          {safetyBackupEnabled
            ? '삭제하기를 누르면 먼저 현재 내용이 자동으로 저장됩니다. 나중에 계획 목록의 ‘이전 내용 보기’에서 삭제 전 내용으로 새 계획을 만들 수 있습니다.'
            : '이 회원의 이름과 입력한 숫자가 화면에서 사라집니다.'}
        </p>

        {directChildren.length === 0 ? (
          <p>
            {isRoot
              ? '아래에 연결된 회원이 없습니다. 맨 위 자리가 비게 됩니다.'
              : '아래에 연결된 회원이 없습니다. 현재 자리만 비게 됩니다.'}
          </p>
        ) : null}

        {canPromote ? (
          <fieldset className="member-form__section">
            <legend>바로 아래 회원은 어떻게 할까요?</legend>
            <label className="checkbox-field">
              <input
                type="radio"
                name="exclusion-strategy"
                value="PROMOTE_ONLY_CHILD"
                checked={strategy === 'PROMOTE_ONLY_CHILD'}
                disabled={pending}
                onChange={() => setStrategy('PROMOTE_ONLY_CHILD')}
              />
              <span>
                <strong>아래 회원을 이 자리로 올리기</strong>
                <span className="help-text">
                  {directChildren[0]?.name.trim() || directChildren[0]?.memberKey}님과 그 아래
                  회원들이 이 자리를 이어받습니다.
                </span>
              </span>
            </label>
            <label className="checkbox-field">
              <input
                type="radio"
                name="exclusion-strategy"
                value="DETACH_CHILDREN"
                checked={strategy === 'DETACH_CHILDREN'}
                disabled={pending}
                onChange={() => setStrategy('DETACH_CHILDREN')}
              />
              <span>
                <strong>아래 회원들의 새 위치를 나중에 정하기</strong>
                <span className="help-text">
                  서로 연결된 상태는 그대로 두고, 빈 왼쪽·오른쪽 자리를 다시 고릅니다.
                </span>
              </span>
            </label>
          </fieldset>
        ) : null}

        {directChildren.length === 1 && !canPromote && !isRoot ? (
          <p className="storage-notice">
            이 회원은 현재 조직도에 들어가 있지 않습니다. 아래 회원들을 어디에 둘지 다시 정해야 합니다.
          </p>
        ) : null}

        {directChildren.length >= 2 ? (
          <p className="storage-notice">
            바로 아래 회원이 두 명이므로 한 명을 자동으로 올릴 수 없습니다. 두 회원의 새 위치를 각각 정해 주세요.
          </p>
        ) : null}

        {isRoot && directChildren.length > 0 ? (
          <p className="storage-notice">
            최상위 회원을 빼면 맨 위 자리가 비게 됩니다. 남은 회원 중 한 명을 새로운 최상위 회원으로 정해 주세요.
          </p>
        ) : null}

        <div className="dialog-panel__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="secondary-button"
            onClick={onCancel}
            disabled={pending}
          >
            취소
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => onConfirm(strategy)}
            disabled={pending}
          >
            {pending ? '현재 내용 저장 중…' : '삭제하기'}
          </button>
        </div>
      </section>
    </div>
  );
}
