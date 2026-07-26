import { describe, expect, it } from 'vitest';
import {
  addMemberToSlot,
  addRootMember,
  assignMemberDirectoryIdentity,
  createProjectDraft,
  editMemberIdentity,
  type IdGenerator,
  type ProjectSetupDraft,
} from '..';

const generateId: IdGenerator = (kind) => `${kind.toLowerCase()}-1`;

function emptyDraft(): ProjectSetupDraft {
  return createProjectDraft({
    year: 2026,
    month: 7,
    half: 'SECOND_HALF',
    generateId,
  });
}

function successfulDraft(
  outcome: ReturnType<typeof addRootMember> | ReturnType<typeof addMemberToSlot>,
): ProjectSetupDraft {
  if (outcome.status === 'FAILURE') throw new Error(outcome.error.message);
  return outcome.draft;
}

describe('assignMemberDirectoryIdentity', () => {
  it('stores the source UUID separately from the plan member key', () => {
    const draft = successfulDraft(addRootMember(emptyDraft(), 'plan-member-1'));
    const outcome = assignMemberDirectoryIdentity(draft, 'plan-member-1', {
      sourceMemberId: 'directory-member-1',
      memberId: '1001',
      displayName: 'Bia',
    });

    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status === 'FAILURE') return;
    expect(outcome.draft.members[0]).toMatchObject({
      memberKey: 'plan-member-1',
      sourceMemberId: 'directory-member-1',
      memberId: '1001',
      name: 'Bia',
    });
  });

  it('blocks the same source UUID and a manually duplicated member number', () => {
    let draft = successfulDraft(addRootMember(emptyDraft(), 'root'));
    const assignedRoot = assignMemberDirectoryIdentity(draft, 'root', {
      sourceMemberId: 'directory-member-1',
      memberId: '1001',
      displayName: 'Bia',
    });
    if (assignedRoot.status === 'FAILURE') throw new Error(assignedRoot.message);
    draft = successfulDraft(
      addMemberToSlot(assignedRoot.draft, 'root', 'LEFT', 'child'),
    );

    const sourceDuplicate = assignMemberDirectoryIdentity(draft, 'child', {
      sourceMemberId: 'directory-member-1',
      memberId: '1001',
      displayName: 'Bia',
    });
    expect(sourceDuplicate).toMatchObject({
      status: 'FAILURE',
      existingMemberKey: 'root',
      reason: 'SOURCE_MEMBER_DUPLICATE',
    });

    draft = editMemberIdentity(draft, 'root', {
      sourceMemberId: null,
      memberId: '2002',
    });
    const memberIdDuplicate = assignMemberDirectoryIdentity(draft, 'child', {
      sourceMemberId: 'directory-member-2',
      memberId: '2002',
      displayName: 'Lia',
    });
    expect(memberIdDuplicate).toMatchObject({
      status: 'FAILURE',
      existingMemberKey: 'root',
      reason: 'MEMBER_ID_DUPLICATE',
    });
  });

  it('allows two different source UUIDs to share the same nickname', () => {
    const root = successfulDraft(addRootMember(emptyDraft(), 'root'));
    const assignedRoot = assignMemberDirectoryIdentity(root, 'root', {
      sourceMemberId: 'directory-member-1',
      memberId: '1001',
      displayName: 'Bia',
    });
    if (assignedRoot.status === 'FAILURE') throw new Error(assignedRoot.message);
    const withChild = successfulDraft(
      addMemberToSlot(assignedRoot.draft, 'root', 'LEFT', 'child'),
    );

    const outcome = assignMemberDirectoryIdentity(withChild, 'child', {
      sourceMemberId: 'directory-member-2',
      memberId: '1002',
      displayName: 'Bia',
    });

    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status === 'FAILURE') return;
    expect(outcome.draft.members.map(({ sourceMemberId, name }) => ({
      sourceMemberId,
      name,
    }))).toEqual([
      { sourceMemberId: 'directory-member-1', name: 'Bia' },
      { sourceMemberId: 'directory-member-2', name: 'Bia' },
    ]);
  });
});
