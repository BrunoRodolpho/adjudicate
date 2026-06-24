/**
 * SANDBOX mode content — the "Configure & test" surface.
 *
 * Each {@link SandboxPackSchema} describes a Pack's intents as flat form
 * field lists so a single generic form component can render inputs (string,
 * number, enum, toggle, slider, money) WITHOUT the user touching raw JSON.
 * A "view raw JSON" affordance is an expert toggle, not the default.
 *
 * Defaults are seeded from `pack-presets.ts` so the form opens on a payload
 * that is known to produce a real, sensible verdict. `help` text is lifted
 * from `intent-schemas.ts`. The named state knobs the brief calls out live
 * in `stateKnobs` with a `statePath` the form writes into `baseState`:
 *   - Token Budget: `tokensConsumed`
 *   - Deployments:  `rampPercent` (1-100 slider — a payload field, exposed as
 *                   a slider control; see note below)
 *   - PIX refund:   the original charge amount (a state knob that sets the
 *                   target charge's `amountCentavos`).
 *
 * Note on the deployments ramp: `rampPercent` is a PAYLOAD field, not state,
 * so it lives in `payloadFields` with `control: "slider"`. Only knobs that
 * write into Pack STATE belong in `stateKnobs`.
 *
 * Determinism: every value here is a fixed literal — no clock, no random.
 */

export type SandboxControl = "input" | "select" | "slider" | "toggle";

export type SandboxFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "money-centavos";

export interface SandboxField {
  /** Payload key this field writes to. */
  readonly name: string;
  /** Human label. */
  readonly label: string;
  readonly type: SandboxFieldType;
  readonly required?: boolean;
  readonly default?: unknown;
  /** Allowed values when `type === "enum"`. */
  readonly enumValues?: ReadonlyArray<string>;
  /** Numeric bounds (also used for slider range). */
  readonly min?: number;
  readonly max?: number;
  /** One-line help, lifted from intent-schemas where available. */
  readonly help?: string;
  /** Preferred control. Defaults inferred from `type` when omitted. */
  readonly control?: SandboxControl;
}

/**
 * A field that writes into Pack STATE (not the payload). `statePath` is a
 * dot path into the `baseState` object, e.g. `"tokensConsumed"` or
 * `"charges.ch_sandbox_1.amountCentavos"`.
 */
export interface StateKnob extends SandboxField {
  readonly statePath: string;
}

export interface SandboxIntentSchema {
  readonly intentKind: string;
  readonly label: string;
  readonly payloadFields: ReadonlyArray<SandboxField>;
  readonly stateKnobs?: ReadonlyArray<StateKnob>;
  /** Seed state the knobs mutate; passed to the kernel as `state`. */
  readonly baseState?: unknown;
}

export interface SandboxPackSchema {
  readonly packId: string;
  readonly displayName: string;
  readonly intents: ReadonlyArray<SandboxIntentSchema>;
}

