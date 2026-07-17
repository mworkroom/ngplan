import type {
  CalculationResult,
  NormalizedAllocationCell,
  OrganizationSnapshotInput,
  PeriodInput,
} from '../engine';
import type {
  AUTOMATIC_PLAN_CALENDAR_VERSION,
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_FINGERPRINT_VERSION,
  AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
  AUTOMATIC_PLAN_MODEL_VERSION,
  AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_POLICY_VERSION,
  AUTOMATIC_PLAN_REQUEST_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
} from './constants';

export type AutomaticPlanField = 'PVP' | 'SELF_LEFT' | 'SELF_RIGHT';

export interface AutomaticPlanPolicy {
  readonly policyVersion: typeof AUTOMATIC_PLAN_POLICY_VERSION;
  readonly objectiveVersion: typeof AUTOMATIC_PLAN_OBJECTIVE_VERSION;
  readonly deterministicSeed: number;
}

export interface NormalizedAutomaticPlanCalendar {
  readonly calendarVersion: typeof AUTOMATIC_PLAN_CALENDAR_VERSION;
  readonly dates: readonly string[];
  readonly skipDateSet: readonly string[];
}

export interface NormalizedOpeningPvpState {
  readonly cumulativePvpOpening: number;
}

export interface AutomaticPlanRequest {
  readonly requestVersion: typeof AUTOMATIC_PLAN_REQUEST_VERSION;
  readonly rulesetVersion: typeof AUTOMATIC_PLAN_RULESET_VERSION;
  readonly engineVersion: typeof AUTOMATIC_PLAN_ENGINE_VERSION;
  readonly fingerprintVersion: typeof AUTOMATIC_PLAN_FINGERPRINT_VERSION;
  readonly period: PeriodInput;
  readonly organization: OrganizationSnapshotInput;
  readonly policy: AutomaticPlanPolicy;
  readonly calendar: NormalizedAutomaticPlanCalendar;
  readonly canonicalMemberKeys: readonly string[];
  readonly openingPvpByMember: Readonly<Record<string, NormalizedOpeningPvpState>>;
  readonly problemFingerprint: string;
  readonly warmStart?: readonly NormalizedAllocationCell[];
}

export interface AutomaticPlanObjectiveVector {
  readonly totalNewPv: number;
  readonly confirmedPayoutWon: number;
  readonly discardedExcessPv: number;
  readonly priorityDepthAscendingDayVector: readonly number[];
  readonly highTargetAscendingDayVector: readonly number[];
  readonly target700AscendingDayVector: readonly number[];
  readonly futureCumulativePvpInvestmentPv: number;
  readonly nonHundredCellCount: number;
  readonly maxDirectPvp: number;
  readonly deterministicAllocationVector: readonly number[];
}

export interface PriorityDepthMemberDayCount {
  readonly memberKey: string;
  readonly organizationDepth: 2 | 3;
  readonly commissionDays: number;
}

export interface HighTargetMemberDayCount {
  readonly memberKey: string;
  readonly pvpTarget: 1500 | 2400;
  readonly commissionDays: number;
}

export interface Target700MemberDayCount {
  readonly memberKey: string;
  readonly commissionDays: number;
}

export interface TerminalCarryMemberSummary {
  readonly memberKey: string;
  readonly pvp: number;
  readonly left: number;
  readonly right: number;
}

export interface TerminalCarrySummary {
  readonly byMember: readonly TerminalCarryMemberSummary[];
  readonly totalPvp: number;
  readonly totalLeft: number;
  readonly totalRight: number;
  readonly totalCarryPv: number;
}

export interface AutomaticPlanDisplayMetrics {
  readonly priorityDepthMemberDayCounts: readonly PriorityDepthMemberDayCount[];
  readonly highTargetMemberDayCounts: readonly HighTargetMemberDayCount[];
  readonly target700MembersAtLeastEight: number;
  readonly target700TotalCommissionDays: number;
  readonly target700MemberDayCounts: readonly Target700MemberDayCount[];
  readonly terminalCarrySummary: TerminalCarrySummary;
}

export interface RawAutomaticPlanCandidate {
  readonly problemFingerprint: string;
  readonly allocations: readonly NormalizedAllocationCell[];
  readonly claimedObjective?: AutomaticPlanObjectiveVector;
}

export interface AutomaticPlanCandidateIdentity {
  readonly candidateId: string;
  readonly sequence: number;
  readonly foundAtElapsedMs: number;
}

export interface VerifiedAutomaticPlanCandidate
  extends AutomaticPlanCandidateIdentity {
  readonly problemFingerprint: string;
  readonly allocations: readonly NormalizedAllocationCell[];
  readonly calculation: CalculationResult;
  readonly objective: AutomaticPlanObjectiveVector;
  readonly display: AutomaticPlanDisplayMetrics;
}

export type AutomaticPlanObjectiveStage =
  | (typeof AUTOMATIC_PLAN_OBJECTIVE_STAGE_ORDER)[number]
  | 'COMPLETE';

export interface AutomaticPlanProofProgress {
  readonly stage: AutomaticPlanObjectiveStage;
  readonly provenScalarObjectiveCount: number;
  readonly provenVectorPrefix:
    | {
        readonly objective:
          | 'PRIORITY_DEPTH_ASCENDING_VECTOR'
          | 'HIGH_TARGET_ASCENDING_VECTOR'
          | 'TARGET_700_ASCENDING_VECTOR'
          | 'DETERMINISTIC_ALLOCATION_VECTOR';
        readonly length: number;
      }
    | null;
  readonly primaryLowerBound: number | null;
}

