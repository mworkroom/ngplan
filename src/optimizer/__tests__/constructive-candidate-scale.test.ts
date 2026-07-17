import { describe, expect, it } from 'vitest';
import {
  buildConstructiveCandidateVariants,
  verifyAutomaticPlanCandidate,
} from '..';
import {
  createOptimizerRequest,
  optimizerMember,
  optimizerOpening,
} from './fixtures';

describe('constructive candidate scale variants', () => {
  it('finds a canonically verified candidate for a mixed-opening 57-member tree', () => {
    const members = Array.from({ length: 57 }, (_, index) => {
      if (index === 0) return optimizerMember('member-0', null, null, 2_400);
      const parentIndex = Math.floor((index - 1) / 2);
      const target = index < 7 ? (index % 2 === 0 ? 1_500 : 2_400) : 700;
      return optimizerMember(
        `member-${index}`,
        `member-${parentIndex}`,
        index % 2 === 1 ? 'LEFT' : 'RIGHT',
        target,
      );
    });
    const openingValues = [2_400, 1_500, 700, 300, 33] as const;
    const openings = Object.freeze(Object.fromEntries(
      members.map((member, index) => {
        const openingPvp = openingValues[index % openingValues.length]!;
        return [
          member.memberKey,
          optimizerOpening({
            openingQualificationPvp: openingPvp,
            fortnightPvpOpeningCredit: openingPvp,
          }),
        ];
      }),
    ));
    const request = createOptimizerRequest(members, openings);
    const variants = buildConstructiveCandidateVariants(request);
    const verifiedShift = variants.slice(2).find((variant, index) => {
      if (variant.status !== 'SUCCESS') return false;
      return verifyAutomaticPlanCandidate(request, variant.candidate, {
        candidateId: `mixed-57-shift-${index + 1}`,
        sequence: index + 1,
        foundAtElapsedMs: 0,
      }).status === 'SUCCESS';
    });

    expect(verifiedShift).toMatchObject({ status: 'SUCCESS' });
  });
});
