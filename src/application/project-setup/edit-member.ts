import type { Half } from '../../engine';
import { deriveDefaultProjectTitle } from './create-project-draft';
import type {
  MemberDraft,
  OpeningStateDraft,
  ProjectSetupBundle,
  ProjectSetupDraft,
} from './types';

function invalidate(draft: ProjectSetupDraft): ProjectSetupDraft {
  return draft.activeBundle === null ? draft : { ...draft, activeBundle: null };
}

function replaceMember(
  draft: ProjectSetupDraft,
  memberKey: string,
  update: (member: MemberDraft) => MemberDraft,
): ProjectSetupDraft {
  const index = draft.members.findIndex((member) => member.memberKey === memberKey);
  if (index < 0) {
    return draft;
  }
  const current = draft.members[index]!;
  const next = update(current);
  if (next === current) {
    return draft;
  }
  const members = [...draft.members];
  members[index] = next;
  return { ...invalidate(draft), members };
}

export interface ProjectPeriodPatch {
  readonly year?: string;
  readonly month?: string;
  readonly half?: Half;
}

export function editProjectPeriod(
  draft: ProjectSetupDraft,
  patch: ProjectPeriodPatch,
): ProjectSetupDraft {
  const year = patch.year ?? draft.year;
  const month = patch.month ?? draft.month;
  const half = patch.half ?? draft.half;
  if (year === draft.year && month === draft.month && half === draft.half) {
    return draft;
  }
  return {
    ...invalidate(draft),
    year,
    month,
    half,
    title:
      draft.titleSource === 'DERIVED'
        ? deriveDefaultProjectTitle(year, month, half)
        : draft.title,
  };
}

export function editProjectTitle(
  draft: ProjectSetupDraft,
  title: string,
): ProjectSetupDraft {
  if (title === draft.title && draft.titleSource === 'MANUAL') {
    return draft;
  }
  return { ...invalidate(draft), title, titleSource: 'MANUAL' };
}

export function restoreDerivedProjectTitle(draft: ProjectSetupDraft): ProjectSetupDraft {
  const title = deriveDefaultProjectTitle(draft.year, draft.month, draft.half);
  if (draft.titleSource === 'DERIVED' && draft.title === title) {
    return draft;
  }
  return { ...invalidate(draft), title, titleSource: 'DERIVED' };
}

export interface MemberIdentityPatch {
  readonly memberId?: string;
  readonly name?: string;
  readonly pvpTarget?: string;
  readonly sheetMarker?: MemberDraft['sheetMarker'];
}

export function editMemberIdentity(
  draft: ProjectSetupDraft,
  memberKey: string,
  patch: MemberIdentityPatch,
): ProjectSetupDraft {
  return replaceMember(draft, memberKey, (member) => {
    const next = {
      ...member,
      memberId: patch.memberId ?? member.memberId,
      name: patch.name ?? member.name,
      pvpTarget: patch.pvpTarget ?? member.pvpTarget,
      sheetMarker: patch.sheetMarker ?? member.sheetMarker,
    };
    return next.memberId === member.memberId &&
      next.name === member.name &&
      next.pvpTarget === member.pvpTarget &&
      next.sheetMarker === member.sheetMarker
      ? member
      : next;
  });
}

export type OpeningStatePatch = Partial<OpeningStateDraft>;

export function editOpeningState(
  draft: ProjectSetupDraft,
  memberKey: string,
  patch: OpeningStatePatch,
): ProjectSetupDraft {
  return replaceMember(draft, memberKey, (member) => {
    const openingState = { ...member.openingState, ...patch };
    const unchanged = (Object.keys(patch) as (keyof OpeningStateDraft)[]).every(
      (key) => openingState[key] === member.openingState[key],
    );
    return unchanged ? member : { ...member, openingState };
  });
}

export function selectMember(
  draft: ProjectSetupDraft,
  memberKey: string | null,
): ProjectSetupDraft {
  return memberKey === draft.selectedMemberKey
    ? draft
    : { ...draft, selectedMemberKey: memberKey };
}

export function activateProjectSetupBundle(
  draft: ProjectSetupDraft,
  bundle: ProjectSetupBundle,
): ProjectSetupDraft {
  return { ...draft, activeBundle: bundle };
}

export function clearActiveProjectSetupBundle(
  draft: ProjectSetupDraft,
): ProjectSetupDraft {
  return invalidate(draft);
}

export function replaceDraftMembers(
  draft: ProjectSetupDraft,
  members: readonly MemberDraft[],
  changes: Partial<Pick<ProjectSetupDraft, 'rootMemberKey' | 'selectedMemberKey'>> = {},
): ProjectSetupDraft {
  return {
    ...invalidate(draft),
    ...changes,
    members,
  };
}

