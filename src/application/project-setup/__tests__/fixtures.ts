import {
  addMemberToSlot,
  addRootMember,
  createProjectDraft,
  editMemberIdentity,
  editOpeningState,
  normalizeProjectSetup,
} from '../index';
import type { Side } from '../../../engine';
import type {
  IdGenerator,
  NormalizeProjectSetupOutcome,
  ProjectSetupBundle,
  ProjectSetupDraft,
  TopologyCommandOutcome,
} from '../index';

const FIXED_IDS = {
  PROJECT: 'project-1',
  ORGANIZATION_SNAPSHOT: 'snapshot-1',
  MEMBER: 'generated-member',
} as const;

export const fixedIdGenerator: IdGenerator = (kind) => FIXED_IDS[kind];

export function createEmptyDraft(): ProjectSetupDraft {
  return createProjectDraft({
    year: 2026,
    month: 7,
    half: 'FIRST_HALF',
    generateId: fixedIdGenerator,
  });
}

export function expectTopologySuccess(
  outcome: TopologyCommandOutcome,
): Extract<TopologyCommandOutcome, { readonly status: 'SUCCESS' }> {
  if (outcome.status === 'FAILURE') {
    throw new Error(`${outcome.error.code}: ${outcome.error.message}`);
  }
  return outcome;
}

export function completeMember(
  draft: ProjectSetupDraft,
  memberKey: string,
  patch: {
    readonly memberId?: string;
    readonly name?: string;
    readonly level?: string;
  } = {},
): ProjectSetupDraft {
  const withIdentity = editMemberIdentity(draft, memberKey, {
    memberId: patch.memberId ?? `ID-${memberKey}`,
    name: patch.name ?? `회원 ${memberKey}`,
    level: patch.level ?? '3',
  });
  return editOpeningState(withIdentity, memberKey, {
    openingStateConfirmed: true,
  });
}

export function addCompletedChild(
  draft: ProjectSetupDraft,
  parentMemberKey: string,
  side: Side,
  memberKey: string,
): ProjectSetupDraft {
  const outcome = expectTopologySuccess(
    addMemberToSlot(draft, parentMemberKey, side, memberKey),
  );
  return completeMember(outcome.draft, memberKey);
}

export function createSingleMemberDraft(
  memberKey = 'A',
): ProjectSetupDraft {
  const root = expectTopologySuccess(addRootMember(createEmptyDraft(), memberKey));
  return completeMember(root.draft, memberKey);
}

export function createDeepTreeDraft(): ProjectSetupDraft {
  let draft = createSingleMemberDraft('A');
  draft = addCompletedChild(draft, 'A', 'LEFT', 'B');
  draft = addCompletedChild(draft, 'A', 'RIGHT', 'C');
  draft = addCompletedChild(draft, 'B', 'LEFT', 'D');
  draft = addCompletedChild(draft, 'D', 'RIGHT', 'E');
  return draft;
}

export function expectNormalizeSuccess(
  outcome: NormalizeProjectSetupOutcome,
): Extract<NormalizeProjectSetupOutcome, { readonly status: 'SUCCESS' }> {
  if (outcome.status === 'FAILURE') {
    throw new Error(outcome.errors.map((issue) => issue.code).join(', '));
  }
  return outcome;
}

export function normalizedBundle(draft: ProjectSetupDraft): ProjectSetupBundle {
  return expectNormalizeSuccess(normalizeProjectSetup(draft)).bundle;
}
