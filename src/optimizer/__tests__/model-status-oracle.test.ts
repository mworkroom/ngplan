import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_PLAN_CALENDAR_VERSION,
  AUTOMATIC_PLAN_ENGINE_VERSION,
  AUTOMATIC_PLAN_FINGERPRINT_VERSION,
  AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
  AUTOMATIC_PLAN_MODEL_VERSION,
  AUTOMATIC_PLAN_OBJECTIVE_VERSION,
  AUTOMATIC_PLAN_POLICY_VERSION,
  AUTOMATIC_PLAN_RULESET_VERSION,
  automaticPlanCoordinateKey,
  buildVerifiedConstructiveCandidate,
  certifyCompleteProof,
  certifyModelCertificate,
  createAutomaticPlanModel,
  deriveAutomaticPlanCoordinates,
  createInfeasibleAutomaticPlanRunState,
  createInitialAutomaticPlanProofProgress,
  createOptimalAutomaticPlanRunState,
  createUnprovenAutomaticPlanRunState,
  searchTinyAutomaticPlan,
  type AutomaticPlanProofProgress,
  type ModelCertificate,
} from '..';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

function certificate(overrides: Partial<ModelCertificate> = {}): ModelCertificate {
  return {
    certificateVersion: AUTOMATIC_PLAN_MODEL_CERTIFICATE_VERSION,
    certificateId: 'model-cert-1',
    modelVersion: AUTOMATIC_PLAN_MODEL_VERSION,
    modelImplementationId: 'test-exact-model',
    fingerprintVersion: AUTOMATIC_PLAN_FINGERPRINT_VERSION,
    rulesetVersion: AUTOMATIC_PLAN_RULESET_VERSION,
    engineVersion: AUTOMATIC_PLAN_ENGINE_VERSION,
    policyVersion: AUTOMATIC_PLAN_POLICY_VERSION,
    objectiveVersion: AUTOMATIC_PLAN_OBJECTIVE_VERSION,
    calendarVersion: AUTOMATIC_PLAN_CALENDAR_VERSION,
    solverAdapterId: 'test-exact-solver',
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

function completeProgress(
  vectorLength: number,
  primaryLowerBound: number | null,
): AutomaticPlanProofProgress {
  return {
    stage: 'COMPLETE',
    provenScalarObjectiveCount: 5,
    provenVectorPrefix: {
      objective: 'DETERMINISTIC_ALLOCATION_VECTOR',
      length: vectorLength,
    },
    primaryLowerBound,
  };
}

describe('Phase 4 model certificate and truthful statuses', () => {
  it('MODEL-004 refuses an incomplete evidence package', () => {
    const request = createOptimizerRequest();
    const incomplete = certificate({
      evidence: { ...certificate().evidence, completeness: false },
    });
    expect(certifyModelCertificate(request, incomplete)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH' },
    });
  });

  it('MODEL-004 refuses a certificate with missing evidence fields', () => {
    const request = createOptimizerRequest();
    const missingEvidence = certificate({
      evidence: {} as ModelCertificate['evidence'],
    });
    expect(certifyModelCertificate(request, missingEvidence)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH' },
    });
  });

  it('MODEL-001 creates only a neutral bounded model skeleton', () => {
    const request = createOptimizerRequest();
    const outcome = createAutomaticPlanModel(request, 5_700);
    expect(outcome.status).toBe('SUCCESS');
    if (outcome.status !== 'SUCCESS') return;
    expect(outcome.model.objectiveStages).toEqual([
      'TOTAL_NEW_PV',
      'DISCARDED_EXCESS',
      'TARGET_700_AT_LEAST_EIGHT',
      'TARGET_700_ASCENDING_VECTOR',
      'NON_HUNDRED_CELLS',
      'MAX_DIRECT_PVP',
      'DETERMINISTIC_ALLOCATION_VECTOR',
    ]);
    expect(
      outcome.model.variableBounds
        .filter((bound) => request.calendar.skipDateSet.includes(bound.coordinate.date))
        .every((bound) => bound.maximum === 0),
    ).toBe(true);
  });

  it('STATUS-002 permits OPTIMAL only with matching certified optimal proof', () => {
    const request = createOptimizerRequest();
    const candidate = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'verified',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    const certified = certifyModelCertificate(request, certificate());
    expect(candidate.status).toBe('SUCCESS');
    expect(certified.status).toBe('SUCCESS');
    if (candidate.status !== 'SUCCESS' || certified.status !== 'SUCCESS') return;
    const proof = certifyCompleteProof(
      request,
      certified.certificate,
      completeProgress(
        candidate.candidate.objective.deterministicAllocationVector.length,
        candidate.candidate.objective.totalNewPv,
      ),
      'OPTIMAL',
    );
    expect(proof.status).toBe('SUCCESS');
    if (proof.status !== 'SUCCESS') return;
    expect(
      createOptimalAutomaticPlanRunState(
        request,
        candidate.candidate,
        certified.certificate,
        proof.proof,
        10,
      ),
    ).toMatchObject({ status: 'SUCCESS', state: { status: 'OPTIMAL' } });
    expect(
      createInfeasibleAutomaticPlanRunState(
        request,
        certified.certificate,
        proof.proof,
        10,
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MODEL_CERTIFICATE_MISMATCH' },
    });
  });

  it('STATUS-002 permits INFEASIBLE only with its matching certified conclusion', () => {
    const request = createOptimizerRequest();
    const certified = certifyModelCertificate(request, certificate());
    if (certified.status !== 'SUCCESS') throw new Error('certificate fixture failed');
    const proof = certifyCompleteProof(
      request,
      certified.certificate,
      completeProgress(deriveAutomaticPlanCoordinates(request).length, null),
      'INFEASIBLE',
    );
    if (proof.status !== 'SUCCESS') throw new Error('proof fixture failed');
    expect(
      createInfeasibleAutomaticPlanRunState(
        request,
        certified.certificate,
        proof.proof,
        10,
      ),
    ).toMatchObject({
      status: 'SUCCESS',
      state: { status: 'INFEASIBLE', bestCandidate: null },
    });
  });

  it('STATUS-002 refuses a COMPLETE proof with only a vector prefix', () => {
    const request = createOptimizerRequest();
    const certified = certifyModelCertificate(request, certificate());
    if (certified.status !== 'SUCCESS') throw new Error('certificate fixture failed');
    expect(
      certifyCompleteProof(
        request,
        certified.certificate,
        completeProgress(1, 5_700),
        'OPTIMAL',
      ),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_PROOF_INCOMPLETE' },
    });
  });

  it('STATUS-001/003/004 keeps an unproven candidate inside non-proof states', () => {
    const request = createOptimizerRequest();
    const candidate = buildVerifiedConstructiveCandidate(request, {
      candidateId: 'incumbent',
      sequence: 1,
      foundAtElapsedMs: 0,
    });
    if (candidate.status !== 'SUCCESS') throw new Error('candidate fixture failed');
    const state = createUnprovenAutomaticPlanRunState(
      'TIME_LIMIT',
      1_800_000,
      candidate.candidate,
      createInitialAutomaticPlanProofProgress(),
      'BEST_VERIFIED_UNPROVEN',
    );
    expect(state).toMatchObject({
      status: 'SUCCESS',
      state: { status: 'TIME_LIMIT', bestCandidate: { candidateId: 'incumbent' } },
    });
    if (state.status === 'SUCCESS') {
      expect(state.state.status).not.toBe('FEASIBLE');
    }
  });
});

