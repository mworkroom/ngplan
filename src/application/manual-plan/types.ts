import type {
  CalculatePlanInput,
  CalculationResult,
  DailySettlement,
  DerivedPeriod,
  FortnightAssessment,
  FortnightSideTarget,
  OpeningStateInput,
  PvBalance,
  RawPerformance,
  RunningFortnightState,
  SettlementMode,
  SheetMarker,
  Side,
  ValidationCode,
} from '../../engine';
import type { ProjectSetupIssueCode } from '../project-setup';

export type ManualPlanField = 'pvp' | 'selfLeft' | 'selfRight';
export type ManualPlanDirectionMode = 'SELF' | 'CHILD';

export interface ManualPlanCellDraft {
  readonly date: string;
  readonly memberKey: string;
  readonly pvp: string;
  readonly selfLeft?: string;
  readonly selfRight?: string;
}

export interface ManualPlanDraft {
  readonly cells: readonly ManualPlanCellDraft[];
}

export interface ManualPlanMemberDescriptor {
  readonly memberKey: string;
  readonly name: string;
  readonly memberId: string | null;
  readonly displayLabel: string;
  readonly duplicateLabel: string | null;
  readonly pvpTarget: number;
  readonly fortnightSideTarget: FortnightSideTarget;
  readonly sheetMarker: SheetMarker;
  readonly openingState: OpeningStateInput;
  readonly leftMode: ManualPlanDirectionMode;
  readonly rightMode: ManualPlanDirectionMode;
  readonly leftChildMemberKey: string | null;
  readonly rightChildMemberKey: string | null;
}

export interface ManualPlanDateDescriptor {
  readonly date: string;
  readonly displayLabel: string;
  readonly weekdayLabel: string;
  readonly settlementMode: SettlementMode;
}

export interface ManualPlanSchema {
  readonly period: DerivedPeriod;
  readonly rootMemberKey: string;
  readonly dates: readonly ManualPlanDateDescriptor[];
  readonly members: readonly ManualPlanMemberDescriptor[];
  readonly memberByKey: ReadonlyMap<string, ManualPlanMemberDescriptor>;
  readonly dateByIso: ReadonlyMap<string, ManualPlanDateDescriptor>;
  readonly cellIndexByKey: ReadonlyMap<string, number>;
}

export interface ManualPlanAchievementTargets {
  readonly pvp: number;
  readonly selfLeft: number;
  readonly selfRight: number;
}

export interface ManualPlanEditRequest {
  readonly date: string;
  readonly memberKey: string;
  readonly field: ManualPlanField;
  readonly value: string;
}

export type ManualPlanEditRejectionCode =
  | 'CELL_NOT_FOUND'
  | 'FIELD_NOT_EDITABLE'
  | 'SKIPPED_DATE_LOCKED';

export type ManualPlanEditOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly draft: ManualPlanDraft;
    }
  | {
      readonly status: 'REJECTED';
      readonly draft: ManualPlanDraft;
      readonly code: ManualPlanEditRejectionCode;
      readonly message: string;
    };

export type ManualPlanIssueCode =
  | ValidationCode
  | ProjectSetupIssueCode
  | 'MANUAL_PLAN_CALCULATION_FAILED';

export interface ManualPlanIssueLocation {
  readonly date?: string;
  readonly memberKey?: string;
  readonly side?: Side;
  readonly field?: string;
}

export interface ManualPlanIssue {
  readonly code: ManualPlanIssueCode;
  readonly severity: 'ERROR' | 'WARNING';
  readonly location: ManualPlanIssueLocation;
  readonly message: string;
  readonly suggestion?: string;
}

export type ManualPlanPvParseOutcome =
  | { readonly ok: true; readonly value: number }
  | {
      readonly ok: false;
      readonly code:
        | 'PV_INVALID'
        | 'PV_NEGATIVE'
        | 'PV_NOT_INTEGER'
        | 'PV_OUT_OF_RANGE';
    };

export type NormalizeManualPlanOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly input: CalculatePlanInput;
    }
  | {
      readonly status: 'FAILURE';
      readonly issues: readonly ManualPlanIssue[];
    };

