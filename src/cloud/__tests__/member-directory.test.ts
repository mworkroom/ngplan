import { describe, expect, it } from 'vitest';
import {
  loadAllMemberDirectoryEntries,
  searchMemberDirectory,
  type MemberDirectoryEntry,
} from '../member-directory';

const entries: readonly MemberDirectoryEntry[] = [
  {
    sourceMemberId: '1',
    memberId: '1001',
    fullName: 'Maria Beatriz Rodrigues',
    nickname: 'Bia',
  },
  {
    sourceMemberId: '2',
    memberId: '1002',
    fullName: 'José da Silva',
    nickname: 'Zé',
  },
  {
    sourceMemberId: '3',
    memberId: '2001',
    fullName: 'Ana Paula',
    nickname: '',
  },
];

describe('member directory', () => {
  it('loads every UUID page while selecting only normalized directory fields', async () => {
    const cursors: Array<string | null> = [];
    const loaded = await loadAllMemberDirectoryEntries(async (cursor) => {
      cursors.push(cursor);
      return cursor === null
        ? {
            rows: [
              { id: '1', member_number: ' 1001 ', name: ' Maria ', nickname: ' Bia ' },
              { id: '2', member_number: '1002', name: 'José', nickname: null },
            ],
          }
        : {
            rows: [
              { id: '3', member_number: null, name: null, nickname: 'Ana' },
            ],
          };
    }, 2);

    expect(cursors).toEqual([null, '2']);
    expect(loaded).toEqual([
      {
        sourceMemberId: '1',
        memberId: '1001',
        fullName: 'Maria',
        nickname: 'Bia',
      },
      {
        sourceMemberId: '2',
        memberId: '1002',
        fullName: 'José',
        nickname: '',
      },
      {
        sourceMemberId: '3',
        memberId: '',
        fullName: '',
        nickname: 'Ana',
      },
    ]);
  });

  it('rejects duplicate or stalled UUID pages', async () => {
    await expect(
      loadAllMemberDirectoryEntries(async (cursor) => ({
        rows:
          cursor === null
            ? [
                { id: '1', member_number: '1', name: 'A', nickname: 'A' },
                { id: '2', member_number: '2', name: 'B', nickname: 'B' },
              ]
            : [
                { id: '2', member_number: '2', name: 'B', nickname: 'B' },
              ],
      }), 2),
    ).rejects.toThrow('중복');
  });

  it('searches nickname first and also finds accents, full names, and member numbers', () => {
    expect(searchMemberDirectory(entries, 'bia')[0]?.sourceMemberId).toBe('1');
    expect(searchMemberDirectory(entries, 'jose')[0]?.sourceMemberId).toBe('2');
    expect(searchMemberDirectory(entries, 'Ana Paula')[0]?.sourceMemberId).toBe('3');
    expect(searchMemberDirectory(entries, '1002')[0]?.sourceMemberId).toBe('2');
    expect(searchMemberDirectory(entries, '   ')).toEqual([]);
  });
});
