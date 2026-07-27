import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  loadAllMemberDirectoryEntries,
  searchMemberDirectory,
  SupabaseMemberDirectory,
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

  it('rejects oversized and stalled pages and supports a zero result limit', async () => {
    await expect(
      loadAllMemberDirectoryEntries(
        async () => ({
          rows: [
            { id: '1', member_number: '1', name: 'A', nickname: 'A' },
            { id: '2', member_number: '2', name: 'B', nickname: 'B' },
            { id: '3', member_number: '3', name: 'C', nickname: 'C' },
          ],
        }),
        2,
      ),
    ).rejects.toThrow('응답 크기가 예상 범위를 벗어났습니다');

    await expect(
      loadAllMemberDirectoryEntries(
        async (cursor) =>
          cursor === null
            ? {
                rows: [
                  { id: '1', member_number: '1', name: 'A', nickname: 'A' },
                  { id: '2', member_number: '2', name: 'B', nickname: 'B' },
                ],
              }
            : {
                rows: [
                  { id: '0', member_number: '0', name: 'Zero', nickname: 'Z' },
                  { id: '1.5', member_number: '1.5', name: 'One', nickname: 'O' },
                ],
              },
        2,
      ),
    ).rejects.toThrow('페이지를 이어서 불러오지 못했습니다');

    expect(searchMemberDirectory(entries, 'bia', 0)).toEqual([]);
  });

  it('orders every search rank from an exact nickname match to a loose match', () => {
    const rankedEntries: readonly MemberDirectoryEntry[] = [
      { sourceMemberId: 'exact', memberId: '', fullName: '', nickname: 'target' },
      { sourceMemberId: 'prefix', memberId: '', fullName: '', nickname: 'target plus' },
      { sourceMemberId: 'contains', memberId: '', fullName: '', nickname: 'xx target yy' },
      { sourceMemberId: 'member-id', memberId: 'target-123', fullName: '', nickname: '' },
      { sourceMemberId: 'full-name', memberId: '', fullName: 'target person', nickname: '' },
      { sourceMemberId: 'loose', memberId: '', fullName: 'person target', nickname: '' },
    ];

    expect(searchMemberDirectory(rankedEntries, 'target').map((entry) => entry.sourceMemberId)).toEqual([
      'exact',
      'prefix',
      'contains',
      'member-id',
      'full-name',
      'loose',
    ]);
  });

  it('loads and caches paginated Supabase results with the expected filters', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: String(index + 1),
      member_number: String(index + 1),
      name: `Member ${index + 1}`,
      nickname: `M${index + 1}`,
    }));
    const client = new FakeDirectoryClient([
      { data: firstPage, error: null },
      {
        data: [{ id: '501', member_number: '501', name: 'Last', nickname: 'Last' }],
        error: null,
      },
    ]);
    const directory = new SupabaseMemberDirectory(
      client as unknown as SupabaseClient,
    );

    const loaded = await directory.listMembers();
    expect(await directory.listMembers()).toBe(loaded);
    expect(loaded).toHaveLength(501);
    expect(loaded.at(-1)?.memberId).toBe('501');
    expect(client.calls).toContainEqual({ action: 'gt', args: ['id', '500'] });
    expect(client.calls).toContainEqual({
      action: 'select',
      args: ['id,member_number,name,nickname'],
    });
    expect(client.calls).toContainEqual({ action: 'eq', args: ['member_status', 'active'] });
    expect(client.calls).toContainEqual({ action: 'eq', args: ['is_hidden', false] });
    expect(client.calls).toContainEqual({ action: 'order', args: ['id', { ascending: true }] });
    expect(client.calls).toContainEqual({ action: 'limit', args: [500] });
  });

  it('clears a failed Supabase request and rejects malformed rows', async () => {
    const client = new FakeDirectoryClient([
      { data: null, error: { message: 'network failed' } },
      { data: [{ id: 1 }], error: null },
      { data: [null], error: null },
    ]);
    const directory = new SupabaseMemberDirectory(
      client as unknown as SupabaseClient,
    );

    await expect(directory.listMembers()).rejects.toThrow('회원 DB를 불러오지 못했습니다');
    await expect(directory.listMembers()).rejects.toThrow('회원 DB 응답 형식을 확인하지 못했습니다');
    await expect(directory.listMembers()).rejects.toThrow('회원 DB 응답 형식을 확인하지 못했습니다');
  });
});

interface FakeDirectoryResponse {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

interface FakeDirectoryCall {
  readonly action: string;
  readonly args: readonly unknown[];
}

class FakeDirectoryQuery implements PromiseLike<FakeDirectoryResponse> {
  readonly #owner: FakeDirectoryClient;

  constructor(owner: FakeDirectoryClient) {
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

  order(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'order', args });
    return this;
  }

  limit(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'limit', args });
    return this;
  }

  gt(...args: readonly unknown[]): this {
    this.#owner.calls.push({ action: 'gt', args });
    return this;
  }

  then<TResult1 = FakeDirectoryResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeDirectoryResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#owner.next().then(onfulfilled, onrejected);
  }
}

class FakeDirectoryClient {
  readonly calls: FakeDirectoryCall[] = [];
  readonly #responses: FakeDirectoryResponse[];

  constructor(responses: readonly FakeDirectoryResponse[]) {
    this.#responses = [...responses];
  }

  from(...args: readonly unknown[]): FakeDirectoryQuery {
    this.calls.push({ action: 'from', args });
    return new FakeDirectoryQuery(this);
  }

  next(): Promise<FakeDirectoryResponse> {
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error('Fake Supabase response queue is empty.');
    }
    return Promise.resolve(response);
  }
}
