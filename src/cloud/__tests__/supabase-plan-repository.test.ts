import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createProjectDraft,
  type IdGenerator,
} from '../../application/project-setup';
import { cloudDocumentFromWorkspaceSession } from '../cloud-plan-document';
import { SupabasePlanRepository } from '../supabase-plan-repository';
import {
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../../ui/workspace-session-storage';

interface FakeResponse {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

interface FakeCall {
  readonly action: string;
  readonly args: readonly unknown[];
}

class FakeQueryBuilder implements PromiseLike<FakeResponse> {
  readonly #owner: FakeSupabaseClient;

  constructor(owner: FakeSupabaseClient) {
    this.#owner = owner;
  }

  select(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'select', args });
    return this;
  }

  eq(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'eq', args });
    return this;
  }

  is(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'is', args });
    return this;
  }

  not(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'not', args });
    return this;
  }

  upsert(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'upsert', args });
    return this;
  }

  update(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'update', args });
    return this;
  }

  limit(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'limit', args });
    return this;
  }

  order(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'order', args });
    return this;
  }

  single(): Promise<FakeResponse> {
    this.#owner.calls.push({ action: 'single', args: [] });
    return this.#owner.next();
  }

  maybeSingle(): Promise<FakeResponse> {
    this.#owner.calls.push({ action: 'maybeSingle', args: [] });
    return this.#owner.next();
  }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#owner.next().then(onfulfilled, onrejected);
  }
}

class FakeSupabaseClient {
  readonly calls: FakeCall[] = [];
  readonly #responses: FakeResponse[];

  constructor(responses: readonly FakeResponse[]) {
    this.#responses = [...responses];
  }

  from(...args: readonly unknown[]): FakeQueryBuilder {
    this.calls.push({ action: 'from', args });
    return new FakeQueryBuilder(this);
  }

  rpc(...args: readonly unknown[]): Promise<FakeResponse> {
    this.calls.push({ action: 'rpc', args });
    return this.next();
  }

  next(): Promise<FakeResponse> {
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error('Fake Supabase response queue is empty.');
    }
    return Promise.resolve(response);
  }
}

const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createDocument() {
  const generateId: IdGenerator = (kind) =>
    kind === 'PROJECT'
      ? PROJECT_ID
      : kind === 'ORGANIZATION_SNAPSHOT'
        ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const snapshot: WorkspaceSessionSnapshot = {
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
  return cloudDocumentFromWorkspaceSession(snapshot);
}

function projectRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    title: '202607A',
    period_year: 2026,
    period_month: 7,
    period_half: 'FIRST_HALF',
    revision: 2,
    hidden_at: null,
    updated_at: '2026-07-26T01:00:00.000Z',
    last_saved_at: '2026-07-26T01:00:00.000Z',
    ...overrides,
  };
}

function repositoryFor(
  responses: readonly FakeResponse[],
): {
  readonly repository: SupabasePlanRepository;
  readonly client: FakeSupabaseClient;
} {
  const client = new FakeSupabaseClient(responses);
  return {
    repository: new SupabasePlanRepository(
      client as unknown as SupabaseClient,
    ),
    client,
  };
}

