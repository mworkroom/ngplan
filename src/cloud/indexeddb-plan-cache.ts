import {
  normalizeCloudPlanDocument,
  type CloudPlanDocumentV2,
} from './cloud-plan-document';
import type { CachedPlanRecord, PlanCache } from './types';
import {
  migrateWorkspaceSessionV3Snapshot,
  normalizeWorkspaceSessionSnapshot,
  type WorkspaceSessionSnapshot,
} from '../ui/workspace-session-storage';

const DATABASE_NAME = 'ngplan-cloud-cache';
const DATABASE_VERSION = 1;
const PLAN_STORE = 'plans';
const WORKSPACE_INDEX = 'workspaceId';

function cacheKey(workspaceId: string, projectId: string): string {
  return `${workspaceId}:${projectId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB 요청에 실패했습니다.')),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB 작업이 중단되었습니다.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB 작업에 실패했습니다.')),
      { once: true },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function normalizeCachedPlanRecord(value: unknown): CachedPlanRecord | null {
  if (!isRecord(value)) return null;
  const document = normalizeCloudPlanDocument(value.document);
  const workspaceSession =
    normalizeWorkspaceSessionSnapshot(value.workspaceSession) ??
    migrateWorkspaceSessionV3Snapshot(value.workspaceSession);
  const hiddenAt = stringOrNull(value.hiddenAt);
  const remoteUpdatedAt = stringOrNull(value.remoteUpdatedAt);
  const remoteLastSavedAt = stringOrNull(value.remoteLastSavedAt);
  const lastAttemptAt = stringOrNull(value.lastAttemptAt);
  const lastError = stringOrNull(value.lastError);
  const remoteRevisionIsValid =
    value.remoteRevision === null ||
    (typeof value.remoteRevision === 'number' &&
      Number.isSafeInteger(value.remoteRevision) &&
      value.remoteRevision >= 1);
  if (
    document === null ||
    workspaceSession === null ||
    typeof value.cacheKey !== 'string' ||
    typeof value.workspaceId !== 'string' ||
    typeof value.projectId !== 'string' ||
    !Array.isArray(value.verifiedUserIds) ||
    !value.verifiedUserIds.every((userId) => typeof userId === 'string') ||
    typeof value.pendingRemote !== 'boolean' ||
    !remoteRevisionIsValid ||
    hiddenAt === undefined ||
    remoteUpdatedAt === undefined ||
    remoteLastSavedAt === undefined ||
    typeof value.localUpdatedAt !== 'string' ||
    lastAttemptAt === undefined ||
    lastError === undefined ||
    value.cacheKey !== cacheKey(value.workspaceId, value.projectId) ||
    document.draft.projectId !== value.projectId ||
    workspaceSession.draft.projectId !== value.projectId
  ) {
    return null;
  }
  return {
    cacheKey: value.cacheKey,
    workspaceId: value.workspaceId,
    projectId: value.projectId,
    verifiedUserIds: Object.freeze([...new Set(value.verifiedUserIds)]),
    document,
    workspaceSession,
    pendingRemote: value.pendingRemote,
    remoteRevision: value.remoteRevision as number | null,
    remoteUpdatedAt,
    remoteLastSavedAt,
    hiddenAt,
    localUpdatedAt: value.localUpdatedAt,
    lastAttemptAt,
    lastError,
  };
}

export function createCachedPlanRecord(input: {
  readonly workspaceId: string;
  readonly verifiedUserId: string;
  readonly verifiedUserIds?: readonly string[];
  readonly document: CloudPlanDocumentV2;
  readonly workspaceSession: WorkspaceSessionSnapshot;
  readonly pendingRemote: boolean;
  readonly remoteRevision?: number | null;
  readonly remoteUpdatedAt?: string | null;
  readonly remoteLastSavedAt?: string | null;
  readonly hiddenAt?: string | null;
  readonly localUpdatedAt?: string;
  readonly lastAttemptAt?: string | null;
  readonly lastError?: string | null;
}): CachedPlanRecord {
  const projectId = input.document.draft.projectId;
  return {
    cacheKey: cacheKey(input.workspaceId, projectId),
    workspaceId: input.workspaceId,
    projectId,
    verifiedUserIds: Object.freeze(
      Array.from(
        new Set([
          ...(input.verifiedUserIds ?? []),
          input.verifiedUserId,
        ]),
      ),
    ),
    document: input.document,
    workspaceSession: input.workspaceSession,
    pendingRemote: input.pendingRemote,
    remoteRevision: input.remoteRevision ?? null,
    remoteUpdatedAt: input.remoteUpdatedAt ?? null,
    remoteLastSavedAt: input.remoteLastSavedAt ?? null,
    hiddenAt: input.hiddenAt ?? null,
    localUpdatedAt: input.localUpdatedAt ?? new Date().toISOString(),
    lastAttemptAt: input.lastAttemptAt ?? null,
    lastError: input.lastError ?? null,
  };
}

export class IndexedDbPlanCache implements PlanCache {
  readonly #factory: IDBFactory;
  #databasePromise: Promise<IDBDatabase> | null = null;

  constructor(factory: IDBFactory = indexedDB) {
    this.#factory = factory;
  }

  async findWorkspaceId(verifiedUserId: string): Promise<string | null> {
    const database = await this.#database();
    const transaction = database.transaction(PLAN_STORE, 'readonly');
    const values = await requestResult(
      transaction.objectStore(PLAN_STORE).getAll(),
    );
    await transactionComplete(transaction);
    const workspaceIds = new Set(
      values
        .map(normalizeCachedPlanRecord)
        .filter((value): value is CachedPlanRecord => value !== null)
        .filter((value) => value.verifiedUserIds.includes(verifiedUserId))
        .map((value) => value.workspaceId),
    );
    return workspaceIds.size === 1 ? [...workspaceIds][0] ?? null : null;
  }

  async authorizeUser(workspaceId: string, userId: string): Promise<void> {
    const records = await this.#listWithoutUserFilter(workspaceId);
    await Promise.all(
      records
        .filter((record) => !record.verifiedUserIds.includes(userId))
        .map((record) =>
          this.put({
            ...record,
            verifiedUserIds: Object.freeze([
              ...record.verifiedUserIds,
              userId,
            ]),
          }),
        ),
    );
  }

  async get(
    workspaceId: string,
    projectId: string,
    verifiedUserId: string,
  ): Promise<CachedPlanRecord | null> {
    const database = await this.#database();
    const transaction = database.transaction(PLAN_STORE, 'readonly');
    const value = await requestResult(
      transaction.objectStore(PLAN_STORE).get(cacheKey(workspaceId, projectId)),
    );
    await transactionComplete(transaction);
    const normalized = normalizeCachedPlanRecord(value);
    return normalized?.verifiedUserIds.includes(verifiedUserId)
      ? normalized
      : null;
  }

  async list(
    workspaceId: string,
    verifiedUserId: string,
  ): Promise<readonly CachedPlanRecord[]> {
    return (await this.#listWithoutUserFilter(workspaceId)).filter((record) =>
      record.verifiedUserIds.includes(verifiedUserId),
    );
  }

  async #listWithoutUserFilter(
    workspaceId: string,
  ): Promise<readonly CachedPlanRecord[]> {
    const database = await this.#database();
    const transaction = database.transaction(PLAN_STORE, 'readonly');
    const values = await requestResult(
      transaction.objectStore(PLAN_STORE).index(WORKSPACE_INDEX).getAll(workspaceId),
    );
    await transactionComplete(transaction);
    return values
      .map(normalizeCachedPlanRecord)
      .filter((value): value is CachedPlanRecord => value !== null)
      .sort((left, right) =>
        right.localUpdatedAt.localeCompare(left.localUpdatedAt),
      );
  }

  async put(record: CachedPlanRecord): Promise<void> {
    const normalized = normalizeCachedPlanRecord(record);
    if (normalized === null) {
      throw new Error('로컬 계획 사본 형식이 올바르지 않습니다.');
    }
    const database = await this.#database();
    const transaction = database.transaction(PLAN_STORE, 'readwrite');
    transaction.objectStore(PLAN_STORE).put(normalized);
    await transactionComplete(transaction);
  }

  async #database(): Promise<IDBDatabase> {
    this.#databasePromise ??= new Promise((resolve, reject) => {
      const request = this.#factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(PLAN_STORE)
          ? request.transaction?.objectStore(PLAN_STORE)
          : database.createObjectStore(PLAN_STORE, { keyPath: 'cacheKey' });
        if (store !== undefined && !store.indexNames.contains(WORKSPACE_INDEX)) {
          store.createIndex(WORKSPACE_INDEX, WORKSPACE_INDEX, { unique: false });
        }
      });
      request.addEventListener('success', () => resolve(request.result), {
        once: true,
      });
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('IndexedDB를 열지 못했습니다.')),
        { once: true },
      );
      request.addEventListener(
        'blocked',
        () => reject(new Error('IndexedDB 업데이트가 다른 탭에 의해 차단되었습니다.')),
        { once: true },
      );
    });
    return this.#databasePromise;
  }
}
