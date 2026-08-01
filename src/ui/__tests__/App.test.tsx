import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, createSessionIdGenerator, type AppProps } from '../App';
import {
  WORKSPACE_SESSION_STORAGE_KEY,
  type WorkspaceSessionSnapshot,
} from '../workspace-session-storage';

type User = ReturnType<typeof userEvent.setup>;

const INITIAL_DATE = new Date(2026, 6, 10, 12, 0, 0);
const OPENING_FIELD_LABELS = [
  'PVP',
  '좌',
  '우',
] as const;

function createDeterministicIdGenerator(): NonNullable<AppProps['generateId']> {
  const counters = {
    PROJECT: 0,
    ORGANIZATION_SNAPSHOT: 0,
    MEMBER: 0,
  };
  return (kind) => {
    counters[kind] += 1;
    return kind.toLowerCase().replaceAll('_', '-') + '-' + counters[kind];
  };
}

function renderApp(props: Partial<AppProps> = {}): User {
  const user = userEvent.setup();
  render(
    <App
      generateId={createDeterministicIdGenerator()}
      initialDate={INITIAL_DATE}
      {...props}
    />,
  );
  return user;
}

function inputByLabel(label: string | RegExp): HTMLInputElement {
  const element = screen.getByLabelText(label, { exact: true });
  if (!(element instanceof HTMLInputElement)) {
    throw new TypeError('Expected an input for label ' + String(label));
  }
  return element;
}

async function replaceInput(
  user: User,
  label: string | RegExp,
  value: string,
): Promise<void> {
  const input = inputByLabel(label);
  await user.clear(input);
  if (value !== '') {
    await user.type(input, value);
  }
}

async function activateWithKeyboard(user: User, element: HTMLElement): Promise<void> {
  element.focus();
  expect(document.activeElement).toBe(element);
  await user.keyboard('{Enter}');
}

async function addRootWithKeyboard(user: User): Promise<void> {
  await activateWithKeyboard(
    user,
    screen.getByRole('button', { name: '최상위 회원 만들기' }),
  );
  await screen.findByRole('heading', { name: '회원 정보 입력' });
}

interface SelectedMemberValues {
  readonly memberId: string;
  readonly name: string;
  readonly pvpTarget?: string;
  readonly fortnightSideTarget?: string;
  readonly confirmed?: boolean;
}

async function fillSelectedMember(
  user: User,
  values: SelectedMemberValues,
): Promise<void> {
  await replaceInput(user, 'ID', values.memberId);
  await replaceInput(user, '이름', values.name);
  await user.selectOptions(
    screen.getByLabelText('PVP 목표'),
    values.pvpTarget ?? '700',
  );
  if (values.fortnightSideTarget !== undefined) {
    await user.selectOptions(
    screen.getByLabelText('좌우 목표'),
      values.fortnightSideTarget,
    );
  }
  if (values.confirmed ?? true) {
    const confirmation = inputByLabel(/시작값이 맞게 입력되었으면 확인 버튼을 클릭해주세요/);
    if (!confirmation.checked) {
      await user.click(confirmation);
    }
  }
}

async function createNamedRoot(
  user: User,
  name = 'Root',
  memberId = '1000',
): Promise<void> {
  await addRootWithKeyboard(user);
  await fillSelectedMember(user, { memberId, name });
}

async function addNamedChild(
  user: User,
  parentName: string,
  sideLabel: '왼쪽' | '오른쪽',
  name: string,
  memberId: string,
): Promise<void> {
  const slotButton = screen.getByRole('button', {
    name:
      parentName +
      '의 ' +
      sideLabel +
      ' 빈 자리에 회원 연결',
  });
  await activateWithKeyboard(user, slotButton);
  await fillSelectedMember(user, { memberId, name });
}

async function selectMember(user: User, name: string): Promise<void> {
  await user.click(
    screen.getByRole('button', { name: name + ' 회원 상세 편집' }),
  );
}

function memberCard(name: string): HTMLElement {
  const article = screen
    .getByRole('button', { name: name + ' 회원 상세 편집' })
    .closest('article');
  if (article === null) {
    throw new Error('Member card not found for ' + name);
  }
  return article;
}

