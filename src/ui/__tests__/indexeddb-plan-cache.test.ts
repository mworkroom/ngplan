import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  createProjectDraft,
  type IdGenerator,
} from '../../application/project-setup';
import { cloudDocumentFromWorkspaceSession } from '../../cloud/cloud-plan-document';
import {
  createCachedPlanRecord,
  IndexedDbPlanCache,
} from '../../cloud/indexeddb-plan-cache';
import {
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../workspace-session-storage';

const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createSnapshot(): WorkspaceSessionSnapshot {
  const generateId: IdGenerator = (kind) =>
    kind === 'PROJECT'
      ? PROJECT_ID
      : kind === 'ORGANIZATION_SNAPSHOT'
        ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  return {
    version: WORKSPACE_SESSION_VERSION,
    draft: createProjectDraft({
      year: 2026,
      month: 7,
      half: 'FIRST_HALF',
      generateId,
    }),
    manualPlanDraft: null,
    screen: 'SETUP',
    organizationScale: 1,
    automaticPlanCheckpoint: null,
  };
}

describe('IndexedDbPlanCache', () => {
  it('keeps a valid offline copy and only exposes it to a previously verified user', async () => {
    const cache = new IndexedDbPlanCache(new IDBFactory());
    const snapshot = createSnapshot();
    await cache.put(
      createCachedPlanRecord({
        workspaceId: WORKSPACE_ID,
        verifiedUserId: 'user-1',
        document: cloudDocumentFromWorkspaceSession(snapshot),
        workspaceSession: snapshot,
        pendingRemote: true,
      }),
    );

    expect(await cache.findWorkspaceId('user-1')).toBe(WORKSPACE_ID);
    expect(await cache.findWorkspaceId('user-2')).toBeNull();
    expect(await cache.list(WORKSPACE_ID, 'user-2')).toEqual([]);

    await cache.authorizeUser(WORKSPACE_ID, 'user-2');

    expect(await cache.findWorkspaceId('user-2')).toBe(WORKSPACE_ID);
    expect(await cache.get(WORKSPACE_ID, PROJECT_ID, 'user-2')).toMatchObject({
      projectId: PROJECT_ID,
      pendingRemote: true,
      verifiedUserIds: ['user-1', 'user-2'],
    });
  });

  it('rejects a mismatched project identity before writing', async () => {
    const cache = new IndexedDbPlanCache(new IDBFactory());
    const snapshot = createSnapshot();
    const valid = createCachedPlanRecord({
      workspaceId: WORKSPACE_ID,
      verifiedUserId: 'user-1',
      document: cloudDocumentFromWorkspaceSession(snapshot),
      workspaceSession: snapshot,
      pendingRemote: false,
    });

    await expect(
      cache.put({ ...valid, projectId: 'different-project' }),
    ).rejects.toThrow('로컬 계획 사본 형식이 올바르지 않습니다.');
  });
});
