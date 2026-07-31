import { useEffect, useMemo, useState } from 'react';
import type { MemberDraft } from '../../application/project-setup';
import {
  searchMemberDirectory,
  type MemberDirectory,
  type MemberDirectoryEntry,
} from '../../cloud/member-directory';

export type MemberDirectorySelectionResult =
  | { readonly status: 'SUCCESS' }
  | { readonly status: 'FAILURE'; readonly message: string };

export interface MemberDirectoryPickerProps {
  readonly directory: MemberDirectory;
  readonly member: MemberDraft;
  readonly planMembers: readonly MemberDraft[];
  readonly onAssign: (
    entry: MemberDirectoryEntry,
    displayName: string,
  ) => MemberDirectorySelectionResult;
  readonly onDisplayNameChange: (displayName: string) => void;
  readonly onChooseManualEntry: () => void;
}

type LoadState =
  | { readonly status: 'IDLE' | 'LOADING' }
  | { readonly status: 'READY'; readonly entries: readonly MemberDirectoryEntry[] }
  | { readonly status: 'ERROR'; readonly message: string };

const HANGUL_NAME_PATTERN = /^[가-힣\s]+$/u;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '회원 명단을 불러오지 못했습니다.';
}

export function defaultMemberDisplayName(
  entry: Pick<MemberDirectoryEntry, 'fullName' | 'nickname'>,
): string {
  const nickname = entry.nickname.trim();
  if (nickname !== '') return nickname;

  const fullName = entry.fullName.trim().replace(/\s+/g, ' ');
  if (fullName === '') return '';
  if (HANGUL_NAME_PATTERN.test(fullName)) return fullName.replace(/\s/g, '');
  return fullName.split(' ')[0] ?? '';
}