function expectZeroOpeningDefaults(): void {
  for (const label of OPENING_FIELD_LABELS) {
    expect(inputByLabel(label).value).toBe('0');
  }
  expect(inputByLabel(/시작값이 맞게 입력되었으면 확인 버튼을 클릭해주세요/).checked).toBe(
    false,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('App project setup flow', () => {
  it('uses the compact view only and omits the former screen-size selector', () => {
    window.localStorage.setItem('ngplan.display-density', 'COMFORTABLE');
    renderApp();
    const app = document.getElementById('project-setup');

    expect(app?.getAttribute('data-density')).toBe('compact');
    expect(screen.queryByLabelText('화면 크기')).toBeNull();
  });

  it('uses Sao Paulo business time for the initial half and supports title/slot panel controls', async () => {
    const generated = createSessionIdGenerator('test session');
    expect(generated('PROJECT')).toBe('project-test_session-1');
    expect(generated('ORGANIZATION_SNAPSHOT')).toBe(
      'organization-snapshot-test_session-1',
    );

    const user = userEvent.setup();
    render(<App initialDate={new Date('2026-07-15T15:30:00.000Z')} />);
    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    expect(inputByLabel('연도').value).toBe('2026');
    expect(inputByLabel('월').value).toBe('7');
    expect((screen.getByLabelText('기간') as HTMLSelectElement).value).toBe(
      'FIRST_HALF',
    );
    await replaceInput(user, '연도', '2027');
    expect(inputByLabel('프로젝트명').value).toBe('202707A');
    await replaceInput(user, '프로젝트명', '직접 관리 제목');
    await replaceInput(user, '월', '8');
    expect(inputByLabel('프로젝트명').value).toBe('직접 관리 제목');
    await user.click(
      screen.getByRole('button', { name: '제목 초기화' }),
    );
    expect(inputByLabel('프로젝트명').value).toBe(
      '202708A',
    );

    await createNamedRoot(user, 'Root', '1000');
    await user.click(
      screen.getByRole('button', {
        name: 'Root의 왼쪽 빈 자리에 회원 연결',
      }),
    );
    expect(screen.getByRole('heading', { name: '회원 정보 입력' })).toBeDefined();
    expect(inputByLabel('ID').value).toBe('');
    expect(document.activeElement).toBe(inputByLabel('이름'));
  });

  it('adds a root and both child sides by keyboard using explicit accessible labels', async () => {
    const user = renderApp();

    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    expect(inputByLabel('연도').value).toBe('2026');
    expect(inputByLabel('월').value).toBe('7');
    expect(inputByLabel('프로젝트명').value).toBe(
      '202607A',
    );

    await addRootWithKeyboard(user);
    expectZeroOpeningDefaults();
    await fillSelectedMember(user, {
      memberId: '1000',
      name: 'Root',
      confirmed: false,
    });

    const leftSlot = screen.getByRole('button', {
      name: 'Root의 왼쪽 빈 자리에 회원 연결',
    });
    await activateWithKeyboard(user, leftSlot);
    expectZeroOpeningDefaults();
    await fillSelectedMember(user, {
      memberId: '1001',
      name: 'Left',
      confirmed: false,
    });

    const rightSlot = screen.getByRole('button', {
      name: 'Root의 오른쪽 빈 자리에 회원 연결',
    });
    await activateWithKeyboard(user, rightSlot);
    expectZeroOpeningDefaults();

    expect(within(memberCard('Root')).queryByText('스스로')).toBeNull();
    expect(screen.getByRole('button', { name: 'Left 위치 바꾸기 또는 명단에서 빼기' })).toBeDefined();
  });

  it('opens a valid plan directly with the keyboard and removes repeated setup states', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Left', '1001');
    await addNamedChild(user, 'Root', '오른쪽', 'Right', '1002');

    expect(screen.queryByText('계획표 준비 완료')).toBeNull();
    expect(screen.queryByText('플랜을 만들 준비가 되었습니다')).toBeNull();
    expect(screen.queryByText('준비 완료')).toBeNull();
    expect(screen.queryByText('입력 중')).toBeNull();

    await activateWithKeyboard(
      user,
      screen.getByRole('button', { name: '플랜 만들기' }),
    );

    const planTitle = await screen.findByRole('heading', { name: '202607A' });
    await waitFor(() => expect(document.activeElement).toBe(planTitle));
    expect(screen.getByText('입력을 확인하고 수동 플랜을 열었습니다.')).toBeDefined();
  });

  it('keeps manual planning available but disables automatic planning for a 1,500 member', async () => {
    const user = renderApp();
    await addRootWithKeyboard(user);
    await fillSelectedMember(user, {
      memberId: '1000',
      name: 'Root',
      fortnightSideTarget: '1500',
    });

    const automaticButton = screen.getByRole('button', {
      name: '다음 단계',
    }) as HTMLButtonElement;
    expect(automaticButton.disabled).toBe(true);
    expect(screen.getByText(/1,500 목표 회원이 있어 다음 단계는 아직 사용할 수 없습니다/))
      .toBeDefined();

    const manualButton = screen.getByRole('button', { name: '플랜 만들기' });
    expect((manualButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(manualButton);
    expect(await screen.findByRole('heading', { name: '202607A' })).toBeDefined();
  });

  it('blocks invalid completion and lets the compact summary focus the first error', async () => {
    const user = renderApp();
    await addRootWithKeyboard(user);
    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    await replaceInput(user, '프로젝트명', '');
    await user.click(screen.getByRole('button', { name: '닫기' }));

    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));

    expect(screen.getByText(/설정을 완료하지 못했습니다/)).toBeDefined();
    expect(screen.queryByText('입력 중')).toBeNull();
    expect(screen.getByText('입력 확인 3건')).toBeDefined();
    expect(screen.queryByLabelText('현재 회원 입력 확인 결과')).toBeNull();

    const organizationPanel = screen.getByRole('region', { name: '조직 구조' });
    await user.click(
      within(organizationPanel).getByRole('button', { name: '다음 문제' }),
    );
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
    });

    expect(inputByLabel('ID').getAttribute('aria-invalid')).toBe('false');
  });

  it('focuses a queued subtree error and reattaches it through the parent slot', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Child', '1001');

    await user.click(
      screen.getByRole('button', { name: '보관함에 넣기' }),
    );

    expect(
      screen.getByRole('heading', {
        name: '보관함에 있는 회원',
        level: 2,
      }),
    ).toBeDefined();
    expect(screen.getByText('1명')).toBeDefined();

    await user.click(
      screen.getByRole('button', { name: 'Root 회원 상세 편집' }),
    );
    const queuedMemberButton = screen.getByRole('button', {
      name: 'Child 정보 보기',
    });
    expect(queuedMemberButton.getAttribute('aria-pressed')).toBe('false');
    await activateWithKeyboard(user, queuedMemberButton);
    expect(queuedMemberButton.getAttribute('aria-pressed')).toBe('true');
    expect(inputByLabel('이름').value).toBe('Child');
    expect(
      screen.getByRole('heading', {
        name: '보관함에 있는 회원',
        level: 3,
      }),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: '다음 문제' }));
    const queueEntry = document.getElementById('queue-member-2');
    expect(queueEntry).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(queueEntry);
    });

    await activateWithKeyboard(
      user,
      screen.getByRole('button', {
        name: 'Root의 왼쪽 빈 자리에 회원 연결',
      }),
    );
    await activateWithKeyboard(
      user,
      screen.getByRole('button', { name: 'Child 회원을 이 자리에 넣기' }),
    );

    expect(
      screen.queryByRole('heading', {
        name: '보관함에 있는 회원',
        level: 2,
      }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Child 위치 바꾸기 또는 명단에서 빼기' })).toBeDefined();
  });

  it('explicitly promotes the only child when excluding a one-child member', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Middle', '1001');
    await addNamedChild(user, 'Middle', '왼쪽', 'Leaf', '1002');

    const excludeButton = screen.getByRole('button', {
      name: 'Middle 위치 바꾸기 또는 명단에서 빼기',
    });
    await user.click(excludeButton);

    expect(
      screen.getByRole('heading', { name: 'Middle님을 삭제할까요?' }),
    ).toBeDefined();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: '취소' }),
      );
    });
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(excludeButton);
    });
    await user.click(excludeButton);
    const promoteOption = screen.getByRole('radio', {
      name: /아래 회원을 이 자리로 올리기/,
    });
    expect((promoteOption as HTMLInputElement).checked).toBe(true);

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '삭제하기',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Leaf 위치 바꾸기 또는 명단에서 빼기' })).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Middle 회원 상세 편집' }),
    ).toBeNull();
    expect(
      screen.queryByRole('heading', {
        name: '보관함에 있는 회원',
        level: 2,
      }),
    ).toBeNull();
  });

  it('queues both preserved subtrees without promotion for a two-child exclusion', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Middle', '1001');
    await addNamedChild(user, 'Middle', '왼쪽', 'A', '1002');
    await addNamedChild(user, 'Middle', '오른쪽', 'B', '1003');
    await selectMember(user, 'Middle');

    await user.click(
      screen.getByRole('button', {
        name: '삭제하기',
      }),
    );

    expect(
      screen.getByText(/두 회원의 새 위치를 각각 정해 주세요/),
    ).toBeDefined();
    expect(screen.queryByRole('radio')).toBeNull();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '삭제하기',
      }),
    );

    const queueHeading = screen.getByRole('heading', {
      name: '보관함에 있는 회원',
      level: 2,
    });
    const queueSection = queueHeading.closest('section');
    if (queueSection === null) {
      throw new Error('Reassignment queue section was not rendered');
    }
    expect(screen.getByText('2명')).toBeDefined();
    expect(within(queueSection).getByText('A')).toBeDefined();
    expect(within(queueSection).getByText('B')).toBeDefined();
    expect(
      screen.getByRole('button', {
        name: 'Root의 왼쪽 빈 자리에 회원 연결',
      }),
    ).toBeDefined();
    expect(
      screen.queryAllByRole('button', { name: '맨 위 회원으로 정하기' }),
    ).toHaveLength(0);
  });

  it('clears an excluded root, queues both child subtrees, and requires an explicit new root', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'A', '1001');
    await addNamedChild(user, 'Root', '오른쪽', 'B', '1002');
    await selectMember(user, 'Root');

    await user.click(
      screen.getByRole('button', {
        name: '삭제하기',
      }),
    );
    expect(
      screen.getByText(/남은 회원 중 한 명을 새로운 최상위 회원으로 정해 주세요/),
    ).toBeDefined();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '삭제하기',
      }),
    );

    expect(screen.getByText('맨 위에 놓을 회원 카드를 만들어 주세요.')).toBeDefined();
    expect(screen.getByText('2명')).toBeDefined();
    const setRootButtons = screen.getAllByRole('button', {
      name: '맨 위 회원으로 정하기',
    });
    expect(setRootButtons).toHaveLength(2);
    const firstSetRootButton = setRootButtons[0];
    if (firstSetRootButton === undefined) {
      throw new Error('Expected a root selection button');
    }

    await user.click(firstSetRootButton);

    expect(
      screen.getByRole('button', { name: 'A 회원 상세 편집' }),
    ).toBeDefined();
    expect(screen.getByText('1명')).toBeDefined();
  });

  it('changes the period in a separate dialog without replacing member data', async () => {
    const user = renderApp();
    await createNamedRoot(user, 'Legacy', '1000');
    await replaceInput(user, 'PVP', '42');

    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    expect(
      screen.getByRole('dialog', { name: '기간 확인 및 변경' }),
    ).toBeDefined();
    await replaceInput(user, '월', '8');
    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.getByRole('heading', { name: '202607A' })).toBeDefined();
    expect(inputByLabel('PVP').value).toBe('42');

    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    await replaceInput(user, '월', '8');
    await user.click(screen.getByRole('button', { name: '변경 적용' }));

    expect(screen.getByRole('heading', { name: '202608A' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Legacy 회원 상세 편집' })).toBeDefined();
    expect(inputByLabel('PVP').value).toBe('42');
  });

  it('exposes a focusable wide-tree viewport and collapse controls with a real controlled region', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Left', '1001');
    await addNamedChild(user, 'Root', '오른쪽', 'Right', '1002');

    const viewport = screen.getByLabelText('좌우 조직도');
    expect(viewport.classList.contains('organization-tree__viewport')).toBe(true);
    expect(viewport.tabIndex).toBe(0);
    expect(viewport.querySelector('.organization-tree__canvas')).not.toBeNull();
    expect(viewport.querySelectorAll('.member-card')).toHaveLength(3);
    expect(screen.getByLabelText('조직 그림 크기')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '작게' }));
    expect(screen.getByText('90%')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '처음 위치' }));
    expect(screen.getByText('100%')).toBeDefined();

    const collapseButton = screen.getByRole('button', {
      name: '접기',
    });
    expect(collapseButton.getAttribute('aria-expanded')).toBe('true');
    const controlledId = collapseButton.getAttribute('aria-controls');
    expect(controlledId).not.toBeNull();
    const controlledRegion =
      controlledId === null ? null : document.getElementById(controlledId);
    expect(controlledRegion).not.toBeNull();
    expect(controlledRegion?.hidden).toBe(false);

    await activateWithKeyboard(user, collapseButton);

    const expandButton = screen.getByRole('button', {
      name: '펼치기',
    });
    expect(expandButton.getAttribute('aria-expanded')).toBe('false');
    expect(expandButton.getAttribute('aria-controls')).toBe(controlledId);
    expect(controlledRegion?.hidden).toBe(true);

    await activateWithKeyboard(user, expandButton);
    expect(
      screen.getByRole('button', { name: '접기' }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
  });

  it('keeps manual entries while moving between setup and the plan in the same tab', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));

    const pvpInput = screen.getByRole('textbox', {
      name: /1 \(수\).*Root.*PVP 계획 PV/,
    }) as HTMLInputElement;
    await user.type(pvpInput, '123');
    expect(pvpInput.value).toBe('123');

    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    expect(screen.getByRole('heading', { name: '202607A' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));

    expect(
      (screen.getByRole('textbox', {
        name: /1 \(수\).*Root.*PVP 계획 PV/,
      }) as HTMLInputElement).value,
    ).toBe('123');
    await waitFor(() => {
      expect(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toContain('123');
    });

    cleanup();
    render(<App initialDate={INITIAL_DATE} />);
    expect(document.getElementById('manual-plan-workspace')).not.toBeNull();
    expect(
      (screen.getByRole('textbox', {
        name: /1 \(수\).*Root.*PVP 계획 PV/,
      }) as HTMLInputElement).value,
    ).toBe('123');
  });

  it('keeps the original plan and creates a completely blank plan for a corrected period', async () => {
    const onCreatePlanCopy = vi.fn(
      async (_snapshot: WorkspaceSessionSnapshot) => undefined,
    );
    const user = renderApp({ onCreatePlanCopy });
    await createNamedRoot(user);
    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));
    await user.type(
      screen.getByRole('textbox', {
        name: /1 \(수\).*Root.*PVP 계획 PV/,
      }),
      '123',
    );
    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));

    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    await replaceInput(user, '월', '8');
    expect(
      screen.getByText(/이미 계획표에 숫자를 입력했기 때문에 이 계획의 기간은 바꿀 수 없습니다/),
    ).toBeDefined();
    expect(
      screen.getByText(/원래 계획은 그대로 남고, 선택한 기간으로 빈 계획이 새로 만들어집니다/),
    ).toBeDefined();
    expect(screen.getByText('새 계획에서 회원을 다시 입력해 주세요.')).toBeDefined();
    await user.click(
      screen.getByRole('button', {
        name: '새 기간 계획 처음부터 만들기',
      }),
    );

    await waitFor(() => expect(onCreatePlanCopy).toHaveBeenCalledTimes(1));
    const copy = onCreatePlanCopy.mock.calls[0]?.[0] as
      | WorkspaceSessionSnapshot
      | undefined;
    expect(copy).toMatchObject({
      draft: {
        projectId: 'project-2',
        organizationSnapshotId: 'organization-snapshot-2',
        year: '2026',
        month: '8',
        half: 'FIRST_HALF',
        members: [],
        rootMemberKey: null,
        selectedMemberKey: null,
        activeBundle: null,
      },
      manualPlanDraft: null,
      screen: 'SETUP',
    });
    expect(
      screen.getByRole('heading', { name: '202607A' }),
    ).toBeDefined();
  });

  it('also treats an explicitly entered zero as date-bound work', async () => {
    const onCreatePlanCopy = vi.fn(
      async (_snapshot: WorkspaceSessionSnapshot) => undefined,
    );
    const user = renderApp({ onCreatePlanCopy });
    await createNamedRoot(user);
    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));
    await user.type(
      screen.getByRole('textbox', {
        name: /1 \(수\).*Root.*PVP 계획 PV/,
      }),
      '0',
    );
    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    await replaceInput(user, '월', '8');

    expect(
      screen.getByText(/이미 계획표 사용을 시작했기 때문에 이 계획의 기간은 바꿀 수 없습니다/),
    ).toBeDefined();
    await user.click(
      screen.getByRole('button', {
        name: '새 기간 계획 처음부터 만들기',
      }),
    );
    await waitFor(() => expect(onCreatePlanCopy).toHaveBeenCalledTimes(1));
    expect(onCreatePlanCopy.mock.calls[0]?.[0]).toMatchObject({
      draft: { month: '8', members: [] },
      manualPlanDraft: null,
    });
  });

  it('explains the next action when a separate blank plan cannot be created', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));
    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    await replaceInput(user, '월', '8');
    await user.click(
      screen.getByRole('button', { name: '새 기간 계획 처음부터 만들기' }),
    );

    expect(
      screen.getByText(
        '이 계획의 기간은 바꿀 수 없습니다. 전체 목록으로 돌아가 새 계획을 만들어 주세요.',
      ),
    ).toBeDefined();
  });

  it('keeps the original open when blank-plan creation fails', async () => {
    const onCreatePlanCopy = vi.fn(async () => {
      throw new Error('새 계획을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    });
    const user = renderApp({ onCreatePlanCopy });
    await createNamedRoot(user);
    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));
    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    await replaceInput(user, '월', '8');
    await user.click(
      screen.getByRole('button', { name: '새 기간 계획 처음부터 만들기' }),
    );

    expect(
      await screen.findByText(
        '새 계획을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('heading', { name: '202607A' })).toBeDefined();
  });

  it('does not delete a member when the safety backup fails', async () => {
    const onRequestSafetyBackup = vi.fn(async () => {
      throw new Error('보관 서버에 연결할 수 없습니다.');
    });
    const user = renderApp({ onRequestSafetyBackup });
    await createNamedRoot(user);
    await user.click(screen.getByRole('button', { name: '삭제하기' }));
    expect(screen.getByText(/먼저 현재 내용이 자동으로 저장됩니다/)).toBeDefined();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '삭제하기',
      }),
    );

    expect(await screen.findByText('보관 서버에 연결할 수 없습니다.')).toBeDefined();
    expect(onRequestSafetyBackup).toHaveBeenCalledWith(
      'BEFORE_MEMBER_EXCLUSION',
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Root 회원 상세 편집' })).toBeDefined();
  });

  it('imports a useful display name and member number and prevents selecting the same source UUID twice', async () => {
    const memberDirectory = {
      listMembers: vi.fn(async () => [
        {
          sourceMemberId: 'directory-1',
          memberId: '1001',
          fullName: 'Maria Beatriz Rodrigues de Almeida',
          nickname: 'Bia',
        },
        {
          sourceMemberId: 'directory-2',
          memberId: '1002',
          fullName: 'Ana Paula da Silva',
          nickname: '',
        },
      ]),
    };
    const user = renderApp({ memberDirectory });

    await addRootWithKeyboard(user);
    await user.type(screen.getByLabelText('이름 또는 회원번호'), 'Bia');
    await user.click(screen.getByRole('button', { name: /Bia.*Maria Beatriz/ }));
    expect(screen.getByText('회원 정보가 입력되었습니다.')).toBeDefined();
    expect(screen.getByText('회원번호 1001')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Bia 회원 상세 편집' })).toBeDefined();
    expect(screen.queryByDisplayValue('Maria Beatriz Rodrigues de Almeida')).toBeNull();

    await user.click(screen.getByRole('button', { name: '표시 이름 바꾸기' }));
    await replaceInput(user, '계획에 표시할 이름', 'Bia 1980');
    await user.click(screen.getByRole('button', { name: '이 이름으로 표시' }));
    expect(screen.getByRole('button', { name: 'Bia 1980 회원 상세 편집' })).toBeDefined();

    await user.click(
      screen.getByRole('button', {
        name: 'Bia 1980의 왼쪽 빈 자리에 회원 연결',
      }),
    );
    await user.type(screen.getByLabelText('이름 또는 회원번호'), 'Bia');
    expect(
      screen.getByRole('button', { name: /Bia.*이미 추가됨/ }).hasAttribute('disabled'),
    ).toBe(true);

    await user.clear(screen.getByLabelText('이름 또는 회원번호'));
    await user.type(screen.getByLabelText('이름 또는 회원번호'), 'Ana Paula');
    await user.click(screen.getByRole('button', { name: /Ana.*Ana Paula/ }));
    expect(screen.getByText('회원번호 1002')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ana 회원 상세 편집' })).toBeDefined();
  });

  it('reorders a persisted mirrored draft before the restored plan is edited', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '오른쪽', 'Kelly', '1001');
    await addNamedChild(user, 'Kelly', '왼쪽', 'Yuri', '1002');
    await user.click(screen.getByRole('button', { name: '플랜 만들기' }));
    expect(
      Array.from(
        document.querySelectorAll('.manual-plan-table__member-heading strong'),
        (heading) => heading.textContent,
      ),
    ).toEqual(['Root', 'Yuri', 'Kelly']);

    const yuriInput = screen.getByRole('textbox', {
      name: /1 \(수\).*Yuri.*PVP 계획 PV/,
    }) as HTMLInputElement;
    await user.type(yuriInput, '123');
    await waitFor(() => {
      expect(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)).toContain('123');
    });

    cleanup();
    const stored = JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY)!) as {
      draft: {
        activeBundle: {
          organization: {
            members: Array<{ memberKey: string; name: string }>;
          };
        };
      };
      manualPlanDraft: {
        cells: Array<{ date: string; memberKey: string }>;
      };
    };
    const memberKeyByName = new Map(
      stored.draft.activeBundle.organization.members.map((member) => [
        member.name,
        member.memberKey,
      ]),
    );
    const legacyRank = new Map([
      [memberKeyByName.get('Root'), 0],
      [memberKeyByName.get('Kelly'), 1],
      [memberKeyByName.get('Yuri'), 2],
    ]);
    stored.manualPlanDraft.cells.sort((left, right) => {
      if (left.date !== right.date) return left.date < right.date ? -1 : 1;
      return legacyRank.get(left.memberKey)! - legacyRank.get(right.memberKey)!;
    });
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify(stored));

    const restoredUser = userEvent.setup();
    render(<App initialDate={INITIAL_DATE} />);
    expect(
      Array.from(
        document.querySelectorAll('.manual-plan-table__member-heading strong'),
        (heading) => heading.textContent,
      ),
    ).toEqual(['Root', 'Yuri', 'Kelly']);
    const restoredYuriInput = screen.getByRole('textbox', {
      name: /1 \(수\).*Yuri.*PVP 계획 PV/,
    }) as HTMLInputElement;
    expect(restoredYuriInput.value).toBe('123');

    await restoredUser.type(restoredYuriInput, '4');
    expect(restoredYuriInput.value).toBe('4');
  });

  it('moves an existing subtree through explicit parent and side controls', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'A', '1001');
    await addNamedChild(user, 'Root', '오른쪽', 'B', '1002');
    await selectMember(user, 'A');

    await user.selectOptions(screen.getByLabelText('상위 회원 선택'), 'member-3');
    await user.selectOptions(screen.getByLabelText('위치 선택'), 'LEFT');
    await user.click(
      screen.getByRole('button', { name: '이동' }),
    );

    expect(
      screen.getByRole('button', {
        name: 'Root의 왼쪽 빈 자리에 회원 연결',
      }),
    ).toBeDefined();
    expect(within(memberCard('B')).getByRole('button', { name: 'A 위치 바꾸기 또는 명단에서 빼기' })).toBeDefined();
  });
});
