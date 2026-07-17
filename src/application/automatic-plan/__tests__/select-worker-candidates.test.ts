import { describe, expect, it } from 'vitest';
import {
  buildConstructiveCandidate,
  type AutomaticPlanConstructionOutcome,
} from '../../../optimizer';
import { createAutomaticPlanRequest } from '../create-request';
import {
  assessWorkerCandidateSources,
  workerTerminalFailure,
} from '../select-worker-candidates';
import { createAutomaticPlanBundle } from './fixtures';

function fixture() {
  const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
  if (normalized.status === 'FAILURE') throw new Error('request fixture failed');
  const built = buildConstructiveCandidate(normalized.request);
  if (built.status === 'FAILURE') throw new Error('candidate fixture failed');
  return { request: normalized.request, valid: built };
}

describe('automatic-plan worker candidate preflight', () => {
  it('keeps the first verification failure and never claims an absent plan is usable', () => {
    const { request, valid } = fixture();
    const invalid: AutomaticPlanConstructionOutcome = Object.freeze({
      status: 'SUCCESS',
      candidate: Object.freeze({
        problemFingerprint: request.problemFingerprint,
        allocations: Object.freeze(valid.candidate.allocations.map((cell) =>
          Object.freeze({
            ...cell,
            pvp: 0,
            ...(cell.selfLeft === undefined ? {} : { selfLeft: 0 }),
            ...(cell.selfRight === undefined ? {} : { selfRight: 0 }),
          })
        )),
      }),
    });

    const assessment = assessWorkerCandidateSources(request, [invalid]);
    expect(assessment.publishableCandidates).toEqual([]);
    expect(assessment.firstFailure?.code).toBe('AUTOMATIC_PLAN_TARGET_UNMET');
    const terminal = workerTerminalFailure(assessment);
    expect(terminal.messageCode).toBe('CONSTRUCTIVE_PLAN_FAILED');
    expect(terminal.error).toBe(assessment.firstFailure);
    expect(terminal.error.message).not.toContain('계획은 사용할 수 있습니다');
  });

  it('publishes only verified sources and limits proof wording to a surviving plan', () => {
    const { request, valid } = fixture();
    const constructionFailure: AutomaticPlanConstructionOutcome = Object.freeze({
      status: 'FAILURE',
      error: Object.freeze({
        code: 'AUTOMATIC_PLAN_CONSTRUCTION_FAILED',
        message: '첫 번째 실제 실패',
      }),
    });
    const assessment = assessWorkerCandidateSources(request, [
      constructionFailure,
      valid,
    ]);

    expect(assessment.publishableCandidates).toEqual([valid.candidate]);
    expect(assessment.firstFailure).toBe(constructionFailure.error);
    const terminal = workerTerminalFailure(assessment);
    expect(terminal.messageCode).toBe('EXACT_PROOF_BACKEND_UNAVAILABLE');
    expect(terminal.error.message).toBe(
      '정확한 최소값 확인만 중단됐습니다. 찾은 검증 계획은 사용할 수 있습니다.',
    );
  });
});
