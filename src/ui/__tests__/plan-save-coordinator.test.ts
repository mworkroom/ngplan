import { describe, expect, it, vi } from 'vitest';
import {
  createProjectDraft,
  type IdGenerator,
} from '../../application/project-setup';
import { PlanSaveCoordinator } from '../../cloud/plan-save-coordinator';
import type {
  CachedPlanRecord,
  CloudProjectRecord,
  CloudProjectSummary,
  CloudSaveStatus,
  CloudWorkspace,
  PlanCache,
  PlanRepository,
  SaveProjectResult,
} from '../../cloud/types';
import {
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../workspace-session-storage';

const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function snapshotWithTitle(title: string): WorkspaceSessionSnapshot {
  const generateId: IdGenerator = (kind) =>
    kind === 'PROJECT'
      ? PROJECT_ID
      : kind === 'ORGANIZATION_SNAPSHOT'
        ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        : crypto.randomUUID();
  const draft = createProjectDraft({
    year: 2026,
    month: 7,
    half: 'FIRST_HALF',
    generateId,
  });
  return {
    version: WORKSPACE_SESSION_VERSION,
    draft: { ...draft, title, titleSource: 'MANUAL' },
    manualPlanDraft: null,
    screen: 'SETUP',
    organizationScale: 1,
    automaticPlanCheckpoint: null,
  };
}

class MemoryCache implements PlanCache {
  readonly records = new Map<string, CachedPlanRecord>();

  async findWorkspaceId(verifiedUserId: string): Promise<string | null> {
    const ids = new Set(
      [...this.records.values()]
        .filter((record) => record.verifiedUserIds.includes(verifiedUserId))
        .map((record) => record.workspaceId),
    );
    return ids.size === 1 ? [...ids][0] ?? null : null;
  }

  async authorizeUser(workspaceId: string, userId: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (
        record.workspaceId === workspaceId &&
        !record.verifiedUserIds.includes(userId)
      ) {
        this.records.set(key, {
          ...record,
          verifiedUserIds: [...record.verifiedUserIds, userId],
        });
      }
    }
  }

  async get(
    workspaceId: string,
    projectId: string,
    verifiedUserId: string,
  ): Promise<CachedPlanRecord | null> {
    const record = this.records.get(`${workspaceId}:${projectId}`) ?? null;
    return record?.verifiedUserIds.includes(verifiedUserId) ? record : null;
  }

  async list(
    workspaceId: string,
    verifiedUserId: string,
  ): Promise<readonly CachedPlanRecord[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.workspaceId === workspaceId &&
        record.verifiedUserIds.includes(verifiedUserId),
    );
  }

  async put(record: CachedPlanRecord): Promise<void> {
    this.records.set(record.cacheKey, record);
  }
}

function repositoryWithSave(
  saveProject: PlanRepository['saveProject'],
): PlanRepository {
  return {
    findWorkspace: async (): Promise<CloudWorkspace> => ({
      id: WORKSPACE_ID,
      name: 'ngplan',
    }),
    listProjects: async (): Promise<readonly CloudProjectSummary[]> => [],
    loadProject: async (): Promise<CloudProjectRecord> => {
      throw new Error('not used');
    },
    saveProject,
    setProjectHidden: async (): Promise<void> => undefined,
  };
}

function saveResult(revision: number): SaveProjectResult {
  return {
    revision,
    updatedAt: `2026-07-26T00:00:0${revision}.000Z`,
    lastSavedAt: `2026-07-26T00:00:0${revision}.000Z`,
  };
}

