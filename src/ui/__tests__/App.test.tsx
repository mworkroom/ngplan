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
import { WORKSPACE_SESSION_STORAGE_KEY } from '../workspace-session-storage';

type User = ReturnType<typeof userEvent.setup>;

const INITIAL_DATE = new Date(2026, 6, 10, 12, 0, 0);
const OPENING_FIELD_LABELS = [
  'PVP 시작값',
  '좌 시작값',
  '우 시작값',
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
  const element = screen.getByLabelText(label);
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
  readonly confirmed?: boolean;
}

async function fillSelectedMember(
  user: User,
  values: SelectedMemberValues,
): Promise<void> {
  await replaceInput(user, 'ID', values.memberId);
  await replaceInput(user, '이름 (닉네임이 표시됨)', values.name);
  await user.selectOptions(
    screen.getByLabelText('이번 기간 PVP 목표'),
    values.pvpTarget ?? '700',
  );
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
    expect(document.activeElement).toBe(inputByLabel('이름 (닉네임이 표시됨)'));
  });

  it('adds a root and both child sides by keyboard using explicit accessible labels', async () => {
    const user = renderApp();

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
      screen.getByRole('button', { name: '수동 플랜 열기' }),
    );

    const planTitle = await screen.findByRole('heading', { name: '202607A' });
    await waitFor(() => expect(document.activeElement).toBe(planTitle));
    expect(screen.getByText('입력을 확인하고 수동 플랜을 열었습니다.')).toBeDefined();
  });

  it('blocks invalid completion and lets the compact summary focus the first error', async () => {
    const user = renderApp();
    await addRootWithKeyboard(user);
    await replaceInput(user, '프로젝트명', '');

    await user.click(screen.getByRole('button', { name: '수동 플랜 열기' }));

    expect(screen.getByText(/설정을 완료하지 못했습니다/)).toBeDefined();
    expect(screen.queryByText('입력 중')).toBeNull();
    expect(screen.getByText(/미입력 항목이 4개 있습니다/)).toBeDefined();
    expect(screen.queryByLabelText('현재 회원 입력 확인 결과')).toBeNull();

    const organizationPanel = screen.getByRole('region', { name: '조직 구조' });
    await user.click(
      within(organizationPanel).getByRole('button', { name: '첫 번째 문제 보기' }),
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
      screen.getByRole('heading', { name: '새 위치를 정해야 하는 회원' }),
    ).toBeDefined();
    expect(screen.getByText('1개 대기')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '회원 정보 보기' }));
    expect(inputByLabel('이름 (닉네임이 표시됨)').value).toBe('Child');

    await user.click(screen.getByRole('button', { name: '첫 번째 문제 보기' }));
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
      screen.getByRole('button', { name: 'Child님과 하위 회원 연결' }),
    );

    expect(
      screen.queryByRole('heading', { name: '새 위치를 정해야 하는 회원' }),
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
      screen.queryByRole('heading', { name: '새 위치를 정해야 하는 회원' }),
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
      name: '새 위치를 정해야 하는 회원',
    });
    const queueSection = queueHeading.closest('section');
    if (queueSection === null) {
      throw new Error('Reassignment queue section was not rendered');
    }
    expect(screen.getByText('2개 대기')).toBeDefined();
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
    expect(screen.getByText('2개 대기')).toBeDefined();
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
    expect(screen.getByText('1개 대기')).toBeDefined();
  });

  it('warns before replacing member data and starts with uncopied opening defaults', async () => {
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const user = renderApp();
    await createNamedRoot(user, 'Legacy', '1000');
    await replaceInput(user, 'PVP 시작값', '42');

    await user.click(screen.getByRole('button', { name: '초기화' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      '지금까지 입력한 회원과 숫자를 모두 지우고 새로 시작할까요?',
    );
    expect(
      screen.getByRole('button', { name: 'Legacy 회원 상세 편집' }),
    ).toBeDefined();
    expect(inputByLabel('PVP 시작값').value).toBe('42');

    await user.click(screen.getByRole('button', { name: '초기화' }));

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('button', { name: 'Legacy 회원 상세 편집' }),
    ).toBeNull();
    expect(screen.getByText('맨 위에 놓을 회원 카드를 만들어 주세요.')).toBeDefined();
    expect(
      screen.getByText(
        '새 플랜을 시작했습니다. 이전에 입력한 회원 정보는 가져오지 않았습니다.',
      ),
    ).toBeDefined();

    await addRootWithKeyboard(user);
    expectZeroOpeningDefaults();
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
    await user.click(screen.getByRole('button', { name: '− 작게' }));
    expect(screen.getByText('현재 90%')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '100%' }));
    expect(screen.getByText('현재 100%')).toBeDefined();

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
    await user.click(screen.getByRole('button', { name: '수동 플랜 열기' }));

    const pvpInput = screen.getByRole('textbox', {
      name: /1 \(수\).*Root.*PVP 계획 PV/,
    }) as HTMLInputElement;
    await user.type(pvpInput, '123');
    expect(pvpInput.value).toBe('123');

    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    expect(screen.getByRole('heading', { name: '애터미 직급 플랜 설정' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '수동 플랜 열기' }));

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

  it('imports only the nickname and member number and prevents selecting the same source UUID twice', async () => {
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
    await user.click(screen.getByRole('button', { name: '불러오기' }));
    await user.type(await screen.findByLabelText('회원 검색'), 'Bia');
    await user.click(screen.getByRole('button', { name: /Bia.*Maria Beatriz/ }));
    expect(inputByLabel('이름 (닉네임이 표시됨)').value).toBe('Bia');
    expect(inputByLabel('ID').value).toBe('1001');
    expect(screen.queryByDisplayValue('Maria Beatriz Rodrigues de Almeida')).toBeNull();

    await user.click(
      screen.getByRole('button', {
        name: 'Bia의 왼쪽 빈 자리에 회원 연결',
      }),
    );
    await user.click(screen.getByRole('button', { name: '불러오기' }));
    await user.type(await screen.findByLabelText('회원 검색'), 'Bia');
    expect(
      screen.getByRole('button', { name: /Bia.*이미 추가됨/ }).hasAttribute('disabled'),
    ).toBe(true);

    await user.clear(screen.getByLabelText('회원 검색'));
    await user.type(screen.getByLabelText('회원 검색'), 'Ana Paula');
    await user.click(screen.getByRole('button', { name: /닉네임 없음.*Ana Paula/ }));
    await user.type(screen.getByLabelText('피라미드 표시 이름'), 'Aninha');
    await user.click(screen.getByRole('button', { name: '이 이름으로 추가' }));
    expect(inputByLabel('이름 (닉네임이 표시됨)').value).toBe('Aninha');
    expect(inputByLabel('ID').value).toBe('1002');
  });

  it('reorders a persisted mirrored draft before the restored plan is edited', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '오른쪽', 'Kelly', '1001');
    await addNamedChild(user, 'Kelly', '왼쪽', 'Yuri', '1002');
    await user.click(screen.getByRole('button', { name: '수동 플랜 열기' }));
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
    expect(restoredYuriInput.value).toBe('1234');
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
