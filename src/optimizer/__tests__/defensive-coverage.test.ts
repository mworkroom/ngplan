import { describe, expect, it } from 'vitest';
import type {
  CalculationResult,
  MemberSnapshot,
  NormalizedAllocationCell,
  OpeningStateInput,
} from '../../engine';
import {
  AUTOMATIC_PLAN_CALENDAR_VERSION,
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_FINGERPRINT_VERSION,
  AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
  AUTOMATIC_PLAN_MODEL_VERSION,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_POLICY_VERSION,
  AUTOMATIC_PLAN_REQUEST_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
  AutomaticPlanRangeError,
  assertValidAutomaticPlanObjective,
  automaticPlanError,
  buildConstructiveCandidate,
  buildVerifiedConstructiveCandidate,
  certifyCompleteProof,
  certifyModelCertificate,
  checkedMultiplyScore,
  checkedSubtractScore,
  checkedSumScores,
  createAutomaticPlanModel,
  createFailedAutomaticPlanRunState,
  createInfeasibleAutomaticPlanRunState,
  createInitialAutomaticPlanProofProgress,
  createOptimalAutomaticPlanRunState,
  createUnprovenAutomaticPlanRunState,
  deriveAutomaticPlanCoordinates,
  deriveCanonicalAutomaticPlanMemberKeys,
  discardedExcessForSettlement,
  errorFromUnknown,
  evaluateAutomaticPlanObjective,
  searchTinyAutomaticPlan,
  validateAutomaticPlanCandidateShape,
  validateAutomaticPlanRequest,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanObjectiveVector,
  type AutomaticPlanProofProgress,
  type AutomaticPlanRequest,
  type ModelCertificate,
} from '..';
import { AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT } from '../proof-stages';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

const IDENTITY = Object.freeze({
  candidateId: 'defensive-candidate',
  sequence: 1,
  foundAtElapsedMs: 0,
});

function invalidRequest(
  request: AutomaticPlanRequest,
  patch: Partial<AutomaticPlanRequest>,
): AutomaticPlanRequest {
  return { ...request, ...patch } as AutomaticPlanRequest;
}

function constructive(request = createOptimizerRequest()) {
  const outcome = buildConstructiveCandidate(request);
  if (outcome.status !== 'SUCCESS') {
    throw new Error(`constructive fixture failed: ${outcome.error.code}`);
  }
  return outcome.candidate;
}

function verifiedFixture(request = createOptimizerRequest()) {
  const outcome = buildVerifiedConstructiveCandidate(request, IDENTITY);
  if (outcome.status !== 'SUCCESS') {
    throw new Error(`verified fixture failed: ${outcome.error.code}`);
  }
  return outcome.candidate;
}

function replaceCell(
  cells: readonly NormalizedAllocationCell[],
  index: number,
  patch: Partial<NormalizedAllocationCell>,
): readonly NormalizedAllocationCell[] {
  return cells.map((cell, cellIndex) =>
    cellIndex === index ? { ...cell, ...patch } : cell,
  );
}

function certificate(overrides: Partial<ModelCertificate> = {}): ModelCertificate {
  return {
    certificateVersion: AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
    certificateId: 'defensive-model-certificate',
    modelVersion: AUTOMATIC_PLAN_MODEL_VERSION,
    modelImplementationId: 'defensive-model',
    fingerprintVersion: AUTOMATIC_PLAN_FINGERPRINT_VERSION,
    rulesetVersion: AUTOMATIC_PLAN_RULESET_VERSION,
    engineVersion: AUTOMATIC_PLAN_ENGINE_VERSION,
    policyVersion: AUTOMATIC_PLAN_POLICY_VERSION,
    objectiveVersion: AUTOMATIC_PLAN_OBJECTIVE_VERSION,
    calendarVersion: AUTOMATIC_PLAN_CALENDAR_VERSION,
    solverAdapterId: 'defensive-solver',
    solverAdapterVersion: '1.0.0',
    integerSemantics: 'EXACT_SAFE_INTEGER',
    evidence: {
      soundness: true,
      completeness: true,
      objectivePreservation: true,
      exactIntegerRange: true,
      exhaustiveOracle: true,
      seededRandomizedComparison: true,
      boundarySuite: true,
      ruleToConstraintMapping: true,
      toleranceSafetyProven: true,
    },
    ...overrides,
  };
}

