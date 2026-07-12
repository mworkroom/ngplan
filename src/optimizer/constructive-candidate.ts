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
  const firstSettlementDate = request.calendar.dates.find((date) => !skipDates.has(date));
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
    firstCell.pvp = Math.max(personalDeficit, qualificationDeficit);
    if (Object.hasOwn(firstCell, 'selfLeft')) {
      firstCell.selfLeft = FORTNIGHT_SIDE_TARGET;
    }
    if (Object.hasOwn(firstCell, 'selfRight')) {
      firstCell.selfRight = FORTNIGHT_SIDE_TARGET;
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
