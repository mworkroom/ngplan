import { createManualPlanDraft } from '../../manual-plan';
import type { ProjectSetupBundle } from '../../project-setup';
import { describe, expect, it } from 'vitest';
import {
  buildConstructiveCandidate,
  verifyAutomaticPlanCandidate,
} from '../../../optimizer';
import { applyVerifiedAutomaticPlanCandidate } from '../apply-candidate';
import { createAutomaticPlanCandidateId } from '../candidate-identity';
import { createAutomaticPlanRequest } from '../create-request';
import { createAutomaticPlanBundle } from './fixtures';

describe('automatic plan request and atomic application', () => {
  it('normalizes canonical dates, Sunday skips, opening ledgers, and a stable fingerprint', () => {
    const bundle = createAutomaticPlanBundle();
    const first = createAutomaticPlanRequest(bundle);
    expect(first.status).toBe('SUCCESS');
    if (first.status !== 'SUCCESS') return;
    expect(first.request.canonicalMemberKeys).toEqual(['root']);
    expect(first.request.calendar.skipDateSet).toContain('2026-07-05');
    expect(first.request.openingPvpByMember.root).toEqual({
      cumulativePvpOpening: 0,
    });
    const warmStart = [
      { date: '2026-07-01', memberKey: 'root', pvp: 0, selfLeft: 0, selfRight: 0 },
    ];
    const withWarmStart = createAutomaticPlanRequest(bundle, warmStart);
    expect(withWarmStart.status).toBe('SUCCESS');
    if (withWarmStart.status === 'SUCCESS') {
      expect(withWarmStart.request.problemFingerprint).toBe(
        first.request.problemFingerprint,
      );
      expect(withWarmStart.request.warmStart?.[0]).not.toBe(warmStart[0]);
      expect(Object.isFrozen(withWarmStart.request.warmStart?.[0])).toBe(true);
    }
  });

  it('rejects a bundle outside the 1..57 member product boundary', () => {
    const bundle = createAutomaticPlanBundle();
    const empty = {
      ...bundle,
      organization: { ...bundle.organization, members: [], openingStateByMember: {} },
    };
    expect(createAutomaticPlanRequest(empty).status).toBe('FAILURE');

    const tooMany = {
      ...bundle,
      organization: {
        ...bundle.organization,
        members: Array.from({ length: 58 }, () => bundle.organization.members[0]!),
      },
    };
    expect(createAutomaticPlanRequest(tooMany).status).toBe('FAILURE');
  });

  it('blocks automatic planning when any member selects the 1,500 side target', () => {
    const bundle = createAutomaticPlanBundle();
    const unsupported = {
      ...bundle,
      organization: {
        ...bundle.organization,
        members: bundle.organization.members.map((member) => ({
          ...member,
          fortnightSideTarget: 1500 as const,
        })),
      },
    };

    expect(createAutomaticPlanRequest(unsupported)).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_SIDE_TARGET_UNSUPPORTED',
        message: expect.stringContaining('수동 플랜'),
      },
    });
  });

  it('rejects a disconnected canonical order and missing or invalid opening values', () => {
    const bundle = createAutomaticPlanBundle();
    const root = bundle.organization.members[0]!;
    const opening = bundle.organization.openingStateByMember.root!;
    const cycleBundle = {
      ...bundle,
      organization: {
        ...bundle.organization,
        members: [
          root,
          { ...root, memberKey: 'B', memberId: 'B', parentMemberKey: 'C', sideAtParent: 'LEFT' },
          { ...root, memberKey: 'C', memberId: 'C', parentMemberKey: 'B', sideAtParent: 'RIGHT' },
        ],
        openingStateByMember: { root: opening, B: opening, C: opening },
      },
    } as unknown as ProjectSetupBundle;
    expect(createAutomaticPlanRequest(cycleBundle)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_MEMBER_ORDER_INVALID' },
    });

    const missingOpening = {
      ...bundle,
      organization: { ...bundle.organization, openingStateByMember: {} },
    } as unknown as ProjectSetupBundle;
    expect(createAutomaticPlanRequest(missingOpening)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' },
    });

    const invalidOpening = {
      ...bundle,
      organization: {
        ...bundle.organization,
        openingStateByMember: {
          root: { ...opening, openingQualificationPvp: Number.NaN },
        },
      },
    } as ProjectSetupBundle;
    expect(createAutomaticPlanRequest(invalidOpening)).toMatchObject({
      status: 'FAILURE',
      error: { code: 'AUTOMATIC_PLAN_REQUEST_INVALID' },
    });

    const throwingOpening = Object.defineProperty(
      { ...opening },
      'openingQualificationPvp',
      { get: () => { throw 'non-error opening failure'; } },
    );
    const nonErrorFailure = {
      ...bundle,
      organization: {
        ...bundle.organization,
        openingStateByMember: { root: throwingOpening },
      },
    } as unknown as ProjectSetupBundle;
    expect(createAutomaticPlanRequest(nonErrorFailure)).toMatchObject({
      status: 'FAILURE',
      error: {
        code: 'AUTOMATIC_PLAN_REQUEST_INVALID',
        message: '자동 계획 요청을 정규화하지 못했습니다.',
      },
    });
  });

  it('re-verifies the pinned snapshot and converts it atomically to manual strings', () => {
    const bundle = createAutomaticPlanBundle();
    const normalized = createAutomaticPlanRequest(bundle);
    expect(normalized.status).toBe('SUCCESS');
    if (normalized.status !== 'SUCCESS') return;
    const built = buildConstructiveCandidate(normalized.request);
    expect(built.status).toBe('SUCCESS');
    if (built.status !== 'SUCCESS') return;
    const candidateId = createAutomaticPlanCandidateId(
      normalized.request.problemFingerprint,
      1,
      built.candidate.allocations,
    );
    const verified = verifyAutomaticPlanCandidate(
      normalized.request,
      built.candidate,
      { candidateId, sequence: 1, foundAtElapsedMs: 25 },
    );
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;
    const before = createManualPlanDraft(bundle);
    const applied = applyVerifiedAutomaticPlanCandidate(
      bundle,
      before,
      verified.candidate,
    );
    expect(applied.status).toBe('SUCCESS');
    if (applied.status !== 'SUCCESS') return;
    expect(applied.draft).not.toBe(before);
    const pinnedFirstAllocation = verified.candidate.allocations[0]!;
    expect(applied.draft.cells[0]).toMatchObject({
      pvp: String(pinnedFirstAllocation.pvp),
      selfLeft: String(pinnedFirstAllocation.selfLeft ?? 0),
      selfRight: String(pinnedFirstAllocation.selfRight ?? 0),
    });
    expect(Object.isFrozen(applied.draft.cells)).toBe(true);
  });

  it('preserves the manual draft for stale or tampered pinned candidates', () => {
    const bundle = createAutomaticPlanBundle();
    const before = createManualPlanDraft(bundle);
    const normalized = createAutomaticPlanRequest(bundle);
    expect(normalized.status).toBe('SUCCESS');
    if (normalized.status !== 'SUCCESS') return;
    const built = buildConstructiveCandidate(normalized.request);
    expect(built.status).toBe('SUCCESS');
    if (built.status !== 'SUCCESS') return;
    const identity = {
      candidateId: createAutomaticPlanCandidateId(
        normalized.request.problemFingerprint,
        1,
        built.candidate.allocations,
      ),
      sequence: 1,
      foundAtElapsedMs: 1,
    };
    const verified = verifyAutomaticPlanCandidate(normalized.request, built.candidate, identity);
    expect(verified.status).toBe('SUCCESS');
    if (verified.status !== 'SUCCESS') return;

    const stale = applyVerifiedAutomaticPlanCandidate(bundle, before, {
      ...verified.candidate,
      problemFingerprint: 'stale',
    });
    expect(stale).toMatchObject({ status: 'FAILURE', draft: before, code: 'CANDIDATE_STALE' });

    const tampered = applyVerifiedAutomaticPlanCandidate(bundle, before, {
      ...verified.candidate,
      candidateId: 'tampered',
    });
    expect(tampered).toMatchObject({
      status: 'FAILURE',
      draft: before,
      code: 'CANDIDATE_IDENTITY_MISMATCH',
    });

    const rejected = applyVerifiedAutomaticPlanCandidate(bundle, before, {
      ...verified.candidate,
      objective: {
        ...verified.candidate.objective,
        totalNewPv: verified.candidate.objective.totalNewPv + 1,
      },
    });
    expect(rejected).toMatchObject({
      status: 'FAILURE',
      draft: before,
      code: 'CANDIDATE_REJECTED',
    });

    const invalidBundle = {
      ...bundle,
      organization: {
        ...bundle.organization,
        members: [],
        openingStateByMember: {},
      },
    } as ProjectSetupBundle;
    const requestInvalid = applyVerifiedAutomaticPlanCandidate(
      invalidBundle,
      before,
      verified.candidate,
    );
    expect(requestInvalid).toMatchObject({
      status: 'FAILURE',
      draft: before,
      code: 'REQUEST_INVALID',
    });
  });
});
