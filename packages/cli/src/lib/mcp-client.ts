/**
 * Minimal MCP `tools/list` client over HTTP/SSE (v1 scope).
 *
 * `adjudicate discover <mcp-endpoint>` only needs ONE Model Context
 * Protocol call: `tools/list`. Rather than pull in
 * `@modelcontextprotocol/sdk` (a full client + transport stack) for a
 * single JSON-RPC round-trip, we hand-roll the request here. The wire
 * shape is the MCP `tools/list` request/response per the spec:
 *
 *   --> { "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
 *   <-- { "jsonrpc": "2.0", "id": 1, "result": { "tools": [ ... ] } }
 *
 * Transport: the request POSTs JSON-RPC to the endpoint. A Streamable
 * HTTP / SSE MCP server replies with either `application/json` (single
 * JSON object) or `text/event-stream` (one-or-more `data:` lines, each a
 * JSON-RPC message). We accept both and extract the first message whose
 * `id` matches our request.
 *
 * Injectability: the actual network call is a function the caller may
 * override (`FetchToolList`). Production passes nothing and gets the
 * built-in `fetch`-based transport; tests pass a stub that returns a
 * canned tool list with NO network I/O.
 */

/**
 * A single tool as advertised by an MCP server's `tools/list`. Only the
 * fields `discover` consumes are modelled; unknown fields are ignored.
 */
export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
}

/**
 * The injectable transport. Given an endpoint, resolve the advertised
 * tool list. Production uses {@link httpFetchToolList}; tests pass a stub.
 */
export type FetchToolList = (endpoint: string) => Promise<ReadonlyArray<McpTool>>;

interface JsonRpcResponse {
  readonly jsonrpc?: string;
  readonly id?: number | string | null;
  readonly result?: { readonly tools?: unknown };
  readonly error?: { readonly code?: number; readonly message?: string };
}

const JSON_RPC_ID = 1;

function buildToolsListRequest(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: JSON_RPC_ID,
    method: "tools/list",
    params: {},
  });
}

/**
 * Parse an MCP HTTP/SSE response body into the matching JSON-RPC message.
 *
 * `application/json` bodies are a single JSON object. `text/event-stream`
 * bodies carry one-or-more `data:` lines, each a JSON-RPC message; we
 * return the first whose `id` matches our request id.
 */
export function parseToolsListBody(
  body: string,
  contentType: string,
): JsonRpcResponse {
  const isEventStream = contentType.toLowerCase().includes("text/event-stream");
  if (!isEventStream) {
    return JSON.parse(body) as JsonRpcResponse;
  }
  const dataLines = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0);
  const parsed = dataLines.map((line) => JSON.parse(line) as JsonRpcResponse);
  // Match by string-coerced id (some servers echo the request id as a string),
  // then fall back to the last message — MCP SSE typically streams the result
  // as the final data line.
  const matched = parsed.find((m) => String(m.id) === String(JSON_RPC_ID));
  if (matched) return matched;
  const last = parsed.at(-1);
  if (last) return last;
  throw new Error(
    `MCP SSE response contained no JSON-RPC message (request id ${JSON_RPC_ID})`,
  );
}

function coerceTools(result: JsonRpcResponse): ReadonlyArray<McpTool> {
  if (result.error) {
    throw new Error(
      `MCP server returned JSON-RPC error ${result.error.code ?? "?"}: ${
        result.error.message ?? "unknown error"
      }`,
    );
  }
  const tools = result.result?.tools;
  if (!Array.isArray(tools)) {
    throw new Error(
      "MCP tools/list response missing a `result.tools` array",
    );
  }
  return tools.map((raw, idx): McpTool => {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as { name?: unknown }).name !== "string" ||
      ((raw as { name: string }).name).length === 0
    ) {
      throw new Error(
        `MCP tools/list entry at index ${idx} is missing a non-empty string \`name\``,
      );
    }
    const t = raw as Record<string, unknown>;
    return {
      name: t.name as string,
      ...(typeof t.description === "string"
        ? { description: t.description }
        : {}),
      ...(typeof t.inputSchema === "object" && t.inputSchema !== null
        ? { inputSchema: t.inputSchema as Record<string, unknown> }
        : {}),
    };
  });
}

/**
 * Built-in HTTP/SSE transport. POSTs a `tools/list` JSON-RPC request to
 * the endpoint and parses the response. Used in production; tests inject
 * a stub instead so no network is touched.
 */
export const httpFetchToolList: FetchToolList = async (endpoint) => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Accept both Streamable-HTTP reply styles.
      accept: "application/json, text/event-stream",
    },
    body: buildToolsListRequest(),
  });
  if (!res.ok) {
    throw new Error(
      `MCP endpoint ${endpoint} returned HTTP ${res.status} ${res.statusText}`,
    );
  }
  const contentType = res.headers.get("content-type") ?? "application/json";
  const text = await res.text();
  const message = parseToolsListBody(text, contentType);
  return coerceTools(message);
};

/**
 * List the tools advertised by an MCP endpoint. `fetchToolList` defaults
 * to the built-in HTTP/SSE transport; tests override it to avoid network.
 */
export async function listMcpTools(
  endpoint: string,
  fetchToolList: FetchToolList = httpFetchToolList,
): Promise<ReadonlyArray<McpTool>> {
  return fetchToolList(endpoint);
}
