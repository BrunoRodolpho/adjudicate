#!/usr/bin/env node
import { Command } from "commander";
import { runAnalyze, type AnalyzeFormat } from "./commands/analyze.js";
import { runAnalyzeComposition } from "./commands/analyze-composition.js";
import { runDemo } from "./commands/demo.js";
import { runDev } from "./commands/dev.js";
import { runDiscover } from "./commands/discover.js";
import { runDoctor } from "./commands/doctor.js";
import { runExport, type ExportFormat } from "./commands/export.js";
import { runPackInit, TEMPLATE_NAMES, type TemplateName } from "./commands/pack-init.js";
import { runPackLint } from "./commands/pack-lint.js";
import { runPackBom } from "./commands/pack-bom.js";
import { runPackVerify, type TrustPolicy } from "./commands/pack-verify.js";
import { runReap } from "./commands/reap.js";
import { runRedTeamCommand } from "./commands/red-team.js";
import { runReplay } from "./commands/replay.js";
import { runRepl } from "./commands/repl.js";
import { runScenariosGenerate } from "./commands/scenarios-generate.js";
import { runSimulate } from "./commands/simulate.js";
import { runVisualize } from "./commands/visualize.js";
import type { SimulationFormat } from "./lib/simulate-renderer.js";

const program = new Command();

program
  .name("adjudicate")
  .description(
    "adjudicate framework CLI — Pack lifecycle commands for policy authors",
  )
  .version("0.4.0");

// Commands listed in alphabetical order matching the eventual `--help` layout.

program
  .command("analyze")
  .description(
    "Run @adjudicate/analyze Tier 1 static analysis against a Pack",
  )
  .requiredOption(
    "--pack <module>",
    "Pack module spec — npm package name or relative/absolute path",
  )
  .option(
    "--format <text|json|sarif>",
    "Output format. text for developer, json for tooling, sarif for CI",
    "text",
  )
  .option(
    "--strict",
    "Escalate warnings to errors; analyze exits non-zero on any warning",
    false,
  )
  .action(
    async (options: { pack: string; format?: string; strict?: boolean }) => {
      const format = (options.format ?? "text") as AnalyzeFormat;
      if (format !== "text" && format !== "json" && format !== "sarif") {
        console.error(`✗ Unknown --format value "${options.format}". Use text, json, or sarif.`);
        process.exit(1);
      }
      await runAnalyze({
        pack: options.pack,
        format,
        strict: options.strict ?? false,
      });
    },
  );

program
  .command("analyze-composition")
  .description(
    "Detect cross-pack conflicts (ADR-140) across a declared set of Packs — offline/CI only",
  )
  .requiredOption(
    "--pack <module>",
    "Pack module spec (repeatable; pass at least two)",
    (v: string, acc: string[]) => {
      acc.push(v);
      return acc;
    },
    [] as string[],
  )
  .option("--format <text|json>", "Output format", "text")
  .action(async (options: { pack: string[]; format?: string }) => {
    await runAnalyzeComposition({
      packs: options.pack,
      format: options.format === "json" ? "json" : "text",
    });
  });

program
  .command("demo")
  .description(
    "Zero-config tour: adjudicate a bundled Pack across six scenarios and render every Decision kind in colour. No API key, network, or Docker.",
  )
  .option("--format <text|json>", "Output format. Defaults to text", "text")
  .action(async (options: { format?: string }) => {
    const format = (options.format ?? "text") as SimulationFormat;
    if (format !== "text" && format !== "json") {
      console.error(`✗ Unknown --format value "${options.format}". Use text or json.`);
      process.exit(1);
    }
    await runDemo({ format });
  });

program
  .command("dev")
  .description(
    "Spin up a local Docker Compose harness (Redis + Postgres) for development",
  )
  .option("--stop", "Stop services (`docker compose down`)", false)
  .option("--logs", "Tail service logs (`docker compose logs -f`)", false)
  .action(async (options: { stop?: boolean; logs?: boolean }) => {
    await runDev({ stop: options.stop ?? false, logs: options.logs ?? false });
  });

program
  .command("discover <mcp-endpoint>")
  .description(
    "Connect to an MCP server (HTTP/SSE), call tools/list, and scaffold a conformant deny-by-default Pack",
  )
  .option(
    "--name <name>",
    "Pack name to scaffold (kebab-case). Defaults to a name derived from the endpoint.",
  )
  .option(
    "--target <dir>",
    "Override the parent directory the Pack is created under",
  )
  .action(
    async (endpoint: string, options: { name?: string; target?: string }) => {
      await runDiscover(endpoint, {
        ...(options.name !== undefined ? { name: options.name } : {}),
        ...(options.target !== undefined ? { target: options.target } : {}),
      });
    },
  );

