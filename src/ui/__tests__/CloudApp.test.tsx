import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProjectDraft,
  type IdGenerator,
} from '../../application/project-setup';
import {
  cloudDocumentFromWorkspaceSession,
  type CloudPlanDocumentV2,
} from '../../cloud/cloud-plan-document';
import { createCachedPlanRecord } from '../../cloud/indexeddb-plan-cache';
import type {
  CachedPlanRecord,
  CloudProjectRecord,
  PlanCache,
  PlanRepository,
} from '../../cloud/types';
import {
  CloudApp,
  mergeCloudProjectLists,
  resolveCloudAppRedirectUrl,
} from '../CloudApp';
import {
  WORKSPACE_SESSION_VERSION,
  type WorkspaceSessionSnapshot,
} from '../workspace-session-storage';

const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = {
  id: 'user-1',
  email: 'mom@example.com',
} as User;

function createSnapshot(title = '브라질 7월 계획'): WorkspaceSessionSnapshot {
  const generateId: IdGenerator = (kind) =>
    kind === 'PROJECT'
      ? PROJECT_ID
      : kind === 'ORGANIZATION_SNAPSHOT'
        ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
        : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const draft = createProjectDraft({
    year: 2026,
    month: 7,
    half: 'SECOND_HALF',
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

function projectRecord(
  document: CloudPlanDocumentV2,
  hiddenAt: string | null = null,
): CloudProjectRecord {
  return {
    id: document.draft.projectId,
    workspaceId: WORKSPACE_ID,
    title: document.draft.title,
    periodYear: 2026,
    periodMonth: 7,
    periodHalf: 'SECOND_HALF',
    revision: 3,
    hiddenAt,
    updatedAt: '2026-07-26T03:00:00.000Z',
    lastSavedAt: '2026-07-26T03:00:00.000Z',
    localOnly: false,
    pendingRemote: false,
    document,
  };
}

class MemoryCache implements PlanCache {
  readonly records = new Map<string, CachedPlanRecord>();

  async findWorkspaceId(userId: string): Promise<string | null> {
    return [...this.records.values()].some((record) =>
      record.verifiedUserIds.includes(userId),
    )
      ? WORKSPACE_ID
      : null;
  }

  async authorizeUser(workspaceId: string, userId: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.workspaceId === workspaceId) {
        this.records.set(key, {
          ...record,
          verifiedUserIds: [...new Set([...record.verifiedUserIds, userId])],
        });
      }
    }
  }

  async get(
    workspaceId: string,
    projectId: string,
    userId: string,
  ): Promise<CachedPlanRecord | null> {
    const record = this.records.get(`${workspaceId}:${projectId}`) ?? null;
    return record?.verifiedUserIds.includes(userId) ? record : null;
  }

  async list(
    workspaceId: string,
    userId: string,
  ): Promise<readonly CachedPlanRecord[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.workspaceId === workspaceId &&
        record.verifiedUserIds.includes(userId),
    );
  }

  async put(record: CachedPlanRecord): Promise<void> {
    this.records.set(record.cacheKey, record);
  }
}

function authenticatedClient(user: User | null = USER): {
  readonly client: SupabaseClient;
  readonly signInWithOAuth: ReturnType<typeof vi.fn>;
  readonly signOut: ReturnType<typeof vi.fn>;
} {
  const signInWithOAuth = vi.fn(async () => ({ data: {}, error: null }));
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: user === null ? null : { user },
        },
        error: null,
      })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
      signInWithOAuth,
      signOut,
    },
  } as unknown as SupabaseClient;
  return { client, signInWithOAuth, signOut };
}

