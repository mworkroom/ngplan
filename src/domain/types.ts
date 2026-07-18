declare const pvBrand: unique symbol;
declare const isoDateBrand: unique symbol;

export type Pv = number & { readonly [pvBrand]: 'Pv' };
export type IsoDate = string & { readonly [isoDateBrand]: 'IsoDate' };
export type BusinessDate = IsoDate;
export type Side = 'LEFT' | 'RIGHT';
export type Half = 'FIRST_HALF' | 'SECOND_HALF';
export type SettlementMode = 'SETTLE' | 'SKIP_NO_INPUT';
export type SettlementStatus = 'SETTLED' | 'SKIPPED';
export type SettlementKind =
  | 'SKIPPED'
  | 'NO_COMMISSION'
  | 'BELOW_QUALIFICATION_SETTLEMENT'
  | 'FULL_COMMISSION';
export type CommissionTier = 300 | 700 | 1500 | 2400 | 6000 | 20000 | 60000;
export type CommissionEquivalentUnits = 1 | 2 | 4 | 8;
export type PvpTarget = 700 | 1500 | 2400;
export type SheetMarker =
  | 'NONE'
  | 'PINK_1'
  | 'GREEN_2'
  | 'BLUE_3'
  | 'PURPLE_4';
export type PvpApplicationReason = 'SMALLER_LEFT' | 'SMALLER_RIGHT' | 'TIE_LEFT';
export type RecommendationStatus =
  | 'NOT_APPLICABLE'
  | 'BELOW_RECOMMENDED'
  | 'MET_OR_EXCEEDED'
  | 'UNCONFIRMED';

export interface PeriodInput {
  readonly year: number;
  readonly month: number;
  readonly half: Half;
}

export interface DerivedPeriod extends PeriodInput {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly dates: readonly IsoDate[];
}

export interface MemberSnapshot {
  readonly memberKey: string;
  readonly memberId: string;
  readonly name: string;
  readonly pvpTarget: PvpTarget;
  readonly sheetMarker: SheetMarker;
  readonly parentMemberKey: string | null;
  readonly sideAtParent: Side | null;
}

export interface OpeningStateInput {
  readonly openingQualificationPvp: number;
  readonly fortnightPvpOpeningCredit: number;
  readonly dailyCarryPvp: number;
  readonly dailyCarryLeft: number;
  readonly dailyCarryRight: number;
}

export interface OrganizationSnapshotInput {
  readonly snapshotId: string;
  readonly members: readonly MemberSnapshot[];
  readonly openingStateByMember: Readonly<Record<string, OpeningStateInput>>;
}

export interface NormalizedAllocationCell {
  readonly date: string;
  readonly memberKey: string;
  readonly pvp: number;
  readonly selfLeft?: number;
  readonly selfRight?: number;
}

export interface CalculatePlanInput {
  readonly period: PeriodInput;
  readonly organization: OrganizationSnapshotInput;
  readonly allocations: readonly NormalizedAllocationCell[];
}

export interface RuleSet {
  readonly rulesetVersion: '7.0.0';
  readonly commissionTiers: readonly CommissionTier[];
  readonly allowedPvpTargets: readonly PvpTarget[];
  readonly cumulativePvpCap: Pv;
  readonly fortnightSideTarget: Pv;
  readonly businessCalendarPolicy: 'SUNDAY_SKIP_NO_INPUT';
  readonly pvpTiePolicy: 'LEFT';
  readonly fortnightPvpSourcePolicy: 'NEW_ONLY_EXCLUDING_OPENING_AND_DAILY_CARRY';
  readonly target700CommissionPreference: {
    readonly eligiblePvpTarget: 700;
    readonly recommendedEquivalentUnits: 8;
  };
  readonly qualificationPolicy: {
    readonly threshold: 300;
    readonly accumulation: 'OPENING_PLUS_DIRECT_INCLUSIVE_NON_RESETTING';
    readonly belowThresholdSettlement: 'RESET_AND_WARN_NOT_FULL_COMMISSION';
  };
}

export type RuleSetVersion = RuleSet['rulesetVersion'];

export interface PvBalance {
  readonly pvp: Pv;
  readonly left: Pv;
  readonly right: Pv;
}

export interface RawPerformance {
  readonly date: IsoDate;
  readonly memberKey: string;
  readonly directPvp: Pv;
  readonly organizationLeft: Pv;
  readonly organizationRight: Pv;
  readonly subtreeTotal: Pv;
}

export interface DailySettlement {
  readonly date: IsoDate;
  readonly memberKey: string;
  readonly businessCalendarMode: SettlementMode;
  readonly settlementStatus: SettlementStatus;
  readonly carryIn: PvBalance;
  readonly rawPerformance: RawPerformance;
  readonly preSettlement: PvBalance;
  readonly qualificationPvp: Pv;
  readonly qualificationThresholdMet: boolean;
  readonly settlementKind: SettlementKind;
  readonly pvpAppliedSide: Side | null;
  readonly pvpApplicationReason: PvpApplicationReason | null;
  readonly assessedLeft: Pv | null;
  readonly assessedRight: Pv | null;
  readonly commissionTier: CommissionTier | null;
  readonly commissionOccurred: boolean;
  readonly carryOut: PvBalance;
}

export interface FortnightRawTotals {
  readonly newPvpTotal: Pv;
  readonly rawLeftTotal: Pv;
  readonly rawRightTotal: Pv;
}

export interface RunningFortnightState extends FortnightRawTotals {
  readonly date: IsoDate;
  readonly memberKey: string;
  readonly personalPvpTotal: Pv;
  readonly personalPvpTarget: Pv;
  readonly remainingPvp: Pv;
  readonly personalPvpTargetMet: boolean;
  readonly qualificationPvp: Pv;
  readonly qualificationThresholdMet: boolean;
}

