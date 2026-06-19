# Adversarial-canary baselines (084)

These JSON files are the **committed, version-controlled baselines** the
`Adversarial canary gate` step in `.github/workflows/ci.yml` and the publish
precondition in `.github/workflows/release.yml` measure each shipped pack
against.

## What the gate does

For each shipped pack the gate runs the **full STRICT** adversarial canary
(`red-team --baseline <this file> --seed 1 --pack <dist bundle>`, i.e.
`runBaselinedCanaryGate`). It **PROMOTES (exit 0)** iff a fresh strict run is
**no worse** than the baseline, and **ROLLS BACK (exit 2)** on **any** of:

- a NEW escape / error / ownership-IDOR escape beyond the baseline counts;
- taint-escalation coverage newly collapsing to **vacuous** (the taint gate no
  longer exercised) when the baseline was non-vacuous;
- a **§C friction REGRESSION** on any baselined scenario — a recorded decision
  weakening to a strictly less-restrictive `kind` (e.g. an ownership/IDOR case on
  a money-mover going `REFUSE → DEFER`);
- a reached clean `EXECUTE` or a harness error — these are **unconditional** and
  can never be baselined away.

This is the FULL STRICT gate, **not** the weaker `--canary-policy execute-escape`
(which only catches a reached `EXECUTE`). The baseline exists so the gate does
not go **permanently red** on the **documented pre-existing 035-F1 #8 gaps**
(e.g. `pack-identity-kyc`'s forged-owner cases resolve to `DEFER`, not `REFUSE`;
`cli`/`pix`/`deploy` defend the taint vector upstream of the taint gate →
vacuous) — while still rolling back the instant a NEW hole opens or any recorded
defense weakens.

## Updating a baseline

A change that legitimately alters a pack's defended posture (e.g. **closing** a
035-F1 gap, which LOWERS the escape count) requires a **reviewed** baseline
update **in the same PR**. Regenerate with:

```bash
pnpm build   # rebuild the red-team + pack dist bundles first
node -e '
  import("./packages/red-team/dist/index.js").then(async (rt) => {
    const { pathToFileURL } = await import("node:url");
    const { writeFileSync } = await import("node:fs");
    const dirs = {
      "cli-agent": "pack-cli-agent",
      "access-governance": "pack-access-governance",
      "incident-response": "pack-incident-response",
      "payments-pix": "pack-payments-pix",
      "identity-kyc": "pack-identity-kyc",
      "deployments-approval": "pack-deployments-approval",
    };
    for (const [dir, id] of Object.entries(dirs)) {
      const mod = await import(pathToFileURL(`./packages/pack-${dir}/dist/index.js`).href);
      const pack = mod.default ?? mod.pack ?? Object.values(mod).find(v => v && v.policy && v.intents);
      const r = rt.runCanaryGate(pack, { stage: "canary", policy: "strict", seed: 1 });
      writeFileSync(`.github/canary-baselines/${id}.json`, JSON.stringify(rt.deriveCanaryBaseline(r), null, 2) + "\n");
    }
  });
'
```

The gate uses a **fixed seed (1)**, so a baseline only changes when a pack's
posture genuinely changes — a clean diff for review.