function mutableRepository(initial: CloudProjectRecord | null): {
  readonly repository: PlanRepository;
  readonly saveProject: ReturnType<typeof vi.fn>;
  readonly setProjectHidden: ReturnType<typeof vi.fn>;
} {
  let project = initial;
  const saveProject = vi.fn(async () => ({
    revision: 4,
    updatedAt: '2026-07-26T04:00:00.000Z',
    lastSavedAt: '2026-07-26T04:00:00.000Z',
  }));
  const setProjectHidden = vi.fn(
    async (_workspaceId: string, _projectId: string, hidden: boolean) => {
      if (project !== null) {
        project = {
          ...project,
          hiddenAt: hidden ? '2026-07-26T05:00:00.000Z' : null,
        };
      }
    },
  );
  const repository: PlanRepository = {
    findWorkspace: async () => ({ id: WORKSPACE_ID, name: 'ngplan' }),
    listProjects: async (_workspaceId, visibility) => {
      if (project === null) return [];
      const visible = project.hiddenAt === null;
      return visibility === 'VISIBLE' === visible ? [project] : [];
    },
    loadProject: async () => {
      if (project === null) throw new Error('missing project');
      return project;
    },
    saveProject,
    setProjectHidden,
  };
  return { repository, saveProject, setProjectHidden };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', window.location.href);
  vi.restoreAllMocks();
});

