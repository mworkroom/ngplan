import { calculatePlanForManualEditing } from '../../engine';
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
    const outcome = calculatePlanForManualEditing(normalized.input);
    if (outcome.status === 'FAILURE') {
      return Object.freeze({
        status: 'BLOCKED',
        issues: Object.freeze(
          outcome.validation.issues.map(mapEngineIssueToManualPlanIssue),
        ),
      });
    }
    const mappedEngineWarnings = outcome.result.warnings.map(
      mapEngineIssueToManualPlanIssue,
    );
    const qualificationBlockingIssues = Object.freeze(
      mappedEngineWarnings.filter(
        (issue) => issue.code === 'BELOW_QUALIFICATION_SETTLEMENT',
      ),
    );
    if (qualificationBlockingIssues.length > 0) {
      const warnings = Object.freeze([
        ...setupWarnings,
        ...mappedEngineWarnings.filter(
          (issue) => issue.code !== 'BELOW_QUALIFICATION_SETTLEMENT',
        ),
      ]);
      return Object.freeze({
        status: 'AUDIT_BLOCKED',
        input: normalized.input,
        result: outcome.result,
        issues: qualificationBlockingIssues,
        warnings,
      });
    }
    const warnings = Object.freeze([
      ...setupWarnings,
      ...mappedEngineWarnings,
    ]);
    return Object.freeze({
      status: 'CURRENT',
      input: normalized.input,
      result: outcome.result,
      warnings,
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
