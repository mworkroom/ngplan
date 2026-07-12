import type { AutomaticPlanModel } from './model';
import type {
  AutomaticPlanProofProgress,
  RawAutomaticPlanCandidate,
  SafeAutomaticPlanError,
} from './types';

export interface AutomaticPlanSolveControl {
  readonly shouldCancel: () => boolean;
  readonly now: () => number;
  readonly deterministicWorkBudget?: number;
}

export interface SolverProgress {
  readonly elapsedMs: number;
  readonly proof: AutomaticPlanProofProgress;
  readonly rawIncumbent: RawAutomaticPlanCandidate | null;
}

export type SolverOutcome =
  | {
      readonly status: 'PROVEN_OPTIMAL';
      readonly candidate: RawAutomaticPlanCandidate;
      readonly proof: AutomaticPlanProofProgress & { readonly stage: 'COMPLETE' };
    }
  | {
      readonly status: 'PROVEN_INFEASIBLE';
      readonly proof: AutomaticPlanProofProgress & { readonly stage: 'COMPLETE' };
    }
  | {
      readonly status: 'STOPPED';
      readonly reason: 'TIME_LIMIT' | 'CANCELLED';
      readonly candidate: RawAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
    }
  | {
      readonly status: 'FAILED';
      readonly candidate: RawAutomaticPlanCandidate | null;
      readonly proof: AutomaticPlanProofProgress;
      readonly error: SafeAutomaticPlanError;
    };

export interface AutomaticPlanSolver {
  solve(
    model: AutomaticPlanModel,
    control: AutomaticPlanSolveControl,
    onProgress: (progress: SolverProgress) => void,
  ): Promise<SolverOutcome>;
}