describe('CloudApp', () => {
  it('resolves OAuth redirects for both Pages and the custom domain', () => {
    expect(
      resolveCloudAppRedirectUrl(
        'https://mworkroom.github.io/ngplan/?source=login',
        './',
      ),
    ).toBe('https://mworkroom.github.io/ngplan/');
    expect(
      resolveCloudAppRedirectUrl(
        'https://plan.nangok.app/?source=login',
        './',
      ),
    ).toBe('https://plan.nangok.app/');
  });

  it('reuses Google login and does not offer public account creation', async () => {
    const { client, signInWithOAuth } = authenticatedClient(null);
    render(
      <CloudApp
        client={client}
        repository={mutableRepository(null).repository}
        cache={new MemoryCache()}
      />,
    );

    const login = await screen.findByRole('button', {
      name: 'Google로 로그인',
    });
    expect(screen.queryByText(/회원가입/)).toBeNull();
    await userEvent.setup().click(login);

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: expect.any(String) },
    });
  });

  it('toggles the mobile settings menu without changing the logout action', async () => {
    const { client, signOut } = authenticatedClient();
    const snapshot = createSnapshot();
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const { repository } = mutableRepository(projectRecord(document));

    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    await screen.findByRole('heading', { name: '애터미 직급 계획표' });
    const settings = screen.getByRole('button', {
      name: '설정',
      hidden: true,
    });
    expect(settings.getAttribute('aria-expanded')).toBe('false');

    await userEvent.setup().click(settings);
    expect(settings.getAttribute('aria-expanded')).toBe('true');

    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(settings.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a simple login error when Google OAuth cannot start', async () => {
    const { client, signInWithOAuth } = authenticatedClient(null);
    signInWithOAuth.mockResolvedValueOnce({
      data: {},
      error: { message: '허용되지 않은 계정' },
    });
    render(
      <CloudApp
        client={client}
        repository={mutableRepository(null).repository}
        cache={new MemoryCache()}
      />,
    );

    await userEvent.setup().click(
      await screen.findByRole('button', { name: 'Google로 로그인' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      '로그인하지 못했습니다. 허용되지 않은 계정',
    );
  });

  it('opens a cloud plan without reading or writing the former localStorage work session', async () => {
    const snapshot = createSnapshot();
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const remote = projectRecord(document);
    const { client } = authenticatedClient();
    const { repository, saveProject } = mutableRepository(remote);
    const cache = new MemoryCache();

    render(<CloudApp client={client} repository={repository} cache={cache} />);

    await userEvent.setup().click(
      await screen.findByRole('button', { name: '계획 열기' }),
    );

    expect(
      await screen.findByRole('heading', { name: '브라질 7월 계획' }),
    ).toBeDefined();
    expect(screen.queryByText('클라우드와 이 기기에 자동으로 저장됩니다.')).toBeNull();
    expect(screen.queryByText('저장됨', { selector: '.cloud-save-status' })).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(saveProject).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('pagehide'));
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(
      globalThis.document,
      'visibilityState',
    );
    Object.defineProperty(globalThis.document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    if (visibilityDescriptor === undefined) {
      Reflect.deleteProperty(globalThis.document, 'visibilityState');
    } else {
      Object.defineProperty(
        globalThis.document,
        'visibilityState',
        visibilityDescriptor,
      );
    }

    await userEvent.setup().click(
      screen.getByRole('button', { name: '전체 목록으로' }),
    );
    expect(
      await screen.findByRole('heading', { name: '애터미 직급 계획표' }),
    ).toBeDefined();
  });

  it('returns from the member setup screen to the plan list with the browser back button', async () => {
    const snapshot = createSnapshot();
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const remote = projectRecord(document);
    const { client } = authenticatedClient();
    const { repository } = mutableRepository(remote);

    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    await userEvent.setup().click(
      await screen.findByRole('button', { name: '계획 열기' }),
    );
    expect(
      await screen.findByRole('heading', { name: '브라질 7월 계획' }),
    ).toBeDefined();
    expect(window.history.state).toMatchObject({ ngplanView: 'EDITOR' });

    act(() => window.history.back());

    expect(
      await screen.findByRole('heading', { name: '애터미 직급 계획표' }),
    ).toBeDefined();
    expect(window.location.href).not.toContain('www.nangok.app');
  });

  it('shows Korean time before Brazil time for each saved plan', async () => {
    const snapshot = createSnapshot();
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const remote = {
      ...projectRecord(document),
      updatedAt: '2026-07-26T16:58:00.000Z',
      lastSavedAt: '2026-07-26T16:58:00.000Z',
    };
    const { client } = authenticatedClient();
    const { repository } = mutableRepository(remote);

    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    const koreanTime = await screen.findByText(
      '한국 시간 2026. 7. 27. 오전 1:58',
    );
    const brazilTime = screen.getByText(
      '브라질 시간 2026. 7. 26. 오후 1:58',
    );
    const savedTimes = koreanTime.closest('.cloud-project-card__saved');

    expect(savedTimes).toBe(brazilTime.closest('.cloud-project-card__saved'));
    expect(
      Array.from(savedTimes?.querySelectorAll('span') ?? [], (item) =>
        item.textContent?.trim(),
      ),
    ).toEqual([
      '한국 시간 2026. 7. 27. 오전 1:58',
      '브라질 시간 2026. 7. 26. 오후 1:58',
    ]);
  });

  it('hides and restores a plan from the list without exposing deletion', async () => {
    const snapshot = createSnapshot();
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const remote = projectRecord(document);
    const { client, signOut } = authenticatedClient();
    const { repository, setProjectHidden } = mutableRepository(remote);
    const cache = new MemoryCache();
    await cache.put(
      createCachedPlanRecord({
        workspaceId: WORKSPACE_ID,
        verifiedUserId: USER.id,
        document,
        workspaceSession: snapshot,
        pendingRemote: false,
        remoteRevision: remote.revision,
        remoteUpdatedAt: remote.updatedAt,
        remoteLastSavedAt: remote.lastSavedAt,
      }),
    );
    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={cache}
      />,
    );

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '목록에서 숨기기' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '숨긴 계획 보기 (1)' })).toBeDefined();
    });
    expect(screen.queryByRole('button', { name: /영구 삭제|삭제/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '숨긴 계획 보기 (1)' }));
    await user.click(screen.getByRole('button', { name: '다시 보이기' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '숨긴 계획 보기 (0)' })).toBeDefined();
    });
    expect(setProjectHidden).toHaveBeenNthCalledWith(
      1,
      WORKSPACE_ID,
      PROJECT_ID,
      true,
    );
    expect(setProjectHidden).toHaveBeenNthCalledWith(
      2,
      WORKSPACE_ID,
      PROJECT_ID,
      false,
    );

    signOut.mockResolvedValueOnce({
      error: { message: 'sign out temporarily failed' },
    });
    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('uses a previously verified IndexedDB copy when the workspace and list are offline', async () => {
    const sourceSnapshot = createSnapshot('오프라인 보관 계획');
    const snapshot: WorkspaceSessionSnapshot = {
      ...sourceSnapshot,
      draft: {
        ...sourceSnapshot.draft,
        year: '',
        month: '99',
        half: 'FIRST_HALF',
      },
    };
    const cache = new MemoryCache();
    await cache.put(
      createCachedPlanRecord({
        workspaceId: WORKSPACE_ID,
        verifiedUserId: USER.id,
        document: cloudDocumentFromWorkspaceSession(snapshot),
        workspaceSession: snapshot,
        pendingRemote: true,
        localUpdatedAt: 'not-a-date',
      }),
    );
    const saveProject = vi.fn(async () => ({
      revision: 1,
      updatedAt: '2026-07-26T06:00:00.000Z',
      lastSavedAt: '2026-07-26T06:00:00.000Z',
    }));
    const repository: PlanRepository = {
      findWorkspace: async () => {
        throw new Error('network unavailable');
      },
      listProjects: async () => {
        throw new Error('network unavailable');
      },
      loadProject: async () => {
        throw new Error('network unavailable');
      },
      saveProject,
      setProjectHidden: async () => undefined,
    };
    const { client } = authenticatedClient();
    const onlineDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'onLine',
    );
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    render(<CloudApp client={client} repository={repository} cache={cache} />);

    expect(
      await screen.findByText(/이 기기에 저장된 계획을 보여드립니다/),
    ).toBeDefined();
    expect(
      screen.getAllByText(/저장 시각 확인 필요/, {
        selector: '.cloud-project-card__saved span',
      }),
    ).toHaveLength(2);
    expect(screen.getByText(/연도 입력 중년 월 입력 중 전반/)).toBeDefined();
    await userEvent.setup().click(
      screen.getByRole('button', { name: '다시 불러오기' }),
    );
    await userEvent.setup().click(
      screen.getByRole('button', { name: '계획 열기' }),
    );
    expect(
      await screen.findByRole('heading', { level: 1 }),
    ).toBeDefined();
    if (onlineDescriptor === undefined) {
      Reflect.deleteProperty(navigator, 'onLine');
    } else {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    }
  });

  it('recovers from an initialization failure through the single retry button', async () => {
    let firstWorkspaceAttempt = true;
    const repository: PlanRepository = {
      findWorkspace: async () => {
        if (firstWorkspaceAttempt) {
          firstWorkspaceAttempt = false;
          throw 'non-error failure';
        }
        return { id: WORKSPACE_ID, name: 'ngplan' };
      },
      listProjects: async () => [],
      loadProject: async () => {
        throw new Error('not used');
      },
      saveProject: async () => ({
        revision: 1,
        updatedAt: '2026-07-26T06:00:00.000Z',
        lastSavedAt: '2026-07-26T06:00:00.000Z',
      }),
      setProjectHidden: async () => undefined,
    };
    const { client } = authenticatedClient();

    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: '계획을 열 수 없습니다' }),
    ).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain(
      '알 수 없는 오류가 발생했습니다.',
    );
    await userEvent.setup().click(
      screen.getByRole('button', { name: '다시 시도' }),
    );
    expect(
      await screen.findByRole('heading', { name: '애터미 직급 계획표' }),
    ).toBeDefined();
  });

  it('keeps a handled error screen when initialization retry also fails', async () => {
    const repository: PlanRepository = {
      findWorkspace: async () => {
        throw new Error('workspace still unavailable');
      },
      listProjects: async () => [],
      loadProject: async () => {
        throw new Error('not used');
      },
      saveProject: async () => ({
        revision: 1,
        updatedAt: '2026-07-26T06:00:00.000Z',
        lastSavedAt: '2026-07-26T06:00:00.000Z',
      }),
      setProjectHidden: async () => undefined,
    };
    const { client } = authenticatedClient();

    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'workspace still unavailable',
    );
    await userEvent.setup().click(
      screen.getByRole('button', { name: '다시 시도' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'workspace still unavailable',
      );
    });
    expect(
      screen
        .getByRole('button', { name: '다시 시도' })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('uploads a pending local record during startup before presenting the list', async () => {
    const snapshot = createSnapshot('동기화 대기 계획');
    const cache = new MemoryCache();
    await cache.put(
      createCachedPlanRecord({
        workspaceId: WORKSPACE_ID,
        verifiedUserId: USER.id,
        document: cloudDocumentFromWorkspaceSession(snapshot),
        workspaceSession: snapshot,
        pendingRemote: true,
      }),
    );
    const remote = projectRecord(cloudDocumentFromWorkspaceSession(snapshot));
    const saveProject = vi.fn(async () => ({
      revision: 7,
      updatedAt: '2026-07-26T07:00:00.000Z',
      lastSavedAt: '2026-07-26T07:00:00.000Z',
    }));
    const repository: PlanRepository = {
      findWorkspace: async () => ({ id: WORKSPACE_ID, name: 'ngplan' }),
      listProjects: async (_workspaceId, visibility) =>
        visibility === 'VISIBLE' ? [remote] : [],
      loadProject: async () => remote,
      saveProject,
      setProjectHidden: async () => undefined,
    };
    const { client } = authenticatedClient();

    render(<CloudApp client={client} repository={repository} cache={cache} />);

    expect(
      await screen.findByRole('heading', { name: '애터미 직급 계획표' }),
    ).toBeDefined();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(await cache.get(WORKSPACE_ID, PROJECT_ID, USER.id)).toMatchObject({
      pendingRemote: false,
      remoteRevision: 7,
      lastError: null,
    });
  });

  it('opens the pending local document directly when startup synchronization still fails', async () => {
    const snapshot = createSnapshot('아직 동기화되지 않은 계획');
    const document = cloudDocumentFromWorkspaceSession(snapshot);
    const cache = new MemoryCache();
    await cache.put(
      createCachedPlanRecord({
        workspaceId: WORKSPACE_ID,
        verifiedUserId: USER.id,
        document,
        workspaceSession: snapshot,
        pendingRemote: true,
      }),
    );
    const remote = projectRecord(document);
    const saveProject = vi.fn(async () => {
      throw new Error('network still unavailable');
    });
    const repository: PlanRepository = {
      findWorkspace: async () => ({ id: WORKSPACE_ID, name: 'ngplan' }),
      listProjects: async (_workspaceId, visibility) =>
        visibility === 'VISIBLE' ? [remote] : [],
      loadProject: async () => {
        throw new Error('pending local record must win');
      },
      saveProject,
      setProjectHidden: async () => undefined,
    };
    const { client } = authenticatedClient();

    render(<CloudApp client={client} repository={repository} cache={cache} />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      '아직 인터넷에 저장되지 않았습니다.',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      '내용은 이 기기에 남아 있습니다.',
    );
    expect(screen.queryByText('이 기기에 저장됨 · 동기화 대기')).toBeNull();
    await userEvent.setup().click(
      screen.getByRole('button', { name: '다시 저장하기' }),
    );
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    await userEvent.setup().click(
      screen.getByRole('button', { name: '계획 열기' }),
    );
    expect(
      await screen.findByRole('heading', { name: '아직 동기화되지 않은 계획' }),
    ).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: '기간 변경' }));
    expect(screen.getByLabelText('프로젝트명')).toHaveProperty(
      'value',
      '아직 동기화되지 않은 계획',
    );
  });

  it('creates a new UUID plan and retries a hidden save failure without exposing editor status', async () => {
    const { client, signOut } = authenticatedClient();
    let saveAttempt = 0;
    const saveProject = vi.fn(async () => {
      saveAttempt += 1;
      if (saveAttempt === 1) throw new Error('temporary save failure');
      return {
        revision: 1,
        updatedAt: '2026-07-26T08:00:00.000Z',
        lastSavedAt: '2026-07-26T08:00:00.000Z',
      };
    });
    const repository: PlanRepository = {
      findWorkspace: async () => ({ id: WORKSPACE_ID, name: 'ngplan' }),
      listProjects: async () => [],
      loadProject: async () => {
        throw new Error('not used');
      },
      saveProject,
      setProjectHidden: async () => undefined,
    };

    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    await userEvent.setup().click(
      await screen.findByRole('button', { name: '새 계획 만들기' }),
    );
    expect(
      screen.getByRole('dialog', { name: '새 계획의 날짜가 맞나요?' }),
    ).toBeDefined();
    await userEvent.setup().click(
      screen.getByRole('button', { name: '이 기간으로 시작' }),
    );
    expect(
      await screen.findByRole('heading', { name: /\d{6}[AB]/ }),
    ).toBeDefined();
    await userEvent.setup().click(
      screen.getByRole('button', { name: '최상위 회원 만들기' }),
    );
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1), {
      timeout: 4_000,
    });
    expect(screen.queryByText('저장 실패', { selector: '.cloud-save-status' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /원격본|오프라인본/ })).toBeNull();

    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    await userEvent.setup().click(screen.getByRole('button', { name: '전체 목록으로' }));
    expect(
      await screen.findByRole('heading', { name: '애터미 직급 계획표' }),
    ).toBeDefined();
    await userEvent.setup().click(
      screen.getByRole('button', { name: '로그아웃' }),
    );
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('opens a recovery point as a new plan without overwriting the original', async () => {
    const document = cloudDocumentFromWorkspaceSession(createSnapshot());
    const base = mutableRepository(projectRecord(document));
    const listRecoveryPoints = vi.fn(async () => [
      {
        key: 'recovery:checkpoint-1',
        kind: 'SAFETY' as const,
        reason: 'BEFORE_PERIOD_CHANGE' as const,
        capturedAt: '2026-07-31T12:00:00.000Z',
        sourceRevision: 2,
        businessDate: null,
      },
    ]);
    const loadRecoveryPoint = vi.fn(async () => document);
    const repository: PlanRepository = {
      ...base.repository,
      listRecoveryPoints,
      loadRecoveryPoint,
    };
    const { client } = authenticatedClient();

    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    await userEvent.setup().click(
      await screen.findByRole('button', { name: '이전 내용 보기' }),
    );
    const recoveryDialog = await screen.findByRole('dialog', {
      name: '이전 내용으로 새 계획 만들기',
    });
    expect(recoveryDialog.textContent).toContain('브라질 7월 계획');
    expect(screen.getByText('기간을 바꾸기 전')).toBeDefined();
    expect(screen.queryByText('이전 자동 저장')).toBeNull();
    await userEvent.setup().click(
      screen.getByRole('button', { name: '이때 내용으로 새 계획 만들기' }),
    );

    expect(
      await screen.findByRole('heading', { name: '브라질 7월 계획 · 이전 내용' }),
    ).toBeDefined();
    expect(loadRecoveryPoint).toHaveBeenCalledWith(
      WORKSPACE_ID,
      PROJECT_ID,
      expect.objectContaining({ key: 'recovery:checkpoint-1' }),
    );
    await userEvent.setup().click(
      screen.getByRole('button', { name: '기간 변경' }),
    );
    expect(screen.getByLabelText('프로젝트명')).toHaveProperty(
      'value',
      '브라질 7월 계획 · 이전 내용',
    );
  });

  it('shows recovery loading errors, retries the list, and keeps a failed restore in the dialog', async () => {
    const document = cloudDocumentFromWorkspaceSession(createSnapshot());
    const base = mutableRepository(projectRecord(document));
    const listRecoveryPoints = vi
      .fn<NonNullable<PlanRepository['listRecoveryPoints']>>()
      .mockRejectedValueOnce(new Error('이전 내용 목록 연결 실패'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          key: 'recovery:auto',
          kind: 'SAFETY',
          reason: 'BEFORE_AUTOMATIC_PLAN_APPLY',
          capturedAt: '2026-07-31T12:15:00.000Z',
          sourceRevision: 5,
          businessDate: null,
        },
        {
          key: 'recovery:member',
          kind: 'SAFETY',
          reason: 'BEFORE_MEMBER_EXCLUSION',
          capturedAt: '2026-07-31T12:10:00.000Z',
          sourceRevision: 4,
          businessDate: null,
        },
        {
          key: 'recovery:rolling',
          kind: 'ROLLING',
          reason: 'AUTO_15_MIN',
          capturedAt: '2026-07-31T12:00:00.000Z',
          sourceRevision: 3,
          businessDate: null,
        },
        {
          key: 'daily:2026-07-30',
          kind: 'DAILY',
          reason: 'DAILY',
          capturedAt: '2026-07-31T02:59:00.000Z',
          sourceRevision: 2,
          businessDate: '2026-07-30',
        },
      ]);
    const loadRecoveryPoint = vi.fn(async () => {
      throw new Error('선택한 이전 내용 연결 실패');
    });
    const { client } = authenticatedClient();
    render(
      <CloudApp
        client={client}
        repository={{
          ...base.repository,
          listRecoveryPoints,
          loadRecoveryPoint,
        }}
        cache={new MemoryCache()}
      />,
    );

    await userEvent.setup().click(
      await screen.findByRole('button', { name: '이전 내용 보기' }),
    );
    expect(await screen.findByText('이전 내용 목록 연결 실패')).toBeDefined();
    await userEvent.setup().click(
      screen.getByRole('button', { name: '다시 불러오기' }),
    );
    expect(
      await screen.findByText('아직 불러올 수 있는 이전 내용이 없습니다.'),
    ).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: '닫기' }));
    await userEvent.setup().click(
      await screen.findByRole('button', { name: '이전 내용 보기' }),
    );
    expect(await screen.findByText('자동 계산을 적용하기 전')).toBeDefined();
    expect(screen.getByText('회원을 삭제하기 전')).toBeDefined();
    expect(screen.getByText('이전 자동 저장')).toBeDefined();
    expect(screen.getAllByText('자동 저장')).toHaveLength(2);
    expect(screen.queryByText(/브라질 2026/)).toBeNull();
    await userEvent.setup().click(
      screen.getAllByRole('button', {
        name: '이때 내용으로 새 계획 만들기',
      })[0]!,
    );
    expect(await screen.findByText('선택한 이전 내용 연결 실패')).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();
    await userEvent.setup().click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows configuration and session errors without exposing app data', async () => {
    const { unmount } = render(
      <CloudApp
        client={null}
        repository={mutableRepository(null).repository}
        cache={new MemoryCache()}
      />,
    );
    expect(
      screen.getByRole('heading', { name: '클라우드 연결 설정이 필요합니다' }),
    ).toBeDefined();
    unmount();

    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: { message: 'session verification failed' },
        })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
    } as unknown as SupabaseClient;
    render(
      <CloudApp
        client={client}
        repository={mutableRepository(null).repository}
        cache={new MemoryCache()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: '로그인 상태를 확인하지 못했습니다',
      }),
    ).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain(
      'session verification failed',
    );
  });

  it('reacts to an Auth session change and returns to the same Google login screen', async () => {
    let listener:
      | ((event: string, session: { readonly user: User } | null) => void)
      | null = null;
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: USER } },
          error: null,
        })),
        onAuthStateChange: vi.fn(
          (
            callback: (
              event: string,
              session: { readonly user: User } | null,
            ) => void,
          ) => {
            listener = callback;
            return {
              data: { subscription: { unsubscribe: vi.fn() } },
            };
          },
        ),
        signOut: vi.fn(async () => ({ error: null })),
        signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      },
    } as unknown as SupabaseClient;

    render(
      <CloudApp
        client={client}
        repository={mutableRepository(null).repository}
        cache={new MemoryCache()}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: '애터미 직급 계획표' }),
    ).toBeDefined();

    act(() => {
      listener?.('SIGNED_OUT', null);
    });

    expect(
      await screen.findByRole('button', { name: 'Google로 로그인' }),
    ).toBeDefined();
  });

  it('shows a list error when online workspace access succeeds but no safe local copy exists', async () => {
    const repository: PlanRepository = {
      findWorkspace: async () => ({ id: WORKSPACE_ID, name: 'ngplan' }),
      listProjects: async () => {
        throw new Error('project list failed');
      },
      loadProject: async () => {
        throw new Error('not used');
      },
      saveProject: async () => ({
        revision: 1,
        updatedAt: '2026-07-26T10:00:00.000Z',
        lastSavedAt: '2026-07-26T10:00:00.000Z',
      }),
      setProjectHidden: async () => undefined,
    };
    const { client } = authenticatedClient();
    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'project list failed',
    );
  });

  it('keeps the project list visible when a remote document cannot be opened and no cache exists', async () => {
    const remote = projectRecord(
      cloudDocumentFromWorkspaceSession(createSnapshot()),
    );
    const repository: PlanRepository = {
      findWorkspace: async () => ({ id: WORKSPACE_ID, name: 'ngplan' }),
      listProjects: async (_workspaceId, visibility) =>
        visibility === 'VISIBLE' ? [remote] : [],
      loadProject: async () => {
        throw new Error('stored document malformed');
      },
      saveProject: async () => ({
        revision: 1,
        updatedAt: '2026-07-26T11:00:00.000Z',
        lastSavedAt: '2026-07-26T11:00:00.000Z',
      }),
      setProjectHidden: async () => undefined,
    };
    const { client } = authenticatedClient();
    render(
      <CloudApp
        client={client}
        repository={repository}
        cache={new MemoryCache()}
      />,
    );

    await userEvent.setup().click(
      await screen.findByRole('button', { name: '계획 열기' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'stored document malformed',
    );
    expect(screen.getByRole('heading', { name: '애터미 직급 계획표' })).toBeDefined();
  });
});

