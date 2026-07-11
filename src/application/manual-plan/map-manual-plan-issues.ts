import type { ValidationIssue } from '../../engine';
import type { ProjectSetupIssue } from '../project-setup';
import {
  manualPlanCellDomId,
  manualPlanFieldDomId,
  manualPlanMemberGroupDomId,
} from './derive-manual-plan-schema';
import type {
  ManualPlanField,
  ManualPlanIssue,
  ManualPlanIssueLocation,
} from './types';

function isManualPlanField(field: string | undefined): field is ManualPlanField {
  return field === 'pvp' || field === 'selfLeft' || field === 'selfRight';
}

function sideForField(field: string | undefined) {
  return field === 'selfLeft' ? 'LEFT' as const : field === 'selfRight' ? 'RIGHT' as const : undefined;
}

export function mapEngineIssueToManualPlanIssue(
  issue: ValidationIssue,
): ManualPlanIssue {
  const inferredSide = issue.location.side ?? sideForField(issue.location.field);
  const location: ManualPlanIssueLocation = {
    ...(issue.location.date === undefined ? {} : { date: issue.location.date }),
    ...(issue.location.memberKey === undefined
      ? {}
      : { memberKey: issue.location.memberKey }),
    ...(inferredSide === undefined ? {} : { side: inferredSide }),
    ...(issue.location.field === undefined ? {} : { field: issue.location.field }),
  };
  const base = {
    code: issue.code,
    severity: issue.severity,
    location,
    message: issue.message,
  };
  return Object.freeze(
    issue.suggestion === undefined ? base : { ...base, suggestion: issue.suggestion },
  );
}

export function mapProjectSetupIssueToManualPlanIssue(
  issue: ProjectSetupIssue,
): ManualPlanIssue {
  const location: ManualPlanIssueLocation = {
    ...(issue.location.memberKey === undefined
      ? {}
      : { memberKey: issue.location.memberKey }),
    ...(issue.location.side === undefined ? {} : { side: issue.location.side }),
    ...(issue.location.field === undefined ? {} : { field: issue.location.field }),
  };
  const base = {
    code: issue.code,
    severity: issue.severity,
    location,
    message: issue.message,
  };
  return Object.freeze(
    issue.suggestion === undefined ? base : { ...base, suggestion: issue.suggestion },
  );
}

export function manualPlanIssueTargetId(issue: ManualPlanIssue): string {
  const { date, memberKey, field } = issue.location;
  if (date !== undefined && memberKey !== undefined && isManualPlanField(field)) {
    return manualPlanFieldDomId(date, memberKey, field);
  }
  if (date !== undefined && memberKey !== undefined) {
    return manualPlanCellDomId(date, memberKey);
  }
  if (memberKey !== undefined) {
    return manualPlanMemberGroupDomId(memberKey);
  }
  return 'manual-plan-workspace';
}
