import { createManualPlanDraft } from '../../manual-plan';
import {
  buildConstructiveCandidate,
  verifyAutomaticPlanCandidate,
  type VerifiedAutomaticPlanCandidate,
} from '../../../optimizer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyVerifiedAutomaticPlanCandidate } from '../apply-candidate';
import { createAutomaticPlanCandidateId } from '../candidate-identity';
import { createAutomaticPlanRequest } from '../create-request';
import { createAutomaticPlanBundle } from './fixtures';

const mocks = vi.hoisted(() => ({
  convert: vi.fn(),
}));

vi.mock('../../manual-plan', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../manual-plan')>()),
  convertVerifiedAllocationsToManualPlanDraft: mocks.convert,
}));

function verifiedCandidate(): VerifiedAutomaticPlanCandidate {
  const normalized = createAutomaticPlanRequest(createAutomaticPlanBundle());
  if (normalized.status !== 'SUCCESS') throw new Error(normalized.error.message);
  const built = buildConstructiveCandidate(normalized.request);
  if (built.status !== 'SUCCESS') throw new Error(built.error.message);
  const verified = verifyAutomaticPlanCandidate(normalized.request, built.candidate, {
    candidateId: createAutomaticPlanCandidateId(
      normalized.request.problemFingerprint,
      1,
      built.candidate.allocations,
    ),
    sequence: 1,
    foundAtElapsedMs: 1,
  });
  if (verified.status !== 'SUCCESS') throw new Error(verified.error.message);
  return verified.candidate;
}

afterEach(() => mocks.convert.mockReset());

describe('automatic plan candidate conversion failure', () => {
  it('preserves the current draft and uses the first conversion issue message', () => {
    const bundle = createAutomaticPlanBundle();
    const draft = createManualPlanDraft(bundle);
    mocks.convert.mockReturnValueOnce({
      status: 'FAILURE',
      issues: [{ message: 'forced conversion failure' }],
    });

    expect(
      applyVerifiedAutomaticPlanCandidate(bundle, draft, verifiedCandidate()),
    ).toMatchObject({
      status: 'FAILURE',
      draft,
      code: 'DRAFT_CONVERSION_FAILED',
      message: 'forced conversion failure',
    });
  });

  it('uses a stable fallback when conversion returns no issue', () => {
    const bundle = createAutomaticPlanBundle();
    const draft = createManualPlanDraft(bundle);
    mocks.convert.mockReturnValueOnce({ status: 'FAILURE', issues: [] });

    expect(
      applyVerifiedAutomaticPlanCandidate(bundle, draft, verifiedCandidate()),
    ).toMatchObject({
      status: 'FAILURE',
      draft,
      code: 'DRAFT_CONVERSION_FAILED',
      message: '자동 계획을 계획표 형식으로 바꾸지 못했습니다.',
    });
  });
});
