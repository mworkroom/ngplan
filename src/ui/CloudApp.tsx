import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { IdGenerator, IdKind } from '../application/project-setup';
import {
  workspaceSessionFromCloudDocument,
  type CloudPlanDocumentV2,
} from '../cloud/cloud-plan-document';
import {
  createCachedPlanRecord,
  IndexedDbPlanCache,
} from '../cloud/indexeddb-plan-cache';
import { PlanSaveCoordinator } from '../cloud/plan-save-coordinator';
import {
  createRecoveryCopySession,
  deriveRecommendedPlanningPeriod,
  type PlanningPeriod,
} from '../cloud/plan-recovery';
import {
  SupabaseMemberDirectory,
  type MemberDirectory,
} from '../cloud/member-directory';
import { supabaseClient } from '../cloud/supabase-client';
import { SupabasePlanRepository } from '../cloud/supabase-plan-repository';
import type {
  CachedPlanRecord,
  CloudProjectSummary,
  CloudSaveStatus,
  CloudWorkspace,
  PlanCache,
  PlanRepository,
  RecoveryPointSummary,
  SafetyBackupReason,
} from '../cloud/types';
import { App } from './App';
import { NewPlanPeriodDialog } from './components/NewPlanPeriodDialog';
import type { WorkspaceSessionSnapshot } from './workspace-session-storage';

interface EditorSelection {
  readonly projectId: string;
  readonly initialPeriod: PlanningPeriod | null;
  readonly initialSession: WorkspaceSessionSnapshot | null;
  readonly initialRecord: CachedPlanRecord | null;
  readonly initialRemoteDocument: CloudPlanDocumentV2 | null;
}

