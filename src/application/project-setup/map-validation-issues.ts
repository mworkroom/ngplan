import type { Side } from '../../engine';
import type {
  ProjectSetupIssue,
  ProjectSetupIssueLocation,
} from './types';

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function projectFieldId(field: string): string {
  return `project-${safePart(field.replace('period.', ''))}`;
}

export function memberCardId(memberKey: string): string {
  return `member-${safePart(memberKey)}-card`;
}

export function memberFieldId(memberKey: string, field: string): string {
  return `member-${safePart(memberKey)}-${safePart(field)}`;
}

export function childSlotId(memberKey: string, side: Side): string {
  return `member-${safePart(memberKey)}-${side.toLowerCase()}-slot`;
}

export function queueEntryId(memberKey: string): string {
  return `queue-${safePart(memberKey)}`;
}

export function validationLocationTargetId(
  location: ProjectSetupIssueLocation,
): string {
  if (location.area === 'QUEUE' && location.memberKey !== undefined) {
    return queueEntryId(location.memberKey);
  }
  if (location.area === 'SLOT' && location.memberKey !== undefined && location.side !== undefined) {
    return childSlotId(location.memberKey, location.side);
  }
  if (location.memberKey !== undefined) {
    return location.field === undefined
      ? memberCardId(location.memberKey)
      : memberFieldId(location.memberKey, location.field);
  }
  return projectFieldId(location.field ?? 'setup');
}

export function validationIssueTargetId(issue: ProjectSetupIssue): string {
  return validationLocationTargetId(issue.location);
}

