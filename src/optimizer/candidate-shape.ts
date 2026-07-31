import type {
  MemberSnapshot,
  NormalizedAllocationCell,
} from '../engine';
import { DEFAULT_RULE_SET } from '../engine';
import {
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_FINGERPRINT_VERSION,
  AUTOMATIC_PLAN_MAX_ACTIVE_MEMBERS,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_POLICY_VERSION,
  AUTOMATIC_PLAN_REQUEST_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
} from './constants';
import { isCanonicalNonNegativeSafeInteger } from './checked-integer';
import { automaticPlanError } from './errors';
import { validateAutomaticPlanCalendar } from './calendar-contract';
import type {
  AutomaticPlanCoordinate,
  AutomaticPlanField,
  AutomaticPlanRequest,
  SafeAutomaticPlanError,
} from './types';

export type AutomaticPlanRequestValidationOutcome =
  | { readonly status: 'SUCCESS' }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

export type AutomaticPlanCandidateShapeOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly allocations: readonly NormalizedAllocationCell[];
    }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

interface Children {
  left?: string;
  right?: string;
}

interface OpeningStateLike {
  readonly openingQualificationPvp?: unknown;
  readonly fortnightPvpOpeningCredit?: unknown;
  readonly dailyCarryPvp?: unknown;
  readonly dailyCarryLeft?: unknown;
  readonly dailyCarryRight?: unknown;
}

const MINIMUM_AUTOMATIC_DIRECT_PV = 30;

function compareArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deriveChildren(
  members: readonly MemberSnapshot[],
): { readonly root: string; readonly childrenByMember: ReadonlyMap<string, Children> } | null {
  const membersByKey = new Map<string, MemberSnapshot>();
  const childrenByMember = new Map<string, Children>();
  let root: string | null = null;
  for (const member of members) {
    if (membersByKey.has(member.memberKey)) {
      return null;
    }
    membersByKey.set(member.memberKey, member);
    childrenByMember.set(member.memberKey, {});
    if (member.parentMemberKey === null) {
      if (root !== null || member.sideAtParent !== null) {
        return null;
      }
      root = member.memberKey;
    }
  }
  if (root === null) {
    return null;
  }
  for (const member of members) {
    if (member.parentMemberKey === null || member.sideAtParent === null) {
      continue;
    }
    const children = childrenByMember.get(member.parentMemberKey);
    if (children === undefined) {
      return null;
    }
    if (member.sideAtParent === 'LEFT') {
      if (children.left !== undefined) {
        return null;
      }
      children.left = member.memberKey;
    } else {
      if (children.right !== undefined) {
        return null;
      }
      children.right = member.memberKey;
    }
  }
  return { root, childrenByMember };
}

