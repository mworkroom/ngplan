import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App, type AppProps } from '../App';

const INITIAL_DATE = new Date(2026, 6, 10, 12, 0, 0);

function createIdGenerator(): NonNullable<AppProps['generateId']> {
  const counters = { PROJECT: 0, ORGANIZATION_SNAPSHOT: 0, MEMBER: 0 };
  return (kind) => {
    counters[kind] += 1;
    return `${kind.toLowerCase().replaceAll('_', '-')}-${counters[kind]}`;
  };
}

function inputById(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`input not found: ${id}`);
  }
  return element;
}

function selectById(id: string): HTMLSelectElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`select not found: ${id}`);
  }
  return element;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('WP3 App setup handoff', () => {
  it('offers both direct plan choices without repeated editing or ready states', () => {
    render(<App generateId={createIdGenerator()} initialDate={INITIAL_DATE} />);
    expect(screen.getByRole('button', { name: '수동 플랜 만들기' })).toBeDefined();
    expect(screen.getByRole('button', { name: '자동 플랜 만들기' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '플래너 생성' })).toBeNull();
    expect(screen.queryByText('입력 중')).toBeNull();
    expect(screen.queryByText('계획표 준비 완료')).toBeNull();
    expect(screen.queryByText('플랜을 만들 준비가 되었습니다')).toBeNull();
    expect(screen.queryByText('준비 완료')).toBeNull();
  });

  it('P3-BOUNDARY-002 validates the latest setup again after a real edit', async () => {
    const user = userEvent.setup();
    render(<App generateId={createIdGenerator()} initialDate={INITIAL_DATE} />);

    const treeViewport = screen.getByLabelText('좌우 조직도');
    await user.click(within(treeViewport).getByRole('button'));
    await user.type(inputById('member-member-1-name'), '루트 회원');
    await user.selectOptions(selectById('member-member-1-pvpTarget'), '700');
    await user.click(inputById('member-member-1-openingStateConfirmed'));
    await user.click(screen.getByRole('button', { name: '수동 플랜 만들기' }));
    await screen.findByRole('heading', { name: '202607A' });
    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));

    await user.click(screen.getByRole('button', { name: '기간 변경' }));
    await user.type(screen.getByRole('textbox', { name: '프로젝트명' }), ' 수정');
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getByRole('button', { name: '수동 플랜 만들기' }));

    const updatedTitle = await screen.findByRole('heading', { name: '202607A 수정' });
    await waitFor(() => expect(document.activeElement).toBe(updatedTitle));
  });

  it('opens the exact session directly and returns to the setup title without a dialog', async () => {
    const user = userEvent.setup();
    render(<App generateId={createIdGenerator()} initialDate={INITIAL_DATE} />);

    const treeViewport = screen.getByLabelText('좌우 조직도');
    await user.click(within(treeViewport).getByRole('button'));
    await user.type(inputById('member-member-1-name'), '루트 회원');
    await user.selectOptions(selectById('member-member-1-pvpTarget'), '700');
    await user.click(inputById('member-member-1-openingStateConfirmed'));

    const openButton = screen.getByRole('button', {
      name: '수동 플랜 만들기',
    });
    openButton.focus();
    await user.keyboard('{Enter}');

    expect(document.getElementById('project-setup')).toBeNull();
    expect(document.getElementById('manual-plan-workspace')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '수동 계획표' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: '자동 계획 만들기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '자동으로 계산하기' })).toBeNull();
    expect(screen.queryByRole('heading', { name: '기간 설정' })).toBeNull();
    expect(screen.queryByText('✓ 계산 완료')).toBeNull();
    const planTitle = screen.getByRole('heading', { name: '202607A' });
    await waitFor(() => expect(document.activeElement).toBe(planTitle));

    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.getElementById('project-setup')).not.toBeNull());
    const setupTitle = screen.getByRole('heading', { name: '2026년 7월 상반기' });
    await waitFor(() => expect(document.activeElement).toBe(setupTitle));
    expect(screen.getByRole('button', { name: '수동 플랜 만들기' })).toBeDefined();
  });
});
