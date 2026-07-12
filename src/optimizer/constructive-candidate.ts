import type { NormalizedAllocationCell } from '../engine';
import {
  automaticPlanCoordinateKey,
  deriveAutomaticPlanCoordinates,
  validateAutomaticPlanRequest,
} from './candidate-shape';
import { automaticPlanError } from './errors';
import { verifyAutomaticPlanCandidate } from './candidate-verifier';
import type {
  AutomaticPlanCandidateIdentity,
  AutomaticPlanConstructionOutcome,
  AutomaticPlanCoordinate,
  AutomaticPlanRequest,
  AutomaticPlanVerificationOutcome,
  RawAutomaticPlanCandidate,
} from './types';

const FORTNIGHT_SIDE_TARGET = 2_500;
const RECOMMENDED_COMMISSION_DAYS = 8;
const MINIMUM_COMMISSION_TIER = 300;

interface MutableCell {
  date: string;
  memberKey: string;
  pvp: number;
  selfLeft?: number;
  selfRight?: number;
}

function cellKey(date: string, memberKey: string): string {
  return JSON.stringify([date, memberKey]);
}

function setCoordinate(
  cell: MutableCell,
  coordinate: AutomaticPlanCoordinate,
  value: number,
): void {
  if (coordinate.field === 'PVP') {
    cell.pvp = value;
  } else if (coordinate.field === 'SELF_LEFT') {
    cell.selfLeft = value;
  } else {
    cell.selfRight = value;
  }
}

function distribute(total: number, count: number): readonly number[] {
  if (count <= 0) return Object.freeze([]);
  const quotient = Math.floor(total / count);
  const remainder = total % count;
  return Object.freeze(
    Array.from({ length: count }, (_, index) => quotient + Number(index < remainder)),
  );
}

/**
 * Deterministic feasibility-first warm start. It deliberately over-allocates raw
 * SELF sides and makes no optimality or infeasibility claim.
 */
export function buildConstructiveCandidate(
  request: AutomaticPlanRequest,
): AutomaticPlanConstructionOutcome {
  const requestValidation = validateAutomaticPlanRequest(request);
  if (requestValidation.status === 'FAILURE') {
    return requestValidation;
  }
  const skipDates = new Set(request.calendar.skipDateSet);
  const settlementDates = request.calendar.dates.filter((date) => !skipDates.has(date));
  const firstSettlementDate = settlementDates[0];
  if (firstSettlementDate === undefined) {
    return {
      status: 'FAILURE',
      error: automaticPlanError(
        'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
        '신규 값을 배정할 수 있는 영업일이 없습니다.',
      ),
    };
  }
  const coordinates = deriveAutomaticPlanCoordinates(request);
  const cells = new Map<string, MutableCell>();
  for (const date of request.calendar.dates) {
    for (const memberKey of request.canonicalMemberKeys) {
      cells.set(cellKey(date, memberKey), { date, memberKey, pvp: 0 });
    }
  }
  for (const coordinate of coordinates) {
    const cell = cells.get(cellKey(coordinate.date, coordinate.memberKey));
    if (cell === undefined) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
          '구성 후보의 날짜·회원 셀을 만들 수 없습니다.',
        ),
      };
    }
    setCoordinate(cell, coordinate, 0);
  }
  const planDates = settlementDates.slice(0, RECOMMENDED_COMMISSION_DAYS);
  for (const memberKey of request.canonicalMemberKeys) {
    const member = request.organization.members.find(
      (candidate) => candidate.memberKey === memberKey,
    );
    const opening = request.openingPvpByMember[memberKey];
    const firstCell = cells.get(cellKey(firstSettlementDate, memberKey));
    if (member === undefined || opening === undefined || firstCell === undefined) {
      return {
        status: 'FAILURE',
        error: automaticPlanError(
          'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
          '구성 후보에 필요한 회원 또는 시작값이 없습니다.',
          { location: { memberKey } },
        ),
      };
    }
    const personalDeficit = Math.max(0, member.pvpTarget - opening.openingFortnightPvp);
    const qualificationDeficit = Math.max(
      0,
      300 - opening.openingQualificationPvp,
    );
    const requiredPvp = Math.max(personalDeficit, qualificationDeficit);
    const remainingAfterQualification = requiredPvp - qualificationDeficit;
    const distributedPvp = distribute(remainingAfterQualification, planDates.length);
    for (let index = 0; index < planDates.length; index += 1) {
      const cell = cells.get(cellKey(planDates[index]!, memberKey))!;
      cell.pvp = distributedPvp[index]! + (index === 0 ? qualificationDeficit : 0);
    }
  }
  const firstSideAllocation =
    FORTNIGHT_SIDE_TARGET - MINIMUM_COMMISSION_TIER * (planDates.length - 1);
  for (const memberKey of request.canonicalMemberKeys) {
    for (let index = 0; index < planDates.length; index += 1) {
      const cell = cells.get(cellKey(planDates[index]!, memberKey))!;
      const sideAllocation = index === 0
        ? firstSideAllocation
        : MINIMUM_COMMISSION_TIER;
      if (Object.hasOwn(cell, 'selfLeft')) cell.selfLeft = sideAllocation;
      if (Object.hasOwn(cell, 'selfRight')) cell.selfRight = sideAllocation;
    }
  }
  const allocations: NormalizedAllocationCell[] = [];
  for (const date of request.calendar.dates) {
    for (const memberKey of request.canonicalMemberKeys) {
      const cell = cells.get(cellKey(date, memberKey));
      if (cell === undefined) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
            '구성 후보 셀을 정본 순서로 만들 수 없습니다.',
          ),
        };
      }
      allocations.push(
        Object.freeze({
          date,
          memberKey,
          pvp: cell.pvp,
          ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: cell.selfLeft! } : {}),
          ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: cell.selfRight! } : {}),
        }),
      );
    }
  }
  const candidate: RawAutomaticPlanCandidate = Object.freeze({
    problemFingerprint: request.problemFingerprint,
    allocations: Object.freeze(allocations),
  });
  return { status: 'SUCCESS', candidate };
}

export function buildVerifiedConstructiveCandidate(
  request: AutomaticPlanRequest,
  identity: AutomaticPlanCandidateIdentity,
): AutomaticPlanVerificationOutcome {
  const built = buildConstructiveCandidate(request);
  if (built.status === 'FAILURE') {
    return built;
  }
  return verifyAutomaticPlanCandidate(request, built.candidate, identity);
}

export { automaticPlanCoordinateKey };
