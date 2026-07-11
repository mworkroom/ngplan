import {
  validateOrganizationSnapshot,
  validatePeriod,
} from '../../engine';
import type {
  MemberSnapshot,
  OpeningStateInput,
  OrganizationSnapshotInput,
} from '../../engine';
import { deriveTopology } from './derive-topology';
import type {
  NormalizeProjectSetupOutcome,
  ProjectSetupBundle,
  ProjectSetupDraft,
  ProjectSetupIssue,
  ProjectSetupValidation,
} from './types';
import {
  createProjectSetupValidation,
  fromCanonicalIssue,
  parseDraftPvpTarget,
  parseDraftPeriod,
  parseMemberOpeningState,
  validateProjectSetupDraft,
} from './validate-draft';

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

function safeOpeningRecord(
  entries: readonly (readonly [string, OpeningStateInput])[],
): Readonly<Record<string, OpeningStateInput>> {
  const record = Object.create(null) as Record<string, OpeningStateInput>;
  for (const [memberKey, opening] of entries) {
    Object.defineProperty(record, memberKey, {
      value: opening,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return record;
}

function mergeValidation(
  base: ProjectSetupValidation,
  additions: readonly ProjectSetupIssue[],
): ProjectSetupValidation {
  return createProjectSetupValidation(
    [...base.issues, ...additions],
    base.reassignmentQueue,
  );
}

function fail(validation: ProjectSetupValidation): NormalizeProjectSetupOutcome {
  return {
    status: 'FAILURE',
    errors: validation.errors,
    warnings: validation.warnings,
    validation,
  };
}

export function normalizeProjectSetup(
  draft: ProjectSetupDraft,
): NormalizeProjectSetupOutcome {
  let validation = validateProjectSetupDraft(draft);
  if (!validation.isReady) {
    return fail(validation);
  }

  const period = parseDraftPeriod(draft);
  if (period === null) {
    return fail(validation);
  }
  const periodReport = validatePeriod(period);
  validation = mergeValidation(
    validation,
    periodReport.issues.map(fromCanonicalIssue),
  );
  if (!validation.isReady) {
    return fail(validation);
  }

  const topology = deriveTopology(draft);
  const members: MemberSnapshot[] = [];
  const openings: [string, OpeningStateInput][] = [];
  for (const member of topology.activeMembers) {
    const pvpTarget = parseDraftPvpTarget(member.pvpTarget);
    const opening = parseMemberOpeningState(member);
    if (!pvpTarget.ok || opening === null) {
      return fail(validation);
    }
    members.push({
      memberKey: member.memberKey,
      memberId: member.memberId.trim(),
      name: member.name.trim(),
      pvpTarget: pvpTarget.value,
      sheetMarker: member.sheetMarker,
      parentMemberKey: member.placement.parentMemberKey,
      sideAtParent: member.placement.sideAtParent,
    });
    openings.push([member.memberKey, opening]);
  }

  const organization: OrganizationSnapshotInput = {
    snapshotId: draft.organizationSnapshotId,
    members,
    openingStateByMember: safeOpeningRecord(openings),
  };
  const organizationReport = validateOrganizationSnapshot(organization);
  validation = mergeValidation(
    validation,
    organizationReport.issues.map(fromCanonicalIssue),
  );
  if (!validation.isReady) {
    return fail(validation);
  }

  const bundle: ProjectSetupBundle = {
    project: {
      projectId: draft.projectId,
      title: draft.title.trim(),
      period,
      timezone: 'Asia/Seoul',
      projectStatus: 'IN_PROGRESS',
      organizationSnapshotId: draft.organizationSnapshotId,
    },
    organization,
  };
  const frozenBundle = deepFreeze(bundle);
  return {
    status: 'SUCCESS',
    bundle: frozenBundle,
    warnings: validation.warnings,
    validation,
  };
}