describe('bounded tiny exhaustive oracle', () => {
  it('ORACLE-001 selects the lower-total candidate inside exact finite domains', () => {
    const request = createOptimizerRequest();
    const firstDate = request.calendar.dates.find(
      (date) => !request.calendar.skipDateSet.includes(date),
    )!;
    const domainByCoordinate = {
      [automaticPlanCoordinateKey({ date: firstDate, memberKey: 'root', field: 'PVP' })]: [
        700,
        800,
      ],
      [automaticPlanCoordinateKey({
        date: firstDate,
        memberKey: 'root',
        field: 'SELF_LEFT',
      })]: [2_500],
      [automaticPlanCoordinateKey({
        date: firstDate,
        memberKey: 'root',
        field: 'SELF_RIGHT',
      })]: [2_500],
    };
    const searched = searchTinyAutomaticPlan(request, {
      defaultDomain: [0],
      domainByCoordinate,
      maxCombinations: 2,
    });
    expect(searched.status).toBe('SUCCESS');
    if (searched.status !== 'SUCCESS') return;
    expect(searched.completeWithinBounds).toBe(true);
    expect(searched.evaluatedCandidateCount).toBe(2);
    expect(searched.bestCandidate?.objective.totalNewPv).toBe(5_700);
    expect(searched).not.toHaveProperty('proof');
  });

  it('ORACLE-003 stops before enumeration when the bounded product exceeds the guard', () => {
    const request = createOptimizerRequest();
    expect(
      searchTinyAutomaticPlan(request, {
        defaultDomain: [0, 1],
        maxCombinations: 1,
      }),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_ORACLE_LIMIT_EXCEEDED' },
    });
  });

  it('ORACLE-003 reports the guard instead of overflowing the combination score', () => {
    const members = [
      optimizerMember('root'),
      optimizerMember('left', 'root', 'LEFT'),
    ];
    const request = createOptimizerRequest(
      members,
      Object.freeze({ root: optimizerOpening(), left: optimizerOpening() }),
    );
    expect(
      searchTinyAutomaticPlan(request, {
        defaultDomain: [0, 1],
        maxCombinations: Number.MAX_SAFE_INTEGER,
      }),
    ).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_ORACLE_LIMIT_EXCEEDED' },
    });
  });
});