export type AutomaticPlanErrorCode =
  | 'AUTOMATIC_PLAN_REQUEST_INVALID'
  | 'AUTOMATIC_PLAN_VERSION_UNSUPPORTED'
  | 'AUTOMATIC_PLAN_MEMBER_LIMIT_EXCEEDED'
  | 'AUTOMATIC_PLAN_CALENDAR_INVALID'
  | 'AUTOMATIC_PLAN_MEMBER_ORDER_INVALID'
  | 'AUTOMATIC_PLAN_OPENING_STATE_INVALID'
  | 'AUTOMATIC_PLAN_FINGERPRINT_MISMATCH'
  | 'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID'
  | 'AUTOMATIC_PLAN_CANDIDATE_ORDER_INVALID'
  | 'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID'
  | 'AUTOMATIC_PLAN_SKIPPED_DATE_NONZERO'
  | 'AUTOMATIC_PLAN_ENGINE_REJECTED'
  | 'AUTOMATIC_PLAN_TARGET_UNMET'
  | 'AUTOMATIC_PLAN_QUALIFICATION_MISMATCH'
  | 'AUTOMATIC_PLAN_BELOW_QUALIFICATION_SETTLEMENT'
  | 'AUTOMATIC_PLAN_PAYOUT_TABLE_INCOMPLETE'
  | 'AUTOMATIC_PLAN_OBJECTIVE_MISMATCH'
  | 'OPTIMIZATION_SCORE_OUT_OF_RANGE'
  | 'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH'
  | 'AUTOMATIC_PLAN_PROOF_INCOMPLETE'
  | 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED'
  | 'AUTOMATIC_PLAN_ORACLE_LIMIT_EXCEEDED'
  | 'AUTOMATIC_PLAN_INTERNAL_ERROR';

export interface SafeAutomaticPlanError {
  readonly code: AutomaticPlanErrorCode;
  readonly message: string;
  readonly location?: {
    readonly date?: string;
    readonly memberKey?: string;
    readonly field?: AutomaticPlanField;
    readonly index?: number;
  };
  readonly causeCode?: string;
}

export type AutomaticPlanVerificationOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly candidate: VerifiedAutomaticPlanCandidate;
    }
  | {
      readonly status: 'FAILURE';
      readonly error: SafeAutomaticPlanError;
    };

export type AutomaticPlanConstructionOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly candidate: RawAutomaticPlanCandidate;
    }
  | {
      readonly status: 'FAILURE';
      readonly error: SafeAutomaticPlanError;
    };

export interface AutomaticPlanModelEvidence {
  readonly soundness: boolean;
  readonly completeness: boolean;
  readonly objectivePreservation: boolean;
  readonly exactIntegerRange: boolean;
  readonly exhaustiveOracle: boolean;
  readonly seededRandomizedComparison: boolean;
  readonly boundarySuite: boolean;
  readonly ruleToConstraintMapping: boolean;
  readonly toleranceSafetyProven: boolean;
}

export interface ModelCertificate {
  readonly certificateVersion: typeof AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION;
  readonly certificateId: string;
  readonly modelVersion: typeof AUTOMATIC_PLAN_MODEL_VERSION;
  readonly modelImplementationId: string;
  readonly fingerprintVersion: typeof AUTOMATIC_PLAN_FINGERPRINT_VERSION;
  readonly rulesetVersion: typeof AUTOMATIC_PLAN_RULESET_VERSION;
  readonly engineVersion: typeof AUTOMATIC_PLAN_ENGINE_VERSION;
  readonly policyVersion: typeof AUTOMATIC_PLAN_POLICY_VERSION;
  readonly objectiveVersion: typeof AUTOMATIC_PLAN_OBJECTIVE_VERSION;
  readonly calendarVersion: typeof AUTOMATIC_PLAN_CALENDAR_VERSION;
  readonly solverAdapterId: string;
  readonly solverAdapterVersion: string;
  readonly integerSemantics: 'EXACT_SAFE_INTEGER';
  readonly evidence: AutomaticPlanModelEvidence;
}

declare const certifiedModelCertificateBrand: unique symbol;
declare const certifiedCompleteProofBrand: unique symbol;

export interface CertifiedModelCertificate extends ModelCertificate {
  readonly [certifiedModelCertificateBrand]: true;
}

export interface CertifiedCompleteProof {
  readonly [certifiedCompleteProofBrand]: true;
  readonly problemFingerprint: string;
  readonly certificateId: string;
  readonly conclusion: 'OPTIMAL' | 'INFEASIBLE';
  readonly progress: AutomaticPlanProofProgress & { readonly stage: 'COMPLETE' };
  readonly allObjectiveStagesProven: true;
}

export type AutomaticPlanRunState =
  | {
      readonly status: 'RUNNING';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
      readonly messageCode: string;
    }
  | {
      readonly status: 'OPTIMAL';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate;
      readonly proof: AutomaticPlanProofProgress & { readonly stage: 'COMPLETE' };
      readonly certifiedProof: CertifiedCompleteProof;
      readonly modelCertificateId: string;
      readonly messageCode: string;
    }
  | {
      readonly status: 'TIME_LIMIT' | 'CANCELLED';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
      readonly messageCode: string;
    }
  | {
      readonly status: 'INFEASIBLE';
      readonly elapsedMs: number;
      readonly bestCandidate: null;
      readonly proof: AutomaticPlanProofProgress & { readonly stage: 'COMPLETE' };
      readonly certifiedProof: CertifiedCompleteProof;
      readonly modelCertificateId: string;
      readonly messageCode: string;
    }
  | {
      readonly status: 'FAILED';
      readonly elapsedMs: number;
      readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
      readonly error: SafeAutomaticPlanError;
      readonly messageCode: string;
    };

export interface AutomaticPlanCoordinate {
  readonly date: string;
  readonly memberKey: string;
  readonly field: AutomaticPlanField;
}
