import {
  buildConstructiveCandidate,
  verifyAutomaticPlanCandidate,
  type AutomaticPlanRequest,
  type VerifiedAutomaticPlanCandidate,
} from '../../../optimizer';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_PLAN_CHECKPOINT_VERSION,
  createAutomaticPlanCheckpointSnapshot,
  restoreAutomaticPlanCheckpointSnapshot,
} from '../checkpoint';
import { createAutomaticPlanCandidateId } from '../candidate-identity';
import { createAutomaticPlanRequest } from '../create-request';
import { createAutomaticPlanBundle } from './fixtures';

function verifiedFixture(): {
  readonly request: AutomaticPlanRequest;
  readonly candidate: VerifiedAutomaticPlanCandidate;
} {
  const requestOutcome = createAutomaticPlanRequest(createAutomaticPlanBundle());
  if (requestOutcome.status !== 'SUCCESS') throw new Error(requestOutcome.error.message);
  const built = buildConstructiveCandidate(requestOutcome.request);
  if (built.status !== 'SUCCESS') throw new Error(built.error.message);
  const candidateId = createAutomaticPlanCandidateId(
    requestOutcome.request.problemFingerprint,
    1,
    built.candidate.allocations,
  );
  const verified = verifyAutomaticPlanCandidate(requestOutcome.request, built.candidate, {
    candidateId,
    sequence: 1,
    foundAtElapsedMs: 12,
  });
  if (verified.status !== 'SUCCESS') throw new Error(verified.error.message);
  return { request: requestOutcome.request, candidate: verified.candidate };
}

describe('verified automatic-plan workspace checkpoint', () => {
  it('contains only compatibility data and is re-verified on restore', () => {
    const fixture = verifiedFixture();
    const snapshot = createAutomaticPlanCheckpointSnapshot(
      fixture.candidate,
      new Date(0),
    );
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('dailySettlementByDateAndMember');
    expect(serialized).not.toContain('proof');
    expect(snapshot.checkpointVersion).toBe('2.0.0');
    expect(snapshot.checkpointVersion).toBe(AUTOMATIC_PLAN_CHECKPOINT_VERSION);
    expect(snapshot.objective).toMatchObject({
      confirmedPayoutWon: expect.any(Number),
      futureCumulativePvpInvestmentPv: expect.any(Number),
    });
    expect(snapshot.objective.highTargetAscendingDayVector).toEqual(
      fixture.candidate.objective.highTargetAscendingDayVector,
    );
    expect(snapshot.objective).not.toHaveProperty(
      'target700MembersAtLeastEight',
    );
    expect(snapshot.display).toMatchObject({
      target700MembersAtLeastEight: expect.any(Number),
      highTargetMemberDayCounts: expect.any(Array),
    });
    expect(snapshot.savedAtIso).toBe('1970-01-01T00:00:00.000Z');

    const restored = restoreAutomaticPlanCheckpointSnapshot(
      fixture.request,
      JSON.parse(serialized),
    );
    expect(restored.status).toBe('RESTORED');
    if (restored.status === 'RESTORED') {
      expect(restored.candidate.candidateId).toBe(fixture.candidate.candidateId);
      expect(restored.candidate.calculation.engineVersion).toBe('5.0.0');
    }
  });

  it('ignores empty, malformed, incompatible, and tampered snapshots', () => {
    const fixture = verifiedFixture();
    expect(restoreAutomaticPlanCheckpointSnapshot(fixture.request, null)).toEqual({
      status: 'EMPTY',
    });
    expect(restoreAutomaticPlanCheckpointSnapshot(fixture.request, { broken: true })).toMatchObject({
      status: 'IGNORED', reason: 'CHECKPOINT_MALFORMED',
    });

    const snapshot = createAutomaticPlanCheckpointSnapshot(fixture.candidate);
    expect(
      restoreAutomaticPlanCheckpointSnapshot(fixture.request, {
        ...snapshot,
        checkpointVersion: '1.1.0',
      }),
    ).toMatchObject({
      status: 'IGNORED', reason: 'CHECKPOINT_MALFORMED',
    });
    const incompatible = { ...fixture.request, problemFingerprint: 'another-problem' };
    expect(restoreAutomaticPlanCheckpointSnapshot(incompatible, snapshot)).toMatchObject({
      status: 'IGNORED', reason: 'CHECKPOINT_FINGERPRINT_MISMATCH',
    });

    expect(restoreAutomaticPlanCheckpointSnapshot(fixture.request, {
      ...snapshot,
      candidateId: 'tampered',
    })).toMatchObject({
      status: 'IGNORED', reason: 'CHECKPOINT_IDENTITY_MISMATCH',
    });
  });

  it('rejects a checkpoint whose canonical summary was modified', () => {
    const fixture = verifiedFixture();
    const snapshot = createAutomaticPlanCheckpointSnapshot(fixture.candidate);
    const tampered = {
      ...snapshot,
      display: {
        ...snapshot.display,
        target700TotalCommissionDays:
          snapshot.display.target700TotalCommissionDays + 1,
      },
    };
    expect(
      restoreAutomaticPlanCheckpointSnapshot(fixture.request, tampered),
    ).toMatchObject({ status: 'IGNORED', reason: 'CHECKPOINT_SUMMARY_MISMATCH' });
  });

  it('rejects a version-2 checkpoint carrying the legacy objective shape', () => {
    const fixture = verifiedFixture();
    const snapshot = createAutomaticPlanCheckpointSnapshot(fixture.candidate);
    const legacyObjective = {
      totalNewPv: snapshot.objective.totalNewPv,
      discardedExcessPv: snapshot.objective.discardedExcessPv,
      target700MembersAtLeastEight:
        snapshot.display.target700MembersAtLeastEight,
      target700AscendingDayVector:
        snapshot.objective.target700AscendingDayVector,
      nonHundredCellCount: snapshot.objective.nonHundredCellCount,
      maxDirectPvp: snapshot.objective.maxDirectPvp,
      deterministicAllocationVector:
        snapshot.objective.deterministicAllocationVector,
    };
    expect(
      restoreAutomaticPlanCheckpointSnapshot(fixture.request, {
        ...snapshot,
        objective: legacyObjective,
      }),
    ).toMatchObject({
      status: 'IGNORED',
      reason: 'AUTOMATIC_PLAN_OBJECTIVE_MISMATCH',
    });
  });

  it('ignores a re-identified checkpoint whose allocations fail independent verification', () => {
    const fixture = verifiedFixture();
    const snapshot = createAutomaticPlanCheckpointSnapshot(fixture.candidate);
    const allocations = snapshot.allocations.map((cell, index) =>
      index === 0 ? { ...cell, pvp: cell.pvp + 1 } : cell,
    );
    const tampered = {
      ...snapshot,
      allocations,
      candidateId: createAutomaticPlanCandidateId(
        fixture.request.problemFingerprint,
        snapshot.sequence,
        allocations,
      ),
    };

    expect(
      restoreAutomaticPlanCheckpointSnapshot(fixture.request, tampered),
    ).toMatchObject({ status: 'IGNORED' });
  });
});
