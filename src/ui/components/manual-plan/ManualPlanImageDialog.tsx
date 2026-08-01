import { useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadManualPlanImage,
  manualPlanImageFilename,
} from './create-manual-plan-image';

export interface ManualPlanImageMemberOption {
  readonly memberKey: string;
  readonly name: string;
  readonly displayLabel: string;
}

export interface ManualPlanImageDialogProps {
  readonly projectTitle: string;
  readonly members: readonly ManualPlanImageMemberOption[];
  readonly onCreateImage: (memberIndices: readonly number[]) => Promise<Blob>;
  readonly onClose: () => void;
}

interface ImagePreview {
  readonly blob: Blob;
  readonly url: string;
  readonly filename: string;
  readonly memberCount: number;
}

function shareIsAvailable(preview: ImagePreview): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  const file = new File([preview.blob], preview.filename, { type: 'image/png' });
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function ManualPlanImageDialog({
  projectTitle,
  members,
  onCreateImage,
  onClose,
}: ManualPlanImageDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstCheckboxRef = useRef<HTMLInputElement>(null);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const selectedIndices = useMemo(
    () => members.flatMap((member, index) =>
      selectedKeys.has(member.memberKey) ? [index] : []),
    [members, selectedKeys],
  );
  const selectedMembers = selectedIndices.map((index) => members[index]!);

  useEffect(() => {
    firstCheckboxRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !generating) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [generating, onClose]);

  useEffect(() => {
    if (preview === null) {
      return undefined;
    }
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const toggleMember = (memberKey: string): void => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(memberKey)) {
        next.delete(memberKey);
      } else {
        next.add(memberKey);
      }
      return next;
    });
    setError('');
  };

  const handleCreate = async (): Promise<void> => {
    if (selectedIndices.length === 0) {
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const blob = await onCreateImage(selectedIndices);
      const filename = manualPlanImageFilename(
        projectTitle,
        selectedMembers.map((member) => member.name),
      );
      setPreview({
        blob,
        url: URL.createObjectURL(blob),
        filename,
        memberCount: selectedIndices.length,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '이미지를 만들지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async (): Promise<void> => {
    if (preview === null) {
      return;
    }
    const file = new File([preview.blob], preview.filename, { type: 'image/png' });
    try {
      await navigator.share({
        files: [file],
        title: projectTitle,
      });
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        setError('이미지를 공유하지 못했습니다. 이미지 저장하기를 이용해 주세요.');
      }
    }
  };

  const canShare = preview !== null && shareIsAvailable(preview);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !generating) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="dialog-panel manual-plan-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-plan-image-dialog-title"
      >
        {preview === null ? (
          <>
            <h2 id="manual-plan-image-dialog-title">
              이미지로 보낼 사람을 고르세요
            </h2>
            <p className="manual-plan-image-dialog__intro">
              고른 사람은 계획표에 보이는 순서대로 이미지에 들어갑니다.
            </p>
            <div
              className="manual-plan-image-dialog__members"
              aria-label="이미지로 보낼 사람"
            >
              {members.map((member, index) => {
                const checked = selectedKeys.has(member.memberKey);
                return (
                  <label
                    className="manual-plan-image-dialog__member"
                    key={member.memberKey}
                  >
                    <input
                      ref={index === 0 ? firstCheckboxRef : undefined}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMember(member.memberKey)}
                    />
                    <span>{member.displayLabel}</span>
                  </label>
                );
              })}
            </div>
            <p className="manual-plan-image-dialog__count" aria-live="polite">
              {selectedKeys.size === 0
                ? '아직 고른 사람이 없습니다.'
                : `${selectedKeys.size}명 선택했습니다.`}
            </p>
            {error === '' ? null : (
              <p className="manual-plan-image-dialog__error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-panel__actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={generating}
              >
                취소
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={selectedIndices.length === 0 || generating}
                onClick={() => void handleCreate()}
              >
                {generating
                  ? '이미지 만드는 중…'
                  : `선택한 ${selectedIndices.length}명 이미지 만들기`}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="manual-plan-image-dialog-title">이미지를 만들었습니다</h2>
            <p className="manual-plan-image-dialog__intro">
              선택한 {preview.memberCount}명이 계획표 순서대로 들어갔습니다.
              오른쪽 사람이 보이지 않으면 이미지를 좌우로 움직이세요.
            </p>
            <div className="manual-plan-image-dialog__preview">
              <img
                src={preview.url}
                alt={`선택한 ${preview.memberCount}명의 계획표 이미지 미리보기`}
              />
            </div>
            {error === '' ? null : (
              <p className="manual-plan-image-dialog__error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-panel__actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPreview(null);
                  setError('');
                }}
              >
                사람 다시 고르기
              </button>
              <button
                type="button"
                className={canShare ? 'secondary-button' : 'primary-button'}
                onClick={() => downloadManualPlanImage(preview.blob, preview.filename)}
              >
                이미지 저장하기
              </button>
              {canShare ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleShare()}
                >
                  이미지 공유하기
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
