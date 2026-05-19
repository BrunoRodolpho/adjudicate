import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { applyNameGuardToWithMetadata } from "../src/codemods/name-guard-to-with-metadata.js";
import { runCodemod, listCodemods } from "../src/runner.js";

function virtualProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false },
  });
}

describe("nameGuardToWithMetadata codemod", () => {
  it("rewrites a simple call and updates the import", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/example.ts",
      [
        `import { nameGuard } from "@adjudicate/core";`,
        ``,
        `const escalate = nameGuard("escalate.large_refunds", (envelope, state) => null);`,
        ``,
      ].join("\n"),
    );

    const changes = applyNameGuardToWithMetadata(file);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("rewrite");
    expect(file.getFullText()).toContain(
      `withMetadata((envelope, state) => null, { name: "escalate.large_refunds" })`,
    );
    expect(file.getFullText()).toContain(
      `import { withMetadata } from "@adjudicate/core";`,
    );
    expect(file.getFullText()).not.toContain("nameGuard");
  });

  it("preserves other named imports when nameGuard is one of many", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/m.ts",
      [
        `import { adjudicate, nameGuard, type Decision } from "@adjudicate/core";`,
        `const g = nameGuard("g1", () => null);`,
        ``,
      ].join("\n"),
    );

    applyNameGuardToWithMetadata(file);

    const text = file.getFullText();
    expect(text).toContain("adjudicate");
    expect(text).toContain("withMetadata");
    expect(text).toContain("Decision");
    expect(text).not.toContain("nameGuard");
  });

  it("merges with an existing withMetadata import", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/m.ts",
      [
        `import { nameGuard, withMetadata } from "@adjudicate/core";`,
        `const g = nameGuard("g", () => null);`,
        `const h = withMetadata(() => null, { name: "h" });`,
        ``,
      ].join("\n"),
    );

    applyNameGuardToWithMetadata(file);

    const text = file.getFullText();
    // Exactly one import line, and `withMetadata` appears only once in named imports
    const importMatches = text.match(/import \{[^}]*\}/g) ?? [];
    expect(importMatches).toHaveLength(1);
    expect(importMatches[0]!.match(/withMetadata/g) ?? []).toHaveLength(1);
    expect(text).not.toContain("nameGuard");
  });

  it("also rewrites imports from @adjudicate/core/kernel", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/m.ts",
      [
        `import { nameGuard } from "@adjudicate/core/kernel";`,
        `const g = nameGuard("k", () => null);`,
      ].join("\n"),
    );

    applyNameGuardToWithMetadata(file);

    expect(file.getFullText()).toContain(
      `import { withMetadata } from "@adjudicate/core/kernel";`,
    );
  });

  it("is idempotent — second run is a no-op", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/m.ts",
      [
        `import { nameGuard } from "@adjudicate/core";`,
        `const g = nameGuard("x", () => null);`,
      ].join("\n"),
    );

    applyNameGuardToWithMetadata(file);
    const afterFirst = file.getFullText();
    const secondChanges = applyNameGuardToWithMetadata(file);
    expect(secondChanges).toHaveLength(0);
    expect(file.getFullText()).toBe(afterFirst);
  });

  it("skips property-access calls like kernel.nameGuard()", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/m.ts",
      [
        `import * as kernel from "@adjudicate/core";`,
        `const g = kernel.nameGuard("x", () => null);`,
      ].join("\n"),
    );

    const changes = applyNameGuardToWithMetadata(file);
    expect(changes).toHaveLength(0);
    expect(file.getFullText()).toContain("kernel.nameGuard");
  });

  it("skips calls with the wrong argument shape", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/m.ts",
      [
        `import { nameGuard } from "@adjudicate/core";`,
        `const g = nameGuard(getName(), () => null);`,
        `const h = nameGuard("only-arg");`,
      ].join("\n"),
    );

    const changes = applyNameGuardToWithMetadata(file);
    expect(changes.every((c) => c.kind === "skip")).toBe(true);
    expect(changes).toHaveLength(2);
  });

  it("rewrites multiple call sites in a single file", () => {
    const project = virtualProject();
    const file = project.createSourceFile(
      "/m.ts",
      [
        `import { nameGuard } from "@adjudicate/core";`,
        `const a = nameGuard("a", () => null);`,
        `const b = nameGuard("b", () => null);`,
      ].join("\n"),
    );

    const changes = applyNameGuardToWithMetadata(file);
    expect(changes.filter((c) => c.kind === "rewrite")).toHaveLength(2);
    const text = file.getFullText();
    expect(text).toContain(`{ name: "a" }`);
    expect(text).toContain(`{ name: "b" }`);
  });
});

describe("runCodemod / listCodemods", () => {
  it("lists the registered codemods", () => {
    const ids = listCodemods().map((c) => c.id);
    expect(ids).toContain("name-guard-to-with-metadata");
  });

  it("throws on an unknown codemod id", async () => {
    await expect(
      runCodemod({ id: "unknown-codemod", globs: ["x"] }),
    ).rejects.toThrow(/Unknown codemod/);
  });
});
