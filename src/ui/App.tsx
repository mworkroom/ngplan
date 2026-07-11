import { useEffect, useMemo, useRef, useState } from 'react';
import {
  activateProjectSetupBundle,
  addMemberToSlot,
  addRootMember,
  attachSubtree,
  createProjectDraft,
  deriveTopology,
  detachSubtree,
  draftHasMemberData,
  editMemberIdentity,
  editOpeningState,
  editProjectPeriod,
  editProjectTitle,
  excludeMember,
  getDescendantKeys,
  memberCardId,
  moveSubtree,
  normalizeProjectSetup,
  queueEntryId,
  restoreDerivedProjectTitle,
  selectMember,
  setRootMember,
  topologySlotKey,
  validateProjectSetupDraft,
  validationIssueTargetId,
  type ChildSlotState,
  type ExclusionStrategy,
  type IdGenerator,
  type IdKind,
  type MemberDraft,
  type ProjectSetupDraft,
  type ProjectSetupIssue,
  type ProjectSetupValidation,
  type TopologyCommandOutcome,
} from '../application/project-setup';
import { ExcludeMemberDialog } from './components/ExcludeMemberDialog';
import { MemberForm } from './components/MemberForm';
import { OpeningStateForm } from './components/OpeningStateForm';
import { OrganizationTree } from './components/OrganizationTree';
import { ProjectPeriodForm } from './components/ProjectPeriodForm';
import { ReassignmentQueue } from './components/ReassignmentQueue';

type Side = ChildSlotState['side'];
type DisplayDensity = 'COMPACT' | 'COMFORTABLE';

const DISPLAY_DENSITY_STORAGE_KEY = 'ngplan.display-density';

function readDisplayDensity(): DisplayDensity {
  try {
    return window.localStorage.getItem(DISPLAY_DENSITY_STORAGE_KEY) === 'COMFORTABLE'
      ? 'COMFORTABLE'
      : 'COMPACT';
  } catch {
    return 'COMPACT';
  }
}

let sessionSequence = 0;

export function createSessionIdGenerator(
  requestedSessionName?: string,
): IdGenerator {
  const sessionName = (
    requestedSessionName ?? `session-${++sessionSequence}`
  ).replace(/[^a-zA-Z0-9_-]/g, '_');
  const counters: Record<IdKind, number> = {
    PROJECT: 0,
    ORGANIZATION_SNAPSHOT: 0,
    MEMBER: 0,
  };
  return (kind) => {
    counters[kind] += 1;
    return `${kind.toLowerCase().replaceAll('_', '-')}-${sessionName}-${counters[kind]}`;
  };
}

export interface AppProps {
  readonly generateId?: IdGenerator;
  readonly initialDate?: Date;
}

interface SlotAction {
  readonly parentMemberKey: string;
  readonly side: Side;
}

function createInitialDraft(generateId: IdGenerator, date: Date): ProjectSetupDraft {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = readPart('year');
  const month = readPart('month');
  const day = readPart('day');
  return createProjectDraft({
    year,
    month,
    half: day <= 15 ? 'FIRST_HALF' : 'SECOND_HALF',
    generateId,
  });
}

