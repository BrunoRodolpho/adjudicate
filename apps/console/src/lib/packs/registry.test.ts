import { describe, expect, it } from "vitest";
import { PackRegistry } from "./registry";

/**
 * Registry alignment + resolution (importing the module already runs
 * assertRegistryAlignment(), which throws on metadata/adapter drift).
 */
describe("PackRegistry", () => {
  it("registers all five packs without alignment errors", () => {
    expect(PackRegistry.all().length).toBe(5);
  });

  it("resolves the new packs by intent kind", () => {
    expect(PackRegistry.match("incident.remediation.execute")?.pack.id).toBe("pack-incident-response");
    expect(PackRegistry.match("incident.monitor.callback")?.pack.id).toBe("pack-incident-response");
    expect(PackRegistry.match("access.request")?.pack.id).toBe("pack-access-governance");
    expect(PackRegistry.match("access.review.resolve")?.pack.id).toBe("pack-access-governance");
  });

  it("returns null for an unknown intent kind", () => {
    expect(PackRegistry.match("nope.unknown")).toBeNull();
  });
});
