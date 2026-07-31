import {
  cloudDocumentFromWorkspaceSession,
  serializeCloudPlanDocument,
  type CloudPlanDocumentV1,
} from './cloud-plan-document';
import { createCachedPlanRecord } from './indexeddb-plan-cache';
import type {
  CachedPlanRecord,
  CloudSaveStatus,
  PlanCache,
  PlanRepository,
  SafetyBackupReason,
} from './types';
import type { WorkspaceSessionSnapshot } from '../ui/workspace-session-storage';

const DEFAULT_LOCAL_DELAY_MS = 500;
const DEFAULT_REMOTE_DELAY_MS = 2_000;
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000] as const;

interface PlanSaveCoordinatorOptions {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly verifiedUserId: string;
  readonly repository: PlanRepository;
  readonly cache: PlanCache;
  readonly initialRecord?: CachedPlanRecord | null;
  readonly initialRemoteDocument?: CloudPlanDocumentV1 | null;
  readonly onStatus: (status: CloudSaveStatus) => void;
  readonly isOnline?: () => boolean;
  readonly now?: () => Date;
  readonly localDelayMs?: number;
  readonly remoteDelayMs?: number;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : '알 수 없는 저장 오류가 발생했습니다.';
}

export class PlanSaveCoordinator {
  readonly #workspaceId: string;
  readonly #projectId: string;
  readonly #verifiedUserId: string;
  readonly #verifiedUserIds: readonly string[];
  readonly #repository: PlanRepository;
  readonly #cache: PlanCache;
  readonly #onStatus: (status: CloudSaveStatus) => void;
  readonly #isOnline: () => boolean;
  readonly #now: () => Date;
  readonly #localDelayMs: number;
  readonly #remoteDelayMs: number;
  #latestSnapshot: WorkspaceSessionSnapshot | null = null;
  #lastRemoteDocumentJson: string | null;
  #remoteRevision: number | null;
  #remoteUpdatedAt: string | null;
  #remoteLastSavedAt: string | null;
  #hiddenAt: string | null;
  #lastAttemptAt: string | null;
  #lastError: string | null;
  #localUpdatedAt: string;
  #localTimer: number | null = null;
  #remoteTimer: number | null = null;
  #retryTimer: number | null = null;
  #remoteInFlight: Promise<void> | null = null;
  #retryIndex = 0;
  #silent = false;
  #stopped = false;

  constructor(options: PlanSaveCoordinatorOptions) {
    this.#workspaceId = options.workspaceId;
    this.#projectId = options.projectId;
    this.#verifiedUserId = options.verifiedUserId;
    this.#repository = options.repository;
    this.#cache = options.cache;
    this.#onStatus = options.onStatus;
    this.#isOnline =
      options.isOnline ??
      (() => typeof navigator === 'undefined' || navigator.onLine);
    this.#now = options.now ?? (() => new Date());
    this.#localDelayMs = options.localDelayMs ?? DEFAULT_LOCAL_DELAY_MS;
    this.#remoteDelayMs = options.remoteDelayMs ?? DEFAULT_REMOTE_DELAY_MS;
    const initialRecord = options.initialRecord ?? null;
    this.#verifiedUserIds = initialRecord?.verifiedUserIds ?? [];
    const initialRemoteDocument = options.initialRemoteDocument ?? null;
    this.#lastRemoteDocumentJson =
      initialRecord?.pendingRemote === true || initialRemoteDocument === null
        ? null
        : serializeCloudPlanDocument(initialRemoteDocument);
    this.#remoteRevision = initialRecord?.remoteRevision ?? null;
    this.#remoteUpdatedAt = initialRecord?.remoteUpdatedAt ?? null;
    this.#remoteLastSavedAt =
      initialRecord?.remoteLastSavedAt ?? this.#remoteUpdatedAt;
    this.#hiddenAt = initialRecord?.hiddenAt ?? null;
    this.#lastAttemptAt = initialRecord?.lastAttemptAt ?? null;
    this.#lastError = initialRecord?.lastError ?? null;
    this.#localUpdatedAt =
      initialRecord?.localUpdatedAt ?? this.#now().toISOString();
  }

