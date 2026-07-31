import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemberDraft } from '../../application/project-setup';
import type {
  MemberDirectory,
  MemberDirectoryEntry,
} from '../../cloud/member-directory';
import {
  defaultMemberDisplayName,
  MemberDirectoryPicker,
} from '../components/MemberDirectoryPicker';

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
  {
    sourceMemberId: 'directory-3',
    memberId: '1003',
    fullName: '박 진 숙',
    nickname: '',
  },
  {
    sourceMemberId: 'directory-4',
    memberId: '1004',
    fullName: '',
    nickname: '',
  },
];

function directory(): MemberDirectory {
  return {
    listMembers: vi.fn(async () => directoryEntries),
  };
}

const unused = () => undefined;

afterEach(cleanup);

describe('defaultMemberDisplayName', () => {
  it('uses a nickname, the first foreign-name word, or a joined Hangul name', () => {
    expect(defaultMemberDisplayName(directoryEntries[0]!)).toBe('Bia');
    expect(defaultMemberDisplayName(directoryEntries[1]!)).toBe('Ana');
    expect(defaultMemberDisplayName(directoryEntries[2]!)).toBe('박진숙');
    expect(defaultMemberDisplayName({ fullName: '  ', nickname: '  ' })).toBe('');
  });
});

describe('MemberDirectoryPicker', () => {
  it('shows search immediately and assigns a nickname', async () => {
    const user = userEvent.setup();
    const memberDirectory = directory();
    const onAssign = vi.fn(() => ({ status: 'SUCCESS' as const }));
    render(
      <MemberDirectoryPicker
        directory={memberDirectory}
        member={createMemberDraft('plan-1')}
        planMembers={[createMemberDraft('plan-1')]}
        onAssign={onAssign}
        onDisplayNameChange={unused}
        onChooseManualEntry={unused}
      />,
    );

    const search = screen.getByLabelText('이름 또는 회원번호');
    expect(memberDirectory.listMembers).toHaveBeenCalledOnce();
    await user.type(search, 'bia');
    const results = await screen.findByRole('list', { name: '회원 검색 결과' });
    await user.click(within(results).getByRole('button', { name: /Bia/ }));

    expect(onAssign).toHaveBeenCalledWith(directoryEntries[0], 'Bia');
  });

  it('automatically uses the first word when a foreign member has no nickname', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn(() => ({ status: 'SUCCESS' as const }));
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={createMemberDraft('plan-1')}
        planMembers={[createMemberDraft('plan-1')]}
        onAssign={onAssign}
        onDisplayNameChange={unused}
        onChooseManualEntry={unused}
      />,
    );

    await user.type(screen.getByLabelText('이름 또는 회원번호'), 'Ana Paula');
    await user.click(await screen.findByRole('button', { name: /Ana.*Ana Paula/ }));
    expect(onAssign).toHaveBeenCalledWith(directoryEntries[1], 'Ana');
    expect(screen.queryByText('이 회원은 표시할 이름이 없습니다.')).toBeNull();
  });

  it('joins spaces in a Hangul name when the nickname is empty', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn(() => ({ status: 'SUCCESS' as const }));
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={createMemberDraft('plan-1')}
        planMembers={[createMemberDraft('plan-1')]}
        onAssign={onAssign}
        onDisplayNameChange={unused}
        onChooseManualEntry={unused}
      />,
    );

    await user.type(screen.getByLabelText('이름 또는 회원번호'), '박 진 숙');
    await user.click(await screen.findByRole('button', { name: /박진숙/ }));
    expect(onAssign).toHaveBeenCalledWith(directoryEntries[2], '박진숙');
  });

  it('asks for a display name only when both stored names are empty', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn(() => ({ status: 'SUCCESS' as const }));
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={createMemberDraft('plan-1')}
        planMembers={[createMemberDraft('plan-1')]}
        onAssign={onAssign}
        onDisplayNameChange={unused}
        onChooseManualEntry={unused}
      />,
    );

    await user.type(screen.getByLabelText('이름 또는 회원번호'), '1004');
    await user.click(await screen.findByRole('button', { name: /이름 미등록/ }));
    expect(screen.getByText('이 회원은 표시할 이름이 없습니다.')).toBeDefined();
    await user.type(screen.getByLabelText('표시 이름'), '회원 1004');
    await user.click(screen.getByRole('button', { name: '이 이름으로 추가' }));
    expect(onAssign).toHaveBeenCalledWith(directoryEntries[3], '회원 1004');
  });

  it('disables a source UUID that is already used by an active plan member', async () => {
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
        onDisplayNameChange={unused}
        onChooseManualEntry={unused}
      />,
    );

    await user.type(screen.getByLabelText('이름 또는 회원번호'), 'Bia');
    const result = await screen.findByRole('button', { name: /이미 추가됨/ });
    expect(result.hasAttribute('disabled')).toBe(true);
  });

  it('allows a source UUID to be selected again when its previous member is excluded', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn(() => ({ status: 'SUCCESS' as const }));
    const current = createMemberDraft('plan-2');
    const excluded = {
      ...createMemberDraft('plan-1'),
      participation: 'EXCLUDED' as const,
      sourceMemberId: 'directory-1',
      name: 'Bia',
    };
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={current}
        planMembers={[excluded, current]}
        onAssign={onAssign}
        onDisplayNameChange={unused}
        onChooseManualEntry={unused}
      />,
    );

    await user.type(screen.getByLabelText('이름 또는 회원번호'), 'Bia');
    const result = await screen.findByRole('button', { name: /Bia/ });
    expect(result.hasAttribute('disabled')).toBe(false);
    await user.click(result);
    expect(onAssign).toHaveBeenCalledWith(directoryEntries[0], 'Bia');
  });

  it('offers direct entry only as an explicit fallback', async () => {
    const user = userEvent.setup();
    const onChooseManualEntry = vi.fn();
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={createMemberDraft('plan-1')}
        planMembers={[createMemberDraft('plan-1')]}
        onAssign={() => ({ status: 'SUCCESS' })}
        onDisplayNameChange={unused}
        onChooseManualEntry={onChooseManualEntry}
      />,
    );

    await user.click(screen.getByRole('button', { name: '직접 입력하기' }));
    expect(onChooseManualEntry).toHaveBeenCalledOnce();
  });

  it('shows the selected member and allows changing only the plan display name', async () => {
    const user = userEvent.setup();
    const onDisplayNameChange = vi.fn();
    const selected = {
      ...createMemberDraft('plan-1'),
      sourceMemberId: 'directory-1',
      memberId: '1001',
      name: 'Maria',
    };
    render(
      <MemberDirectoryPicker
        directory={directory()}
        member={selected}
        planMembers={[selected]}
        onAssign={() => ({ status: 'SUCCESS' })}
        onDisplayNameChange={onDisplayNameChange}
        onChooseManualEntry={unused}
      />,
    );

    expect(screen.getByText('회원 정보가 입력되었습니다.')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '표시 이름 바꾸기' }));
    const input = screen.getByLabelText('계획에 표시할 이름');
    await user.clear(input);
    await user.type(input, 'Maria 1980');
    await user.click(screen.getByRole('button', { name: '이 이름으로 표시' }));
    expect(onDisplayNameChange).toHaveBeenCalledWith('Maria 1980');
  });
});
