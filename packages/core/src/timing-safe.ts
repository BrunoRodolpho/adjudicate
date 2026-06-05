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
 * This is a PURE-JS constant-time compare on purpose. `@adjudicate/core` must
 * stay browser-safe — it is bundled into the Next.js `apps/console` / `apps/web`
 * builds — so it cannot import `node:crypto` (`timingSafeEqual`) or use
 * `Buffer`; doing so breaks the webpack browser build with
 * `UnhandledSchemeError: Reading from "node:crypto" is not handled`. sha256
 * itself comes from the pure-JS `@adjudicate/canonical`; this helper stays in
 * the same no-Node-builtins regime.
 *
 * Mirrors the INTENT of the already-landed ibx `detectForgery` hardening
 * (customer-intent-gateway.ts): equal-length → constant-time compare; any
 * length-mismatch / non-string → mismatch, never throws. (apps/api there is a
 * Node-only backend so it can use `crypto.timingSafeEqual`; core cannot, hence
 * the hand-rolled constant-time loop below.)
 */

/**
 * `true` iff `a` and `b` are equal hex digest strings, compared in constant
 * time (no early-exit on the first differing char). Returns `false` (never
 * throws) when either side is not a string, lengths differ, or the contents
 * differ. Drop-in replacement for `a === b` on digest hex strings that closes
 * the timing side-channel. Pure JS — no `node:crypto`, no `Buffer` — so core
 * stays browser-bundleable.
 */
export function timingSafeHexEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  // Length mismatch can never be equal. Bailing on length is not a meaningful
  // timing leak: a near-miss forgery must already match the real digest's
  // fixed length (sha256 hex = 64 chars).
  if (a.length !== b.length) return false;
  // XOR-accumulate every char-code difference; the loop runs the FULL length
  // regardless of where (or whether) the strings first differ, so the elapsed
  // time does not reveal the matching prefix. `mismatch` stays 0 iff every
  // char matched.
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