describe('SupabasePlanRepository', () => {
  it('maps workspace, visible/hidden lists, a full document, save metadata, hide, and restore', async () => {
    const document = createDocument();
    const { repository, client } = repositoryFor([
      { data: [{ id: WORKSPACE_ID, name: 'ngplan' }], error: null },
      { data: [projectRow()], error: null },
      {
        data: [
          projectRow({
            hidden_at: '2026-07-26T02:00:00.000Z',
          }),
        ],
        error: null,
      },
      {
        data: projectRow({ current_document: document }),
        error: null,
      },
      {
        data: {
          revision: 3,
          updated_at: '2026-07-26T03:00:00.000Z',
          last_saved_at: '2026-07-26T03:00:00.000Z',
        },
        error: null,
      },
      { data: { id: PROJECT_ID }, error: null },
      { data: { id: PROJECT_ID }, error: null },
    ]);

    await expect(repository.findWorkspace()).resolves.toEqual({
      id: WORKSPACE_ID,
      name: 'ngplan',
    });
    await expect(
      repository.listProjects(WORKSPACE_ID, 'VISIBLE'),
    ).resolves.toMatchObject([{ id: PROJECT_ID, hiddenAt: null }]);
    await expect(
      repository.listProjects(WORKSPACE_ID, 'HIDDEN'),
    ).resolves.toMatchObject([
      { id: PROJECT_ID, hiddenAt: '2026-07-26T02:00:00.000Z' },
    ]);
    await expect(
      repository.loadProject(WORKSPACE_ID, PROJECT_ID),
    ).resolves.toMatchObject({ id: PROJECT_ID, document });

    const transientDocument = {
      ...document,
      draft: {
        ...document.draft,
        title: '',
        year: '',
        month: '99',
      },
    };
    await expect(
      repository.saveProject(WORKSPACE_ID, transientDocument),
    ).resolves.toEqual({
      revision: 3,
      updatedAt: '2026-07-26T03:00:00.000Z',
      lastSavedAt: '2026-07-26T03:00:00.000Z',
    });
    await expect(
      repository.setProjectHidden(WORKSPACE_ID, PROJECT_ID, true),
    ).resolves.toBeUndefined();
    await expect(
      repository.setProjectHidden(WORKSPACE_ID, PROJECT_ID, false),
    ).resolves.toBeUndefined();

    expect(client.calls).toContainEqual({
      action: 'is',
      args: ['hidden_at', null],
    });
    expect(client.calls).toContainEqual({
      action: 'not',
      args: ['hidden_at', 'is', null],
    });
    const upsert = client.calls.find((call) => call.action === 'upsert');
    expect(upsert?.args[0]).toMatchObject({
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      title: '계획-99',
      period_year: null,
      period_month: null,
      timezone: 'America/Sao_Paulo',
      current_document: transientDocument,
    });
    expect(client.calls.filter((call) => call.action === 'update')).toEqual([
      { action: 'update', args: [{ hidden_at: expect.any(String) }] },
      { action: 'update', args: [{ hidden_at: null }] },
    ]);
    expect(repository).not.toHaveProperty('deleteProject');
  });

  it('lists rolling, safety, and daily points and loads each as a read-only document', async () => {
    const document = createDocument();
    const { repository, client } = repositoryFor([
      {
        data: [
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            kind: 'SAFETY',
            reason: 'BEFORE_PERIOD_CHANGE',
            captured_at: '2026-07-31T10:00:00.000Z',
            source_revision: 9,
          },
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            kind: 'ROLLING',
            reason: 'AUTO_15_MIN',
            captured_at: '2026-07-31T09:45:00.000Z',
            source_revision: 8,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            business_date: '2026-07-30',
            saved_at: '2026-07-31T02:59:00.000Z',
            source_revision: 7,
          },
        ],
        error: null,
      },
      { data: { document }, error: null },
      { data: { document }, error: null },
      {
        data: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        error: null,
      },
    ]);

    const points = await repository.listRecoveryPoints(
      WORKSPACE_ID,
      PROJECT_ID,
    );
    expect(points).toMatchObject([
      {
        kind: 'SAFETY',
        reason: 'BEFORE_PERIOD_CHANGE',
        sourceRevision: 9,
      },
      { kind: 'ROLLING', reason: 'AUTO_15_MIN', sourceRevision: 8 },
      { kind: 'DAILY', reason: 'DAILY', businessDate: '2026-07-30' },
    ]);
    await expect(
      repository.loadRecoveryPoint(WORKSPACE_ID, PROJECT_ID, points[0]!),
    ).resolves.toEqual(document);
    await expect(
      repository.loadRecoveryPoint(WORKSPACE_ID, PROJECT_ID, points[2]!),
    ).resolves.toEqual(document);
    await expect(
      repository.createSafetyBackup(
        WORKSPACE_ID,
        PROJECT_ID,
        'BEFORE_MEMBER_EXCLUSION',
        9,
      ),
    ).resolves.toBeUndefined();

    expect(client.calls).toContainEqual({
      action: 'rpc',
      args: [
        'ngplan_create_safety_backup',
        {
          target_workspace_id: WORKSPACE_ID,
          target_project_id: PROJECT_ID,
          target_reason: 'BEFORE_MEMBER_EXCLUSION',
          expected_source_revision: 9,
        },
      ],
    });
  });

  it('rejects missing, duplicate, malformed, and inaccessible workspace responses', async () => {
    for (const [response, message] of [
      [
        { data: [], error: null },
        '이 계정에는 ngplan 작업공간 접근 권한이 없습니다.',
      ],
      [
        {
          data: [
            { id: WORKSPACE_ID, name: 'ngplan' },
            { id: PROJECT_ID, name: 'ngplan' },
          ],
          error: null,
        },
        'ngplan 작업공간이 중복되어 관리 확인이 필요합니다.',
      ],
      [
        { data: [{ id: 42, name: 'ngplan' }], error: null },
        'ngplan 작업공간 응답 형식이 올바르지 않습니다.',
      ],
      [
        { data: null, error: { message: 'RLS denied' } },
        'ngplan 작업공간을 불러오지 못했습니다: RLS denied',
      ],
    ] as const) {
      const { repository } = repositoryFor([response]);
      await expect(repository.findWorkspace()).rejects.toThrow(message);
    }
  });

  it('rejects malformed list and document records without guessing', async () => {
    const malformedList = repositoryFor([
      { data: [projectRow({ revision: 0 })], error: null },
    ]).repository;
    await expect(
      malformedList.listProjects(WORKSPACE_ID, 'VISIBLE'),
    ).rejects.toThrow('저장된 계획 목록에 읽을 수 없는 항목이 있습니다.');

    const listError = repositoryFor([
      { data: null, error: { message: 'list failed' } },
    ]).repository;
    await expect(
      listError.listProjects(WORKSPACE_ID, 'HIDDEN'),
    ).rejects.toThrow('계획 목록을 불러오지 못했습니다: list failed');

    const missing = repositoryFor([{ data: null, error: null }]).repository;
    await expect(
      missing.loadProject(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('계획을 찾지 못했거나 접근 권한이 없습니다.');

    const malformedDocument = repositoryFor([
      {
        data: projectRow({
          current_document: { version: 99 },
        }),
        error: null,
      },
    ]).repository;
    await expect(
      malformedDocument.loadProject(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('저장된 계획 문서 형식이 현재 앱과 맞지 않습니다.');

    const loadError = repositoryFor([
      { data: null, error: { message: 'load failed' } },
    ]).repository;
    await expect(
      loadError.loadProject(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('계획을 불러오지 못했습니다: load failed');
  });

  it('rejects failed or malformed save and hide responses', async () => {
    const document = createDocument();
    const failedSave = repositoryFor([
      { data: null, error: { message: 'save failed' } },
    ]).repository;
    await expect(
      failedSave.saveProject(WORKSPACE_ID, document),
    ).rejects.toThrow('계획을 저장하지 못했습니다: save failed');

    const malformedSave = repositoryFor([
      {
        data: {
          revision: 0,
          updated_at: 'now',
          last_saved_at: 'now',
        },
        error: null,
      },
    ]).repository;
    await expect(
      malformedSave.saveProject(WORKSPACE_ID, document),
    ).rejects.toThrow('계획 저장 응답 형식이 올바르지 않습니다.');

    const failedHide = repositoryFor([
      { data: null, error: { message: 'hide failed' } },
    ]).repository;
    await expect(
      failedHide.setProjectHidden(WORKSPACE_ID, PROJECT_ID, true),
    ).rejects.toThrow('계획을 숨기지 못했습니다: hide failed');

    const failedRestore = repositoryFor([
      { data: null, error: { message: 'restore failed' } },
    ]).repository;
    await expect(
      failedRestore.setProjectHidden(WORKSPACE_ID, PROJECT_ID, false),
    ).rejects.toThrow('계획을 복원하지 못했습니다: restore failed');

    const missingHideTarget = repositoryFor([
      { data: null, error: null },
    ]).repository;
    await expect(
      missingHideTarget.setProjectHidden(WORKSPACE_ID, PROJECT_ID, true),
    ).rejects.toThrow('계획을 찾지 못했거나 접근 권한이 없습니다.');
  });

  it('rejects failed and malformed recovery responses without guessing', async () => {
    await expect(
      repositoryFor([
        { data: null, error: { message: 'recent denied' } },
        { data: [], error: null },
      ]).repository.listRecoveryPoints(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('최근 보관본을 불러오지 못했습니다: recent denied');

    await expect(
      repositoryFor([
        { data: [], error: null },
        { data: null, error: { message: 'daily denied' } },
      ]).repository.listRecoveryPoints(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('일일 보관본을 불러오지 못했습니다: daily denied');

    await expect(
      repositoryFor([
        { data: {}, error: null },
        { data: [], error: null },
      ]).repository.listRecoveryPoints(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('보관본 목록 응답 형식이 올바르지 않습니다.');

    await expect(
      repositoryFor([
        {
          data: [
            {
              id: 'bad',
              kind: 'ROLLING',
              reason: 'UNKNOWN',
              captured_at: 'now',
              source_revision: 1,
            },
          ],
          error: null,
        },
        { data: [], error: null },
      ]).repository.listRecoveryPoints(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('읽을 수 없는 최근 보관본 항목이 있습니다.');

    await expect(
      repositoryFor([
        { data: [], error: null },
        {
          data: [
            {
              business_date: '2026-07-30',
              saved_at: 'now',
              source_revision: 0,
            },
          ],
          error: null,
        },
      ]).repository.listRecoveryPoints(WORKSPACE_ID, PROJECT_ID),
    ).rejects.toThrow('읽을 수 없는 일일 보관본 항목이 있습니다.');

    const point = {
      key: 'recovery:missing',
      kind: 'SAFETY' as const,
      reason: 'BEFORE_PERIOD_CHANGE' as const,
      capturedAt: '2026-07-31T12:00:00.000Z',
      sourceRevision: 1,
      businessDate: null,
    };
    await expect(
      repositoryFor([
        { data: null, error: { message: 'load denied' } },
      ]).repository.loadRecoveryPoint(WORKSPACE_ID, PROJECT_ID, point),
    ).rejects.toThrow('보관본을 불러오지 못했습니다: load denied');
    await expect(
      repositoryFor([{ data: null, error: null }]).repository.loadRecoveryPoint(
        WORKSPACE_ID,
        PROJECT_ID,
        point,
      ),
    ).rejects.toThrow('선택한 보관본을 찾지 못했습니다.');
    await expect(
      repositoryFor([
        { data: { document: { version: 99 } }, error: null },
      ]).repository.loadRecoveryPoint(WORKSPACE_ID, PROJECT_ID, point),
    ).rejects.toThrow('선택한 보관본 문서가 현재 계획과 맞지 않습니다.');

    await expect(
      repositoryFor([
        { data: null, error: { message: 'rpc denied' } },
      ]).repository.createSafetyBackup(
        WORKSPACE_ID,
        PROJECT_ID,
        'BEFORE_MEMBER_EXCLUSION',
        9,
      ),
    ).rejects.toThrow('안전 보관본을 만들지 못했습니다: rpc denied');
  });
});