function certifiedFixture() {
  const request = createOptimizerRequest();
  const candidate = verifiedFixture(request);
  const certified = certifyModelCertificate(request, certificate());
  if (certified.status !== 'SUCCESS') throw new Error('certificate fixture failed');
  const progress: AutomaticPlanProofProgress = {
    stage: 'COMPLETE',
    provenScalarObjectiveCount: AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT,
    provenVectorPrefix: {
      objective: 'DETERMINISTIC_ALLOCATION_VECTOR',
      length: candidate.objective.deterministicAllocationVector.length,
    },
    primaryLowerBound: candidate.objective.totalNewPv,
  };
  const optimalProof = certifyCompleteProof(
    request,
    certified.certificate,
    progress,
    'OPTIMAL',
  );
  if (optimalProof.status !== 'SUCCESS') throw new Error('proof fixture failed');
  return {
    request,
    candidate,
    certificate: certified.certificate,
    proof: optimalProof.proof,
  };
}

describe('optimizer request and shape defensive coverage', () => {
  it('rejects every malformed topology family without producing an order', () => {
    const malformed: readonly (readonly MemberSnapshot[])[] = [
      [optimizerMember('root'), optimizerMember('root')],
      [optimizerMember('root'), optimizerMember('second-root')],
      [optimizerMember('root', null, 'LEFT')],
      [optimizerMember('orphan', 'missing', 'LEFT')],
      [optimizerMember('root'), optimizerMember('orphan', 'missing', 'LEFT')],
      [
        optimizerMember('root'),
        optimizerMember('left-a', 'root', 'LEFT'),
        optimizerMember('left-b', 'root', 'LEFT'),
      ],
      [
        optimizerMember('root'),
        optimizerMember('right-a', 'root', 'RIGHT'),
        optimizerMember('right-b', 'root', 'RIGHT'),
      ],
      [optimizerMember('root'), optimizerMember('detached', 'root', null)],
      [
        optimizerMember('root'),
        optimizerMember('cycle-a', 'cycle-b', 'LEFT'),
        optimizerMember('cycle-b', 'cycle-a', 'LEFT'),
      ],
    ];
    for (const members of malformed) {
      expect(deriveCanonicalAutomaticPlanMemberKeys(members)).toEqual([]);
    }
  });

  it('rejects each version field before solving', () => {
    const request = createOptimizerRequest();
    const variants: AutomaticPlanRequest[] = [
      invalidRequest(request, { requestVersion: 'x' as typeof AUTOMATIC_PLAN_REQUEST_VERSION }),
      invalidRequest(request, { rulesetVersion: 'x' as typeof AUTOMATIC_PLAN_RULESET_VERSION }),
      invalidRequest(request, { engineVersion: 'x' as typeof AUTOMATIC_PLAN_ENGINE_VERSION }),
      invalidRequest(request, {
        fingerprintVersion: 'x' as typeof AUTOMATIC_PLAN_FINGERPRINT_VERSION,
      }),
      invalidRequest(request, {
        policy: {
          ...request.policy,
          policyVersion: 'x' as typeof AUTOMATIC_PLAN_POLICY_VERSION,
        },
      }),
      invalidRequest(request, {
        policy: {
          ...request.policy,
          objectiveVersion: 'x' as typeof AUTOMATIC_PLAN_OBJECTIVE_VERSION,
        },
      }),
    ];
    for (const variant of variants) {
      expect(validateAutomaticPlanRequest(variant)).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_VERSION_UNSUPPORTED' },
      });
    }
  });

  it('rejects invalid request identities and calendar variants', () => {
    const request = createOptimizerRequest();
    for (const variant of [
      invalidRequest(request, { problemFingerprint: ' ' }),
      invalidRequest(request, {
        policy: { ...request.policy, deterministicSeed: Number.NaN },
      }),
      invalidRequest(request, {
        policy: { ...request.policy, deterministicSeed: -0 },
      }),
    ]) {
      expect(validateAutomaticPlanRequest(variant)).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' },
      });
    }

    const firstDate = request.calendar.dates[0]!;
    const firstSkip = request.calendar.skipDateSet[0]!;
    const calendarVariants = [
      {
        ...request.calendar,
        calendarVersion: 'x' as typeof AUTOMATIC_PLAN_CALENDAR_VERSION,
      },
      { ...request.calendar, dates: [...request.calendar.dates, firstDate] },
      { ...request.calendar, skipDateSet: [...request.calendar.skipDateSet, firstSkip] },
      { ...request.calendar, dates: [...request.calendar.dates].reverse() },
      { ...request.calendar, skipDateSet: request.calendar.skipDateSet.slice(1) },
    ];
    for (const calendar of calendarVariants) {
      expect(validateAutomaticPlanRequest(invalidRequest(request, { calendar }))).toMatchObject({
        status: 'FAILURE',
        error: {
          code:
            String(calendar.calendarVersion) === 'x'
              ? 'AUTOMATIC_PLAN_VERSION_UNSUPPORTED'
              : 'AUTOMATIC_PLAN_CALENDAR_INVALID',
        },
      });
    }
  });

  it('rejects missing, unknown, invalid, and mismatched opening ledgers', () => {
    const request = createOptimizerRequest();
    const normalized = request.openingPvpByMember.root!;
    const engineOpening = request.organization.openingStateByMember.root!;
    const withNormalized = (
      value: unknown,
    ): AutomaticPlanRequest =>
      invalidRequest(request, {
        openingPvpByMember: { root: value } as AutomaticPlanRequest['openingPvpByMember'],
      });
    const withEngine = (value: unknown): AutomaticPlanRequest =>
      invalidRequest(request, {
        organization: {
          ...request.organization,
          openingStateByMember: { root: value } as Readonly<Record<string, OpeningStateInput>>,
        },
      });
    const variants: AutomaticPlanRequest[] = [
      invalidRequest(request, { openingPvpByMember: {} }),
      invalidRequest(request, { openingPvpByMember: { unknown: normalized } }),
      withNormalized(undefined),
      withEngine(undefined),
      withNormalized({ cumulativePvpOpening: -1 }),
      withNormalized({ cumulativePvpOpening: 2_401 }),
      withNormalized({ cumulativePvpOpening: 1 }),
      withEngine({ ...engineOpening, openingQualificationPvp: 1 }),
      withEngine({ ...engineOpening, fortnightPvpOpeningCredit: 1 }),
      withEngine({ ...engineOpening, dailyCarryPvp: 1 }),
      withEngine({ ...engineOpening, dailyCarryLeft: -1 }),
      withEngine({ ...engineOpening, dailyCarryRight: -1 }),
    ];
    for (const variant of variants) {
      expect(validateAutomaticPlanRequest(variant)).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_OPENING_STATE_INVALID' },
      });
    }
  });

  it('returns request failures and rejects sparse, unknown, structural, and scalar cells', () => {
    const request = createOptimizerRequest();
    const cells = constructive(request).allocations;
    expect(
      validateAutomaticPlanCandidateShape(
        invalidRequest(request, { problemFingerprint: '' }),
        cells,
      ),
    ).toMatchObject({ status: 'FAILURE', error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' } });

    const sparse = Array.from(cells) as NormalizedAllocationCell[];
    delete sparse[0];
    expect(validateAutomaticPlanCandidateShape(request, sparse)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CANDIDATE_ORDER_INVALID' },
    });
    expect(
      validateAutomaticPlanCandidateShape(request, [
        { ...cells[0]!, unknown: 1 } as NormalizedAllocationCell,
        ...cells.slice(1),
      ]),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID' },
    });
    for (const patch of [
      { selfLeft: undefined },
      { selfRight: undefined },
      { pvp: 0.5 },
      { selfLeft: -1 },
      { selfRight: Number.NaN },
    ]) {
      const patched = { ...cells[0]!, ...patch } as NormalizedAllocationCell;
      if (patch.selfLeft === undefined) delete (patched as { selfLeft?: number }).selfLeft;
      if (patch.selfRight === undefined) delete (patched as { selfRight?: number }).selfRight;
      expect(
        validateAutomaticPlanCandidateShape(request, [patched, ...cells.slice(1)]),
      ).toMatchObject({ status: 'FAILURE' });
    }

    const sundayIndex = cells.findIndex((cell) =>
      request.calendar.skipDateSet.includes(cell.date),
    );
    for (const patch of [{ selfLeft: 1 }, { selfRight: 1 }]) {
      expect(
        validateAutomaticPlanCandidateShape(
          request,
          replaceCell(cells, sundayIndex, patch),
        ),
      ).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_SKIPPED_DATE_NONZERO' },
      });
    }
  });
});

