export const PROBLEM_FINGERPRINT_VERSION = '2.0.0' as const;
export const PROBLEM_FINGERPRINT_ALGORITHM = 'fnv1a64-canonical-json-v1' as const;

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): CanonicalJsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error('Fingerprint 입력에는 유한한 정규 숫자만 사용할 수 있습니다.');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value instanceof Set) {
    return [...value].map(canonicalize).sort((left, right) =>
      compareCodeUnits(JSON.stringify(left), JSON.stringify(right)),
    );
  }
  if (value instanceof Map) {
    return [...value.entries()]
      .map(([key, entryValue]) => [String(key), canonicalize(entryValue)] as const)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, entryValue]) => [key, entryValue]);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => compareCodeUnits(left, right));
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }
  throw new Error('Fingerprint 입력에 지원하지 않는 값이 있습니다.');
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function createProblemFingerprint(value: unknown): string {
  const canonical = canonicalStringify(value);
  return `${PROBLEM_FINGERPRINT_VERSION}:${PROBLEM_FINGERPRINT_ALGORITHM}:${fnv1a64(canonical)}`;
}
