import type {
  Half,
  OrganizationSnapshotInput,
  PeriodInput,
  Side,
  ValidationCode,
  ValidationLocation,
} from '../../engine';

export type DraftTitleSource = 'DERIVED' | 'MANUAL';
export type MemberParticipation = 'ACTIVE' | 'EXCLUDED';

export interface OpeningStateDraft {
  readonly fortnightPvpOpeningCredit: string;
  readonly dailyCarryPvp: string;
  readonly dailyCarryLeft: string;
  readonly dailyCarryRight: string;
  readonly openingStateConfirmed: boolean;
}

export type OpeningStateField = Exclude<
  keyof OpeningStateDraft,
  'openingStateConfirmed'
>;

export interface PlacementDraft {
  readonly parentMemberKey: string | null;
  readonly sideAtParent: Side | null;
}

export interface MemberDraft {
  readonly memberKey: string;
  readonly participation: MemberParticipation;
  readonly memberId: string;
  readonly name: string;
  readonly level: string;
  readonly placement: PlacementDraft;
  readonly openingState: OpeningStateDraft;
}

export interface PlanProject {
  readonly projectId: string;
  readonly title: string;
  readonly period: PeriodInput;
  readonly timezone: 'Asia/Seoul';
  readonly projectStatus: 'IN_PROGRESS';
  readonly organizationSnapshotId: string;
}

export interface ProjectSetupBundle {
  readonly project: PlanProject;
  readonly organization: OrganizationSnapshotInput;
}

export interface ProjectSetupDraft {
  readonly projectId: string;
  readonly organizationSnapshotId: string;
  readonly year: string;
  readonly month: string;
  readonly half: Half;
  readonly title: string;
  readonly titleSource: DraftTitleSource;
  readonly timezone: 'Asia/Seoul';
  readonly projectStatus: 'IN_PROGRESS';
  readonly members: readonly MemberDraft[];
  readonly rootMemberKey: string | null;
  readonly selectedMemberKey: string | null;
  readonly activeBundle: ProjectSetupBundle | null;
}

export type IdKind = 'PROJECT' | 'ORGANIZATION_SNAPSHOT' | 'MEMBER';
export type IdGenerator = (kind: IdKind) => string;

export interface ReassignmentQueueEntry {
  readonly memberKey: string;
  readonly memberName: string;
  readonly reason: 'ACTIVE_SUBTREE_UNPLACED';
  readonly message: string;
}

export type DirectionKind = 'SELF' | 'CHILD';

export interface ChildSlotState {
  readonly parentMemberKey: string;
  readonly side: Side;
  readonly kind: DirectionKind;
  readonly childMemberKey: string | null;
}

export interface DerivedTopology {
  readonly activeMembers: readonly MemberDraft[];
  readonly memberByKey: ReadonlyMap<string, MemberDraft>;
  readonly childBySlot: ReadonlyMap<string, string>;
  readonly childrenByParent: ReadonlyMap<string, readonly string[]>;
  readonly traversal: readonly string[];
  readonly reassignmentQueue: readonly ReassignmentQueueEntry[];
}

export type TopologyCommandErrorCode =
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_NOT_ACTIVE'
  | 'MEMBER_KEY_DUPLICATE'
  | 'ROOT_ALREADY_EXISTS'
  | 'ROOT_REQUIRED'
  | 'ROOT_CANNOT_MOVE'
  | 'SUBTREE_NOT_UNPLACED'
  | 'SLOT_OCCUPIED'
  | 'ORGANIZATION_CYCLE'
  | 'PROMOTION_NOT_AVAILABLE';

export interface TopologyCommandError {
  readonly code: TopologyCommandErrorCode;
  readonly message: string;
}

export interface OrganizationChangeSummary {
  readonly command:
    | 'ADD_ROOT'
    | 'ADD_MEMBER'
    | 'ATTACH_SUBTREE'
    | 'MOVE_SUBTREE'
    | 'DETACH_SUBTREE'
    | 'SET_ROOT'
    | 'EXCLUDE_MEMBER';
  readonly excludedMemberKey: string | null;
  readonly detachedSubtreeRoots: readonly string[];
  readonly promotedMemberKey: string | null;
  readonly vacatedParentMemberKey: string | null;
  readonly vacatedSide: Side | null;
}

export type TopologyCommandOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly draft: ProjectSetupDraft;
      readonly summary: OrganizationChangeSummary;
    }
  | {
      readonly status: 'FAILURE';
      readonly draft: ProjectSetupDraft;
      readonly error: TopologyCommandError;
    };

export type ExclusionStrategy = 'PROMOTE_ONLY_CHILD' | 'DETACH_CHILDREN';

export type ProjectSetupIssueCode =
  | ValidationCode
  | 'PROJECT_TITLE_REQUIRED'
  | 'MEMBER_OPENING_STATE_UNCONFIRMED'
  | 'REASSIGNMENT_REQUIRED'
  | 'SELECTED_ROOT_INVALID'
  | 'MEMBER_NAME_DUPLICATE';

export interface ProjectSetupIssueLocation extends ValidationLocation {
  readonly area?: 'PROJECT' | 'MEMBER' | 'SLOT' | 'QUEUE';
}

export interface ProjectSetupIssue {
  readonly code: ProjectSetupIssueCode;
  readonly severity: 'ERROR' | 'WARNING';
  readonly location: ProjectSetupIssueLocation;
  readonly message: string;
  readonly suggestion?: string;
}

export interface ProjectSetupValidation {
  readonly isReady: boolean;
  readonly issues: readonly ProjectSetupIssue[];
  readonly errors: readonly ProjectSetupIssue[];
  readonly warnings: readonly ProjectSetupIssue[];
  readonly reassignmentQueue: readonly ReassignmentQueueEntry[];
}

export type NormalizeProjectSetupOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly bundle: ProjectSetupBundle;
      readonly warnings: readonly ProjectSetupIssue[];
      readonly validation: ProjectSetupValidation;
    }
  | {
      readonly status: 'FAILURE';
      readonly errors: readonly ProjectSetupIssue[];
      readonly warnings: readonly ProjectSetupIssue[];
      readonly validation: ProjectSetupValidation;
    };

export type DraftPvParseOutcome =
  | { readonly ok: true; readonly value: number }
  | {
      readonly ok: false;
      readonly code: 'PV_INVALID' | 'PV_NEGATIVE' | 'PV_NOT_INTEGER' | 'PV_OUT_OF_RANGE';
    };

export type DraftLevelParseOutcome =
  | { readonly ok: true; readonly value: number }
  | {
      readonly ok: false;
      readonly code: 'LEVEL_NOT_INTEGER' | 'LEVEL_OUT_OF_RANGE';
    };