describe('PlanSaveCoordinator', () => {
  it('serializes remote writes and sends the newest edit after an in-flight save', async () => {
    const cache = new MemoryCache();
    const statuses: CloudSaveStatus[] = [];
    let releaseFirst: () => void = () => {
      throw new Error('first save gate was not initialized');
    };
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const savedTitles: string[] = [];
    let activeSaves = 0;
    let maximumActiveSaves = 0;
    const repository = repositoryWithSave(async (_workspaceId, document) => {
      activeSaves += 1;
      maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves);
      savedTitles.push(document.draft.title);
      if (savedTitles.length === 1) await firstGate;
      activeSaves -= 1;
      return saveResult(savedTitles.length);
    });
    const coordinator = new PlanSaveCoordinator({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      verifiedUserId: 'user-1',
      repository,
      cache,
      onStatus: (status) => statuses.push(status),
      localDelayMs: 60_000,
      remoteDelayMs: 60_000,
    });

    coordinator.schedule(snapshotWithTitle('첫 입력'));
    const flushing = coordinator.flushNow();
    await vi.waitFor(() => expect(savedTitles).toEqual(['첫 입력']));
    coordinator.schedule(snapshotWithTitle('가장 최신 입력'));
    releaseFirst();
    await flushing;

    expect(savedTitles).toEqual(['첫 입력', '가장 최신 입력']);
    expect(maximumActiveSaves).toBe(1);
    expect(cache.records.get(`${WORKSPACE_ID}:${PROJECT_ID}`)).toMatchObject({
      pendingRemote: false,
      remoteRevision: 2,
      document: { draft: { title: '가장 최신 입력' } },
    });
    expect(statuses.at(-1)).toMatchObject({ state: 'SAVED' });
    coordinator.dispose();
  });

  it('stores offline edits locally without a choice dialog and uploads them on retry', async () => {
    const cache = new MemoryCache();
    const statuses: CloudSaveStatus[] = [];
    let online = false;
    const save = vi.fn(async () => saveResult(1));
    const coordinator = new PlanSaveCoordinator({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      verifiedUserId: 'user-1',
      repository: repositoryWithSave(save),
      cache,
      onStatus: (status) => statuses.push(status),
      isOnline: () => online,
      localDelayMs: 60_000,
      remoteDelayMs: 60_000,
    });

    coordinator.schedule(snapshotWithTitle('오프라인 입력'));
    await coordinator.flushNow();

    expect(save).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toMatchObject({
      state: 'OFFLINE',
      message: '오프라인 저장됨',
    });
    expect(cache.records.get(`${WORKSPACE_ID}:${PROJECT_ID}`)).toMatchObject({
      pendingRemote: true,
      document: { draft: { title: '오프라인 입력' } },
    });

    online = true;
    await coordinator.retryNow();

    expect(save).toHaveBeenCalledTimes(1);
    expect(cache.records.get(`${WORKSPACE_ID}:${PROJECT_ID}`)).toMatchObject({
      pendingRemote: false,
      remoteRevision: 1,
    });
    expect(statuses.at(-1)).toMatchObject({ state: 'SAVED' });
    coordinator.dispose();
  });

  it('keeps the local pending copy after a failure and succeeds through 다시 저장', async () => {
    const cache = new MemoryCache();
    const statuses: CloudSaveStatus[] = [];
    let attempt = 0;
    const repository = repositoryWithSave(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('temporary network error');
      return saveResult(1);
    });
    const coordinator = new PlanSaveCoordinator({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      verifiedUserId: 'user-1',
      repository,
      cache,
      onStatus: (status) => statuses.push(status),
      localDelayMs: 60_000,
      remoteDelayMs: 60_000,
    });

    coordinator.schedule(snapshotWithTitle('재시도할 입력'));
    await coordinator.flushNow();

    expect(statuses.at(-1)).toMatchObject({ state: 'FAILED' });
    expect(cache.records.get(`${WORKSPACE_ID}:${PROJECT_ID}`)).toMatchObject({
      pendingRemote: true,
      lastError: 'temporary network error',
    });

    await coordinator.retryNow();

    expect(attempt).toBe(2);
    expect(statuses.at(-1)).toMatchObject({ state: 'SAVED' });
    expect(cache.records.get(`${WORKSPACE_ID}:${PROJECT_ID}`)).toMatchObject({
      pendingRemote: false,
      lastError: null,
    });
    coordinator.dispose();
  });

  it('flushes the exact current document before creating a semantic safety backup', async () => {
    const cache = new MemoryCache();
    const save = vi.fn(async () => saveResult(4));
    const createSafetyBackup = vi.fn(async () => undefined);
    const repository: PlanRepository = {
      ...repositoryWithSave(save),
      createSafetyBackup,
    };
    const coordinator = new PlanSaveCoordinator({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      verifiedUserId: 'user-1',
      repository,
      cache,
      onStatus: () => undefined,
      localDelayMs: 60_000,
      remoteDelayMs: 60_000,
    });

    coordinator.schedule(snapshotWithTitle('보관할 최신 입력'));
    await coordinator.createSafetyBackup('BEFORE_MEMBER_EXCLUSION');

    expect(save).toHaveBeenCalledTimes(1);
    expect(createSafetyBackup).toHaveBeenCalledWith(
      WORKSPACE_ID,
      PROJECT_ID,
      'BEFORE_MEMBER_EXCLUSION',
      4,
    );
    coordinator.dispose();
  });

  it('blocks a destructive action while offline or when the latest save failed', async () => {
    const offlineBackup = vi.fn(async () => undefined);
    const offlineCoordinator = new PlanSaveCoordinator({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      verifiedUserId: 'user-1',
      repository: {
        ...repositoryWithSave(async () => saveResult(1)),
        createSafetyBackup: offlineBackup,
      },
      cache: new MemoryCache(),
      onStatus: () => undefined,
      isOnline: () => false,
      localDelayMs: 60_000,
      remoteDelayMs: 60_000,
    });
    offlineCoordinator.schedule(snapshotWithTitle('오프라인 입력'));
    await expect(
      offlineCoordinator.createSafetyBackup('BEFORE_MEMBER_EXCLUSION'),
    ).rejects.toThrow('인터넷 연결 후 다시 시도해 주세요');
    expect(offlineBackup).not.toHaveBeenCalled();
    offlineCoordinator.dispose();

    const failedBackup = vi.fn(async () => undefined);
    const failedCoordinator = new PlanSaveCoordinator({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      verifiedUserId: 'user-1',
      repository: {
        ...repositoryWithSave(async () => {
          throw new Error('save failed');
        }),
        createSafetyBackup: failedBackup,
      },
      cache: new MemoryCache(),
      onStatus: () => undefined,
      localDelayMs: 60_000,
      remoteDelayMs: 60_000,
    });
    failedCoordinator.schedule(snapshotWithTitle('저장 실패 입력'));
    await expect(
      failedCoordinator.createSafetyBackup('BEFORE_AUTOMATIC_PLAN_APPLY'),
    ).rejects.toThrow('위험한 변경을 막았습니다');
    expect(failedBackup).not.toHaveBeenCalled();
    failedCoordinator.dispose();
  });
});
