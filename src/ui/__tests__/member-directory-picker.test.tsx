import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemberDraft } from '../../application/project-setup';
import type {
  MemberDirectory,
  MemberDirectoryEntry,
} from '../../cloud/member-directory';
import { MemberDirectoryPicker } from '../components/MemberDirectoryPicker';

const directoryEntries: readonly MemberDirectoryEntry[] = [
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
];

function directory(): MemberDirectory {
  return {
    listMembers: vi.fn(async () => directoryEntries),
  };
}

afterEach(cleanup);

describe('MemberDirectoryPicker', () => {
  it('searches by nickname and assigns only the nickname as the display name', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn(() => ({ status: 'SUCCESS' as const }));
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={createMemberDraft('plan-1')}
        planMembers={[createMemberDraft('plan-1')]}
        onAssign={onAssign}
      />,
    );

    await user.click(screen.getByRole('button', { name: '불러오기' }));
    const search = await screen.findByLabelText('회원 검색');
    await user.type(search, 'bia');
    const results = screen.getByRole('list', { name: '회원 검색 결과' });
    await user.click(within(results).getByRole('button', { name: /Bia/ }));

    expect(onAssign).toHaveBeenCalledWith(directoryEntries[0], 'Bia');
  });

  it('requires a short plan name when the source nickname is empty', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn(() => ({ status: 'SUCCESS' as const }));
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={createMemberDraft('plan-1')}
        planMembers={[createMemberDraft('plan-1')]}
        onAssign={onAssign}
      />,
    );

    await user.click(screen.getByRole('button', { name: '불러오기' }));
    await user.type(await screen.findByLabelText('회원 검색'), 'Ana Paula');
    await user.click(screen.getByRole('button', { name: /닉네임 없음/ }));
    expect(screen.getByText('이 회원은 닉네임이 없습니다.')).toBeDefined();
    const confirm = screen.getByRole('button', { name: '이 이름으로 추가' });
    expect(confirm.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('피라미드 표시 이름'), 'Aninha');
    await user.click(confirm);
    expect(onAssign).toHaveBeenCalledWith(directoryEntries[1], 'Aninha');
  });

  it('disables a source UUID that is already present anywhere in the plan', async () => {
    const user = userEvent.setup();
    const current = createMemberDraft('plan-2');
    const used = {
      ...createMemberDraft('plan-1'),
      sourceMemberId: 'directory-1',
      name: 'Bia',
    };
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={current}
        planMembers={[used, current]}
        onAssign={() => ({ status: 'SUCCESS' })}
      />,
    );

    await user.click(screen.getByRole('button', { name: '불러오기' }));
    await user.type(await screen.findByLabelText('회원 검색'), 'Bia');
    const result = screen.getByRole('button', { name: /이미 추가됨/ });
    expect(result.hasAttribute('disabled')).toBe(true);
  });
});
