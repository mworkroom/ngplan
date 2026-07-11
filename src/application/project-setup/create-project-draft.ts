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
    fortnightPvpOpeningCredit: '0',
    dailyCarryPvp: '0',
    dailyCarryLeft: '0',
    dailyCarryRight: '0',
    openingStateConfirmed: false,
  };
}

export function createMemberDraft(memberKey: string): MemberDraft {
  return {
    memberKey,
    participation: 'ACTIVE',
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
  const halfLabel = half === 'FIRST_HALF' ? '상반기' : '하반기';
  return `${year}년 ${month}월 ${halfLabel} 직급 플랜`;
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
    timezone: 'Asia/Seoul',
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

