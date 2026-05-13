/**
 * Scenario file format — the input shape `adjudicate simulate` reads.
 *
 * A scenario bundles everything one adjudication call needs: the intent
 * envelope's input fields, a state snapshot, and (optionally) an
 * expected decision kind for diff-mode comparisons.
 *
 * The scenario file carries only the user-supplied envelope fields
 * (`kind`, `payload`, `actor`, `taint`, `nonce`, optional `createdAt`).
 * The CLI feeds these through `buildEnvelope()` to produce the
 * canonical `IntentEnvelope` with `version` and `intentHash` filled in
 * — adopters never hand-author hashes.
 *
 * `state` is `unknown` at the schema layer because each Pack defines
 * its own state shape (PIX has `charges: Map<string, PixCharge>`, KYC
 * has `sessions: Map<...>`). State validation happens implicitly: if
 * the Pack's guards extract fields that aren't present, they short-
 * circuit naturally — no schema-level state validator.
 *
 * Trade-offs:
 *   - JSON-only in v0. YAML deferred — keeps the dep surface small,
 *     and JSON is what CI tooling expects.
 *   - Map<K, V> state values: scenario authors encode as a plain
 *     object and the Pack's adapters / state-rehydration layer (or
 *     in-test code) reconstitute Maps if needed. The kernel itself
 *     never iterates state; only guards do.
 */

import { promises as fs } from "node:fs";
import { z, type ZodIssue } from "zod";

// ─── Zod schema ────────────────────────────────────────────────────────────

const TaintSchema = z.enum(["SYSTEM", "TRUSTED", "UNTRUSTED"]);

const ActorSchema = z
  .object({
    principal: z.enum(["llm", "user", "system"]),
    sessionId: z.string().min(1),
  })
  .strict();

const IntentInputSchema = z
  .object({
    kind: z.string().min(1),
    payload: z.unknown(),
    actor: ActorSchema,
    taint: TaintSchema,
    nonce: z.string().min(1),
    createdAt: z.string().min(1).optional(),
  })
  .strict();

const DecisionKindSchema = z.enum([
  "EXECUTE",
  "REFUSE",
  "ESCALATE",
  "REQUEST_CONFIRMATION",
  "DEFER",
  "REWRITE",
]);

const ScenarioSchema = z
  .object({
    intent: IntentInputSchema,
    state: z.unknown(),
    expected: z
      .object({ kind: DecisionKindSchema })
      .strict()
      .optional(),
  })
  .strict();

export type Scenario = z.infer<typeof ScenarioSchema>;
export type IntentInput = z.infer<typeof IntentInputSchema>;

// ─── Loading + validation ──────────────────────────────────────────────────

export class ScenarioParseError extends Error {
  constructor(
    public readonly path: string,
    public readonly issues: ReadonlyArray<ZodIssue>,
  ) {
    super(formatIssues(path, issues));
    this.name = "ScenarioParseError";
  }
}

function formatIssues(
  filePath: string,
  issues: ReadonlyArray<ZodIssue>,
): string {
  const lines = issues.map((iss) => {
    const where = iss.path.length > 0 ? iss.path.join(".") : "<root>";
    return `  • ${where}: ${iss.message}`;
  });
  return `Scenario validation failed (${filePath}):\n${lines.join("\n")}`;
}

/**
 * Load a scenario from a single JSON file containing `intent` + `state`
 * (+ optional `expected`).
 */
export async function loadScenario(filePath: string): Promise<Scenario> {
  const raw = await readJson(filePath);
  return parseScenario(raw, filePath);
}

/**
 * Load a scenario from a pair of files: `intentPath` carries the intent
 * input fields, `statePath` carries the state snapshot. Useful when the
 * same state is shared across many intent fixtures.
 *
 * The intent file's top-level shape is the same as the `intent` field
 * of the bundled scenario format. The state file's content becomes
 * `state` directly.
 */
export async function loadIntentAndState(
  intentPath: string,
  statePath: string,
): Promise<Scenario> {
  const [intentRaw, stateRaw] = await Promise.all([
    readJson(intentPath),
    readJson(statePath),
  ]);
  return parseScenario(
    { intent: intentRaw, state: stateRaw },
    `${intentPath} + ${statePath}`,
  );
}

function parseScenario(raw: unknown, sourcePath: string): Scenario {
  const result = ScenarioSchema.safeParse(raw);
  if (!result.success) {
    throw new ScenarioParseError(sourcePath, result.error.issues);
  }
  return result.data;
}

async function readJson(filePath: string): Promise<unknown> {
  const text = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    throw new Error(`Failed to parse JSON in ${filePath}: ${e.message}`);
  }
}