export function App({ generateId: injectedGenerateId, initialDate }: AppProps = {}) {
  const generateIdRef = useRef<IdGenerator | null>(null);
  if (generateIdRef.current === null) {
    generateIdRef.current = injectedGenerateId ?? createSessionIdGenerator();
  }
  const generateId = generateIdRef.current;
  const initialDateRef = useRef(initialDate ?? new Date());
  const [draft, setDraft] = useState<ProjectSetupDraft>(() =>
    createInitialDraft(generateId, initialDateRef.current),
  );
  const [submittedValidation, setSubmittedValidation] =
    useState<ProjectSetupValidation | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [slotAction, setSlotAction] = useState<SlotAction | null>(null);
  const [collapsedMemberKeys, setCollapsedMemberKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [excludedMemberKey, setExcludedMemberKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [displayDensity, setDisplayDensity] = useState<DisplayDensity>(readDisplayDensity);
  const slotFirstActionRef = useRef<HTMLButtonElement>(null);
  const excludeTriggerRef = useRef<HTMLElement | null>(null);

  const topology = useMemo(() => deriveTopology(draft), [draft]);
  const liveValidation = useMemo(() => validateProjectSetupDraft(draft), [draft]);
  const displayedValidation = submittedValidation ?? liveValidation;
  const selectedMember =
    draft.selectedMemberKey === null
      ? undefined
      : topology.memberByKey.get(draft.selectedMemberKey);
  const selectedMemberIssues = selectedMember === undefined
    ? []
    : displayedValidation.issues.filter(
        (issue) => issue.location.memberKey === selectedMember.memberKey,
      );
  const memberPendingExclusion =
    excludedMemberKey === null
      ? undefined
      : topology.memberByKey.get(excludedMemberKey);
  const directChildrenPendingExclusion =
    memberPendingExclusion === undefined
      ? []
      : (topology.childrenByParent.get(memberPendingExclusion.memberKey) ?? [])
          .map((memberKey) => topology.memberByKey.get(memberKey))
          .filter((member): member is MemberDraft => member !== undefined);

  useEffect(() => {
    slotFirstActionRef.current?.focus();
  }, [slotAction]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DISPLAY_DENSITY_STORAGE_KEY, displayDensity);
    } catch {
      // 화면 밀도 저장이 차단돼도 현재 세션의 선택은 유지합니다.
    }
  }, [displayDensity]);

  const focusTopologyMember = (memberKey: string | null): void => {
    window.setTimeout(() => {
      const target =
        memberKey === null
          ? document.getElementById('project-rootMemberKey')
          : document.getElementById(memberCardId(memberKey)) ??
            document.getElementById(queueEntryId(memberKey));
      target?.focus();
      target?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    }, 0);
  };

  const commitDraft = (nextDraft: ProjectSetupDraft, message?: string): void => {
    setDraft(nextDraft);
    setSubmittedValidation(null);
    setCommandError(null);
    if (message !== undefined) {
      setAnnouncement(message);
    }
  };

  const applyTopologyOutcome = (
    outcome: TopologyCommandOutcome,
    message: string,
  ): boolean => {
    if (outcome.status === 'FAILURE') {
      setCommandError(outcome.error.message);
      setAnnouncement(`조직 변경 실패: ${outcome.error.message}`);
      return false;
    }
    commitDraft(outcome.draft, message);
    setSlotAction(null);
    focusTopologyMember(outcome.draft.selectedMemberKey);
    return true;
  };

  const focusIssue = (issue: ProjectSetupIssue): void => {
    if (
      issue.location.memberKey !== undefined &&
      issue.location.area !== 'QUEUE'
    ) {
      setDraft((current) => selectMember(current, issue.location.memberKey ?? null));
    }
    const targetId = validationIssueTargetId(issue);
    window.setTimeout(() => {
      const fallbackId =
        issue.location.memberKey === undefined
          ? 'project-setup'
          : memberCardId(issue.location.memberKey);
      const target = document.getElementById(targetId) ?? document.getElementById(fallbackId);
      target?.focus();
      target?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    }, 0);
  };

  const handleNewProject = (): void => {
    if (
      draftHasMemberData(draft) &&
      !window.confirm(
        '현재 회원과 조직, 시작값을 모두 버리고 새 프로젝트를 시작할까요?',
      )
    ) {
      return;
    }
    const next = createProjectDraft({
      year: draft.year,
      month: draft.month,
      half: draft.half,
      generateId,
    });
    setDraft(next);
    setSubmittedValidation(null);
    setCommandError(null);
    setSlotAction(null);
    setCollapsedMemberKeys(new Set());
    setExcludedMemberKey(null);
    setAnnouncement('새 프로젝트 초안을 만들었습니다. 이전 회원 데이터는 복사하지 않았습니다.');
  };

  const handleAddRoot = (): void => {
    applyTopologyOutcome(
      addRootMember(draft, generateId('MEMBER')),
      '새 루트 회원을 만들었습니다.',
    );
  };

  const handleAddMemberToOpenSlot = (): void => {
    if (slotAction === null) {
      return;
    }
    const succeeded = applyTopologyOutcome(
      addMemberToSlot(
        draft,
        slotAction.parentMemberKey,
        slotAction.side,
        generateId('MEMBER'),
      ),
      `${slotAction.side === 'LEFT' ? '왼쪽' : '오른쪽'} 슬롯에 새 회원을 추가했습니다.`,
    );
    if (succeeded) {
      setSlotAction(null);
    }
  };

  const handleOpenSlot = (parentMemberKey: string, side: Side): void => {
    setCommandError(null);
    if (topology.reassignmentQueue.length === 0) {
      applyTopologyOutcome(
        addMemberToSlot(draft, parentMemberKey, side, generateId('MEMBER')),
        `${side === 'LEFT' ? '왼쪽' : '오른쪽'} 슬롯에 새 회원을 추가했습니다.`,
      );
      return;
    }
    setSlotAction({ parentMemberKey, side });
  };

  const handleRequestExclude = (memberKey: string): void => {
    excludeTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft(selectMember(draft, memberKey));
    setExcludedMemberKey(memberKey);
  };

  const handleAttachQueuedSubtree = (memberKey: string): void => {
    if (slotAction === null) {
      return;
    }
    const succeeded = applyTopologyOutcome(
      attachSubtree(
        draft,
        memberKey,
        slotAction.parentMemberKey,
        slotAction.side,
      ),
      '재배치 대기 서브트리를 빈 슬롯에 연결했습니다.',
    );
    if (succeeded) {
      setSlotAction(null);
    }
  };

  const handleNormalize = (): void => {
    const outcome = normalizeProjectSetup(draft);
    setSubmittedValidation(outcome.validation);
    if (outcome.status === 'FAILURE') {
      setAnnouncement(`설정을 완료하지 못했습니다. 오류 ${outcome.errors.length}개를 확인해 주세요.`);
      const firstError = outcome.errors[0];
      if (firstError !== undefined) {
        focusIssue(firstError);
      }
      return;
    }
    setDraft(activateProjectSetupBundle(draft, outcome.bundle));
    setCommandError(null);
    setAnnouncement('프로젝트 설정이 완료되어 Phase 3 전달 번들이 준비되었습니다.');
  };

  const candidateParents = useMemo(() => {
    if (selectedMember === undefined) {
      return [];
    }
    const descendants = getDescendantKeys(topology, selectedMember.memberKey);
    return topology.activeMembers.filter(
      (candidate) =>
        candidate.memberKey !== selectedMember.memberKey &&
        !descendants.has(candidate.memberKey),
    );
  }, [selectedMember, topology]);

  const slotPanelParent =
    slotAction === null
      ? undefined
      : topology.memberByKey.get(slotAction.parentMemberKey);

  return (
    <main
      id="project-setup"
      className="app-shell"
      data-density={displayDensity === 'COMPACT' ? 'compact' : 'comfortable'}
      tabIndex={-1}
    >
      <header className="app-header">
        <div className="app-header__copy">
          <p className="app-header__eyebrow">ngplan · Phase 2</p>
          <h1>애터미 직급 플랜 설정</h1>
          <p className="app-header__description">
            여기에 팀 전용 COPY 쓸 예정
          </p>
        </div>
        <div className="app-header__actions">
          <span
            className={`status-badge ${
              draft.activeBundle === null
                ? 'status-badge--editing'
                : 'status-badge--ready'
            }`}
          >
            {draft.activeBundle === null ? 'EDITING · 편집 중' : 'READY · 설정 완료'}
          </span>
          <label className="density-control">
            <select
              aria-label="화면 크기"
              value={displayDensity}
              onChange={(event) => setDisplayDensity(event.currentTarget.value as DisplayDensity)}
            >
              <option value="COMPACT">작은 화면</option>
              <option value="COMFORTABLE">큰 화면</option>
            </select>
          </label>

          <button type="button" className="secondary-button" onClick={handleNewProject}>
            새 프로젝트
          </button>
          <button type="button" className="primary-button" onClick={handleNormalize}>
            설정 검증 및 완료
          </button>
        </div>
      </header>

      <aside className="storage-notice" aria-label="저장 안내">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>이 단계에는 저장 기능이 없습니다.</strong>
          <div>
            브라우저를 새로고침하거나 닫으면 현재 초안이 모두 사라집니다. 화면 크기 설정만 저장됩니다.
          </div>
        </div>
      </aside>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {commandError === null ? null : (
        <section className="validation-summary validation-summary--error" role="alert">
          <h2 className="validation-summary__title">조직 변경을 적용하지 못했습니다.</h2>
          <p>{commandError}</p>
        </section>
      )}

      {draft.activeBundle === null ? null : (
        <section className="setup-bundle-summary" aria-labelledby="bundle-summary-title">
          <div className="panel__header">
            <div>
              <h2 id="bundle-summary-title" className="panel__title">
                설정 번들 준비 완료
              </h2>
              <p className="panel__description">
                이후 편집이 발생하면 이 READY 상태는 즉시 해제됩니다.
              </p>
            </div>
            <span className="status-badge status-badge--ready">READY</span>
          </div>
          <dl>
            <dt>제목</dt>
            <dd>{draft.activeBundle.project.title}</dd>
            <dt>기간</dt>
            <dd>
              {draft.activeBundle.project.period.year}년{' '}
              {draft.activeBundle.project.period.month}월{' '}
              {draft.activeBundle.project.period.half === 'FIRST_HALF'
                ? '상반기'
                : '하반기'}
            </dd>
            <dt>활성 회원</dt>
            <dd>{draft.activeBundle.organization.members.length}명</dd>
          </dl>
        </section>
      )}

      <div className="project-period-row">
        <ProjectPeriodForm
          draft={draft}
          issues={displayedValidation.issues}
          onPeriodChange={(patch) => commitDraft(editProjectPeriod(draft, patch))}
          onTitleChange={(title) => commitDraft(editProjectTitle(draft, title))}
          onRestoreDerivedTitle={() => commitDraft(restoreDerivedProjectTitle(draft))}
        />
      </div>

      <div className="workspace-grid">

        <div className="workspace-grid__tree">
          <OrganizationTree
            draft={draft}
            topology={topology}
            issues={displayedValidation.issues}
            collapsedMemberKeys={collapsedMemberKeys}
            onAddRoot={handleAddRoot}
            onSelectMember={(memberKey) => setDraft(selectMember(draft, memberKey))}
            onToggleCollapsed={(memberKey) =>
              setCollapsedMemberKeys((current) => {
                const next = new Set(current);
                if (next.has(memberKey)) {
                  next.delete(memberKey);
                } else {
                  next.add(memberKey);
                }
                return next;
              })
            }
            onOpenSlot={handleOpenSlot}
            onNavigateIssue={focusIssue}
            onRemoveMember={handleRequestExclude}
          />

          {topology.reassignmentQueue.length === 0 ? null : (
            <ReassignmentQueue
              entries={topology.reassignmentQueue}
              rootMissing={draft.rootMemberKey === null}
              onSelect={(memberKey) => setDraft(selectMember(draft, memberKey))}
              onSetRoot={(memberKey) =>
                applyTopologyOutcome(
                  setRootMember(draft, memberKey),
                  '재배치 대기 서브트리를 새 루트로 지정했습니다.',
                )
              }
            />
          )}
        </div>

        <aside className="workspace-grid__sidebar" aria-label="선택한 회원 편집">
          {slotAction === null || slotPanelParent === undefined ? null : (
            <section className="slot-action-panel" aria-labelledby="slot-action-title">
              <div>
                <h3 id="slot-action-title">
                  {slotPanelParent.name.trim() || slotPanelParent.memberKey} ·{' '}
                  {slotAction.side === 'LEFT' ? '왼쪽' : '오른쪽'} 빈 슬롯
                </h3>
                <p className="help-text">새 회원을 만들거나 대기 중인 서브트리를 연결합니다.</p>
              </div>
              <div className="button-row">
                <button ref={slotFirstActionRef} type="button" className="primary-button" onClick={handleAddMemberToOpenSlot}>
                  새 회원 만들기
                </button>
                {topology.reassignmentQueue.map((entry) => (
                  <button type="button" className="secondary-button" key={entry.memberKey} onClick={() => handleAttachQueuedSubtree(entry.memberKey)}>
                    {entry.memberName.trim() || entry.memberKey} 서브트리 연결
                  </button>
                ))}
                <button type="button" className="text-button" onClick={() => setSlotAction(null)}>
                  취소
                </button>
              </div>
            </section>
          )}
          {selectedMemberIssues.length === 0 ? null : (
            <section className="member-error-summary" aria-label="현재 회원 검증 결과" role="alert">
              <strong>현재 회원: 수정할 항목 {selectedMemberIssues.length}개</strong>
              <button type="button" className="text-button" onClick={() => focusIssue(selectedMemberIssues[0]!)}>
                첫 항목으로 이동
              </button>
            </section>
          )}
          {selectedMember === undefined ? (
            <section className="panel empty-state">
              <p>카드에서 회원을 선택하면 상세 입력을 편집할 수 있습니다.</p>
            </section>
          ) : (
            <section className="panel">
              <MemberForm
                member={selectedMember}
                issues={displayedValidation.issues}
                isRoot={draft.rootMemberKey === selectedMember.memberKey}
                candidateParents={candidateParents}
                isSlotAvailable={(parentMemberKey, side) => {
                  const occupant = topology.childBySlot.get(
                    topologySlotKey(parentMemberKey, side),
                  );
                  return occupant === undefined || occupant === selectedMember.memberKey;
                }}
                onIdentityChange={(patch) =>
                  commitDraft(editMemberIdentity(draft, selectedMember.memberKey, patch))
                }
                onMove={(parentMemberKey, side) =>
                  applyTopologyOutcome(
                    moveSubtree(
                      draft,
                      selectedMember.memberKey,
                      parentMemberKey,
                      side,
                    ),
                    '선택한 서브트리를 새 빈 슬롯으로 이동했습니다.',
                  )
                }
                onDetach={() =>
                  applyTopologyOutcome(
                    detachSubtree(draft, selectedMember.memberKey),
                    '선택한 서브트리를 재배치 대기 목록으로 분리했습니다.',
                  )
                }
                onExclude={() => handleRequestExclude(selectedMember.memberKey)}
              />
              <OpeningStateForm
                member={selectedMember}
                issues={displayedValidation.issues}
                onChange={(patch) =>
                  commitDraft(editOpeningState(draft, selectedMember.memberKey, patch))
                }
              />
            </section>
          )}
        </aside>
      </div>

      {memberPendingExclusion === undefined ? null : (
        <ExcludeMemberDialog
          member={memberPendingExclusion}
          directChildren={directChildrenPendingExclusion}
          isRoot={draft.rootMemberKey === memberPendingExclusion.memberKey}
          onCancel={() => {
            setExcludedMemberKey(null);
            window.setTimeout(() => excludeTriggerRef.current?.focus(), 0);
          }}
          onConfirm={(strategy: ExclusionStrategy) => {
            const outcome = excludeMember(
              draft,
              memberPendingExclusion.memberKey,
              strategy,
            );
            const succeeded = applyTopologyOutcome(
              outcome,
              '회원을 제외하고 살아 있는 하위 서브트리를 보존했습니다.',
            );
            if (succeeded) {
              setExcludedMemberKey(null);
            }
          }}
        />
      )}
    </main>
  );
}
