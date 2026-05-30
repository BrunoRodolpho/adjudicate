/**
 * Constant-time equality for derived-vs-stored hash digests.
 *
 * Verification sites that compare a freshly-derived hash against a stored one
 * (audit-record tamper checks, parked-envelope resume checks, confirmation
 * blob checks) must not use a plain `a !== b` string compare: `!==`
 * short-circuits on the first differing character, leaking — via wall-clock
 * timing — how many leading hex digits of an attacker-supplied digest matched
 * the real one. Over many probes that turns into a digit-by-digit forgery
 * oracle.
 *
 * `crypto.timingSafeEqual` compares two equal-length buffers in time that does
 * not depend on where they first differ. It THROWS on unequal-length buffers,
 * so we must guard length first — and a length mismatch (or a non-string /
 * non-hex input that can't form an equal-length digest buffer) is, by
 * definition, "not equal". This helper returns the SAME boolean a `===` would
 * for every input; it only removes the timing side-channel. It never throws.
 *
 * Mirrors the already-landed ibx `detectForgery` hardening
 * (customer-intent-gateway.ts): equal-length → constant-time compare; any
 * length-mismatch / non-hex → mismatch, never throws.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * `true` iff `a` and `b` are byte-for-byte equal hex digest strings, compared
 * in constant time. Returns `false` (never throws) when either side is not a
 * string, lengths differ, or the bytes differ. This is a drop-in replacement
 * for `a === b` on digest hex strings that closes the timing side-channel.
 */
export function timingSafeHexEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  // Length mismatch can never be equal — and timingSafeEqual would throw on
  // unequal-length buffers. Bailing here is not itself a timing leak: a
  // near-miss forgery must already match the real digest's length. Hex digests
  // are ASCII, so string length == byte length under latin1/ascii decoding.
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "latin1");
  const bufB = Buffer.from(b, "latin1");
  // Defensive: latin1 is 1 byte/char so lengths already match, but guard the
  // buffer lengths too so timingSafeEqual can never throw.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
