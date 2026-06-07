# @adjudicate/pack-incident-response

## 0.2.0

### Minor Changes

- 2ca4532: feat: new @adjudicate/pack-incident-response (Item 9) and @adjudicate/pack-access-governance (Item 10) — domain Packs exercising all six Decision outcomes via L2 primitives, registered in the console pack registry. Incident: ESCALATE on blast radius / DEFER on dependency-down / REWRITE auto-scope-clamp / CONFIRM destructive remediation. Access: DEFER pending review / REWRITE least-privilege / ESCALATE sensitive resource / CONFIRM revoke. Both system-only kinds (monitor callback, review resolve) are TRUSTED-gated.

### Patch Changes

- Updated dependencies [fdc0344]
- Updated dependencies [ce2cdc5]
- Updated dependencies [7545b17]
- Updated dependencies [570db36]
- Updated dependencies [55c2494]
- Updated dependencies [464db38]
- Updated dependencies [1e0058b]
  - @adjudicate/core@1.3.0
  - @adjudicate/primitives@0.3.0

## 0.1.0-experimental

### Minor Changes

- Initial release. Incident-remediation Pack exercising all six Decision
  outcomes (ESCALATE on blast radius, DEFER on dependency-down, REWRITE
  scope-clamp, REQUEST_CONFIRMATION, REFUSE, EXECUTE) via L2 primitives.