describe('optimizer arithmetic, construction, objective, and oracle defenses', () => {
  it('rejects invalid identities, stale fingerprints, malformed shapes, engine failures, and unmet targets', () => {
    const request = createOptimizerRequest();
    const raw = constructive(request);
    for (const identity of [
      { ...IDENTITY, candidateId: ' ' },
      { ...IDENTITY, sequence: -1 },
      { ...IDENTITY, foundAtElapsedMs: -1 },
    ]) {
      expect(verifyAutomaticPlanCandidate(request, raw, identity)).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' },
      });
    }
    expect(
      verifyAutomaticPlanCandidate(
        request,
        { ...raw, problemFingerprint: 'stale' },
        IDENTITY,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_FINGERPRINT_MISMATCH' },
    });
    expect(
      verifyAutomaticPlanCandidate(
        request,
        { ...raw, allocations: raw.allocations.slice(1) },
        IDENTITY,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID' },
    });

    const firstBusinessIndex = raw.allocations.findIndex(
      (cell) => !request.calendar.skipDateSet.includes(cell.date),
    );
    expect(
      verifyAutomaticPlanCandidate(
        request,
        {
          ...raw,
          allocations: replaceCell(raw.allocations, firstBusinessIndex, {
            pvp: Number.MAX_SAFE_INTEGER,
          }),
        },
        IDENTITY,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_ENGINE_REJECTED' },
    });

    const zeroAllocations = raw.allocations.map((cell) => ({
      ...cell,
      pvp: 0,
      ...(Object.hasOwn(cell, 'selfLeft') ? { selfLeft: 0 } : {}),
      ...(Object.hasOwn(cell, 'selfRight') ? { selfRight: 0 } : {}),
    }));
    expect(
      verifyAutomaticPlanCandidate(
        request,
        { ...raw, allocations: zeroAllocations },
        IDENTITY,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_TARGET_UNMET' },
    });
  });

  it('covers multiply, subtract, iterable sum, and safe error conversion', () => {
    expect(checkedMultiplyScore(4, 5)).toBe(20);
    expect(() => checkedMultiplyScore(Number.MAX_SAFE_INTEGER, 2)).toThrow(
      AutomaticPlanRangeError,
    );
    expect(checkedSubtractScore(5, 4)).toBe(1);
    expect(() => checkedSubtractScore(4, 5)).toThrow(AutomaticPlanRangeError);
    expect(checkedSumScores(new Set([1, 2, 3]))).toBe(6);
    expect(errorFromUnknown(new AutomaticPlanRangeError('range'))).toMatchObject({
      code: 'OPTIMIZATION_SCORE_OUT_OF_RANGE',
      message: 'range',
    });
    expect(errorFromUnknown(new TypeError('opaque'))).toMatchObject({
      code: 'AUTOMATIC_PLAN_INTERNAL_ERROR',
    });
  });

  it('rejects invalid requests in construction/model and invalid model bounds', () => {
    const request = createOptimizerRequest();
    const invalid = invalidRequest(request, { problemFingerprint: '' });
    expect(buildConstructiveCandidate(invalid)).toMatchObject({ status: 'FAILURE' });
    expect(buildVerifiedConstructiveCandidate(invalid, IDENTITY)).toMatchObject({
      status: 'FAILURE',
    });
    expect(createAutomaticPlanModel(invalid, 1)).toMatchObject({ status: 'FAILURE' });
    for (const upperBound of [-1, -0, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(createAutomaticPlanModel(request, upperBound)).toMatchObject({
        status: 'FAILURE',
        error: { code: 'OPTIMIZATION_SCORE_OUT_OF_RANGE' },
      });
    }
  });

  it('constructs zero and same-day cumulative-PVP threshold deficits deterministically', () => {
    const fullyOpened = optimizerOpening({
      openingQualificationPvp: 700,
      fortnightPvpOpeningCredit: 700,
    });
    const zeroRequest = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({ root: fullyOpened }),
    );
    expect(constructive(zeroRequest).allocations.find((cell) => cell.pvp > 0)).toBeUndefined();

    const qualificationRequest = createOptimizerRequest(
      [optimizerMember('root')],
      Object.freeze({
        root: optimizerOpening({
          openingQualificationPvp: 33,
          fortnightPvpOpeningCredit: 33,
        }),
      }),
    );
    const firstBusiness = constructive(qualificationRequest).allocations.find(
      (cell) => !qualificationRequest.calendar.skipDateSet.includes(cell.date),
    );
    expect(firstBusiness?.pvp).toBe(267);
  });

  it('rejects a FULL_COMMISSION settlement without a tier', () => {
    const candidate = verifiedFixture();
    const settlement = Object.values(
      candidate.calculation.dailySettlementByDateAndMember,
    )
      .flatMap((byMember) => Object.values(byMember))
      .find((item) => item.settlementKind === 'FULL_COMMISSION')!;
    expect(() =>
      discardedExcessForSettlement({ ...settlement, commissionTier: null }),
    ).toThrow(TypeError);
  });

  it('rejects unsorted objectives and exercises prefix-length comparison validation', () => {
    const unsorted: AutomaticPlanObjectiveVector = {
      totalNewPv: 1,
      confirmedPayoutWon: 0,
      discardedExcessPv: 0,
      highTargetAscendingDayVector: [],
      target700AscendingDayVector: [8, 7],
      futureCumulativePvpInvestmentPv: 0,
      nonHundredCellCount: 1,
      maxDirectPvp: 1,
      deterministicAllocationVector: [1],
    };
    expect(() => assertValidAutomaticPlanObjective(unsorted)).toThrow(TypeError);
  });

  it('returns shape, internal, and safe-range objective failures', () => {
    const request = createOptimizerRequest();
    const candidate = verifiedFixture(request);
    expect(
      evaluateAutomaticPlanObjective(
        request,
        candidate.allocations.slice(1),
        candidate.calculation,
      ),
    ).toMatchObject({ status: 'FAILURE', error: { code: 'AUTOMATIC_PLAN_CANDIDATE_SHAPE_INVALID' } });

    const missingSettlements = {
      ...candidate.calculation,
      dailySettlementByDateAndMember: {},
    } as CalculationResult;
    expect(
      evaluateAutomaticPlanObjective(request, candidate.allocations, missingSettlements),
    ).toMatchObject({ status: 'FAILURE', error: { code: 'AUTOMATIC_PLAN_INTERNAL_ERROR' } });

    const businessIndexes = candidate.allocations
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => !request.calendar.skipDateSet.includes(cell.date))
      .slice(0, 2)
      .map(({ index }) => index);
    let overflowing = replaceCell(candidate.allocations, businessIndexes[0]!, {
      pvp: Number.MAX_SAFE_INTEGER,
    });
    overflowing = replaceCell(overflowing, businessIndexes[1]!, { pvp: 30 });
    expect(
      evaluateAutomaticPlanObjective(request, overflowing, candidate.calculation),
    ).toMatchObject({ status: 'FAILURE', error: { code: 'OPTIMIZATION_SCORE_OUT_OF_RANGE' } });
  });

  it('covers non-700 and non-hundred objective metrics', () => {
    const target1500Request = createOptimizerRequest(
      [optimizerMember('root', null, null, 1500)],
      Object.freeze({ root: optimizerOpening() }),
    );
    const target1500 = verifiedFixture(target1500Request);
    expect(target1500.objective.highTargetAscendingDayVector).toHaveLength(1);
    expect(target1500.objective.target700AscendingDayVector).toEqual([]);

    const request = createOptimizerRequest();
    const raw = constructive(request);
    const firstBusinessIndex = raw.allocations.findIndex(
      (cell) => !request.calendar.skipDateSet.includes(cell.date),
    );
    const verified = verifyAutomaticPlanCandidate(
      request,
      {
        problemFingerprint: request.problemFingerprint,
        allocations: replaceCell(raw.allocations, firstBusinessIndex, { pvp: 701 }),
      },
      { ...IDENTITY, candidateId: 'non-hundred' },
    );
    expect(verified).toMatchObject({ status: 'SUCCESS' });
    if (verified.status === 'SUCCESS') {
      expect(verified.candidate.objective.nonHundredCellCount).toBe(1);
    }
  });

  it('covers invalid, empty, zero-limit, invalid-domain, and infeasible oracle paths', () => {
    const request = createOptimizerRequest();
    expect(
      searchTinyAutomaticPlan(invalidRequest(request, { problemFingerprint: '' }), {
        defaultDomain: [0],
        maxCombinations: 1,
      }),
    ).toMatchObject({ status: 'FAILURE', error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' } });
    for (const options of [
      { defaultDomain: [0], maxCombinations: 0 },
      { defaultDomain: [], maxCombinations: 1 },
      { defaultDomain: [-1], maxCombinations: 1 },
    ]) {
      expect(searchTinyAutomaticPlan(request, options)).toMatchObject({ status: 'FAILURE' });
    }
    expect(
      searchTinyAutomaticPlan(request, {
        defaultDomain: [0, 0],
        maxCombinations: 1,
        candidateIdPrefix: 'no-feasible',
      }),
    ).toMatchObject({
      status: 'SUCCESS',
      bestCandidate: null,
      evaluatedCandidateCount: 1,
    });
  });
});