export function deriveCanonicalAutomaticPlanMemberKeys(
  members: readonly MemberSnapshot[],
): readonly string[] {
  const topology = deriveChildren(members);
  if (topology === null) {
    return Object.freeze([]);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (memberKey: string): void => {
    if (visited.has(memberKey)) {
      return;
    }
    visited.add(memberKey);
    order.push(memberKey);
    const children = topology.childrenByMember.get(memberKey);
    if (children?.left !== undefined) {
      visit(children.left);
    }
    if (children?.right !== undefined) {
      visit(children.right);
    }
  };
  visit(topology.root);
  return visited.size === members.length ? Object.freeze(order) : Object.freeze([]);
}

export function validateAutomaticPlanRequest(
  request: AutomaticPlanRequest,
): AutomaticPlanRequestValidationOutcome {
  if (
    request.requestVersion !== AUTOMATIC_PLAN_REQUEST_VERSION ||
    request.rulesetVersion !== AUTOMATIC_PLAN_RULESET_VERSION ||
    request.engineVersion !== AUTOMATIC_PLAN_ENGINE_VERSION ||
    request.fingerprintVersion !== AUTOMATIC_PLAN_FINGERPRINT_VERSION ||
    request.policy.policyVersion !== AUTOMATIC_PLAN_POLICY_VERSION ||
    request.policy.objectiveVersion !== AUTOMATIC_PLAN_OBJECTIVE_VERSION
  ) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_VERSION_UNSUPPORTED',
        '자동 계획 요청의 규칙 또는 목적 버전을 지원하지 않습니다.',
      ),
    };
  }
  if (
    request.problemFingerprint.trim() === '' ||
    !Number.isSafeInteger(request.policy.deterministicSeed) ||
    Object.is(request.policy.deterministicSeed, -0)
  ) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_REQUEST_INVALID',
        '자동 계획 요청 식별자 또는 결정적 seed가 올바르지 않습니다.',
      ),
    };
  }
  const members = request.organization.members;
  if (members.length === 0 || members.length > AUTOMATIC_PLAN_MAX_ACTIVE_MEMBERS) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_MEMBER_LIMIT_EXCEEDED',
        `자동 계획은 1명부터 ${AUTOMATIC_PLAN_MAX_ACTIVE_MEMBERS}명까지 지원합니다.`,
      ),
    };
  }
  const unsupportedSideTargetMember = members.find(
    (member) =>
      member.fortnightSideTarget !==
      DEFAULT_RULE_SET.defaultFortnightSideTarget,
  );
  if (unsupportedSideTargetMember !== undefined) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_SIDE_TARGET_UNSUPPORTED',
        '좌·우 각 1,500 목표 회원이 있어 자동 플랜은 아직 사용할 수 없습니다.',
        { location: { memberKey: unsupportedSideTargetMember.memberKey } },
      ),
    };
  }
  const expectedMemberKeys = deriveCanonicalAutomaticPlanMemberKeys(members);
  if (
    expectedMemberKeys.length !== members.length ||
    !compareArrays(request.canonicalMemberKeys, expectedMemberKeys)
  ) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_MEMBER_ORDER_INVALID',
        '회원 순서는 맨 위 회원부터 왼쪽 가지를 먼저 방문하는 정본 순서여야 합니다.',
      ),
    };
  }
  const calendar = validateAutomaticPlanCalendar(request);
  if (calendar.status === 'FAILURE') {
    return calendar;
  }
  const memberKeySet = new Set(expectedMemberKeys);
  const openingKeys = Object.keys(request.openingPvpByMember);
  if (
    openingKeys.length !== expectedMemberKeys.length ||
    openingKeys.some((memberKey) => !memberKeySet.has(memberKey))
  ) {
    return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_OPENING_STATE_INVALID',
          '회원별 누적 PVP 시작값이 완전하지 않습니다.',
        ),
    };
  }
  for (const memberKey of expectedMemberKeys) {
    const normalized = request.openingPvpByMember[memberKey];
    const engineOpening = request.organization.openingStateByMember[
      memberKey
    ] as OpeningStateLike | undefined;
    if (
      normalized === undefined ||
      engineOpening === undefined ||
      !isCanonicalNonNegativeSafeInteger(normalized.cumulativePvpOpening) ||
      normalized.cumulativePvpOpening > DEFAULT_RULE_SET.cumulativePvpCap ||
      normalized.cumulativePvpOpening !== engineOpening.openingQualificationPvp ||
      normalized.cumulativePvpOpening !== engineOpening.fortnightPvpOpeningCredit ||
      engineOpening.dailyCarryPvp !== 0 ||
      !isCanonicalNonNegativeSafeInteger(engineOpening.dailyCarryLeft) ||
      !isCanonicalNonNegativeSafeInteger(engineOpening.dailyCarryRight)
    ) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_OPENING_STATE_INVALID',
          '누적 PVP는 0~2,400에서 자격·보름 장부에 같게 적용되고 첫날 일일 PVP는 0이어야 합니다.',
          { location: { memberKey } },
        ),
      };
    }
  }
  return { status: 'SUCCESS' };
}

function allowedFieldsForMember(
  memberKey: string,
  members: readonly MemberSnapshot[],
): Readonly<{ left: boolean; right: boolean }> {
  let leftChild = false;
  let rightChild = false;
  for (const member of members) {
    if (member.parentMemberKey !== memberKey) {
      continue;
    }
    if (member.sideAtParent === 'LEFT') {
      leftChild = true;
    } else if (member.sideAtParent === 'RIGHT') {
      rightChild = true;
    }
  }
  return { left: !leftChild, right: !rightChild };
}

function fieldValue(cell: NormalizedAllocationCell, field: AutomaticPlanField): number | undefined {
  return field === 'PVP'
    ? cell.pvp
    : field === 'SELF_LEFT'
      ? cell.selfLeft
      : cell.selfRight;
}

