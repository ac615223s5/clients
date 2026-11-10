import { CipherType, isCipherType } from "../enums/cipher-type";

/** The meaning of a policy without usable data: only Card is restricted. */
const DEFAULT_RESTRICTED_TYPES: readonly CipherType[] = Object.freeze([CipherType.Card]);

/**
 * Reads the restricted cipher types from the `data` of a `PolicyType.RestrictedItemTypes` policy.
 *
 * Accepted shapes:
 * - `null` / `undefined`: legacy meaning, `[Card]`.
 * - `{ restrictedTypes: number[] }`: the current shape. An empty list means nothing is restricted.
 * - `number[]`: a bare array, as older clients read it.
 *
 * Anything else (including an object without a `restrictedTypes` array) falls back to `[Card]`,
 * so unreadable data never silently removes the restriction. Unknown values inside a list are
 * dropped and duplicates are removed.
 */
export function getRestrictedItemTypes(data: unknown): CipherType[] {
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.restrictedTypes)
      ? data.restrictedTypes
      : undefined;

  if (list == null) {
    return [...DEFAULT_RESTRICTED_TYPES];
  }

  return Array.from(new Set(list.filter(isCipherType)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
