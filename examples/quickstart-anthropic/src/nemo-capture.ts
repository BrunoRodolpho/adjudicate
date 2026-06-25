/**
 * Live-run capture + recording client for the Nemotron validation harness.
 *
 * Two responsibilities:
 *  1. `RecordingOpenAIClient` — wraps a structural OpenAIChatLikeClient and
 *     records, per call: the request body (system+messages+tools), the raw
 *     model response, latencyMs, token usage, and tokens/sec. Used to feed the
 *     replay corpus with the *exact* model I/O.
 *  2. `writeLiveRun` — writes one replay record per turn to
 *     ~/projects/validation_artifacts/live-runs/run-NNN.json (and mirrors it to
 *     replay_corpus/). The record carries intentHash + canonicalIntent +
 *     policyVersion + providerVersion + modelConfig so a future regression is
 *     pinned to a provider/policy/model change, not guessed.
 *
 * No product logic lives here — this is pure evidence capture.
 */

import { mkdirSync, writeFileSync, readdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ARTIFACTS =
  process.env.NEMO_ARTIFACTS ?? join(homedir(), "projects", "validation_artifacts");
const LIVE_RUNS = join(ARTIFACTS, "live-runs");
const REPLAY = join(ARTIFACTS, "replay_corpus");

for (const d of [LIVE_RUNS, REPLAY]) mkdirSync(d, { recursive: true });

/** One captured model call (request + raw response + timing). */
export interface ModelCallCapture {
  readonly requestBody: unknown;
  readonly rawResponse: unknown;
  readonly latencyMs: number;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly tokensPerSec: number | null;
}

/** The replay record schema (plan §"Reproducibility — golden transcripts"). */
export interface LiveRunRecord {
  readonly track: string;
  readonly scenario: string;
  readonly expected?: string;
  readonly provider: string;
  readonly providerVersion: string;
  readonly modelConfig: { model: string; temperature?: number; num_ctx?: number };
  readonly system?: string;
  readonly userMessage?: string;
  readonly modelCalls: ReadonlyArray<ModelCallCapture>;
  readonly toolCalls: unknown;
  readonly canonicalIntent?: unknown;
  readonly intentHash?: string;
  readonly decisionKind?: string;
  readonly decision?: unknown;
  readonly policyVersion?: string;
  readonly finalOutput?: string;
  readonly state?: unknown;
  readonly outcome?: string;
  readonly latencyMs: number;
  readonly tokensPerSec: number | null;
  readonly capturedAt: string;
}

let seq = 0;
function nextSeq(): string {
  if (seq === 0) {
    // Seed from the MAX run number present (not count) so a gap (run-001, run-003) never
    // causes the next id to collide and overwrite an existing capture.
    const existing = readdirSync(LIVE_RUNS).filter((f) => /^run-\d+\.json$/.test(f));
    seq = Math.max(0, ...existing.map((f) => parseInt(f.match(/\d+/)?.[0] ?? "0", 10)));
  }
  seq += 1;
  return String(seq).padStart(3, "0");
}

export function writeLiveRun(record: LiveRunRecord): string {
  const id = nextSeq();
  const file = join(LIVE_RUNS, `run-${id}.json`);
  const json = JSON.stringify({ id, ...record }, null, 2);
  writeFileSync(file, json);
  // mirror a compact line to the replay corpus jsonl for bulk reproduction
  appendFileSync(
    join(REPLAY, `${record.track}.jsonl`),
    JSON.stringify({ id, ...record }) + "\n",
  );
  return file;
}

/** Wrap a structural OpenAI chat client to capture every call. */
export function makeRecordingClient(
  inner: { chat: { completions: { create(body: unknown): Promise<unknown> } } },
): {
  client: { chat: { completions: { create(body: unknown): Promise<unknown> } } };
  drain(): ModelCallCapture[];
} {
  const captures: ModelCallCapture[] = [];
  const client = {
    chat: {
      completions: {
        async create(body: unknown): Promise<unknown> {
          const t0 = performance.now();
          const res = await inner.chat.completions.create(body);
          const latencyMs = performance.now() - t0;
          const usage = (res as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
            .usage;
          const completionTokens = usage?.completion_tokens ?? null;
          const tokensPerSec =
            completionTokens != null && latencyMs > 0
              ? Number(((completionTokens / latencyMs) * 1000).toFixed(2))
              : null;
          captures.push({
            requestBody: body,
            rawResponse: res,
            latencyMs: Number(latencyMs.toFixed(1)),
            promptTokens: usage?.prompt_tokens ?? null,
            completionTokens,
            tokensPerSec,
          });
          return res;
        },
      },
    },
  };
  return { client, drain: () => captures.splice(0, captures.length) };
}

/** Minimal structural OpenAIChatLikeClient backed by `fetch` → Ollama's OpenAI-compatible endpoint. */
export function makeFetchOllamaClient(baseUrl: string): { chat: { completions: { create(body: unknown): Promise<unknown> } } } {
  return {
    chat: {
      completions: {
        async create(body: unknown): Promise<unknown> {
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer ollama" },
            body: JSON.stringify({ ...(body as object), stream: false }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
          return (await res.json()) as unknown;
        },
      },
    },
  };
}

/** A scripted client: call #1 returns the given tool_calls; subsequent calls return a terminal text. */
export interface RawToolCallSpec {
  name: string;
  args: unknown; // may be a string (malformed) or object
}
export function makeScriptedClient(
  toolCalls: RawToolCallSpec[],
  model = "scripted",
): { chat: { completions: { create(body: unknown): Promise<unknown> } } } {
  let n = 0;
  return {
    chat: {
      completions: {
        async create(): Promise<unknown> {
          n += 1;
          if (n === 1) {
            return {
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "",
                    tool_calls: toolCalls.map((tc, i) => ({
                      id: `call_scripted_${i}`,
                      index: i,
                      type: "function",
                      function: {
                        name: tc.name,
                        arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args),
                      },
                    })),
                  },
                  finish_reason: "tool_calls",
                },
              ],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            };
          }
          return {
            model,
            choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          };
        },
      },
    },
  };
}

/** Aggregate latency percentiles for the metrics dashboard. */
export function summarizeLatency(latencies: number[]): {
  p50: number;
  p95: number;
  max: number;
  count: number;
} {
  if (latencies.length === 0) return { p50: 0, p95: 0, max: 0, count: 0 };
  const s = [...latencies].sort((a, b) => a - b);
  // s is non-empty (early-returned above); `?? 0` satisfies noUncheckedIndexedAccess.
  const pick = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
  return {
    p50: Number(pick(50).toFixed(1)),
    p95: Number(pick(95).toFixed(1)),
    max: Number((s[s.length - 1] ?? 0).toFixed(1)),
    count: s.length,
  };
}
