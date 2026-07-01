// @adjudicate/core — RenderedReply: the runtime-non-forgeable carrier for
// every customer-facing string that may cross an egress boundary.
//
// Round-2 Theorem E (sole-emitter): the ONLY values that may be handed to a
// customer-egress sink (Twilio/WhatsApp send, SSE text frame, web channel
// render) are replies MINTED by the closed set of factories in THIS module.
// E-1 (this wave) establishes the brand carrier, the closed minter set, and
// the egress-side `unwrapRendered` membership gate. E-2 (W5) threads minted
// values through the call sites; C6 (W6) binds claim values. Neither is done
// here.
//
// WHY AN OBJECT WRAPPER, NOT A BRANDED STRING
// ────────────────────────────────────────────
// A branded string (`string & { __brand }`) is erased by tsc: at runtime it is
// an ordinary string, so any literal or wire-sourced string `as RenderedReply`
// satisfies it and there is NO runtime membership test (strings cannot be
// WeakSet keys). Theorem E demands RUNTIME non-forgeability, so the carrier is
// a heap object trackable in a module-private `WeakSet`. `unwrapRendered`
// proves provenance at the boundary by asserting WeakSet membership — a forged
// object literal that structurally matches `RenderedReply` throws at the sink.
//
// Precedent: the `unique symbol` brand mirrors `with-deadlines.ts`'s
// `DEADLINE_HIT`, EXCEPT the brand symbol here is NEVER exported — only the
// type, the minters, and `unwrapRendered` leave this module. An un-exported
// symbol cannot be referenced by external code, so no external module can even
// name the brand key, let alone synthesise a conforming object literal.

/**
 * The module-private brand key. NEVER exported. Because the symbol is not in
 * scope anywhere outside this file, no external module can write an object
 * literal whose key is `[renderedBrand]`, so `RenderedReply` is opaque at the
 * type level (compile-time leg of defense-in-depth, layer (a)).
 */
declare const renderedBrand: unique symbol;

/**
 * An opaque, runtime-non-forgeable customer-facing reply.
 *
 * The only way to obtain one is a minter in this module; the only way to read
 * the underlying string is {@link unwrapRendered}, which asserts the value was
 * genuinely minted here. Treat instances as immutable.
 */
export interface RenderedReply {
  readonly text: string;
  readonly [renderedBrand]: true;
}

/**
 * Runtime membership registry — every minted reply is inserted here, and
 * {@link unwrapRendered} asserts presence before yielding the string. A
 * `WeakSet` (not `Set`) so minted replies stay garbage-collectable; the keys
 * are the reply objects themselves, which is why the carrier MUST be a heap
 * object and not a string (defense-in-depth, layer (b)).
 */
const MINTED = new WeakSet<object>();

/**
 * The single internal construction point. Every public minter funnels through
 * here so there is exactly ONE place that creates a branded object and exactly
 * ONE WeakSet that tracks provenance. Frozen so the carrier is immutable.
 */
function mint(text: string): RenderedReply {
  const reply = Object.freeze({ text }) as unknown as RenderedReply;
  MINTED.add(reply);
  return reply;
}

// ── (1) RENDERER MINT ────────────────────────────────────────────────────────

/**
 * Mint a reply rendered from validated claims (the claims→prose surface:
 * renderer-from-claims.ts / ibatexas-responder.ts). This is the primary,
 * non-templated egress path.
 */
export function mintRenderedReply(text: string): RenderedReply {
  return mint(text);
}

// ── (2) OPERATIONAL MINTERS ────────────────────────────────────────────────────
// Non-claims customer egress that is legitimately templated. One named factory
// per category so every operational send site is independently auditable.

/** Scheduled / proactive cron-driven message (e.g. reservation reminders). */
export function mintCronReply(text: string): RenderedReply {
  return mint(text);
}

/** Transactional receipt / confirmation (e.g. order or payment receipt). */
export function mintReceiptReply(text: string): RenderedReply {
  return mint(text);
}

/** One-time-passcode / verification message. */
export function mintOtpReply(text: string): RenderedReply {
  return mint(text);
}

/** Operator broadcast / nudge (e.g. cart-intelligence, escalation pings). */
export function mintBroadcastReply(text: string): RenderedReply {
  return mint(text);
}

/** Deterministic fallback used when an upstream producer yields nothing. */
export function mintFallbackReply(text: string): RenderedReply {
  return mint(text);
}

// ── (3) TRANSITIONAL MINTER ────────────────────────────────────────────────────

/**
 * Wrap raw text emitted by the legacy prose responder so egress still
 * type-checks during the W4→W5 wiring gap. It is a real minter (adds to the
 * WeakSet), so unwrapping succeeds — but its single call-site is the seam that
 * W5 deletes once value-binding lands.
 *
 * @deprecated W4→W5 transitional. Do not introduce new call sites. The legacy
 * prose responder is the ONLY permitted caller; W5 removes it.
 */
export function wrapLegacyResponderText(text: string): RenderedReply {
  return mint(text);
}

// ── EGRESS GATE ────────────────────────────────────────────────────────────────

/**
 * Extract the underlying string at an egress sink, AFTER proving the value was
 * minted by this module. A forged object literal that structurally satisfies
 * `RenderedReply` (only constructible via `as`, which the lint layer (c) bans)
 * is rejected here at runtime (defense-in-depth, layer (b)).
 *
 * @throws {Error} if `reply` was not produced by a minter in this module.
 */
export function unwrapRendered(reply: RenderedReply): string {
  if (!MINTED.has(reply)) {
    throw new Error(
      "unwrapRendered: forged or non-minted RenderedReply reached an egress sink. " +
        "Customer-facing strings must be produced by a @adjudicate/core minter " +
        "(mintRenderedReply / mint{Cron,Receipt,Otp,Broadcast,Fallback}Reply / " +
        "wrapLegacyResponderText), never cast with `as RenderedReply`.",
    );
  }
  return reply.text;
}
