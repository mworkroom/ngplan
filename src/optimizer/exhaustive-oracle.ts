import type { NormalizedAllocationCell } from '../engine';
import { assertCanonicalNonNegativeSafeInteger } from './checked-integer';
import {
  automaticPlanCoordinateKey,
  deriveAutomaticPlanCoordinates,
  validateAutomaticPlanRequest,
} from './candidate-shape';
import { verifyAutomaticPlanCandidate } from './candidate-verifier';
import { automaticPlanError, errorFromUnknown } from './errors';
import { compareAutomaticPlanObjectives } from './objective';
import type {
  AutomaticPlanCoordinate,
  AutomaticPlanRequest,
  SafeAutomaticPlanError,
  VerifiedAutomaticPlanCandidate,
} from './types';

export interface TinyAutomaticPlanOracleOptions {
  readonly defaultDomain: readonly number[];
  readonly domainByCoordinate?: Readonly<Record<string, readonly number[]>>;
  readonly maxCombinations: number;
  readonly candidateIdPrefix?: string;
}

export type TinyAutomaticPlanOracleOutcome =
  | {
      readonly status: 'SUCCESS';
      readonly bestCandidate: VerifiedAutomaticPlanCandidate | null;
      readonly evaluatedCandidateCount: number;
      readonly completeWithinBounds: true;
    }
  | { readonly status: 'FAILURE'; readonly error: SafeAutomaticPlanError };

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

function normalizeDomain(values: readonly number[]): readonly number[] {
  if (values.length === 0) {
    throw new TypeError('oracle domain must not be empty');
  }
  const unique = [...new Set(values)];
  for (const value of unique) {
    assertCanonicalNonNegativeSafeInteger(value, 'oracle domain value');
  }
  return Object.freeze(unique.sort((left, right) => left - right));
}

function assign(cell: MutableCell, coordinate: AutomaticPlanCoordinate, value: number): void {
  if (coordinate.field === 'PVP') {
    cell.pvp = value;
  } else if (coordinate.field === 'SELF_LEFT') {
    cell.selfLeft = value;
  } else {
    cell.selfRight = value;
  }
}

function freezeCells(
  request: AutomaticPlanRequest,
  cells: ReadonlyMap<string, MutableCell>,
): readonly NormalizedAllocationCell[] {
  const allocations: NormalizedAllocationCell[] = [];
  for (const date of request.calendar.dates) {
    for (const memberKey of request.canonicalMemberKeys) {
      const cell = cells.get(cellKey(date, memberKey));
      if (cell === undefined) {
        throw new TypeError('oracle cell missing');
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
  return Object.freeze(allocations);
}

/**
 * Exhausts only the caller-supplied finite domains. Even when complete within
 * those bounds, this helper never emits a product `INFEASIBLE` or `OPTIMAL`
 * run state; model completeness still requires a certified global argument.
 */
export function searchTinyAutomaticPlan(
  request: AutomaticPlanRequest,
  options: TinyAutomaticPlanOracleOptions,
): TinyAutomaticPlanOracleOutcome {
  const validRequest = validateAutomaticPlanRequest(request);
  if (validRequest.status === 'FAILURE') {
    return validRequest;
  }
  try {
    assertCanonicalNonNegativeSafeInteger(options.maxCombinations, 'oracle limit');
    if (options.maxCombinations === 0) {
      throw new TypeError('oracle limit must be positive');
    }
    const defaultDomain = normalizeDomain(options.defaultDomain);
    const coordinates = deriveAutomaticPlanCoordinates(request);
    const skipDates = new Set(request.calendar.skipDateSet);
    const domains = coordinates.map((coordinate) => {
      if (skipDates.has(coordinate.date)) {
        return Object.freeze([0]);
      }
      const override = options.domainByCoordinate?.[
        automaticPlanCoordinateKey(coordinate)
      ];
      return normalizeDomain(override ?? defaultDomain);
    });
    let combinationCount = 1;
    for (const domain of domains) {
      if (
        combinationCount >
        Math.floor(options.maxCombinations / domain.length)
      ) {
        return {
          status: 'FAILURE',
          error: automaticPlanError(
            'AUTOMATIC_PLAN_ORACLE_LIMIT_EXCEEDED',
            '작은 완전탐색의 조합 수가 설정한 한도를 넘습니다.',
          ),
        };
      }
      combinationCount *= domain.length;
    }
    const cells = new Map<string, MutableCell>();
    for (const date of request.calendar.dates) {
      for (const memberKey of request.canonicalMemberKeys) {
        cells.set(cellKey(date, memberKey), { date, memberKey, pvp: 0 });
      }
    }
    for (const coordinate of coordinates) {
      const cell = cells.get(cellKey(coordinate.date, coordinate.memberKey))!;
      assign(cell, coordinate, 0);
    }
    let evaluatedCandidateCount = 0;
    let bestCandidate: VerifiedAutomaticPlanCandidate | null = null;
    const candidateIdPrefix = options.candidateIdPrefix ?? 'tiny-oracle';
    const visit = (coordinateIndex: number): void => {
      if (coordinateIndex === coordinates.length) {
        const sequence = evaluatedCandidateCount;
        evaluatedCandidateCount += 1;
        const verified = verifyAutomaticPlanCandidate(
          request,
          {
            problemFingerprint: request.problemFingerprint,
            allocations: freezeCells(request, cells),
          },
          {
            candidateId: `${candidateIdPrefix}-${sequence}`,
            sequence,
            foundAtElapsedMs: 0,
          },
        );
        if (
          verified.status === 'SUCCESS' &&
          (bestCandidate === null ||
            compareAutomaticPlanObjectives(
              verified.candidate.objective,
              bestCandidate.objective,
            ) < 0)
        ) {
          bestCandidate = verified.candidate;
        }
        return;
      }
      const coordinate = coordinates[coordinateIndex]!;
      const cell = cells.get(cellKey(coordinate.date, coordinate.memberKey))!;
      for (const value of domains[coordinateIndex]!) {
        assign(cell, coordinate, value);
        visit(coordinateIndex + 1);
      }
    };
    visit(0);
    return {
      status: 'SUCCESS',
      bestCandidate,
      evaluatedCandidateCount,
      completeWithinBounds: true,
    };
  } catch (error) {
    return { status: 'FAILURE', error: errorFromUnknown(error) };
  }
}