describe('mergeCloudProjectLists', () => {
  it('uses a pending local document automatically while preserving remote hidden state', () => {
    const remote = projectRecord(
      cloudDocumentFromWorkspaceSession(createSnapshot('원격 제목')),
      '2026-07-26T05:00:00.000Z',
    );
    const pendingSnapshot = createSnapshot('오프라인 최신 제목');
    const cached = createCachedPlanRecord({
      workspaceId: WORKSPACE_ID,
      verifiedUserId: USER.id,
      document: cloudDocumentFromWorkspaceSession(pendingSnapshot),
      workspaceSession: pendingSnapshot,
      pendingRemote: true,
      remoteRevision: remote.revision,
      hiddenAt: null,
    });

    const merged = mergeCloudProjectLists([], [remote], [cached], true);

    expect(merged.visible).toEqual([]);
    expect(merged.hidden).toHaveLength(1);
    expect(merged.hidden[0]).toMatchObject({
      title: '오프라인 최신 제목',
      hiddenAt: remote.hiddenAt,
      pendingRemote: true,
      localOnly: false,
    });
  });

  it('includes a local-only draft during an outage and ignores a synced orphan when remote is authoritative', () => {
    const localSnapshot = createSnapshot('');
    const localOnly = createCachedPlanRecord({
      workspaceId: WORKSPACE_ID,
      verifiedUserId: USER.id,
      document: cloudDocumentFromWorkspaceSession({
        ...localSnapshot,
        draft: {
          ...localSnapshot.draft,
          year: '',
          month: '99',
          title: '',
        },
      }),
      workspaceSession: {
        ...localSnapshot,
        draft: {
          ...localSnapshot.draft,
          year: '',
          month: '99',
          title: '',
        },
      },
      pendingRemote: false,
      localUpdatedAt: '2026-07-26T09:00:00.000Z',
    });
    const olderProjectId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const olderSnapshot: WorkspaceSessionSnapshot = {
      ...localSnapshot,
      draft: {
        ...localSnapshot.draft,
        projectId: olderProjectId,
        title: '더 오래된 계획',
      },
    };
    const older = createCachedPlanRecord({
      workspaceId: WORKSPACE_ID,
      verifiedUserId: USER.id,
      document: cloudDocumentFromWorkspaceSession(olderSnapshot),
      workspaceSession: olderSnapshot,
      pendingRemote: true,
      localUpdatedAt: '2026-07-26T08:00:00.000Z',
    });

    const offline = mergeCloudProjectLists([], [], [older, localOnly], false);
    expect(offline.visible[0]).toMatchObject({
      title: '이름 없는 계획',
      periodYear: null,
      periodMonth: null,
      localOnly: true,
    });

    const online = mergeCloudProjectLists([], [], [localOnly], true);
    expect(online.visible).toEqual([]);
  });
});
