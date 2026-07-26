import type { SupabaseClient } from '@supabase/supabase-js';

export interface MemberDirectoryEntry {
  readonly sourceMemberId: string;
  readonly memberId: string;
  readonly fullName: string;
  readonly nickname: string;
}

export interface MemberDirectory {
  listMembers(): Promise<readonly MemberDirectoryEntry[]>;
}

interface MemberDirectoryRow {
  readonly id: string;
  readonly member_number: string | null;
  readonly name: string | null;
  readonly nickname: string | null;
}

export interface MemberDirectoryPage {
  readonly rows: readonly MemberDirectoryRow[];
}

export type MemberDirectoryPageFetcher = (
  cursor: string | null,
) => Promise<MemberDirectoryPage>;

const MEMBER_DIRECTORY_COLUMNS = 'id,member_number,name,nickname';
const MEMBER_DIRECTORY_PAGE_SIZE = 500;

function text(value: string | null): string {
  return value?.trim() ?? '';
}

function isMemberDirectoryRow(value: unknown): value is MemberDirectoryRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    (row.member_number === null || typeof row.member_number === 'string') &&
    (row.name === null || typeof row.name === 'string') &&
    (row.nickname === null || typeof row.nickname === 'string')
  );
}

export async function loadAllMemberDirectoryEntries(
  fetchPage: MemberDirectoryPageFetcher,
  pageSize = MEMBER_DIRECTORY_PAGE_SIZE,
): Promise<readonly MemberDirectoryEntry[]> {
  const entries: MemberDirectoryEntry[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const page = await fetchPage(cursor);
    if (page.rows.length > pageSize) {
      throw new Error('회원 DB 응답 크기가 예상 범위를 벗어났습니다.');
    }
    for (const row of page.rows) {
      if (seenIds.has(row.id)) {
        throw new Error('회원 DB에서 같은 회원이 중복으로 전달되었습니다.');
      }
      seenIds.add(row.id);
      entries.push({
        sourceMemberId: row.id,
        memberId: text(row.member_number),
        fullName: text(row.name),
        nickname: text(row.nickname),
      });
    }
    if (page.rows.length < pageSize) {
      break;
    }
    const nextCursor = page.rows.at(-1)?.id ?? null;
    if (nextCursor === null || (cursor !== null && nextCursor <= cursor)) {
      throw new Error('회원 DB 페이지를 이어서 불러오지 못했습니다.');
    }
    cursor = nextCursor;
  }

  return Object.freeze(entries.map((entry) => Object.freeze(entry)));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rankEntry(entry: MemberDirectoryEntry, normalizedQuery: string): number {
  const nickname = normalizeSearchText(entry.nickname);
  const memberId = normalizeSearchText(entry.memberId);
  const fullName = normalizeSearchText(entry.fullName);
  if (nickname === normalizedQuery) return 0;
  if (nickname.startsWith(normalizedQuery)) return 1;
  if (nickname.includes(normalizedQuery)) return 2;
  if (memberId.startsWith(normalizedQuery)) return 3;
  if (fullName.startsWith(normalizedQuery)) return 4;
  return 5;
}

export function searchMemberDirectory(
  entries: readonly MemberDirectoryEntry[],
  query: string,
  limit = 20,
): readonly MemberDirectoryEntry[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === '' || limit <= 0) {
    return [];
  }
  const tokens = normalizedQuery.split(' ');
  return entries
    .filter((entry) => {
      const searchable = normalizeSearchText(
        `${entry.nickname} ${entry.fullName} ${entry.memberId}`,
      );
      return tokens.every((token) => searchable.includes(token));
    })
    .sort((left, right) => {
      const rankDifference =
        rankEntry(left, normalizedQuery) - rankEntry(right, normalizedQuery);
      if (rankDifference !== 0) return rankDifference;
      return left.nickname.localeCompare(right.nickname, 'pt-BR', {
        sensitivity: 'base',
      });
    })
    .slice(0, limit);
}

export class SupabaseMemberDirectory implements MemberDirectory {
  readonly #client: SupabaseClient;
  #entriesPromise: Promise<readonly MemberDirectoryEntry[]> | null = null;

  constructor(client: SupabaseClient) {
    this.#client = client;
  }

  listMembers(): Promise<readonly MemberDirectoryEntry[]> {
    if (this.#entriesPromise === null) {
      this.#entriesPromise = loadAllMemberDirectoryEntries((cursor) =>
        this.#fetchPage(cursor),
      ).catch((error: unknown) => {
        this.#entriesPromise = null;
        throw error;
      });
    }
    return this.#entriesPromise;
  }

  async #fetchPage(cursor: string | null): Promise<MemberDirectoryPage> {
    let query = this.#client
      .from('members')
      .select(MEMBER_DIRECTORY_COLUMNS)
      .eq('member_status', 'active')
      .eq('is_hidden', false)
      .order('id', { ascending: true })
      .limit(MEMBER_DIRECTORY_PAGE_SIZE);
    if (cursor !== null) {
      query = query.gt('id', cursor);
    }
    const { data, error } = await query;
    if (error !== null) {
      throw new Error('회원 DB를 불러오지 못했습니다.', { cause: error });
    }
    if (!Array.isArray(data) || !data.every(isMemberDirectoryRow)) {
      throw new Error('회원 DB 응답 형식을 확인하지 못했습니다.');
    }
    return { rows: data };
  }
}
