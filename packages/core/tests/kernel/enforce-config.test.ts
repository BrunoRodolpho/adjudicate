import { afterEach, describe, expect, it, vi } from "vitest"
import {
  _resetEnforceConfig,
  isEnforced,
  isShadowed,
  validateEnforceConfig,
} from "../../src/kernel/enforce-config.js"
import {
  _resetMetricsSink,
  setMetricsSink,
  type MetricsSink,
  type SinkFailureEvent,
} from "../../src/kernel/metrics.js"

describe("intent-enforce-config", () => {
  afterEach(() => {
    _resetEnforceConfig()
  })

  it("returns false for both when env vars are unset", () => {
    expect(isShadowed("order.submit", {})).toBe(false)
    expect(isEnforced("order.submit", {})).toBe(false)
  })

  it("parses comma-separated intent kinds for shadow", () => {
    const env = { IBX_KERNEL_SHADOW: "order.submit,payment.confirm" }
    expect(isShadowed("order.submit", env)).toBe(true)
    expect(isShadowed("payment.confirm", env)).toBe(true)
    expect(isShadowed("refund.issue", env)).toBe(false)
  })

  it("parses comma-separated intent kinds for enforce independently", () => {
    const env = {
      IBX_KERNEL_SHADOW: "order.submit",
      IBX_KERNEL_ENFORCE: "apply_coupon,update_preferences",
    }
    expect(isShadowed("order.submit", env)).toBe(true)
    expect(isShadowed("apply_coupon", env)).toBe(false)
    expect(isEnforced("apply_coupon", env)).toBe(true)
    expect(isEnforced("order.submit", env)).toBe(false)
  })

  it("supports wildcard `*` for blanket coverage", () => {
    expect(isShadowed("anything.at.all", { IBX_KERNEL_SHADOW: "*" })).toBe(true)
    expect(isEnforced("anything.at.all", { IBX_KERNEL_ENFORCE: "*" })).toBe(true)
  })

  it("trims whitespace around comma-separated values", () => {
    const env = { IBX_KERNEL_SHADOW: " order.submit ,  payment.confirm  " }
    expect(isShadowed("order.submit", env)).toBe(true)
    expect(isShadowed("payment.confirm", env)).toBe(true)
  })

  it("ignores empty entries", () => {
    const env = { IBX_KERNEL_SHADOW: ",order.submit,," }
    expect(isShadowed("order.submit", env)).toBe(true)
    expect(isShadowed("", env)).toBe(false)
  })

  it("recomputes when env values change between calls", () => {
    expect(isEnforced("order.submit", { IBX_KERNEL_ENFORCE: "" })).toBe(false)
    expect(
      isEnforced("order.submit", { IBX_KERNEL_ENFORCE: "order.submit" }),
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
