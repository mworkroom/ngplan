import { editMemberIdentity } from './edit-member';
import type {
  MemberDirectoryAssignmentOutcome,
  MemberDirectoryIdentity,
  ProjectSetupDraft,
} from './types';

export function assignMemberDirectoryIdentity(
  draft: ProjectSetupDraft,
  memberKey: string,
  identity: MemberDirectoryIdentity,
): MemberDirectoryAssignmentOutcome {
  const sourceMemberId = identity.sourceMemberId.trim();
  const memberId = identity.memberId.trim();
  const displayName = identity.displayName.trim();
  const sourceDuplicate = draft.members.find(
    (member) =>
      member.memberKey !== memberKey &&
      member.participation === 'ACTIVE' &&
      member.sourceMemberId === sourceMemberId,
  );
  if (sourceDuplicate !== undefined) {
    return {
      status: 'FAILURE',
      draft,
      existingMemberKey: sourceDuplicate.memberKey,
      reason: 'SOURCE_MEMBER_DUPLICATE',
      message: '이미 이 계획에 추가된 회원입니다.',
    };
  }
  const memberIdDuplicate =
    memberId === ''
      ? undefined
      : draft.members.find(
          (member) =>
            member.memberKey !== memberKey &&
            member.participation === 'ACTIVE' &&
            member.memberId.trim() === memberId,
        );
  if (memberIdDuplicate !== undefined) {
    return {
      status: 'FAILURE',
      draft,
      existingMemberKey: memberIdDuplicate.memberKey,
      reason: 'MEMBER_ID_DUPLICATE',
      message: '같은 회원번호가 이미 이 계획에 등록되어 있습니다.',
    };
  }
  return {
    status: 'SUCCESS',
    draft: editMemberIdentity(draft, memberKey, {
      sourceMemberId,
      memberId,
      name: displayName,
    }),
  };
}