program
  .command("doctor")
  .description("Verify the local environment for adjudicate development")
  .action(async () => {
    await runDoctor();
  });

program
  .command("export")
  .description(
    "Export audit records (JSONL source) to JSON, CSV, or Parquet (Parquet deferred to v0.6)",
  )
  .requiredOption(
    "--source <path>",
    "Source JSONL or JSON-array file produced by the audit sink",
  )
  .option("--format <json|csv|parquet>", "Output format. Defaults to json (unlike other commands which default to text; json is the primary use-case for export).", "json")
  .option("--output <file>", "Write to file instead of stdout")
  .option("--since <iso>", "Lower bound on recordedAt (inclusive)")
  .option("--until <iso>", "Upper bound on recordedAt (exclusive)")
  .action(
    async (options: {
      source: string;
      format?: string;
      output?: string;
      since?: string;
      until?: string;
    }) => {
      const format = (options.format ?? "json") as ExportFormat;
      if (format !== "json" && format !== "csv" && format !== "parquet") {
        console.error(`✗ Unknown --format value "${options.format}". Use json, csv, or parquet.`);
        process.exit(1);
      }
      await runExport({
        source: options.source,
        format,
        ...(options.output !== undefined ? { output: options.output } : {}),
        ...(options.since !== undefined ? { since: options.since } : {}),
        ...(options.until !== undefined ? { until: options.until } : {}),
      });
    },
  );

const pack = program
  .command("pack")
  .description("Pack lifecycle commands");

pack
  .command("init <name>")
  .description("Scaffold a new Pack with the canonical layout")
  .option(
    "--target <dir>",
    "Override the parent directory the Pack is created under",
  )
  .option(
    "--template <name>",
    `Domain template to scaffold from: ${TEMPLATE_NAMES.join(", ")}. Defaults to basic.`,
    "basic",
  )
  .action(
    async (
      name: string,
      options: { target?: string; template?: string },
    ) => {
      await runPackInit(name, {
        target: options.target,
        template: options.template as TemplateName | undefined,
      });
    },
  );

pack
  .command("lint [path]")
  .description(
    "Validate a Pack at <path> (default: cwd) against kernel conformance",
  )
  .action(async (packPath: string | undefined) => {
    await runPackLint(packPath);
  });

pack
  .command("bom <path>")
  .description("Emit an AI Bill-of-Materials (AI-BOM) for a Pack (ADR-127)")
  .option("--kernel-version <semver>", "Kernel version to record in the BOM")
  .option("--model-version <id>", "LLM model id the Pack is tested against")
  .action(
    async (packPath: string, options: { kernelVersion?: string; modelVersion?: string }) => {
      await runPackBom({
        pack: packPath,
        ...(options.kernelVersion !== undefined ? { kernelVersion: options.kernelVersion } : {}),
        ...(options.modelVersion !== undefined ? { modelVersion: options.modelVersion } : {}),
      });
    },
  );

pack
  .command("verify [path]")
  .description(
    "Verify a Pack's trust posture: fingerprint + optional signature + manifest",
  )
  .option(
    "--expect <hex>",
    "Expected SHA-256 fingerprint. Mismatch is a hard failure.",
  )
  .option(
    "--expect-seal <hex>",
    "Expected SHA-256 of the ConfigSeal surface (081: pins guard code bodies). Mismatch is a hard failure.",
  )
  .option("--public-key <pem-path>", "Path to a PEM-encoded public key")
  .option(
    "--signature <json-path>",
    'Path to a JSON file with { "algorithm", "keyId", "value": "<base64>" }',
  )
  .option(
    "--policy <policy>",
    'Trust policy: none | best_effort | require_fingerprint | require_signature. Defaults to best_effort; use require_signature to match the strict installPack load-time gate (082).',
    "best_effort",
  )
  .option("--quiet", "Print only the fingerprint on stdout; exit 1 on failure", false)
  .action(
    async (
      packPath: string | undefined,
      options: {
        expect?: string;
        expectSeal?: string;
        publicKey?: string;
        signature?: string;
        policy?: string;
        quiet?: boolean;
      },
    ) => {
      const policy = (options.policy ?? "best_effort") as TrustPolicy;
      const allowed: TrustPolicy[] = [
        "none",
        "best_effort",
        "require_fingerprint",
        "require_signature",
      ];
      if (!allowed.includes(policy)) {
        console.error(
          `✗ Unknown --policy value "${options.policy}". Use one of: ${allowed.join(", ")}`,
        );
        process.exit(1);
      }
      await runPackVerify(packPath, {
        ...(options.expect !== undefined ? { expect: options.expect } : {}),
        ...(options.expectSeal !== undefined ? { expectSeal: options.expectSeal } : {}),
        ...(options.publicKey !== undefined
          ? { publicKey: options.publicKey }
          : {}),
        ...(options.signature !== undefined
          ? { signature: options.signature }
          : {}),
        policy,
        quiet: options.quiet ?? false,
      });
    },
  );

