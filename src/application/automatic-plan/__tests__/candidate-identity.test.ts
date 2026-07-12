import { createAutomaticPlanCandidateId } from '../candidate-identity';
import { describe, expect, it } from 'vitest';

describe('automatic-plan candidate identity', () => {
  const allocations = Object.freeze([
    Object.freeze({ date: '2026-07-13', memberKey: 'root', pvp: 300, selfLeft: 0, selfRight: 300 }),
  ]);

  it('binds the fingerprint, sequence, and immutable allocation snapshot', () => {
    const first = createAutomaticPlanCandidateId('problem-a', 1, allocations);
    expect(first).toBe(createAutomaticPlanCandidateId('problem-a', 1, allocations));
    expect(first).not.toBe(createAutomaticPlanCandidateId('problem-a', 2, allocations));
    expect(first).not.toBe(
      createAutomaticPlanCandidateId('problem-a', 1, [
        { ...allocations[0]!, pvp: 301 },
      ]),
    );
  });

  it('rejects invalid sequences', () => {
    expect(() => createAutomaticPlanCandidateId('problem-a', 0, allocations)).toThrow();
  });
});
