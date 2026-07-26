import type { Half } from '../../engine';
import type {
  IdGenerator,
  MemberDraft,
  OpeningStateDraft,
  ProjectSetupDraft,
} from './types';

export interface CreateProjectDraftInput {
  readonly year: number | string;
  readonly month: number | string;
  readonly half: Half;
  readonly generateId: IdGenerator;
}

export function createOpeningStateDraft(): OpeningStateDraft {
  return {
    cumulativePvp: '0',
    dailyCarryLeft: '0',
    dailyCarryRight: '0',
    openingStateConfirmed: false,
  };
}

export function createMemberDraft(memberKey: string): MemberDraft {
  return {
    memberKey,
    participation: 'ACTIVE',
    sourceMemberId: null,
    memberId: '',
    name: '',
    pvpTarget: '',
    sheetMarker: 'NONE',
    placement: { parentMemberKey: null, sideAtParent: null },
    openingState: createOpeningStateDraft(),
  };
}

export function deriveDefaultProjectTitle(
  year: string,
  month: string,
  half: Half,
): string {
  const halfCode = half === 'FIRST_HALF' ? 'A' : 'B';
  return `${year}${month.padStart(2, '0')}${halfCode}`;
}

export function createProjectDraft(input: CreateProjectDraftInput): ProjectSetupDraft {
  const year = String(input.year);
  const month = String(input.month);
  return {
    projectId: input.generateId('PROJECT'),
    organizationSnapshotId: input.generateId('ORGANIZATION_SNAPSHOT'),
    year,
    month,
    half: input.half,
    title: deriveDefaultProjectTitle(year, month, input.half),
    titleSource: 'DERIVED',
    timezone: 'America/Sao_Paulo',
    projectStatus: 'IN_PROGRESS',
    members: [],
    rootMemberKey: null,
    selectedMemberKey: null,
    activeBundle: null,
  };
}

export function draftHasMemberData(draft: ProjectSetupDraft): boolean {
  return draft.members.length > 0;
}