export function MemberDirectoryPicker({
  directory,
  member,
  planMembers,
  onAssign,
  onDisplayNameChange,
  onChooseManualEntry,
}: MemberDirectoryPickerProps) {
  const [searching, setSearching] = useState(
    () => (member.sourceMemberId?.trim() ?? '') === '',
  );
  const [loadState, setLoadState] = useState<LoadState>({ status: 'IDLE' });
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [pendingEntry, setPendingEntry] = useState<MemberDirectoryEntry | null>(
    null,
  );
  const [missingName, setMissingName] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(member.name);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    setSearching((member.sourceMemberId?.trim() ?? '') === '');
    setQuery('');
    setPendingEntry(null);
    setMissingName('');
    setEditingDisplayName(false);
    setDisplayNameDraft(member.name);
    setSelectionError(null);
  }, [member.memberKey]);

  useEffect(() => {
    if (!searching) return undefined;
    let active = true;
    setLoadState({ status: 'LOADING' });
    void directory.listMembers().then(
      (entries) => {
        if (active) setLoadState({ status: 'READY', entries });
      },
      (error: unknown) => {
        if (active) {
          setLoadState({ status: 'ERROR', message: errorMessage(error) });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [directory, reloadKey, searching]);

  const usedBySourceMemberId = useMemo(
    () =>
      new Map(
        planMembers
          .filter(
            (candidate) =>
              candidate.memberKey !== member.memberKey &&
              candidate.participation === 'ACTIVE' &&
              (candidate.sourceMemberId?.trim() ?? '') !== '',
          )
          .map((candidate) => [candidate.sourceMemberId!, candidate] as const),
      ),
    [member.memberKey, planMembers],
  );
  const results =
    loadState.status === 'READY'
      ? searchMemberDirectory(loadState.entries, query)
      : [];

  const assign = (entry: MemberDirectoryEntry, displayName: string): void => {
    const outcome = onAssign(entry, displayName);
    if (outcome.status === 'FAILURE') {
      setSelectionError(outcome.message);
      return;
    }
    setSearching(false);
    setQuery('');
    setPendingEntry(null);
    setMissingName('');
    setSelectionError(null);
  };

  const choose = (entry: MemberDirectoryEntry): void => {
    setSelectionError(null);
    const displayName = defaultMemberDisplayName(entry);
    if (displayName === '') {
      setPendingEntry(entry);
      setMissingName('');
      return;
    }
    assign(entry, displayName);
  };

  if (!searching && (member.sourceMemberId?.trim() ?? '') !== '') {
    return (
      <section className="member-directory" aria-labelledby="selected-member-title">
        <div className="member-directory__selected">
          <div>
            <h3 id="selected-member-title">선택한 회원</h3>
            <strong>{member.name.trim() || '이름 미입력'}</strong>
            <span>회원번호 {member.memberId.trim() || '미등록'}</span>
            <p role="status">회원 정보가 입력되었습니다.</p>
          </div>
          <div className="member-directory__selected-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSearching(true);
                setSelectionError(null);
              }}
            >
              회원 다시 찾기
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDisplayNameDraft(member.name);
                setEditingDisplayName(true);
              }}
            >
              표시 이름 바꾸기
            </button>
          </div>
        </div>

        {editingDisplayName ? (
          <form
            className="member-directory__display-name"
            onSubmit={(event) => {
              event.preventDefault();
              const displayName = displayNameDraft.trim();
              if (displayName === '') return;
              onDisplayNameChange(displayName);
              setEditingDisplayName(false);
            }}
          >
            <div className="field">
              <label htmlFor={`member-directory-display-name-${member.memberKey}`}>
                계획에 표시할 이름
              </label>
              <input
                id={`member-directory-display-name-${member.memberKey}`}
                value={displayNameDraft}
                autoFocus
                maxLength={40}
                onChange={(event) => setDisplayNameDraft(event.currentTarget.value)}
              />
            </div>
            <div className="button-row">
              <button
                type="submit"
                className="primary-button"
                disabled={displayNameDraft.trim() === ''}
              >
                이 이름으로 표시
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setEditingDisplayName(false)}
              >
                취소
              </button>
            </div>
          </form>
        ) : null}
      </section>
    );
  }

  return (
    <section className="member-directory" aria-labelledby="member-directory-title">
      <div className="member-directory__heading">
        <h3 id="member-directory-title">회원 찾기</h3>
        <p>이름이나 회원번호를 입력해 주세요.</p>
      </div>

      <div className="member-directory__body">
        <div className="field">
          <label htmlFor={`member-directory-search-${member.memberKey}`}>
            이름 또는 회원번호
          </label>
          <input
            id={`member-directory-search-${member.memberKey}`}
            type="search"
            value={query}
            placeholder="예: 엘리 또는 28944433"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPendingEntry(null);
              setSelectionError(null);
            }}
          />
        </div>

        {loadState.status === 'LOADING' ? (
          <p className="help-text" role="status">
            회원 명단을 준비하고 있습니다.
          </p>
        ) : null}
        {loadState.status === 'ERROR' ? (
          <div className="member-directory__error" role="alert">
            <p>{loadState.message}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              다시 시도
            </button>
          </div>
        ) : null}
        {loadState.status === 'READY' && query.trim() === '' ? (
          <p className="help-text">찾을 회원의 이름이나 번호를 입력해 주세요.</p>
        ) : null}
        {loadState.status === 'READY' && query.trim() !== '' && results.length === 0 ? (
          <p className="help-text" role="status">
            일치하는 회원이 없습니다.
          </p>
        ) : null}
        {loadState.status === 'READY' && results.length > 0 ? (
          <ul className="member-directory__results" aria-label="회원 검색 결과">
            {results.map((entry) => {
              const usedMember = usedBySourceMemberId.get(entry.sourceMemberId);
              const isCurrent = member.sourceMemberId === entry.sourceMemberId;
              const memberNumberMissing = entry.memberId === '';
              const disabled = usedMember !== undefined || isCurrent || memberNumberMissing;
              const status = usedMember
                ? '이미 추가됨'
                : isCurrent
                  ? '현재 선택'
                  : memberNumberMissing
                    ? '회원번호 없음'
                    : null;
              const resultName = defaultMemberDisplayName(entry) || '이름 미등록';
              return (
                <li key={entry.sourceMemberId}>
                  <button
                    type="button"
                    className="member-directory__result"
                    disabled={disabled}
                    onClick={() => choose(entry)}
                  >
                    <span className="member-directory__result-main">
                      <strong>{resultName}</strong>
                      {status === null ? (
                        <span className="member-directory__result-action">이 회원 선택</span>
                      ) : (
                        <span className="status-badge">{status}</span>
                      )}
                    </span>
                    <span className="member-directory__result-detail">
                      <span title={entry.fullName}>{entry.fullName || '가입 이름 미등록'}</span>
                      <span>회원번호 {entry.memberId || '미등록'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {pendingEntry === null ? null : (
          <div className="member-directory__missing-name">
            <strong>이 회원은 표시할 이름이 없습니다.</strong>
            <p className="help-text">계획에서 사용할 이름을 입력해 주세요.</p>
            <div className="field">
              <label htmlFor={`member-directory-missing-name-${member.memberKey}`}>
                표시 이름
              </label>
              <input
                id={`member-directory-missing-name-${member.memberKey}`}
                value={missingName}
                autoFocus
                maxLength={40}
                onChange={(event) => {
                  setMissingName(event.currentTarget.value);
                  setSelectionError(null);
                }}
              />
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={missingName.trim() === ''}
              onClick={() => assign(pendingEntry, missingName)}
            >
              이 이름으로 추가
            </button>
          </div>
        )}

        {selectionError === null ? null : (
          <p className="field-error" role="alert">
            {selectionError}
          </p>
        )}

        {(member.sourceMemberId?.trim() ?? '') === '' ? (
          <div className="member-directory__manual-entry">
            <span>찾는 회원이 없어요.</span>
            <button type="button" className="secondary-button" onClick={onChooseManualEntry}>
              직접 입력하기
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