  schedule(snapshot: WorkspaceSessionSnapshot): void {
    if (this.#stopped) return;
    if (snapshot.draft.projectId !== this.#projectId) {
      throw new Error('다른 계획의 작업본을 현재 저장 대기열에 넣을 수 없습니다.');
    }
    this.#latestSnapshot = snapshot;
    this.#localUpdatedAt = this.#now().toISOString();
    this.#clearTimer('LOCAL');
    this.#localTimer = window.setTimeout(() => {
      this.#localTimer = null;
      void this.#persistLocalCopy();
    }, this.#localDelayMs);

    const documentJson = serializeCloudPlanDocument(
      cloudDocumentFromWorkspaceSession(snapshot),
    );
    if (documentJson === this.#lastRemoteDocumentJson) {
      this.#emit({
        state: 'SAVED',
        lastSavedAt: this.#remoteLastSavedAt,
        message: '저장됨',
      });
      return;
    }
    this.#emit({
      state: 'SAVING',
      lastSavedAt: this.#remoteLastSavedAt,
      message: '저장 중',
    });
    this.#clearTimer('REMOTE');
    this.#remoteTimer = window.setTimeout(() => {
      this.#remoteTimer = null;
      void this.#drainRemoteQueue();
    }, this.#remoteDelayMs);
  }

  async flushNow(): Promise<void> {
    if (this.#latestSnapshot === null) return;
    this.#clearTimer('LOCAL');
    this.#clearTimer('REMOTE');
    await this.#persistLocalCopy();
    await this.#drainRemoteQueue();
  }

  async retryNow(): Promise<void> {
    this.#retryIndex = 0;
    this.#clearTimer('RETRY');
    await this.flushNow();
  }

  async createSafetyBackup(reason: SafetyBackupReason): Promise<void> {
    if (this.#repository.createSafetyBackup === undefined) {
      throw new Error('이 저장소에서는 안전 보관본을 만들 수 없습니다.');
    }
    if (!this.#isOnline()) {
      throw new Error('인터넷 연결 후 다시 시도해 주세요. 원본을 보관하지 않은 변경은 막았습니다.');
    }
    await this.flushNow();
    const snapshot = this.#latestSnapshot;
    if (snapshot === null) {
      throw new Error('보관할 현재 계획이 아직 준비되지 않았습니다.');
    }
    const latestDocumentJson = serializeCloudPlanDocument(
      cloudDocumentFromWorkspaceSession(snapshot),
    );
    if (latestDocumentJson !== this.#lastRemoteDocumentJson) {
      throw new Error('현재 계획을 클라우드에 저장하지 못해 위험한 변경을 막았습니다. 저장 상태를 확인해 주세요.');
    }
    if (this.#remoteRevision === null) {
      throw new Error('클라우드 저장 리비전을 확인하지 못해 위험한 변경을 막았습니다.');
    }
    await this.#repository.createSafetyBackup(
      this.#workspaceId,
      this.#projectId,
      reason,
      this.#remoteRevision,
    );
  }

  handleOnline(): void {
    if (this.#stopped || this.#latestSnapshot === null) return;
    this.#clearTimer('RETRY');
    void this.#drainRemoteQueue();
  }

  resume(): void {
    this.#silent = false;
    this.#stopped = false;
  }

  dispose(): void {
    if (this.#stopped) return;
    this.#clearTimer('LOCAL');
    this.#clearTimer('REMOTE');
    this.#clearTimer('RETRY');
    this.#silent = true;
    if (this.#latestSnapshot !== null) {
      void this.#persistLocalCopy();
      void this.#drainRemoteQueue();
    }
    this.#stopped = true;
  }

  async #persistLocalCopy(options?: {
    readonly lastAttemptAt?: string | null;
    readonly lastError?: string | null;
  }): Promise<void> {
    const snapshot = this.#latestSnapshot;
    if (snapshot === null) return;
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const pendingRemote =
      serializeCloudPlanDocument(document) !== this.#lastRemoteDocumentJson;
    try {
      await this.#cache.put(
        createCachedPlanRecord({
          workspaceId: this.#workspaceId,
          verifiedUserId: this.#verifiedUserId,
          verifiedUserIds: this.#verifiedUserIds,
          document,
          workspaceSession: snapshot,
          pendingRemote,
          remoteRevision: this.#remoteRevision,
          remoteUpdatedAt: this.#remoteUpdatedAt,
          remoteLastSavedAt: this.#remoteLastSavedAt,
          hiddenAt: this.#hiddenAt,
          localUpdatedAt: this.#localUpdatedAt,
          lastAttemptAt: options?.lastAttemptAt ?? this.#lastAttemptAt,
          lastError: options?.lastError ?? this.#lastError,
        }),
      );
    } catch (error) {
      this.#emit({
        state: 'FAILED',
        lastSavedAt: this.#remoteLastSavedAt,
        message: `로컬 사본 저장 실패: ${errorMessage(error)}`,
      });
    }
  }

  async #drainRemoteQueue(): Promise<void> {
    if (this.#remoteInFlight !== null) {
      await this.#remoteInFlight;
      return;
    }
    this.#remoteInFlight = this.#runRemoteLoop();
    try {
      await this.#remoteInFlight;
    } finally {
      this.#remoteInFlight = null;
    }
  }

  async #runRemoteLoop(): Promise<void> {
    while (this.#latestSnapshot !== null) {
      const snapshot = this.#latestSnapshot;
      const document = cloudDocumentFromWorkspaceSession(snapshot);
      const documentJson = serializeCloudPlanDocument(document);
      if (documentJson === this.#lastRemoteDocumentJson) {
        this.#retryIndex = 0;
        this.#lastError = null;
        this.#emit({
          state: 'SAVED',
          lastSavedAt: this.#remoteLastSavedAt,
          message: '저장됨',
        });
        return;
      }
      if (!this.#isOnline()) {
        await this.#persistLocalCopy();
        this.#emit({
          state: 'OFFLINE',
          lastSavedAt: this.#remoteLastSavedAt,
          message: '오프라인 저장됨',
        });
        this.#scheduleRetry();
        return;
      }

      const attemptAt = this.#now().toISOString();
      this.#lastAttemptAt = attemptAt;
      this.#emit({
        state: 'SAVING',
        lastSavedAt: this.#remoteLastSavedAt,
        message: '저장 중',
      });
      await this.#persistLocalCopy({ lastAttemptAt: attemptAt, lastError: null });
      try {
        const result = await this.#repository.saveProject(
          this.#workspaceId,
          document,
        );
        this.#lastRemoteDocumentJson = documentJson;
        this.#remoteRevision = result.revision;
        this.#remoteUpdatedAt = result.updatedAt;
        this.#remoteLastSavedAt = result.lastSavedAt;
        this.#lastError = null;
        this.#retryIndex = 0;
        await this.#persistLocalCopy({
          lastAttemptAt: attemptAt,
          lastError: null,
        });
      } catch (error) {
        this.#lastError = errorMessage(error);
        await this.#persistLocalCopy({
          lastAttemptAt: attemptAt,
          lastError: this.#lastError,
        });
        const offline = !this.#isOnline();
        this.#emit({
          state: offline ? 'OFFLINE' : 'FAILED',
          lastSavedAt: this.#remoteLastSavedAt,
          message: offline ? '오프라인 저장됨' : '저장 실패',
        });
        this.#scheduleRetry();
        return;
      }
    }
  }

  #scheduleRetry(): void {
    if (this.#stopped || this.#retryTimer !== null) return;
    const delay =
      RETRY_DELAYS_MS[Math.min(this.#retryIndex, RETRY_DELAYS_MS.length - 1)] ??
      RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    this.#retryIndex += 1;
    this.#retryTimer = window.setTimeout(() => {
      this.#retryTimer = null;
      void this.#drainRemoteQueue();
    }, delay);
  }

  #clearTimer(kind: 'LOCAL' | 'REMOTE' | 'RETRY'): void {
    const timer =
      kind === 'LOCAL'
        ? this.#localTimer
        : kind === 'REMOTE'
          ? this.#remoteTimer
          : this.#retryTimer;
    if (timer !== null) window.clearTimeout(timer);
    if (kind === 'LOCAL') this.#localTimer = null;
    if (kind === 'REMOTE') this.#remoteTimer = null;
    if (kind === 'RETRY') this.#retryTimer = null;
  }

  #emit(status: CloudSaveStatus): void {
    if (!this.#silent) this.#onStatus(status);
  }
}
