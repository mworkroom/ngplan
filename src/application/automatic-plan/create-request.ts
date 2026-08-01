import {
  buildOrganizationIndex,
  derivePeriod,
  settlementModeForDate,
  type NormalizedAllocationCell,
} from '../../engine';
import {
  AUTOMATIC_PLAN_CALENDAR_VERSION,
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_FINGERPRINT_VERSION,
  AUTOMATIC_PLAN_MAX_ACTIVE_MEMBERS,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_POLICY_VERSION,
  AUTOMATIC_PLAN_REQUEST_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
  type AutomaticPlanRequest,
  type SafeAutomaticPlanError,
} from '../../optimizer';
import type { ProjectSetupBundle } from '../project-setup';
import { createProblemFingerprint } from './fingerprint';

const DEFAULT_DETERMINISTIC_SEED = 0x4e47504c;

export type CreateAutomaticPlanRequestOutcome =
  | { readonly status: 'SUCCESS'; readonly request: AutomaticPlanRequest }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

function failure(
  code: SafeAutomaticPlanError['code'],
  message: string,
): CreateAutomaticPlanRequestOutcome {
  return Object.freeze({
    status: 'FAILURE',
    error: Object.freeze({ code, message }),
  });
}

function freezeWarmStart(
  warmStart: readonly NormalizedAllocationCell[] | undefined,
): readonly NormalizedAllocationCell[] | undefined {
  return warmStart === undefined
    ? undefined
    : Object.freeze(warmStart.map((cell) => Object.freeze({ ...cell })));
}

export function createAutomaticPlanRequest(
  bundle: ProjectSetupBundle,
  warmStart?: readonly NormalizedAllocationCell[],
): CreateAutomaticPlanRequestOutcome {
  if (
    bundle.organization.members.length < 1 ||
    bundle.organization.members.length > AUTOMATIC_PLAN_MAX_ACTIVE_MEMBERS
  ) {
    return failure(
      'AUTOMATIC_PLAN_MEMBER_LIMIT_EXCEEDED',
      `자동 계획은 활성 회원 1명부터 ${AUTOMATIC_PLAN_MAX_ACTIVE_MEMBERS}명까지 만들 수 있습니다.`,
    );
  }

  try {
    const period = derivePeriod(bundle.project.period);
    const organization = buildOrganizationIndex(bundle.organization.members);
    const canonicalMemberKeys = Object.freeze([...organization.orderedMemberKeys]);
    if (canonicalMemberKeys.length !== bundle.organization.members.length) {
      return failure(
        'AUTOMATIC_PLAN_MEMBER_ORDER_INVALID',
        '루트부터 이어지는 정본 회원 순서를 만들 수 없습니다.',
      );
    }

    const dates = Object.freeze(period.dates.map(String));
    const skipDateSet = Object.freeze(
      period.dates
        .filter((date) => settlementModeForDate(date) === 'SKIP_NO_INPUT')
        .map(String),
    );
    const openingPvpEntries = canonicalMemberKeys.map((memberKey) => {
      const opening = bundle.organization.openingStateByMember[memberKey];
      if (opening === undefined) {
        throw new Error(`회원 ${memberKey}의 시작값이 없습니다.`);
      }
      if (
        !Number.isSafeInteger(opening.openingQualificationPvp) ||
        Object.is(opening.openingQualificationPvp, -0) ||
        opening.openingQualificationPvp < 0 ||
        opening.openingQualificationPvp > 2_400 ||
        opening.fortnightPvpOpeningCredit !== opening.openingQualificationPvp ||
        opening.dailyCarryPvp !== 0
      ) {
        throw new Error(
          `회원 ${memberKey}의 누적 PVP는 0~2,400에서 자격·보름 장부에 같게 적용되고 첫날 일일 PVP는 0이어야 합니다.`,
        );
      }
      return [
        memberKey,
        Object.freeze({
          cumulativePvpOpening: opening.openingQualificationPvp,
        }),
      ] as const;
    });
    const openingPvpByMember = Object.freeze(Object.fromEntries(openingPvpEntries));
    const canonicalMembers = canonicalMemberKeys.map((memberKey) => {
      const member = organization.membersByKey.get(memberKey)!;
      return Object.freeze({
        memberKey: member.memberKey,
        memberId: member.memberId,
        name: member.name,
        pvpTarget: member.pvpTarget,
        fortnightSideTarget: member.fortnightSideTarget,
        sheetMarker: member.sheetMarker,
        parentMemberKey: member.parentMemberKey,
        sideAtParent: member.sideAtParent,
        opening: bundle.organization.openingStateByMember[memberKey]!,
      });
    });
    const fingerprintInput = Object.freeze({
      fingerprintVersion: AUTOMATIC_PLAN_FINGERPRINT_VERSION,
      requestVersion: AUTOMATIC_PLAN_REQUEST_VERSION,
      rulesetVersion: AUTOMATIC_PLAN_RULESET_VERSION,
      engineVersion: AUTOMATIC_PLAN_ENGINE_VERSION,
      policyVersion: AUTOMATIC_PLAN_POLICY_VERSION,
      objectiveVersion: AUTOMATIC_PLAN_OBJECTIVE_VERSION,
      calendarVersion: AUTOMATIC_PLAN_CALENDAR_VERSION,
      period: bundle.project.period,
      organizationSnapshotId: bundle.organization.snapshotId,
      dates,
      skipDateSet,
      canonicalMembers,
    });
    const frozenWarmStart = freezeWarmStart(warmStart);
    const request: AutomaticPlanRequest = Object.freeze({
      requestVersion: AUTOMATIC_PLAN_REQUEST_VERSION,
      rulesetVersion: AUTOMATIC_PLAN_RULESET_VERSION,
      engineVersion: AUTOMATIC_PLAN_ENGINE_VERSION,
      fingerprintVersion: AUTOMATIC_PLAN_FINGERPRINT_VERSION,
      period: Object.freeze({ ...bundle.project.period }),
      organization: bundle.organization,
      policy: Object.freeze({
        policyVersion: AUTOMATIC_PLAN_POLICY_VERSION,
        objectiveVersion: AUTOMATIC_PLAN_OBJECTIVE_VERSION,
        deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
      }),
      calendar: Object.freeze({
        calendarVersion: AUTOMATIC_PLAN_CALENDAR_VERSION,
        dates,
        skipDateSet,
      }),
      canonicalMemberKeys,
      openingPvpByMember,
      problemFingerprint: createProblemFingerprint(fingerprintInput),
      ...(frozenWarmStart === undefined ? {} : { warmStart: frozenWarmStart }),
    });
    return Object.freeze({ status: 'SUCCESS', request });
  } catch (error) {
    return failure(
      'AUTOMATIC_PLAN_REQUEST_INVALID',
      error instanceof Error
        ? error.message
        : '자동 계획 요청을 정규화하지 못했습니다.',
    );
  }
}
