import { calculatePlan } from '../../engine';
import type { ProjectSetupBundle } from '../project-setup';
import { deriveManualPlanSchema } from './derive-manual-plan-schema';
import { mapEngineIssueToManualPlanIssue } from './map-manual-plan-issues';
import { normalizeManualPlanDraft } from './normalize-manual-plan';
import type {
  ManualPlanCalculationState,
  ManualPlanDraft,
  ManualPlanIssue,
  ManualPlanSchema,
} from './types';

export function calculateManualPlan(
  bundle: ProjectSetupBundle,
  draft: ManualPlanDraft,
  schema: ManualPlanSchema = deriveManualPlanSchema(bundle),
  setupWarnings: readonly ManualPlanIssue[] = [],
): ManualPlanCalculationState {
  const normalized = normalizeManualPlanDraft(bundle, draft, schema);
  if (normalized.status === 'FAILURE') {
    return Object.freeze({ status: 'BLOCKED', issues: normalized.issues });
  }

  try {
    const outcome = calculatePlan(normalized.input);
    if (outcome.status === 'FAILURE') {
      return Object.freeze({
        status: 'BLOCKED',
        issues: Object.freeze(
          outcome.validation.issues.map(mapEngineIssueToManualPlanIssue),
        ),
      });
    }
    return Object.freeze({
      status: 'CURRENT',
      input: normalized.input,
      result: outcome.result,
      warnings: Object.freeze([
        ...setupWarnings,
        ...outcome.result.warnings.map(mapEngineIssueToManualPlanIssue),
      ]),
    });
  } catch {
    return Object.freeze({
      status: 'BLOCKED',
      issues: Object.freeze([
        Object.freeze({
          code: 'MANUAL_PLAN_CALCULATION_FAILED' as const,
          severity: 'ERROR' as const,
          location: Object.freeze({}),
          message: '현재 계획을 계산하지 못했습니다.',
          suggestion: '입력값을 확인한 뒤 다시 시도해 주세요.',
        }),
      ]),
    });
  }
}