export const SANDBOX_SCHEMAS: ReadonlyArray<SandboxPackSchema> = [
  // ── Payments · PIX ─────────────────────────────────────────────────
  {
    packId: "payments-pix",
    displayName: "Payments · PIX",
    intents: [
      {
        intentKind: "pix.charge.create",
        label: "Create a charge",
        payloadFields: [
          {
            name: "amountCentavos",
            label: "Amount",
            type: "money-centavos",
            required: true,
            default: 1500,
            min: 1,
            help: "Amount in centavos. Hard rule: never floats.",
          },
          {
            name: "payerDocument",
            label: "Payer document (CPF/CNPJ)",
            type: "string",
            required: true,
            default: "12345678900",
            help: "CPF (11 digits) or CNPJ (14 digits), digits only.",
          },
          {
            name: "description",
            label: "Description",
            type: "string",
            default: "Coffee, two espressos",
            help: "Free-text description shown to payer in their bank app.",
          },
        ],
      },
      {
        intentKind: "pix.charge.refund",
        label: "Refund a charge",
        payloadFields: [
          {
            name: "chargeId",
            label: "Charge id",
            type: "string",
            required: true,
            default: "ch_sandbox_1",
            help: "Charge id from a prior pix.charge.create.",
          },
          {
            name: "refundCentavos",
            label: "Refund amount",
            type: "money-centavos",
            required: true,
            default: 3000,
            min: 1,
            help: "Refund amount in centavos. May be REWRITTEN if it exceeds the original charge.",
          },
          {
            name: "reason",
            label: "Reason",
            type: "string",
            default: "customer complaint",
            help: "Free-text reason shown in the audit trail.",
          },
        ],
        stateKnobs: [
          {
            name: "originalChargeCentavos",
            label: "Original charge amount",
            type: "money-centavos",
            default: 1500,
            min: 1,
            statePath: "charges.ch_sandbox_1.amountCentavos",
            help: "The amount of the charge being refunded. Refunds above this are clamped.",
          },
        ],
        baseState: {
          charges: {
            ch_sandbox_1: {
              id: "ch_sandbox_1",
              amountCentavos: 1500,
              status: "confirmed",
              createdAt: "2026-05-13T11:00:00.000Z",
              confirmedAt: "2026-05-13T11:01:00.000Z",
            },
          },
        },
      },
    ],
  },

  // ── Identity · KYC ─────────────────────────────────────────────────
  {
    packId: "identity-kyc",
    displayName: "Identity · KYC",
    intents: [
      {
        intentKind: "kyc.start",
        label: "Start a verification session",
        payloadFields: [
          {
            name: "sessionId",
            label: "Session id",
            type: "string",
            required: true,
            default: "kyc_sandbox_1",
            help: "Caller-supplied unique session id.",
          },
          {
            name: "userId",
            label: "User id",
            type: "string",
            required: true,
            default: "u_sandbox_1",
            help: "Internal user id the session is being run for.",
          },
        ],
      },
      {
        intentKind: "kyc.document.upload",
        label: "Upload a document",
        payloadFields: [
          {
            name: "sessionId",
            label: "Session id",
            type: "string",
            required: true,
            default: "kyc_sandbox_1",
            help: "Session id from a prior kyc.start.",
          },
          {
            name: "documentType",
            label: "Document type",
            type: "enum",
            required: true,
            default: "passport",
            enumValues: ["passport", "drivers_license", "national_id"],
            control: "select",
            help: "Type of document being uploaded.",
          },
          {
            name: "documentRef",
            label: "Document reference",
            type: "string",
            required: true,
            default: "blob_xyz",
            help: "Blob storage reference for the uploaded scan.",
          },
        ],
      },
    ],
  },

  // ── Deployments · Approval ─────────────────────────────────────────
  {
    packId: "deployments-approval",
    displayName: "Deployments · Approval",
    intents: [
      {
        intentKind: "deployment.approval.request",
        label: "Request a deployment",
        payloadFields: [
          {
            name: "service",
            label: "Service",
            type: "string",
            required: true,
            default: "api",
            help: "Service name being deployed.",
          },
          {
            name: "environment",
            label: "Environment",
            type: "enum",
            required: true,
            default: "staging",
            enumValues: ["staging", "production"],
            control: "select",
            help: "Target environment. REFUSEd otherwise.",
          },
          {
            name: "gitSha",
            label: "Git SHA",
            type: "string",
            required: true,
            default: "deadbeefdeadbeef",
            help: "Git commit SHA being deployed. Empty string is REFUSEd.",
          },
          {
            name: "rampPercent",
            label: "Ramp %",
            type: "integer",
            required: true,
            default: 25,
            min: 1,
            max: 100,
            control: "slider",
            help: "Traffic percentage (1–100). In the sandbox, production has no prior approval, so it routes to a human (ESCALATE); staging EXECUTEs.",
          },
        ],
      },
      {
        intentKind: "deployment.rollback.execute",
        label: "Execute a rollback",
        payloadFields: [
          {
            name: "service",
            label: "Service",
            type: "string",
            required: true,
            default: "api",
            help: "Service to roll back.",
          },
          {
            name: "environment",
            label: "Environment",
            type: "enum",
            required: true,
            default: "production",
            enumValues: ["staging", "production"],
            control: "select",
            help: "Target environment.",
          },
          {
            name: "toGitSha",
            label: "Roll back to SHA",
            type: "string",
            required: true,
            default: "deadbeefdeadbeef",
            help: "Git SHA to roll back to. Empty string is REFUSEd.",
          },
          {
            name: "confirmationToken",
            label: "Confirmation token",
            type: "string",
            default: "",
            help: "Required for production rollbacks; absence triggers REQUEST_CONFIRMATION.",
          },
        ],
      },
    ],
  },

  // ── Data Classification · PII ──────────────────────────────────────
  {
    packId: "pii-redaction",
    displayName: "Data Classification · PII",
    intents: [
      {
        intentKind: "support.ticket.create",
        label: "Create a support ticket",
        payloadFields: [
          {
            name: "subject",
            label: "Subject",
            type: "string",
            required: true,
            default: "Cannot log in",
            help: "Ticket subject. Scanned for classified data.",
          },
          {
            name: "body",
            label: "Body",
            type: "string",
            required: true,
            default:
              "My SSN is 123-45-6789 and card 4111111111111111, please help.",
            help: "Ticket body. SSN / card patterns are REWRITE-redacted; clean text EXECUTEs.",
          },
        ],
      },
    ],
  },

  // ── Token Budget · Cost Control ────────────────────────────────────
  {
    packId: "token-budget",
    displayName: "Token Budget · Cost Control",
    intents: [
      {
        intentKind: "agent.step",
        label: "Take an agent step",
        payloadFields: [
          {
            name: "tool",
            label: "Tool",
            type: "string",
            required: true,
            default: "search",
            help: "Name of the tool the agent step would invoke.",
          },
        ],
        stateKnobs: [
          {
            name: "tokensConsumed",
            label: "Tokens already consumed",
            type: "integer",
            default: 1200,
            min: 0,
            max: 10000,
            control: "slider",
            statePath: "tokensConsumed",
            help: "Running session counter. At/over the 5,000 budget the step is REFUSEd.",
          },
        ],
        baseState: { tokensConsumed: 1200 },
      },
    ],
  },

  // ── Terminal · Command Risk ────────────────────────────────────────
  {
    packId: "command-risk",
    displayName: "Terminal · Command Risk",
    intents: [
      {
        intentKind: "terminal.run",
        label: "Run a shell command",
        payloadFields: [
          {
            name: "command",
            label: "Command",
            type: "string",
            required: true,
            default: "ls -la",
            help: "Shell command to grade. Safe runs; risky patterns REWRITE / REQUEST_CONFIRMATION / REFUSE.",
          },
        ],
      },
    ],
  },
];

/** Convenience lookup by Pack id. */
export const SANDBOX_SCHEMA_BY_PACK: Record<string, SandboxPackSchema> =
  Object.fromEntries(SANDBOX_SCHEMAS.map((s) => [s.packId, s]));
