---
"@adjudicate/pack-payments-pix": patch
---

Migrate `pixTaintPolicy` to `createSystemTaintPolicy` (Layer-2 primitive).

Closes the open sniff-test question from Phase 5: `createSystemTaintPolicy` was extracted but only KYC used it, leaving PIX as the inline-policy outlier. The factory now has both shipped Packs as consumers, re-establishing the 2-Pack justification for the primitive.

No behavioral change: `pixTaintPolicy.minimumFor("pix.charge.confirm")` still returns `"TRUSTED"`; user-initiated kinds still return `"UNTRUSTED"`. The public export `pixTaintPolicy` is preserved, so adopters who imported it directly are unaffected.

Conformance tests in `tests/conformance.test.ts` continue to pass against the factory-produced policy.