export function deriveAutomaticPlanCoordinates(
  request: AutomaticPlanRequest,
): readonly AutomaticPlanCoordinate[] {
  const coordinates: AutomaticPlanCoordinate[] = [];
  for (const date of request.calendar.dates) {
    for (const memberKey of request.canonicalMemberKeys) {
      const modes = allowedFieldsForMember(memberKey, request.organization.members);
      coordinates.push({ date, memberKey, field: 'PVP' });
      if (modes.left) {
        coordinates.push({ date, memberKey, field: 'SELF_LEFT' });
      }
      if (modes.right) {
        coordinates.push({ date, memberKey, field: 'SELF_RIGHT' });
      }
    }
  }
  return Object.freeze(coordinates.map((coordinate) => Object.freeze(coordinate)));
}

export function automaticPlanCoordinateKey(coordinate: AutomaticPlanCoordinate): string {
  return JSON.stringify([coordinate.date, coordinate.memberKey, coordinate.field]);
}

export function validateAutomaticPlanCandidateShape(
  request: AutomaticPlanRequest,
  allocations: readonly NormalizedAllocationCell[],
): AutomaticPlanCandidateShapeOutcome {
  const requestValidation = validateAutomaticPlanRequest(request);
  if (requestValidation.status === 'FAILURE') {
    return requestValidation;
  }
  const expectedCellCount = request.calendar.dates.length * request.canonicalMemberKeys.length;
  if (allocations.length !== expectedCellCount) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID',
        '자동 계획 후보에 날짜·회원 셀이 빠졌거나 중복되었습니다.',
      ),
    };
  }
  const skipDates = new Set(request.calendar.skipDateSet);
  const cloned: NormalizedAllocationCell[] = [];
  let index = 0;
  for (const date of request.calendar.dates) {
    for (const memberKey of request.canonicalMemberKeys) {
      const cell = allocations[index];
      if (cell === undefined || cell.date !== date || cell.memberKey !== memberKey) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_CANDIDATE_ORDER_INVALID',
            '자동 계획 후보 셀이 정본 날짜·회원 순서와 일치하지 않습니다.',
            { location: { date, memberKey, index } },
          ),
        };
      }
      const allowedKeys = new Set(['date', 'memberKey', 'pvp', 'selfLeft', 'selfRight']);
      if (Object.keys(cell).some((key) => !allowedKeys.has(key))) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID',
            '자동 계획 후보 셀에 알 수 없는 필드가 있습니다.',
            { location: { date, memberKey, index } },
          ),
        };
      }
      const modes = allowedFieldsForMember(memberKey, request.organization.members);
      const hasLeft = Object.hasOwn(cell, 'selfLeft');
      const hasRight = Object.hasOwn(cell, 'selfRight');
      if (hasLeft !== modes.left || hasRight !== modes.right) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID',
            'SELF와 CHILD 방향의 직접 입력 필드 모양이 조직과 일치하지 않습니다.',
            { location: { date, memberKey, index } },
          ),
        };
      }
      const fields: AutomaticPlanField[] = [
        'PVP',
        ...(modes.left ? (['SELF_LEFT'] as const) : []),
        ...(modes.right ? (['SELF_RIGHT'] as const) : []),
      ];
      for (const field of fields) {
        const value = fieldValue(cell, field);
        if (!isCanonicalNonNegativeSafeInteger(value)) {
          return {
            status: 'FAILURE',
            error: automaticPlanError(
              'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID',
              '자동 계획의 모든 직접 값은 0 이상의 안전한 정수여야 합니다.',
              { location: { date, memberKey, field, index } },
            ),
          };
        }
        if (skipDates.has(date) && value !== 0) {
          return {
            status: 'FAILURE',
            error: automaticPlanError(
              'AUTOMATIC_PLAN_SKIPPED_DATE_NONZERO',
              '일요일과 정산 제외 날짜에는 신규 값을 배정할 수 없습니다.',
              { location: { date, memberKey, field, index } },
            ),
          };
        }
        if (value !== 0 && value < MINIMUM_AUTOMATIC_DIRECT_PV) {
          return {
            status: 'FAILURE',
            error: automaticPlanError(
              'AUTOMATIC_PLAN_CANDIDATE_VALUE_INVALID',
              '자동 계획의 직접 값은 0이거나 30 이상의 안전한 정수여야 합니다.',
              { location: { date, memberKey, field, index } },
            ),
          };
        }
      }
      cloned.push(
        Object.freeze({
          date,
          memberKey,
          pvp: cell.pvp,
          ...(modes.left ? { selfLeft: cell.selfLeft! } : {}),
          ...(modes.right ? { selfRight: cell.selfRight! } : {}),
        }),
      );
      index += 1;
    }
  }
  return { status: 'SUCCESS', allocations: Object.freeze(cloned) };
}
