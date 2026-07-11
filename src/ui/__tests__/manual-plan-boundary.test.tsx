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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('WP3 App setup handoff', () => {
  it('does not offer manual planning before an active setup bundle exists', () => {
    render(<App generateId={createIdGenerator()} initialDate={INITIAL_DATE} />);
    expect(screen.queryByRole('button', { name: '수동 계획표 열기' })).toBeNull();
  });

  it('P3-BOUNDARY-002 invalidates READY and removes the start action after a setup edit', async () => {
    const user = userEvent.setup();
    render(<App generateId={createIdGenerator()} initialDate={INITIAL_DATE} />);

    const treeViewport = screen.getByLabelText('좌우 조직 트리 스크롤 영역');
    await user.click(within(treeViewport).getByRole('button'));
    await user.type(inputById('member-member-1-name'), '루트 회원');
    await user.type(inputById('member-member-1-level'), '3');
    await user.click(inputById('member-member-1-openingStateConfirmed'));
    await user.click(screen.getByRole('button', { name: '설정 검증 및 완료' }));
    expect(
      await screen.findByRole('button', { name: '수동 계획표 열기' }),
    ).toBeDefined();

    await user.type(screen.getByRole('textbox', { name: '프로젝트 제목' }), ' 수정');
    expect(screen.queryByRole('button', { name: '수동 계획표 열기' })).toBeNull();
    expect(screen.queryByText('READY · 설정 완료')).toBeNull();
  });

  it('opens the exact ready session and returns an unmodified plan without a dialog', async () => {
    const user = userEvent.setup();
    render(<App generateId={createIdGenerator()} initialDate={INITIAL_DATE} />);

    const treeViewport = screen.getByLabelText('좌우 조직 트리 스크롤 영역');
    await user.click(within(treeViewport).getByRole('button'));
    await user.type(inputById('member-member-1-name'), '루트 회원');
    await user.type(inputById('member-member-1-level'), '3');
    await user.click(inputById('member-member-1-openingStateConfirmed'));
    await user.click(screen.getByRole('button', { name: '설정 검증 및 완료' }));

    const openButton = await screen.findByRole('button', {
      name: '수동 계획표 열기',
    });
    await user.click(openButton);

    expect(document.getElementById('project-setup')).toBeNull();
    expect(document.getElementById('manual-plan-workspace')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: '기간 설정' })).toBeNull();
    expect(screen.getByText('✓ 계산 완료')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '설정으로 돌아가기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.getElementById('project-setup')).not.toBeNull());
    expect(screen.getByRole('button', { name: '수동 계획표 열기' })).toBeDefined();
    expect(screen.getByText('READY · 설정 완료')).toBeDefined();
  });
});