export interface CommissionOccurrence {
  readonly date: IsoDate;
  readonly tier: CommissionTier;
}

export interface BelowQualificationSettlementOccurrence
  extends CommissionOccurrence {
  readonly qualificationPvp: Pv;
}

export interface FortnightAssessment extends FortnightRawTotals {
  readonly memberKey: string;
  readonly pvpTarget: PvpTarget;
  readonly openingQualificationPvp: Pv;
  readonly closingQualificationPvp: Pv;
  readonly qualificationThresholdMet: boolean;
  readonly fortnightPvpOpeningCredit: Pv;
  readonly personalPvpTotal: Pv;
  readonly personalPvpTarget: Pv;
  readonly remainingPvp: Pv;
  readonly personalPvpTargetMet: boolean;
  readonly periodPvpForSide: Pv;
  readonly pvpAppliedSide: Side;
  readonly pvpApplicationReason: PvpApplicationReason;
  readonly assessedLeft: Pv;
  readonly assessedRight: Pv;
  readonly leftTargetMet: boolean;
  readonly rightTargetMet: boolean;
  readonly sideTargetsMet: boolean;
  readonly allTargetsMet: boolean;
  readonly commissionOccurrences: readonly CommissionOccurrence[];
  readonly commissionDays: number;
  readonly commissionEquivalentUnits: number | null;
  readonly belowQualificationSettlementOccurrences: readonly BelowQualificationSettlementOccurrence[];
  readonly belowQualificationSettlementDays: number;
  readonly recommendationStatus: RecommendationStatus;
  readonly recommendedCommissionEquivalentUnits: number | null;
}

export interface ValidationLocation {
  readonly snapshotId?: string;
  readonly date?: string;
  readonly memberKey?: string;
  readonly memberId?: string;
  readonly side?: Side;
  readonly field?: string;
  readonly index?: number;
}

export type ValidationCode =
  | 'INPUT_STRUCTURE_INVALID'
  | 'PV_INVALID'
  | 'PV_NEGATIVE'
  | 'PV_NOT_INTEGER'
  | 'PV_OUT_OF_RANGE'
  | 'PV_AGGREGATE_OUT_OF_RANGE'
  | 'PERIOD_YEAR_INVALID'
  | 'PERIOD_MONTH_INVALID'
  | 'PERIOD_HALF_INVALID'
  | 'DATE_INVALID'
  | 'DATE_OUTSIDE_PERIOD'
  | 'MEMBER_KEY_REQUIRED'
  | 'MEMBER_KEY_DUPLICATE'
  | 'MEMBER_ID_REQUIRED'
  | 'MEMBER_ID_DUPLICATE'
  | 'MEMBER_NAME_REQUIRED'
  | 'PVP_TARGET_INVALID'
  | 'SHEET_MARKER_INVALID'
  | 'PLACEMENT_INCOMPLETE'
  | 'ROOT_PLACEMENT_INVALID'
  | 'PARENT_NOT_FOUND'
  | 'PARENT_SIDE_OCCUPIED'
  | 'MEMBER_ATTACHED_MULTIPLE_TIMES'
  | 'ORGANIZATION_CYCLE'
  | 'ROOT_MISSING'
  | 'MULTIPLE_ROOTS'
  | 'ORGANIZATION_DISCONNECTED'
  | 'OPENING_STATE_MISSING'
  | 'OPENING_STATE_MEMBER_NOT_FOUND'
  | 'CUMULATIVE_PVP_OPENING_EXCEEDS_CAP'
  | 'CUMULATIVE_PVP_OPENING_MISMATCH'
  | 'DAILY_PVP_OPENING_NONZERO'
  | 'CUMULATIVE_PVP_ALLOCATION_EXCEEDS_CAP'
  | 'ALLOCATION_MEMBER_NOT_FOUND'
  | 'ALLOCATION_CELL_DUPLICATE'
  | 'ALLOCATION_CELL_MISSING'
  | 'ALLOCATION_FIELD_MISSING'
  | 'SELF_SIDE_ALLOCATION_MISSING'
  | 'CONNECTED_SIDE_ALLOCATION'
  | 'NON_ZERO_INPUT_ON_SKIPPED_DATE'
  | 'BELOW_QUALIFICATION_SETTLEMENT'
  | 'RULESET_VERSION_UNSUPPORTED'
  | 'RULESET_BODY_MISMATCH';

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly severity: 'ERROR' | 'WARNING';
  readonly location: ValidationLocation;
  readonly message: string;
  readonly suggestion?: string;
}

export interface ValidationReport {
  readonly isValid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

export interface CalculationResult {
  readonly inputSnapshot: CalculatePlanInput;
  readonly period: DerivedPeriod;
  readonly rulesetVersion: RuleSet['rulesetVersion'];
  readonly engineVersion: string;
  readonly rawPerformanceByDateAndMember: Readonly<
    Record<string, Readonly<Record<string, RawPerformance>>>
  >;
  readonly dailySettlementByDateAndMember: Readonly<
    Record<string, Readonly<Record<string, DailySettlement>>>
  >;
  readonly runningFortnightByDateAndMember: Readonly<
    Record<string, Readonly<Record<string, RunningFortnightState>>>
  >;
  readonly finalAssessmentByMember: Readonly<Record<string, FortnightAssessment>>;
  readonly closingDailyCarryByMember: Readonly<Record<string, PvBalance>>;
  readonly warnings: readonly ValidationIssue[];
}

export type CalculationOutcome =
  | { readonly status: 'SUCCESS'; readonly result: CalculationResult }
  | { readonly status: 'FAILURE'; readonly validation: ValidationReport };