program
  .command("reap")
  .description(
    "Scan the Idle-DeferStore (Redis) for `defer:pending:*` keys and report TTL status",
  )
  .option("--url <url>", "Redis connection URL", "redis://localhost:6379")
  .option("--dry-run", "Print what would be reaped without acting", false)
  .option("--format <text|json>", "Output format. Defaults to text", "text")
  .action(
    async (options: { url?: string; dryRun?: boolean; format?: string }) => {
      const format = (options.format ?? "text") as "text" | "json";
      if (format !== "text" && format !== "json") {
        console.error(`✗ Unknown --format value "${options.format}". Use text or json.`);
        process.exit(1);
      }
      await runReap({
        ...(options.url !== undefined ? { url: options.url } : {}),
        dryRun: options.dryRun ?? false,
        format,
      });
    },
  );

program
  .command("repl")
  .description(
    "Interactive intent → decision shell. Pure adjudication; no audit sink.",
  )
  .requiredOption("--pack <module>", "Pack module spec")
  .action(async (options: { pack: string }) => {
    await runRepl({ pack: options.pack });
  });

program
  .command("replay")
  .description(
    "Re-adjudicate stored AuditRecords against a Pack and report divergence",
  )
  .requiredOption("--pack <module>", "Pack module spec")
  .requiredOption(
    "--records <file>",
    "JSON-array or JSONL file of stored AuditRecord objects",
  )
  .option("--format <text|json>", "Output format. Defaults to text", "text")
  .action(
    async (options: { pack: string; records: string; format?: string }) => {
      const format = (options.format ?? "text") as "text" | "json";
      if (format !== "text" && format !== "json") {
        console.error(`✗ Unknown --format value "${options.format}". Use text or json.`);
        process.exit(1);
      }
      await runReplay({
        pack: options.pack,
        records: options.records,
        format,
      });
    },
  );

program
  .command("red-team")
  .description(
    "Generate adversarial scenarios for a Pack and assert its kernel-level defenses hold",
  )
  .requiredOption("--pack <module>", "Pack module spec")
  .option("--seed <n>", "PRNG seed for deterministic generation")
  .option("--per-intent <n>", "Attack variants per eligible intent kind. Defaults to 3")
  .option(
    "--vectors <csv>",
    "Comma list of vectors: prompt_injection,taint_escalation,tool_scope_violation,provenance_injection. Defaults to all",
  )
  .option(
    "--canary",
    "084 — run the FROZEN adversarial-canary GATE (all vectors + ownership/IDOR). Exit 2 = ROLLBACK / 0 = PROMOTE. Ignores --vectors.",
    false,
  )
  .option(
    "--canary-policy <strict|execute-escape>",
    "084 — canary failure policy. strict (default): non-acceptable decision/error/vacuous taint pass rolls back. execute-escape: roll back ONLY on a reached EXECUTE or error (§D-1 privilege-escalation gate, for a heterogeneous shipped catalog).",
    "strict",
  )
  .option(
    "--baseline <file>",
    "084 — the CI/publish gate. Run the STRICT canary and gate it against a COMMITTED baseline JSON: PROMOTE iff no-worse-than-baseline; ROLLBACK on any NEW escape/error/IDOR/vacuity OR any §C friction regression (e.g. an IDOR REFUSE→DEFER). Documents the pre-existing 035-F1 gaps without blinding the gate. Implies --canary; overrides --canary-policy.",
  )
  .option("--format <text|json>", "Output format. Defaults to text", "text")
  .action(
    async (options: {
      pack: string;
      seed?: string;
      perIntent?: string;
      vectors?: string;
      canary?: boolean;
      canaryPolicy?: string;
      baseline?: string;
      format?: string;
    }) => {
      const format = (options.format ?? "text") as "text" | "json";
      if (format !== "text" && format !== "json") {
        console.error(`✗ Unknown --format value "${options.format}". Use text or json.`);
        process.exit(1);
      }
      const canaryPolicy = (options.canaryPolicy ?? "strict") as "strict" | "execute-escape";
      if (canaryPolicy !== "strict" && canaryPolicy !== "execute-escape") {
        console.error(`✗ Unknown --canary-policy value "${options.canaryPolicy}". Use strict or execute-escape.`);
        process.exit(1);
      }
      // 041 — `provenance_injection` is an accepted vector key (its generator
      // lands in 042/043; requesting it today yields zero scenarios).
      const VALID = [
        "prompt_injection",
        "taint_escalation",
        "tool_scope_violation",
        "provenance_injection",
      ] as const;
      type Vector = (typeof VALID)[number];
      let vectors: ReadonlyArray<Vector> | undefined;
      if (options.vectors !== undefined) {
        const parts = options.vectors.split(",").map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (!VALID.includes(p as Vector)) {
            console.error(`✗ Unknown vector "${p}". Use ${VALID.join(", ")}.`);
            process.exit(1);
          }
        }
        vectors = parts as ReadonlyArray<Vector>;
      }
      // --baseline implies canary mode (the baseline-anchored STRICT gate).
      const canaryMode = options.canary === true || options.baseline !== undefined;
      await runRedTeamCommand({
        pack: options.pack,
        ...(options.seed !== undefined ? { seed: Number(options.seed) } : {}),
        ...(options.perIntent !== undefined ? { perIntent: Number(options.perIntent) } : {}),
        ...(vectors !== undefined ? { vectors } : {}),
        ...(canaryMode ? { canary: true, canaryPolicy } : {}),
        ...(options.baseline !== undefined ? { baseline: options.baseline } : {}),
        format,
      });
    },
  );

