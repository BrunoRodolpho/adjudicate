import { afterEach, describe, expect, it, vi } from "vitest"
import { validateEnforceConfig } from "../../src/kernel/enforce-config.js"
import { createRuntimeContext } from "../../src/kernel/runtime-context.js"
import {
  _resetMetricsSink,
  setMetricsSink,
  type MetricsSink,
  type SinkFailureEvent,
} from "../../src/kernel/metrics.js"

// ConfigReviewer-001: the module-level isShadowed/isEnforced wrappers (which
// defaulted env to process.env) were removed. Enforce/shadow lookups now go
// through a RuntimeContext seeded from an explicit envSeed, which never reads
// live process.env. These tests exercise that surface.
function enforceConfigFor(env: NodeJS.ProcessEnv) {
  return createRuntimeContext({ id: "test", envSeed: env }).enforceConfig
}

describe("intent-enforce-config (via RuntimeContext.enforceConfig)", () => {
  it("returns false for both when env vars are unset", () => {
    const cfg = enforceConfigFor({})
    expect(cfg.isShadowed("order.submit")).toBe(false)
    expect(cfg.isEnforced("order.submit")).toBe(false)
  })

  it("parses comma-separated intent kinds for shadow", () => {
    const cfg = enforceConfigFor({ IBX_KERNEL_SHADOW: "order.submit,payment.confirm" })
    expect(cfg.isShadowed("order.submit")).toBe(true)
    expect(cfg.isShadowed("payment.confirm")).toBe(true)
    expect(cfg.isShadowed("refund.issue")).toBe(false)
  })

  it("parses comma-separated intent kinds for enforce independently", () => {
    const cfg = enforceConfigFor({
      IBX_KERNEL_SHADOW: "order.submit",
      IBX_KERNEL_ENFORCE: "apply_coupon,update_preferences",
    })
    expect(cfg.isShadowed("order.submit")).toBe(true)
    expect(cfg.isShadowed("apply_coupon")).toBe(false)
    expect(cfg.isEnforced("apply_coupon")).toBe(true)
    expect(cfg.isEnforced("order.submit")).toBe(false)
  })

  it("supports wildcard `*` for blanket coverage", () => {
    expect(enforceConfigFor({ IBX_KERNEL_SHADOW: "*" }).isShadowed("anything.at.all")).toBe(true)
    expect(enforceConfigFor({ IBX_KERNEL_ENFORCE: "*" }).isEnforced("anything.at.all")).toBe(true)
  })

  it("trims whitespace around comma-separated values", () => {
    const cfg = enforceConfigFor({ IBX_KERNEL_SHADOW: " order.submit ,  payment.confirm  " })
    expect(cfg.isShadowed("order.submit")).toBe(true)
    expect(cfg.isShadowed("payment.confirm")).toBe(true)
  })

  it("ignores empty entries", () => {
    const cfg = enforceConfigFor({ IBX_KERNEL_SHADOW: ",order.submit,," })
    expect(cfg.isShadowed("order.submit")).toBe(true)
    expect(cfg.isShadowed("")).toBe(false)
  })

  it("recomputes when env values change between calls", () => {
    expect(enforceConfigFor({ IBX_KERNEL_ENFORCE: "" }).isEnforced("order.submit")).toBe(false)
    expect(
      enforceConfigFor({ IBX_KERNEL_ENFORCE: "order.submit" }).isEnforced("order.submit"),
    ).toBe(true)
  })
})

describe("validateEnforceConfig (T7 #17)", () => {
  afterEach(() => {
    _resetMetricsSink()
  })

  it("returns no unknowns when every token is in the known set", () => {
    const warn = vi.fn()
    const result = validateEnforceConfig(
      new Set(["a", "b", "c"]),
      { IBX_KERNEL_SHADOW: "a,b", IBX_KERNEL_ENFORCE: "c" },
      warn,
    )
    expect(result.unknownShadow).toEqual([])
    expect(result.unknownEnforce).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it("flags unknown shadow tokens with warn + recordSinkFailure", () => {
    const failures: SinkFailureEvent[] = []
    const sink: MetricsSink = {
      recordLedgerOp() {},
      recordDecision() {},
      recordRefusal() {},
      recordSinkFailure(e) {
        failures.push(e)
      },
      recordShadowDivergence() {},
      recordResourceLimit() {},
    }
    setMetricsSink(sink)
    const warn = vi.fn()
    const result = validateEnforceConfig(
      new Set(["order.submit"]),
      { IBX_KERNEL_SHADOW: "order.submit,oder.submmit" },
      warn,
    )
    expect(result.unknownShadow).toEqual(["oder.submmit"])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(failures).toHaveLength(1)
    expect(failures[0]!.errorClass).toBe("enforce_config_typo")
    expect(failures[0]!.subject).toContain("oder.submmit")
  })

  it("flags unknown enforce tokens", () => {
    const warn = vi.fn()
    const result = validateEnforceConfig(
      new Set(["order.submit"]),
      { IBX_KERNEL_ENFORCE: "ordr.submit" },
      warn,
    )
    expect(result.unknownEnforce).toEqual(["ordr.submit"])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("honours wildcard `*` (no token check)", () => {
    const warn = vi.fn()
    const result = validateEnforceConfig(
      new Set(["order.submit"]),
      { IBX_KERNEL_SHADOW: "*", IBX_KERNEL_ENFORCE: "*" },
      warn,
    )
    expect(result.unknownShadow).toEqual([])
    expect(result.unknownEnforce).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it("flags both shadow and enforce typos in one call", () => {
    const warn = vi.fn()
    const result = validateEnforceConfig(
      new Set(["a"]),
      { IBX_KERNEL_SHADOW: "a,bad1", IBX_KERNEL_ENFORCE: "a,bad2" },
      warn,
    )
    expect(result.unknownShadow).toEqual(["bad1"])
    expect(result.unknownEnforce).toEqual(["bad2"])
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
