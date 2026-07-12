import {
  canonicalStringify,
  createProblemFingerprint,
} from '../fingerprint';
import { describe, expect, it } from 'vitest';

describe('automatic-plan problem fingerprint', () => {
  it('is independent of object insertion order', () => {
    const left = { b: 2, a: { y: 4, x: 3 } };
    const right = { a: { x: 3, y: 4 }, b: 2 };

    expect(canonicalStringify(left)).toBe(canonicalStringify(right));
    expect(createProblemFingerprint(left)).toBe(createProblemFingerprint(right));
  });

  it('changes when a business value changes', () => {
    expect(createProblemFingerprint({ opening: 32 })).not.toBe(
      createProblemFingerprint({ opening: 33 }),
    );
  });

  it('rejects negative zero and non-finite values', () => {
    expect(() => createProblemFingerprint({ pv: -0 })).toThrow();
    expect(() => createProblemFingerprint({ pv: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('canonicalizes Set and Map contents independent of insertion order', () => {
    const left = {
      set: new Set<unknown>([3, { b: 2, a: 1 }, { a: 1, b: 2 }]),
      map: new Map<unknown, unknown>([[2, 'two'], ['1', 'one']]),
    };
    const right = {
      map: new Map<unknown, unknown>([['1', 'one'], [2, 'two']]),
      set: new Set<unknown>([{ a: 1, b: 2 }, 3, { b: 2, a: 1 }]),
    };

    expect(canonicalStringify(left)).toBe(canonicalStringify(right));
    expect(canonicalStringify(left)).toContain('[["1","one"],["2","two"]]');
  });

  it('omits undefined object fields and rejects unsupported top-level values', () => {
    expect(canonicalStringify({ keep: 1, omit: undefined })).toBe('{"keep":1}');
    expect(() => canonicalStringify(() => undefined)).toThrow(
      'Fingerprint 입력에 지원하지 않는 값이 있습니다.',
    );
    expect(() => canonicalStringify(1n)).toThrow();
  });
});