describe('optimizer certificate and run-state defensive coverage', () => {
  it('rejects every certificate metadata and evidence failure family', () => {
    const request = createOptimizerRequest();
    const metadata: Partial<ModelCertificate>[] = [
      { certificateVersion: 'x' as typeof AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION },
      { modelVersion: 'x' as typeof AUTOMATIC_PLAN_MODEL_VERSION },
      { fingerprintVersion: 'x' as typeof AUTOMATIC_PLAN_FINGERPRINT_VERSION },
      { rulesetVersion: 'x' as typeof AUTOMATIC_PLAN_RULESET_VERSION },
      { engineVersion: 'x' as typeof AUTOMATIC_PLAN_ENGINE_VERSION },
      { policyVersion: 'x' as typeof AUTOMATIC_PLAN_POLICY_VERSION },
      { objectiveVersion: 'x' as typeof AUTOMATIC_PLAN_OBJECTIVE_VERSION },
      { calendarVersion: 'x' as typeof AUTOMATIC_PLAN_CALENDAR_VERSION },
      { certificateId: ' ' },
      { modelImplementationId: ' ' },
      { solverAdapterId: ' ' },
      { solverAdapterVersion: ' ' },
      { integerSemantics: 'FLOAT' as ModelCertificate['integerSemantics'] },
    ];
    for (const patch of metadata) {
      expect(certifyModelCertificate(request, certificate(patch))).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH' },
      });
    }
    for (const evidenceKey of Object.keys(certificate().evidence) as Array<
      keyof ModelCertificate['evidence']
    >) {
      expect(
        certifyModelCertificate(
          request,
          certificate({
            evidence: { ...certificate().evidence, [evidenceKey]: false },
          }),
        ),
      ).toMatchObject({ status: 'FAILURE' });
    }
    expect(
      certifyModelCertificate(
        invalidRequest(request, { problemFingerprint: '' }),
        certificate(),
      ),
    ).toMatchObject({ status: 'FAILURE' });
  });

  it('rejects each incomplete proof progress family', () => {
    const request = createOptimizerRequest();
    const certified = certifyModelCertificate(request, certificate());
    if (certified.status !== 'SUCCESS') throw new Error('certificate fixture failed');
    const coordinateCount = deriveAutomaticPlanCoordinates(request).length;
    const valid: AutomaticPlanProofProgress = {
      stage: 'COMPLETE',
      provenScalarObjectiveCount: AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT,
      provenVectorPrefix: {
        objective: 'DETERMINISTIC_ALLOCATION_VECTOR',
        length: coordinateCount,
      },
      primaryLowerBound: 5_700,
    };
    const variants: AutomaticPlanProofProgress[] = [
      { ...valid, stage: 'TOTAL_NEW_PV' },
      {
        ...valid,
        provenScalarObjectiveCount:
          AUTOMATIC_PLAN_PROVEN_SCALAR_OBJECTIVE_COUNT - 1,
      },
      { ...valid, provenVectorPrefix: null },
      {
        ...valid,
        provenVectorPrefix: {
          objective: 'TARGET_700_ASCENDING_VECTOR',
          length: coordinateCount,
        },
      },
      {
        ...valid,
        provenVectorPrefix: {
          objective: 'DETERMINISTIC_ALLOCATION_VECTOR',
          length: -1,
        },
      },
      {
        ...valid,
        provenVectorPrefix: {
          objective: 'DETERMINISTIC_ALLOCATION_VECTOR',
          length: coordinateCount - 1,
        },
      },
      { ...valid, primaryLowerBound: -1 },
      { ...valid, primaryLowerBound: null },
    ];
    for (const progress of variants) {
      expect(
        certifyCompleteProof(request, certified.certificate, progress, 'OPTIMAL'),
      ).toMatchObject({
        status: 'FAILURE',
        error: { code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE' },
      });
    }
  });

  it('guards elapsed time and mismatched optimal/infeasible proof state', () => {
    const fixture = certifiedFixture();
    expect(
      createOptimalAutomaticPlanRunState(
        fixture.request,
        fixture.candidate,
        fixture.certificate,
        fixture.proof,
        -1,
      ),
    ).toMatchObject({ status: 'FAILURE', error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' } });
    expect(
      createOptimalAutomaticPlanRunState(
        fixture.request,
        { ...fixture.candidate, problemFingerprint: 'stale' },
        fixture.certificate,
        fixture.proof,
        0,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH' },
    });

    const infeasibleProof = certifyCompleteProof(
      fixture.request,
      fixture.certificate,
      {
        ...fixture.proof.progress,
        primaryLowerBound: null,
      },
      'INFEASIBLE',
    );
    if (infeasibleProof.status !== 'SUCCESS') throw new Error('infeasible proof failed');
    expect(
      createInfeasibleAutomaticPlanRunState(
        fixture.request,
        fixture.certificate,
        infeasibleProof.proof,
        -1,
      ),
    ).toMatchObject({ status: 'FAILURE', error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' } });
    expect(
      createInfeasibleAutomaticPlanRunState(
        { ...fixture.request, problemFingerprint: 'stale' },
        fixture.certificate,
        infeasibleProof.proof,
        0,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH' },
    });
  });

  it('covers invalid and successful unproven/failed state factories', () => {
    const proof = createInitialAutomaticPlanProofProgress();
    expect(
      createUnprovenAutomaticPlanRunState('RUNNING', -0, null, proof, 'RUNNING'),
    ).toMatchObject({ status: 'FAILURE' });
    const error = automaticPlanError('AUTOMATIC_PLAN_PROOF_INCOMPLETE', 'incomplete');
    expect(createFailedAutomaticPlanRunState(-1, null, proof, error, 'FAILED')).toMatchObject({
      status: 'FAILURE',
    });
    expect(createFailedAutomaticPlanRunState(10, null, proof, error, 'FAILED')).toMatchObject({
      status: 'SUCCESS',
      state: { status: 'FAILED', error },
    });
  });
});

describe('50-member first-candidate scale path', () => {
  it('builds and verifies a normalized 50-member binary tree', () => {
    const members = Array.from({ length: 50 }, (_, index) => {
      if (index === 0) return optimizerMember('member-0');
      const parentIndex = Math.floor((index - 1) / 2);
      return optimizerMember(
        `member-${index}`,
        `member-${parentIndex}`,
        index % 2 === 1 ? 'LEFT' : 'RIGHT',
      );
    });
    const openings = Object.freeze(
      Object.fromEntries(
        members.map((member) => [member.memberKey, optimizerOpening()]),
      ),
    );
    const request = createOptimizerRequest(members, openings);
    const startedAt = performance.now();
    const built = buildConstructiveCandidate(request);
    expect(built.status).toBe('SUCCESS');
    if (built.status !== 'SUCCESS') return;
    const verified = verifyAutomaticPlanCandidate(request, built.candidate, {
      candidateId: 'fifty-member-first-candidate',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    const elapsedMs = performance.now() - startedAt;
    console.info(`50-member constructive+verify elapsed: ${elapsedMs.toFixed(2)} ms`);
    expect(verified).toMatchObject({ status: 'SUCCESS' });
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