const scenarios = program
  .command("scenarios")
  .description("Scenario fixture commands");

scenarios
  .command("generate")
  .description(
    "Generate scenario JSON fixtures from a Pack's intents (seeded LCG)",
  )
  .requiredOption("--pack <module>", "Pack module spec")
  .requiredOption("--output <dir>", "Output directory (must exist)")
  .option("--count <n>", "Fixtures per intent kind. Defaults to 3", "3")
  .option("--seed <n>", "PRNG seed. Defaults to 42", "42")
  .action(
    async (options: {
      pack: string;
      output: string;
      count?: string;
      seed?: string;
    }) => {
      const count = Number(options.count ?? "3");
      const seed = Number(options.seed ?? "42");
      if (!Number.isFinite(count) || count < 1) {
        console.error(`✗ --count must be a positive integer.`);
        process.exit(1);
      }
      if (!Number.isFinite(seed)) {
        console.error(`✗ --seed must be a finite number.`);
        process.exit(1);
      }
      await runScenariosGenerate({
        pack: options.pack,
        output: options.output,
        count,
        seed,
      });
    },
  );

program
  .command("simulate")
  .description(
    "Run envelopes against a Pack's policy. Single (--scenario / --intent+--state) or diff (--scenarios <dir>)",
  )
  .requiredOption(
    "--pack <module>",
    "Pack module spec — npm package name or relative/absolute path",
  )
  .option(
    "--scenarios <dir>",
    "Directory of *.json scenarios. Diff mode: each is run and compared to its expected.kind; exits 2 on any mismatch, 1 on errors",
  )
  .option(
    "--scenario <file>",
    "Single bundled scenario JSON (intent + state + optional expected)",
  )
  .option("--intent <file>", "Intent JSON (must be paired with --state)")
  .option("--state <file>", "State JSON (must be paired with --intent)")
  .option("--format <text|json>", "Output format. Defaults to text", "text")
  .action(
    async (options: {
      pack: string;
      scenario?: string;
      scenarios?: string;
      intent?: string;
      state?: string;
      format?: string;
    }) => {
      const format = (options.format ?? "text") as SimulationFormat;
      if (format !== "text" && format !== "json") {
        console.error(`✗ Unknown --format value "${options.format}". Use text or json.`);
        process.exit(1);
      }
      await runSimulate({
        pack: options.pack,
        scenario: options.scenario,
        scenarios: options.scenarios,
        intent: options.intent,
        state: options.state,
        format,
      });
    },
  );

program
  .command("visualize")
  .description(
    "Render a Pack's PolicyBundle as a standalone HTML (SVG) policy graph",
  )
  .requiredOption("--pack <module>", "Pack module spec")
  .option("--output <file>", "Output HTML file. Defaults to policy.html", "policy.html")
  .action(async (options: { pack: string; output?: string }) => {
    await runVisualize({
      pack: options.pack,
      ...(options.output !== undefined ? { output: options.output } : {}),
    });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