export interface CloudAppProps {
  readonly client?: SupabaseClient | null;
  readonly memberDirectory?: MemberDirectory;
  readonly repository?: PlanRepository;
  readonly cache?: PlanCache;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

function safePeriodNumber(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function titleFromCache(record: CachedPlanRecord): string {
  const title = record.document.draft.title.trim();
  return title === '' ? '이름 없는 계획' : title;
}

function summaryFromCache(record: CachedPlanRecord): CloudProjectSummary {
  return {
    id: record.projectId,
    workspaceId: record.workspaceId,
    title: titleFromCache(record),
    periodYear: safePeriodNumber(record.document.draft.year, 2000, 2200),
    periodMonth: safePeriodNumber(record.document.draft.month, 1, 12),
    periodHalf: record.document.draft.half,
    revision: record.remoteRevision ?? 0,
    hiddenAt: record.hiddenAt,
    updatedAt: record.localUpdatedAt,
    lastSavedAt: record.remoteLastSavedAt ?? record.localUpdatedAt,
    localOnly: record.remoteRevision === null,
    pendingRemote: record.pendingRemote,
  };
}

export function mergeCloudProjectLists(
  remoteVisible: readonly CloudProjectSummary[],
  remoteHidden: readonly CloudProjectSummary[],
  cachedRecords: readonly CachedPlanRecord[],
  remoteAvailable: boolean,
): {
  readonly visible: readonly CloudProjectSummary[];
  readonly hidden: readonly CloudProjectSummary[];
} {
  const cachedById = new Map(
    cachedRecords.map((record) => [record.projectId, record] as const),
  );
  const merged = new Map<string, CloudProjectSummary>();
  for (const remote of [...remoteVisible, ...remoteHidden]) {
    const cached = cachedById.get(remote.id);
    merged.set(
      remote.id,
      cached?.pendingRemote === true
        ? {
            ...summaryFromCache(cached),
            hiddenAt: remote.hiddenAt,
            localOnly: false,
          }
        : remote,
    );
  }
  for (const cached of cachedRecords) {
    if (!merged.has(cached.projectId) && (!remoteAvailable || cached.pendingRemote)) {
      merged.set(cached.projectId, summaryFromCache(cached));
    }
  }
  const all = [...merged.values()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  return {
    visible: all.filter((project) => project.hiddenAt === null),
    hidden: all.filter((project) => project.hiddenAt !== null),
  };
}

function createCloudIdGenerator(
  projectId: string,
  initialProjectIdAvailable: boolean,
): IdGenerator {
  return (kind: IdKind) => {
    if (kind === 'PROJECT' && initialProjectIdAvailable) {
      initialProjectIdAvailable = false;
      return projectId;
    }
    return crypto.randomUUID();
  };
}

function formatPeriod(project: CloudProjectSummary): string {
  const year = project.periodYear?.toString() ?? '연도 입력 중';
  const month =
    project.periodMonth === null ? '월 입력 중' : `${project.periodMonth}월`;
  const half = project.periodHalf === 'FIRST_HALF' ? '전반' : '후반';
  return `${year}년 ${month} ${half}`;
}

function formatSavedAt(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '저장 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function resolveCloudAppRedirectUrl(
  currentUrl: string,
  baseUrl = import.meta.env.BASE_URL,
): string {
  return new URL(baseUrl, currentUrl).toString();
}

function LoginScreen({
  client,
}: {
  readonly client: SupabaseClient;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (): Promise<void> => {
    setPending(true);
    setError(null);
    const redirectTo = resolveCloudAppRedirectUrl(window.location.href);
    const { error: signInError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (signInError !== null) {
      setPending(false);
      setError(signInError.message);
    }
  };

  return (
    <main className="cloud-gate">
      <section className="cloud-gate__card" aria-labelledby="login-title">
        <p className="app-header__eyebrow">애터미 직급 계획표</p>
        <h1 id="login-title">계획표 로그인</h1>
        <p>등록된 계정으로 로그인해 주세요.</p>
        <button
          type="button"
          className="primary-button cloud-gate__button"
          onClick={() => void signIn()}
          disabled={pending}
        >
          {pending ? '로그인 화면 여는 중…' : 'Google로 로그인'}
        </button>
        {error === null ? null : (
          <p className="cloud-message cloud-message--error" role="alert">
            로그인하지 못했습니다. {error}
          </p>
        )}
      </section>
    </main>
  );
}

function ConfigurationScreen() {
  return (
    <main className="cloud-gate">
      <section className="cloud-gate__card" aria-labelledby="config-title">
        <p className="app-header__eyebrow">애터미 직급 계획표</p>
        <h1 id="config-title">클라우드 연결 설정이 필요합니다</h1>
        <p>
          배포 환경에 Supabase URL과 publishable key를 등록한 뒤 다시
          빌드해 주세요.
        </p>
      </section>
    </main>
  );
}

function LoadingScreen({ message }: { readonly message: string }) {
  return (
    <main className="cloud-gate" aria-busy="true">
      <section className="cloud-gate__card">
        <p className="cloud-loading" role="status">
          {message}
        </p>
      </section>
    </main>
  );
}

function ProjectCard({
  project,
  onOpen,
  onOpenRecovery,
  onToggleHidden,
  actionPending,
}: {
  readonly project: CloudProjectSummary;
  readonly onOpen: (project: CloudProjectSummary) => void;
  readonly onOpenRecovery?:
    | ((project: CloudProjectSummary) => void)
    | undefined;
  readonly onToggleHidden: (project: CloudProjectSummary) => void;
  readonly actionPending: boolean;
}) {
  const hidden = project.hiddenAt !== null;
  return (
    <article className="cloud-project-card">
      <div className="cloud-project-card__copy">
        <h3>{project.title}</h3>
        <p>{formatPeriod(project)}</p>
        <p className="cloud-project-card__saved">
          <span>한국 시간 {formatSavedAt(project.lastSavedAt, 'Asia/Seoul')}</span>
          <span>
            브라질 시간{' '}
            {formatSavedAt(project.lastSavedAt, 'America/Sao_Paulo')}
          </span>
        </p>
        {project.pendingRemote ? (
          <span className="cloud-project-card__pending">
            이 기기에 저장됨 · 동기화 대기
          </span>
        ) : null}
      </div>
      <div className="cloud-project-card__actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => onOpen(project)}
          disabled={actionPending}
        >
          계획 열기
        </button>
        {onOpenRecovery === undefined || project.localOnly ? null : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onOpenRecovery(project)}
            disabled={actionPending}
          >
            이전 내용 보기
          </button>
        )}
        <button
          type="button"
          className="secondary-button"
          onClick={() => onToggleHidden(project)}
          disabled={actionPending || project.localOnly}
          title={
            project.localOnly
              ? '클라우드 저장이 끝난 뒤 숨길 수 있습니다.'
              : undefined
          }
        >
          {hidden ? '다시 보이기' : '목록에서 숨기기'}
        </button>
      </div>
    </article>
  );
}

function ProjectListScreen({
  visible,
  hidden,
  offline,
  error,
  onNew,
  onOpen,
  onOpenRecovery,
  onToggleHidden,
  onRefresh,
  onSignOut,
}: {
  readonly visible: readonly CloudProjectSummary[];
  readonly hidden: readonly CloudProjectSummary[];
  readonly offline: boolean;
  readonly error: string | null;
  readonly onNew: () => void;
  readonly onOpen: (project: CloudProjectSummary) => void;
  readonly onOpenRecovery?:
    | ((project: CloudProjectSummary) => void)
    | undefined;
  readonly onToggleHidden: (project: CloudProjectSummary) => Promise<void>;
  readonly onRefresh: () => Promise<void>;
  readonly onSignOut: () => Promise<void>;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const [actionProjectId, setActionProjectId] = useState<string | null>(null);

  const toggleHidden = async (project: CloudProjectSummary): Promise<void> => {
    setActionProjectId(project.id);
    try {
      await onToggleHidden(project);
    } finally {
      setActionProjectId(null);
    }
  };

  return (
    <main className="cloud-projects">
      <header className="cloud-projects__header setup-command-header">
        <h1>애터미 직급 계획표</h1>
        <div className="cloud-projects__header-actions">
          <button type="button" className="setup-command-header__action" onClick={onNew}>
            새 계획 만들기
          </button>
          <button
            type="button"
            className="setup-command-header__action"
            onClick={() => void onSignOut()}
          >
            로그아웃
          </button>
        </div>
      </header>

      {offline ? (
        <p className="cloud-message" role="status">
          인터넷 연결을 확인하는 동안 이 기기에 저장된 계획을 보여드립니다.
          연결되면 자동으로 동기화합니다.
        </p>
      ) : null}
      {error === null ? null : (
        <div className="cloud-message cloud-message--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void onRefresh()}
          >
            다시 불러오기
          </button>
        </div>
      )}

      <section className="cloud-projects__section" aria-labelledby="visible-projects">
        <div className="cloud-projects__section-header">
          <h2 id="visible-projects">전체 목록</h2>
          <span>{visible.length}개</span>
        </div>
        {visible.length === 0 ? (
          <div className="cloud-empty">
            <p>아직 저장된 계획이 없습니다.</p>
            <button type="button" className="primary-button" onClick={onNew}>
              첫 계획 만들기
            </button>
          </div>
        ) : (
          <div className="cloud-project-grid">
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={onOpen}
                onOpenRecovery={onOpenRecovery}
                onToggleHidden={(item) => void toggleHidden(item)}
                actionPending={actionProjectId === project.id}
              />
            ))}
          </div>
        )}
      </section>

      <section className="cloud-projects__section cloud-projects__section--hidden">
        <button
          type="button"
          className="secondary-button"
          aria-expanded={showHidden}
          aria-controls="hidden-projects"
          onClick={() => setShowHidden((current) => !current)}
        >
          숨긴 계획 보기 ({hidden.length})
        </button>
        <div id="hidden-projects" hidden={!showHidden}>
          {hidden.length === 0 ? (
            <p className="cloud-empty">숨긴 계획이 없습니다.</p>
          ) : (
            <div className="cloud-project-grid">
              {hidden.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={onOpen}
                  onOpenRecovery={onOpenRecovery}
                  onToggleHidden={(item) => void toggleHidden(item)}
                  actionPending={actionProjectId === project.id}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function recoveryReasonLabel(point: RecoveryPointSummary): string {
  switch (point.reason) {
    case 'BEFORE_PERIOD_CHANGE':
      return '기간을 바꾸기 전';
    case 'BEFORE_AUTOMATIC_PLAN_APPLY':
      return '자동 계산을 적용하기 전';
    case 'BEFORE_MEMBER_EXCLUSION':
      return '회원을 삭제하기 전';
    case 'AUTO_15_MIN':
      return '자동 저장';
    case 'DAILY':
      return '자동 저장';
  }
}

function RecoveryPointSection({
  title,
  description,
  points,
  pendingKey,
  onOpenCopy,
  initiallyOpen = false,
}: {
  readonly title: string;
  readonly description: string;
  readonly points: readonly RecoveryPointSummary[];
  readonly pendingKey: string | null;
  readonly onOpenCopy: (point: RecoveryPointSummary) => void;
  readonly initiallyOpen?: boolean;
}) {
  if (points.length === 0) return null;

  return (
    <details className="recovery-section" open={initiallyOpen}>
      <summary>
        {title} <span>{points.length}개</span>
      </summary>
      <p className="help-text">{description}</p>
      <ul className="recovery-list">
        {points.map((point) => (
          <li key={point.key}>
            <div>
              <strong>{recoveryReasonLabel(point)}</strong>
              <span>{formatSavedAt(point.capturedAt, 'Asia/Seoul')}</span>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={pendingKey !== null}
              onClick={() => onOpenCopy(point)}
            >
              {pendingKey === point.key
                ? '새 계획 만드는 중…'
                : '이때 내용으로 새 계획 만들기'}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RecoveryDialog({
  project,
  points,
  loading,
  error,
  pendingKey,
  onOpenCopy,
  onRetry,
  onClose,
}: {
  readonly project: CloudProjectSummary;
  readonly points: readonly RecoveryPointSummary[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly pendingKey: string | null;
  readonly onOpenCopy: (point: RecoveryPointSummary) => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  const safety = points.filter((point) => point.kind === 'SAFETY');
  const automatic = points.filter((point) => point.kind !== 'SAFETY');
  return (
    <div className="period-dialog-backdrop" role="presentation">
      <section
        className="period-dialog recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-dialog-title"
      >
        <div className="period-dialog__header">
          <div>
            <p className="period-confirmation__eyebrow">{project.title}</p>
            <h2 id="recovery-dialog-title">이전 내용으로 새 계획 만들기</h2>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={pendingKey !== null}
          >
            닫기
          </button>
        </div>
        <p className="recovery-dialog__notice">
          현재 계획은 지워지지 않습니다.
          <br />
          원하는 시간을 고르면 그때 내용으로 새 계획이 만들어집니다.
        </p>
        {loading ? <p role="status">이전 내용을 불러오는 중…</p> : null}
        {error === null ? null : (
          <div className="cloud-message cloud-message--error" role="alert">
            <span>{error}</span>
            <button type="button" className="secondary-button" onClick={onRetry}>
              다시 불러오기
            </button>
          </div>
        )}
        {loading || error !== null ? null : (
          <div className="recovery-dialog__sections">
            {points.length === 0 ? (
              <p className="cloud-empty">아직 불러올 수 있는 이전 내용이 없습니다.</p>
            ) : null}
            <RecoveryPointSection
              title="실수하기 전 자동 저장"
              description="기간을 바꾸거나 자동 계산을 적용하거나 회원을 삭제하기 전에 자동으로 저장한 내용입니다."
              points={safety}
              pendingKey={pendingKey}
              onOpenCopy={onOpenCopy}
              initiallyOpen
            />
            <RecoveryPointSection
              title="이전 자동 저장"
              description="작업하는 동안 자동으로 저장한 내용입니다."
              points={automatic}
              pendingKey={pendingKey}
              onOpenCopy={onOpenCopy}
              initiallyOpen={safety.length === 0}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function CloudProjectEditor({
  user,
  workspace,
  selection,
  memberDirectory,
  repository,
  cache,
  onBack,
  onOpenCopy,
}: {
  readonly user: User;
  readonly workspace: CloudWorkspace;
  readonly selection: EditorSelection;
  readonly memberDirectory: MemberDirectory;
  readonly repository: PlanRepository;
  readonly cache: PlanCache;
  readonly onBack: () => void;
  readonly onOpenCopy: (snapshot: WorkspaceSessionSnapshot) => void;
}) {
  const [, setStatus] = useState<CloudSaveStatus>(() => ({
    state:
      selection.initialRecord?.pendingRemote === true
        ? navigator.onLine
          ? 'SAVING'
          : 'OFFLINE'
        : selection.initialRemoteDocument === null
          ? 'SAVING'
          : 'SAVED',
    lastSavedAt:
      selection.initialRecord?.remoteLastSavedAt ??
      selection.initialRecord?.remoteUpdatedAt ??
      null,
    message:
      selection.initialRecord?.pendingRemote === true && !navigator.onLine
        ? '오프라인 저장됨'
        : selection.initialRemoteDocument === null
          ? '저장 중'
          : '저장됨',
  }));
  const coordinatorRef = useRef<PlanSaveCoordinator | null>(null);
  if (coordinatorRef.current === null) {
    coordinatorRef.current = new PlanSaveCoordinator({
      workspaceId: workspace.id,
      projectId: selection.projectId,
      verifiedUserId: user.id,
      repository,
      cache,
      initialRecord: selection.initialRecord,
      initialRemoteDocument: selection.initialRemoteDocument,
      onStatus: setStatus,
    });
  }
  const coordinator = coordinatorRef.current;
  const generateId = useMemo(
    () =>
      createCloudIdGenerator(
        selection.projectId,
        selection.initialSession === null,
      ),
    [selection.initialSession, selection.projectId],
  );
  const handleSessionChange = useCallback(
    (snapshot: WorkspaceSessionSnapshot) => coordinator.schedule(snapshot),
    [coordinator],
  );

  useEffect(() => {
    coordinator.resume();
    const handleOnline = () => coordinator.handleOnline();
    const handlePageExit = () => void coordinator.flushNow();
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void coordinator.flushNow();
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageExit);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handlePageExit);
      document.removeEventListener('visibilitychange', handleVisibility);
      coordinator.dispose();
    };
  }, [coordinator]);

  const leaveEditor = async (): Promise<void> => {
    await coordinator.flushNow();
    onBack();
  };

  const createPlanCopy = async (
    snapshot: WorkspaceSessionSnapshot,
  ): Promise<void> => {
    await coordinator.flushNow();
    onOpenCopy(snapshot);
  };

  const createSafetyBackup = async (
    reason: SafetyBackupReason,
  ): Promise<void> => coordinator.createSafetyBackup(reason);

  return (
    <App
      key={selection.projectId}
      generateId={generateId}
      initialPeriod={selection.initialPeriod ?? undefined}
      memberDirectory={memberDirectory}
      initialWorkspaceSession={selection.initialSession}
      onWorkspaceSessionChange={handleSessionChange}
      onCreatePlanCopy={createPlanCopy}
      onRequestSafetyBackup={
        repository.createSafetyBackup === undefined
          ? undefined
          : createSafetyBackup
      }
      onBackToPlanList={() => void leaveEditor()}
    />
  );
}

function AuthenticatedCloudWorkspace({
  user,
  memberDirectory,
  repository,
  cache,
  onSignOut,
}: {
  readonly user: User;
  readonly memberDirectory: MemberDirectory;
  readonly repository: PlanRepository;
  readonly cache: PlanCache;
  readonly onSignOut: () => Promise<void>;
}) {
  const [workspace, setWorkspace] = useState<CloudWorkspace | null>(null);
  const [visible, setVisible] = useState<readonly CloudProjectSummary[]>([]);
  const [hidden, setHidden] = useState<readonly CloudProjectSummary[]>([]);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlanPeriod, setNewPlanPeriod] = useState<PlanningPeriod | null>(null);
  const [recoveryProject, setRecoveryProject] =
    useState<CloudProjectSummary | null>(null);
  const [recoveryPoints, setRecoveryPoints] =
    useState<readonly RecoveryPointSummary[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryPendingKey, setRecoveryPendingKey] = useState<string | null>(null);

  const loadLists = useCallback(
    async (activeWorkspace: CloudWorkspace): Promise<void> => {
      const cachedRecords = await cache.list(activeWorkspace.id, user.id);
      let remoteVisible: readonly CloudProjectSummary[] = [];
      let remoteHidden: readonly CloudProjectSummary[] = [];
      let remoteAvailable = false;
      try {
        [remoteVisible, remoteHidden] = await Promise.all([
          repository.listProjects(activeWorkspace.id, 'VISIBLE'),
          repository.listProjects(activeWorkspace.id, 'HIDDEN'),
        ]);
        remoteAvailable = true;
      } catch (listError) {
        if (cachedRecords.length === 0) throw listError;
      }
      const merged = mergeCloudProjectLists(
        remoteVisible,
        remoteHidden,
        cachedRecords,
        remoteAvailable,
      );
      setVisible(merged.visible);
      setHidden(merged.hidden);
      setOffline(!remoteAvailable);
      setError(
        remoteAvailable
          ? null
          : '클라우드 목록을 불러오지 못해 이 기기의 사본을 보여드립니다.',
      );
    },
    [cache, repository, user.id],
  );

  const synchronizePendingRecords = useCallback(
    async (activeWorkspace: CloudWorkspace): Promise<void> => {
      const records = await cache.list(activeWorkspace.id, user.id);
      for (const record of records) {
        if (!record.pendingRemote) continue;
        try {
          const saved = await repository.saveProject(
            activeWorkspace.id,
            record.document,
          );
          await cache.put({
            ...record,
            pendingRemote: false,
            remoteRevision: saved.revision,
            remoteUpdatedAt: saved.updatedAt,
            remoteLastSavedAt: saved.lastSavedAt,
            lastAttemptAt: new Date().toISOString(),
            lastError: null,
          });
        } catch {
          return;
        }
      }
    },
    [cache, repository, user.id],
  );

  const initialize = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const cachedWorkspaceId = await cache.findWorkspaceId(user.id);
    let activeWorkspace: CloudWorkspace;
    let verifiedOnline = false;
    try {
      activeWorkspace = await repository.findWorkspace();
      verifiedOnline = true;
      await cache.authorizeUser(activeWorkspace.id, user.id);
    } catch (workspaceError) {
      if (cachedWorkspaceId === null) throw workspaceError;
      activeWorkspace = { id: cachedWorkspaceId, name: 'ngplan' };
    }
    setWorkspace(activeWorkspace);
    if (verifiedOnline) {
      await synchronizePendingRecords(activeWorkspace);
    }
    await loadLists(activeWorkspace);
    setLoading(false);
  }, [cache, loadLists, repository, synchronizePendingRecords, user.id]);

  useEffect(() => {
    let active = true;
    void initialize().catch((initializationError) => {
      if (!active) return;
      setError(messageFromError(initializationError));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [initialize]);

  const refresh = async (): Promise<void> => {
    if (workspace === null) {
      await initialize();
      return;
    }
    setError(null);
    try {
      await synchronizePendingRecords(workspace);
      await loadLists(workspace);
    } catch (refreshError) {
      setError(messageFromError(refreshError));
    }
  };

  const openProject = async (project: CloudProjectSummary): Promise<void> => {
    if (workspace === null) return;
    setLoading(true);
    setError(null);
    try {
      const cached = await cache.get(workspace.id, project.id, user.id);
      if (cached?.pendingRemote === true) {
        setSelection({
          projectId: project.id,
          initialPeriod: null,
          initialSession: cached.workspaceSession,
          initialRecord: cached,
          initialRemoteDocument: null,
        });
        return;
      }
      try {
        const remote = await repository.loadProject(workspace.id, project.id);
        const session = workspaceSessionFromCloudDocument(
          remote.document,
          cached?.workspaceSession,
        );
        const nextCache = createCachedPlanRecord({
          workspaceId: workspace.id,
          verifiedUserId: user.id,
          ...(cached === null
            ? {}
            : { verifiedUserIds: cached.verifiedUserIds }),
          document: remote.document,
          workspaceSession: session,
          pendingRemote: false,
          remoteRevision: remote.revision,
          remoteUpdatedAt: remote.updatedAt,
          remoteLastSavedAt: remote.lastSavedAt,
          hiddenAt: remote.hiddenAt,
          localUpdatedAt: new Date().toISOString(),
        });
        await cache.put(nextCache);
        setSelection({
          projectId: project.id,
          initialPeriod: null,
          initialSession: session,
          initialRecord: nextCache,
          initialRemoteDocument: remote.document,
        });
      } catch (remoteError) {
        if (cached === null) throw remoteError;
        setOffline(true);
        setSelection({
          projectId: project.id,
          initialPeriod: null,
          initialSession: cached.workspaceSession,
          initialRecord: cached,
          initialRemoteDocument: null,
        });
      }
    } catch (openError) {
      setError(messageFromError(openError));
    } finally {
      setLoading(false);
    }
  };

  const requestNewProject = (): void => {
    setNewPlanPeriod(deriveRecommendedPlanningPeriod(new Date()));
  };

  const createNewProject = (period: PlanningPeriod): void => {
    const projectId = crypto.randomUUID();
    setNewPlanPeriod(null);
    setSelection({
      projectId,
      initialPeriod: period,
      initialSession: null,
      initialRecord: null,
      initialRemoteDocument: null,
    });
  };

  const loadRecoveryPoints = async (
    project: CloudProjectSummary,
  ): Promise<void> => {
    if (workspace === null || repository.listRecoveryPoints === undefined) return;
    setRecoveryLoading(true);
    setRecoveryError(null);
    try {
      setRecoveryPoints(
        await repository.listRecoveryPoints(workspace.id, project.id),
      );
    } catch (recoveryLoadError) {
      setRecoveryError(messageFromError(recoveryLoadError));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const openRecovery = (project: CloudProjectSummary): void => {
    setRecoveryProject(project);
    setRecoveryPoints([]);
    void loadRecoveryPoints(project);
  };

  const openRecoveryCopy = async (
    point: RecoveryPointSummary,
  ): Promise<void> => {
    if (
      workspace === null ||
      recoveryProject === null ||
      repository.loadRecoveryPoint === undefined
    ) {
      return;
    }
    setRecoveryPendingKey(point.key);
    setRecoveryError(null);
    try {
      const document = await repository.loadRecoveryPoint(
        workspace.id,
        recoveryProject.id,
        point,
      );
      const session = createRecoveryCopySession(document, {
        projectId: crypto.randomUUID(),
        organizationSnapshotId: crypto.randomUUID(),
      });
      setRecoveryProject(null);
      setSelection({
        projectId: session.draft.projectId,
        initialPeriod: null,
        initialSession: session,
        initialRecord: null,
        initialRemoteDocument: null,
      });
    } catch (recoveryOpenError) {
      setRecoveryError(messageFromError(recoveryOpenError));
    } finally {
      setRecoveryPendingKey(null);
    }
  };

  const toggleHidden = async (project: CloudProjectSummary): Promise<void> => {
    if (workspace === null) return;
    await repository.setProjectHidden(
      workspace.id,
      project.id,
      project.hiddenAt === null,
    );
    const cached = await cache.get(workspace.id, project.id, user.id);
    if (cached !== null) {
      await cache.put({
        ...cached,
        hiddenAt:
          project.hiddenAt === null ? new Date().toISOString() : null,
      });
    }
    await loadLists(workspace);
  };

  if (loading) {
    return <LoadingScreen message="저장된 계획을 확인하고 있습니다…" />;
  }
  if (workspace === null) {
    return (
      <main className="cloud-gate">
        <section className="cloud-gate__card">
          <h1>계획을 열 수 없습니다</h1>
          <p className="cloud-message cloud-message--error" role="alert">
            {error ?? 'ngplan 작업공간을 찾지 못했습니다.'}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void initialize().catch((initializationError) => {
                setError(messageFromError(initializationError));
                setLoading(false);
              });
            }}
          >
            다시 시도
          </button>
        </section>
      </main>
    );
  }
  if (selection !== null) {
    return (
      <CloudProjectEditor
        key={selection.projectId}
        user={user}
        workspace={workspace}
        selection={selection}
        memberDirectory={memberDirectory}
        repository={repository}
        cache={cache}
        onOpenCopy={(snapshot) => {
          setSelection({
            projectId: snapshot.draft.projectId,
            initialPeriod: null,
            initialSession: snapshot,
            initialRecord: null,
            initialRemoteDocument: null,
          });
        }}
        onBack={() => {
          setSelection(null);
          void refresh();
        }}
      />
    );
  }
  return (
    <>
      <ProjectListScreen
        visible={visible}
        hidden={hidden}
        offline={offline}
        error={error}
        onNew={requestNewProject}
        onOpen={(project) => void openProject(project)}
        onOpenRecovery={
          repository.listRecoveryPoints === undefined ||
          repository.loadRecoveryPoint === undefined
            ? undefined
            : openRecovery
        }
        onToggleHidden={toggleHidden}
        onRefresh={refresh}
        onSignOut={onSignOut}
      />
      {newPlanPeriod === null ? null : (
        <NewPlanPeriodDialog
          recommended={newPlanPeriod}
          onConfirm={createNewProject}
          onCancel={() => setNewPlanPeriod(null)}
        />
      )}
      {recoveryProject === null ? null : (
        <RecoveryDialog
          project={recoveryProject}
          points={recoveryPoints}
          loading={recoveryLoading}
          error={recoveryError}
          pendingKey={recoveryPendingKey}
          onOpenCopy={(point) => void openRecoveryCopy(point)}
          onRetry={() => void loadRecoveryPoints(recoveryProject)}
          onClose={() => {
            setRecoveryProject(null);
            setRecoveryPoints([]);
            setRecoveryError(null);
          }}
        />
      )}
    </>
  );
}

export function CloudApp({
  client = supabaseClient,
  memberDirectory: injectedMemberDirectory,
  repository: injectedRepository,
  cache: injectedCache,
}: CloudAppProps = {}) {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(client !== null);
  const [authError, setAuthError] = useState<string | null>(null);
  const repository = useMemo(
    () =>
      injectedRepository ??
      (client === null ? null : new SupabasePlanRepository(client)),
    [client, injectedRepository],
  );
  const memberDirectory = useMemo(
    () =>
      injectedMemberDirectory ??
      (client === null ? null : new SupabaseMemberDirectory(client)),
    [client, injectedMemberDirectory],
  );
  const cache = useMemo(
    () => injectedCache ?? new IndexedDbPlanCache(),
    [injectedCache],
  );

  useEffect(() => {
    if (client === null) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error !== null) setAuthError(error.message);
      setUser(data.session?.user ?? null);
      setCheckingSession(false);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setCheckingSession(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  if (client === null || repository === null || memberDirectory === null) {
    return <ConfigurationScreen />;
  }
  if (checkingSession) {
    return <LoadingScreen message="로그인 상태를 확인하고 있습니다…" />;
  }
  if (authError !== null && user === null) {
    return (
      <main className="cloud-gate">
        <section className="cloud-gate__card">
          <h1>로그인 상태를 확인하지 못했습니다</h1>
          <p className="cloud-message cloud-message--error" role="alert">
            {authError}
          </p>
        </section>
      </main>
    );
  }
  if (user === null) {
    return <LoginScreen client={client} />;
  }

  const signOut = async (): Promise<void> => {
    const { error } = await client.auth.signOut();
    if (error !== null) {
      setAuthError(error.message);
    }
  };

  return (
    <AuthenticatedCloudWorkspace
      user={user}
      memberDirectory={memberDirectory}
      repository={repository}
      cache={cache}
      onSignOut={signOut}
    />
  );
}
