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

type User = ReturnType<typeof userEvent.setup>;

const INITIAL_DATE = new Date(2026, 6, 10, 12, 0, 0);
const OPENING_FIELD_LABELS = [
  '현재 보유 PVP',
  '현재 좌 잔액',
  '현재 우 잔액',
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

function renderApp(): User {
  const user = userEvent.setup();
  render(
    <App
      generateId={createDeterministicIdGenerator()}
      initialDate={INITIAL_DATE}
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
    screen.getByRole('button', { name: '새 루트 회원 만들기' }),
  );
  await screen.findByRole('heading', { name: '회원 상세' });
}

interface SelectedMemberValues {
  readonly memberId: string;
  readonly name: string;
  readonly level?: string;
  readonly confirmed?: boolean;
}

async function fillSelectedMember(
  user: User,
  values: SelectedMemberValues,
): Promise<void> {
  await replaceInput(user, '회사 회원 ID', values.memberId);
  await replaceInput(user, '회원 이름', values.name);
  await replaceInput(user, '사업 레벨', values.level ?? '1');
  if (values.confirmed ?? true) {
    const confirmation = inputByLabel(/회사 시스템의 시작값을 확인했습니다/);
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
      ' 빈 슬롯에 회원 추가 또는 서브트리 연결',
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
  expect(inputByLabel(/회사 시스템의 시작값을 확인했습니다/).checked).toBe(
    false,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('App project setup flow', () => {
  it('defaults to compact density and persists a comfortable preference', async () => {
    const user = renderApp();
    const app = document.getElementById('project-setup');

    expect(app?.getAttribute('data-density')).toBe('compact');
    await user.selectOptions(screen.getByLabelText('화면 크기'), 'COMFORTABLE');
    expect(app?.getAttribute('data-density')).toBe('comfortable');
    expect(window.localStorage.getItem('ngplan.display-density')).toBe('COMFORTABLE');

    cleanup();
    render(<App initialDate={INITIAL_DATE} />);
    expect(document.getElementById('project-setup')?.getAttribute('data-density')).toBe(
      'comfortable',
    );
  });

  it('uses Seoul time for the initial half and supports title/slot panel controls', async () => {
    const generated = createSessionIdGenerator('test session');
    expect(generated('PROJECT')).toBe('project-test_session-1');
    expect(generated('ORGANIZATION_SNAPSHOT')).toBe(
      'organization-snapshot-test_session-1',
    );

    const user = userEvent.setup();
    render(<App initialDate={new Date('2026-07-15T15:30:00.000Z')} />);
    expect(inputByLabel('대상 연도').value).toBe('2026');
    expect(inputByLabel('대상 월').value).toBe('7');
    expect((screen.getByLabelText('대상 반월') as HTMLSelectElement).value).toBe(
      'SECOND_HALF',
    );
    await replaceInput(user, '대상 연도', '2027');
    expect(inputByLabel('프로젝트 제목').value).toContain('2027년');
    await replaceInput(user, '프로젝트 제목', '직접 관리 제목');
    await replaceInput(user, '대상 월', '8');
    expect(inputByLabel('프로젝트 제목').value).toBe('직접 관리 제목');
    await user.click(
      screen.getByRole('button', { name: '제목 초기화' }),
    );
    expect(inputByLabel('프로젝트 제목').value).toBe(
      '2027년 8월 하반기 직급 플랜',
    );

    await createNamedRoot(user, 'Root', '1000');
    await user.click(
      screen.getByRole('button', {
        name: 'Root의 왼쪽 빈 슬롯에 회원 추가 또는 서브트리 연결',
      }),
    );
    expect(screen.getByRole('heading', { name: '회원 상세' })).toBeDefined();
    expect(inputByLabel('회사 회원 ID').value).toBe('');
  });

  it('adds a root and both child sides by keyboard using explicit accessible labels', async () => {
    const user = renderApp();

    expect(inputByLabel('대상 연도').value).toBe('2026');
    expect(inputByLabel('대상 월').value).toBe('7');
    expect(inputByLabel('프로젝트 제목').value).toBe(
      '2026년 7월 상반기 직급 플랜',
    );

    await addRootWithKeyboard(user);
    expectZeroOpeningDefaults();
    await fillSelectedMember(user, {
      memberId: '1000',
      name: 'Root',
      confirmed: false,
    });

    const leftSlot = screen.getByRole('button', {
      name: 'Root의 왼쪽 빈 슬롯에 회원 추가 또는 서브트리 연결',
    });
    await activateWithKeyboard(user, leftSlot);
    expectZeroOpeningDefaults();
    await fillSelectedMember(user, {
      memberId: '1001',
      name: 'Left',
      confirmed: false,
    });

    const rightSlot = screen.getByRole('button', {
      name: 'Root의 오른쪽 빈 슬롯에 회원 추가 또는 서브트리 연결',
    });
    await activateWithKeyboard(user, rightSlot);
    expectZeroOpeningDefaults();

    expect(within(memberCard('Root')).queryByText('스스로')).toBeNull();
    expect(screen.getByRole('button', { name: 'Left 제외 또는 재배치' })).toBeDefined();
  });

  it('publishes a valid READY bundle and invalidates it on the next real edit', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Left', '1001');
    await addNamedChild(user, 'Root', '오른쪽', 'Right', '1002');

    await user.click(
      screen.getByRole('button', { name: '설정 검증 및 완료' }),
    );

    expect(screen.getByText('READY · 설정 완료')).toBeDefined();
    expect(
      screen.getByRole('heading', { name: '설정 번들 준비 완료' }),
    ).toBeDefined();
    expect(screen.getByText('프로젝트 설정이 완료되어 Phase 3 전달 번들이 준비되었습니다.')).toBeDefined();

    await user.type(inputByLabel('회원 이름'), ' 수정');

    expect(screen.getByText('EDITING · 편집 중')).toBeDefined();
    expect(
      screen.queryByRole('heading', { name: '설정 번들 준비 완료' }),
    ).toBeNull();
  });

  it('blocks invalid completion and lets the compact summary focus the first error', async () => {
    const user = renderApp();
    await addRootWithKeyboard(user);
    await replaceInput(user, '프로젝트 제목', '');

    await user.click(
      screen.getByRole('button', { name: '설정 검증 및 완료' }),
    );

    expect(screen.getByText(/설정을 완료하지 못했습니다/)).toBeDefined();
    expect(screen.getByText('EDITING · 편집 중')).toBeDefined();
    expect(screen.getByText(/완료 전 확인할 항목 4개/)).toBeDefined();
    expect(screen.getByLabelText('현재 회원 검증 결과')).toBeDefined();

    const organizationPanel = screen.getByRole('region', { name: '조직 구조' });
    await user.click(
      within(organizationPanel).getByRole('button', { name: '첫 오류로 이동' }),
    );
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
    });

    expect(inputByLabel('회사 회원 ID').getAttribute('aria-invalid')).toBe('false');
  });

  it('focuses a queued subtree error and reattaches it through the parent slot', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Child', '1001');

    await user.click(
      screen.getByRole('button', { name: '현재 부모에서 분리' }),
    );

    expect(
      screen.getByRole('heading', { name: '재배치 대기 서브트리' }),
    ).toBeDefined();
    expect(screen.getByText('1개 대기')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '서브트리 선택' }));
    expect(inputByLabel('회원 이름').value).toBe('Child');

    await user.click(screen.getByRole('button', { name: '첫 항목으로 이동' }));
    const queueEntry = document.getElementById('queue-member-2');
    expect(queueEntry).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(queueEntry);
    });

    await activateWithKeyboard(
      user,
      screen.getByRole('button', {
        name: 'Root의 왼쪽 빈 슬롯에 회원 추가 또는 서브트리 연결',
      }),
    );
    await activateWithKeyboard(
      user,
      screen.getByRole('button', { name: 'Child 서브트리 연결' }),
    );

    expect(
      screen.queryByRole('heading', { name: '재배치 대기 서브트리' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Child 제외 또는 재배치' })).toBeDefined();
  });

  it('explicitly promotes the only child when excluding a one-child member', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'Middle', '1001');
    await addNamedChild(user, 'Middle', '왼쪽', 'Leaf', '1002');

    const excludeButton = screen.getByRole('button', {
      name: 'Middle 제외 또는 재배치',
    });
    await user.click(excludeButton);

    expect(
      screen.getByRole('heading', { name: 'Middle 회원 제외' }),
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
      name: /자식을 기존 슬롯으로 승격/,
    });
    expect((promoteOption as HTMLInputElement).checked).toBe(true);

    await user.click(
      screen.getByRole('button', { name: '선택한 방식으로 제외' }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Leaf 제외 또는 재배치' })).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Middle 회원 상세 편집' }),
    ).toBeNull();
    expect(
      screen.queryByRole('heading', { name: '재배치 대기 서브트리' }),
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
        name: '현재 프로젝트에서 회원 제외',
      }),
    );

    expect(
      screen.getByText(/두 서브트리 모두 재배치 대기 목록으로 이동합니다/),
    ).toBeDefined();
    expect(screen.queryByRole('radio')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: '선택한 방식으로 제외' }),
    );

    const queueHeading = screen.getByRole('heading', {
      name: '재배치 대기 서브트리',
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
        name: 'Root의 왼쪽 빈 슬롯에 회원 추가 또는 서브트리 연결',
      }),
    ).toBeDefined();
    expect(
      screen.queryAllByRole('button', { name: '새 루트로 지정' }),
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
        name: '현재 프로젝트에서 회원 제외',
      }),
    );
    expect(
      screen.getByText(/남은 서브트리 중 하나를 새 루트로 명시적으로 지정해야 합니다/),
    ).toBeDefined();
    await user.click(
      screen.getByRole('button', { name: '선택한 방식으로 제외' }),
    );

    expect(screen.getByText('활성 루트 회원이 없습니다.')).toBeDefined();
    expect(screen.getByText('2개 대기')).toBeDefined();
    const setRootButtons = screen.getAllByRole('button', {
      name: '새 루트로 지정',
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
    await replaceInput(user, '현재 보유 PVP', '42');

    await user.click(screen.getByRole('button', { name: '새 프로젝트' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      '현재 회원과 조직, 시작값을 모두 버리고 새 프로젝트를 시작할까요?',
    );
    expect(
      screen.getByRole('button', { name: 'Legacy 회원 상세 편집' }),
    ).toBeDefined();
    expect(inputByLabel('현재 보유 PVP').value).toBe('42');

    await user.click(screen.getByRole('button', { name: '새 프로젝트' }));

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('button', { name: 'Legacy 회원 상세 편집' }),
    ).toBeNull();
    expect(screen.getByText('활성 루트 회원이 없습니다.')).toBeDefined();
    expect(
      screen.getByText(
        '새 프로젝트 초안을 만들었습니다. 이전 회원 데이터는 복사하지 않았습니다.',
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

    const viewport = screen.getByLabelText('좌우 조직 트리 스크롤 영역');
    expect(viewport.classList.contains('organization-tree__viewport')).toBe(true);
    expect(viewport.tabIndex).toBe(0);
    expect(viewport.querySelector('.organization-tree__canvas')).not.toBeNull();
    expect(viewport.querySelectorAll('.member-card')).toHaveLength(3);

    const collapseButton = screen.getByRole('button', {
      name: '하위 조직 접기',
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
      name: '하위 조직 펼치기',
    });
    expect(expandButton.getAttribute('aria-expanded')).toBe('false');
    expect(expandButton.getAttribute('aria-controls')).toBe(controlledId);
    expect(controlledRegion?.hidden).toBe(true);

    await activateWithKeyboard(user, expandButton);
    expect(
      screen.getByRole('button', { name: '하위 조직 접기' }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
  });

  it('moves an existing subtree through explicit parent and side controls', async () => {
    const user = renderApp();
    await createNamedRoot(user);
    await addNamedChild(user, 'Root', '왼쪽', 'A', '1001');
    await addNamedChild(user, 'Root', '오른쪽', 'B', '1002');
    await selectMember(user, 'A');

    await user.selectOptions(screen.getByLabelText('새 상위 회원'), 'member-3');
    await user.selectOptions(screen.getByLabelText('새 배치 방향'), 'LEFT');
    await user.click(
      screen.getByRole('button', { name: '선택한 빈 슬롯으로 이동' }),
    );

    expect(
      screen.getByRole('button', {
        name: 'Root의 왼쪽 빈 슬롯에 회원 추가 또는 서브트리 연결',
      }),
    ).toBeDefined();
    expect(within(memberCard('B')).getByRole('button', { name: 'A 제외 또는 재배치' })).toBeDefined();
  });
});