export type ManualPlanCalculationState =
  | {
      readonly status: 'CURRENT';
      readonly input: CalculatePlanInput;
      readonly result: CalculationResult;
      readonly warnings: readonly ManualPlanIssue[];
    }
  | {
      readonly status: 'AUDIT_BLOCKED';
      readonly input: CalculatePlanInput;
      readonly result: CalculationResult;
      readonly issues: readonly ManualPlanIssue[];
      readonly warnings: readonly ManualPlanIssue[];
    }
  | {
      readonly status: 'BLOCKED';
      readonly issues: readonly ManualPlanIssue[];
    };

export interface ManualPlanWorksheetCellView {
  readonly date: string;
  readonly memberKey: string;
  readonly directPvp: number;
  readonly organizationLeft: number;
  readonly organizationRight: number;
  readonly subtreeTotal: number;
}

export interface ManualPlanDailyAuditView {
  readonly date: string;
  readonly dateLabel: string;
  readonly memberKey: string;
  readonly memberLabel: string;
  readonly settlementStatus: DailySettlement['settlementStatus'];
  readonly settlementLabel: string;
  readonly carryIn: PvBalance;
  readonly rawPerformance: RawPerformance;
  readonly preSettlement: PvBalance;
  readonly qualificationPvp: number;
  readonly qualificationThresholdMet: boolean;
  readonly settlementKind: DailySettlement['settlementKind'];
  readonly pvpAppliedSide: DailySettlement['pvpAppliedSide'];
  readonly pvpApplicationReason: DailySettlement['pvpApplicationReason'];
  readonly pvpApplicationLabel: string;
  readonly assessedLeft: number | null;
  readonly assessedRight: number | null;
  readonly commissionTier: DailySettlement['commissionTier'];
  readonly commissionOccurred: boolean;
  readonly commissionEquivalentUnits: number | null;
  readonly commissionLabel: string;
  readonly carryOut: PvBalance;
  readonly running: RunningFortnightState;
  readonly runningPvpStatusLabel: string;
}

export interface ManualPlanMemberSummaryView {
  readonly memberKey: string;
  readonly memberLabel: string;
  readonly pvpTarget: number;
  readonly fortnightSideTarget: FortnightSideTarget;
  readonly sheetMarker: SheetMarker;
  readonly openingQualificationPvp: number;
  readonly closingQualificationPvp: number;
  readonly qualificationThresholdMet: boolean;
  readonly fortnightPvpOpeningCredit: number;
  readonly newPvpTotal: number;
  readonly personalPvpTotal: number;
  readonly personalPvpTarget: number;
  readonly remainingPvp: number;
  readonly personalPvpTargetMet: boolean;
  readonly personalPvpStatusLabel: string;
  readonly rawLeftTotal: number;
  readonly rawRightTotal: number;
  readonly periodPvpForSide: number;
  readonly pvpAppliedSide: FortnightAssessment['pvpAppliedSide'];
  readonly pvpApplicationReason: FortnightAssessment['pvpApplicationReason'];
  readonly pvpApplicationLabel: string;
  readonly assessedLeft: number;
  readonly assessedRight: number;
  readonly leftTargetMet: boolean;
  readonly rightTargetMet: boolean;
  readonly leftTargetLabel: string;
  readonly rightTargetLabel: string;
  readonly sideTargetsMet: boolean;
  readonly allTargetsMet: boolean;
  readonly allTargetsLabel: string;
  readonly commissionDays: number;
  readonly commissionEquivalentUnits: number | null;
  readonly commissionOccurrences: FortnightAssessment['commissionOccurrences'];
  readonly belowQualificationSettlementOccurrences:
    FortnightAssessment['belowQualificationSettlementOccurrences'];
  readonly belowQualificationSettlementDays: number;
  readonly recommendationStatus: FortnightAssessment['recommendationStatus'];
  readonly recommendedCommissionEquivalentUnits: number | null;
  readonly recommendationLabel: string;
}

export interface ManualPlanMemberJumpOption {
  readonly value: string;
  readonly label: string;
  readonly targetId: string;
}

export interface ManualPlanValidationSummaryItem {
  readonly issue: ManualPlanIssue;
  readonly contextLabel: string;
  readonly targetId: string;
}

export type ConvertVerifiedAllocationsToManualPlanDraftOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly draft: ManualPlanDraft;
      readonly replacesModifiedDraft: boolean;
    }
  | {
      readonly status: 'FAILURE';
      readonly issues: readonly ManualPlanIssue[];
    };
