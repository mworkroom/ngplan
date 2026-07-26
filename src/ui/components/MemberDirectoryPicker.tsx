import { useMemo, useState } from 'react';
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
}

type LoadState =
  | { readonly status: 'IDLE' | 'LOADING' }
  | { readonly status: 'READY'; readonly entries: readonly MemberDirectoryEntry[] }
  | { readonly status: 'ERROR'; readonly message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '회원 DB를 불러오지 못했습니다.';
}

export function MemberDirectoryPicker({
  directory,
  member,
  planMembers,
  onAssign,
}: MemberDirectoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'IDLE' });
  const [query, setQuery] = useState('');
  const [pendingEntry, setPendingEntry] = useState<MemberDirectoryEntry | null>(
    null,
  );
  const [shortName, setShortName] = useState('');
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const usedBySourceMemberId = useMemo(
    () =>
      new Map(
        planMembers
          .filter(
            (candidate) =>
              candidate.memberKey !== member.memberKey &&
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

  const load = async (): Promise<void> => {
    setLoadState({ status: 'LOADING' });
    setSelectionError(null);
    try {
      const entries = await directory.listMembers();
      setLoadState({ status: 'READY', entries });
    } catch (error) {
      setLoadState({ status: 'ERROR', message: errorMessage(error) });
    }
  };

  const toggle = (): void => {
    const nextOpen = !open;
    setOpen(nextOpen);
    setSelectionError(null);
    setPendingEntry(null);
    setShortName('');
    if (nextOpen && loadState.status === 'IDLE') {
      void load();
    }
  };

  const assign = (
    entry: MemberDirectoryEntry,
    displayName: string,
  ): void => {
    const outcome = onAssign(entry, displayName);
    if (outcome.status === 'FAILURE') {
      setSelectionError(outcome.message);
      return;
    }
    setOpen(false);
    setQuery('');
    setPendingEntry(null);
    setShortName('');
    setSelectionError(null);
  };

  const choose = (entry: MemberDirectoryEntry): void => {
    setSelectionError(null);
    if (entry.nickname === '') {
      setPendingEntry(entry);
      setShortName('');
      return;
    }
    assign(entry, entry.nickname);
  };

  return (
    <section className="member-directory" aria-labelledby="member-directory-title">
      <div className="member-directory__summary">
        <div>
          <h3 id="member-directory-title">간편 입력</h3>
          <p>
            {member.sourceMemberId
              ? '회원 DB에서 불러온 회원입니다.'
              : '닉네임, 본명 또는 회원번호로 찾을 수 있습니다.'}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          aria-expanded={open}
          onClick={toggle}
        >
          {open
            ? '검색 닫기'
            : member.sourceMemberId
              ? '다른 회원 선택'
              : '불러오기'}
        </button>
      </div>

      {!open ? null : (
        <div className="member-directory__body">
          {loadState.status === 'LOADING' ? (
            <p className="help-text" role="status">
              회원 DB를 불러오고 있습니다…
            </p>
          ) : null}
          {loadState.status === 'ERROR' ? (
            <div className="member-directory__error" role="alert">
              <p>{loadState.message}</p>
              <button type="button" className="secondary-button" onClick={() => void load()}>
                다시 시도
              </button>
            </div>
          ) : null}
          {loadState.status !== 'READY' ? null : (
            <>
              <div className="field">
                <label htmlFor={`member-directory-search-${member.memberKey}`}>
                  회원 검색
                </label>
                <input
                  id={`member-directory-search-${member.memberKey}`}
                  type="search"
                  value={query}
                  placeholder="닉네임, 본명 또는 회원번호"
                  autoComplete="off"
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                    setPendingEntry(null);
                    setSelectionError(null);
                  }}
                />
              </div>
              {query.trim() === '' ? (
                <p className="help-text">
                  검색어를 입력하면 최대 20명의 회원을 보여드립니다.
                </p>
              ) : results.length === 0 ? (
                <p className="help-text" role="status">
                  일치하는 회원이 없습니다.
                </p>
              ) : (
                <ul className="member-directory__results" aria-label="회원 검색 결과">
                  {results.map((entry) => {
                    const usedMember = usedBySourceMemberId.get(
                      entry.sourceMemberId,
                    );
                    const isCurrent =
                      member.sourceMemberId === entry.sourceMemberId;
                    const memberNumberMissing = entry.memberId === '';
                    const disabled =
                      usedMember !== undefined || isCurrent || memberNumberMissing;
                    const status = usedMember
                      ? usedMember.participation === 'EXCLUDED'
                        ? '제외된 회원으로 이미 등록됨'
                        : '이미 추가됨'
                      : isCurrent
                        ? '현재 선택'
                        : memberNumberMissing
                          ? '회원번호 없음'
                          : null;
                    return (
                      <li key={entry.sourceMemberId}>
                        <button
                          type="button"
                          className="member-directory__result"
                          disabled={disabled}
                          onClick={() => choose(entry)}
                        >
                          <span className="member-directory__result-main">
                            <strong>
                              {entry.nickname || '닉네임 없음'}
                            </strong>
                            {status === null ? null : (
                              <span className="status-badge">{status}</span>
                            )}
                          </span>
                          <span className="member-directory__result-detail">
                            <span title={entry.fullName}>
                              {entry.fullName || '본명 미등록'}
                            </span>
                            <span>
                              회원번호 {entry.memberId || '미등록'}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {pendingEntry === null ? null : (
            <div className="member-directory__short-name">
              <strong>이 회원은 닉네임이 없습니다.</strong>
              <p className="help-text">
                시트에 표시할 짧은 이름을 입력해 주세요. 원본 회원 DB는 수정하지 않습니다.
              </p>
              <div className="field">
                <label htmlFor={`member-directory-short-name-${member.memberKey}`}>
                  시트 표시 이름
                </label>
                <input
                  id={`member-directory-short-name-${member.memberKey}`}
                  value={shortName}
                  autoFocus
                  maxLength={40}
                  onChange={(event) => {
                    setShortName(event.currentTarget.value);
                    setSelectionError(null);
                  }}
                />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="primary-button"
                  disabled={shortName.trim() === ''}
                  onClick={() => assign(pendingEntry, shortName)}
                >
                  이 이름으로 추가
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setPendingEntry(null);
                    setShortName('');
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {selectionError === null ? null : (
            <p className="field-error" role="alert">
              {selectionError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
