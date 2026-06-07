/**
 * Display-time command redactor (ADR-134 security follow-up to ADR-123).
 *
 * The command-risk guard stores the RAW proposed command in the audit detail.
 * The aggregation + transparency surfaces never read it at all (redaction by
 * construction), but the per-record `CommandRiskBadge` legitimately shows an
 * operator the offending command on the Decision Detail. That command is tainted
 * (LLM-proposed, UNTRUSTED-origin) and the credential-category rules fire on
 * exactly the commands most likely to embed live secrets — so the badge must
 * mask secret-bearing tokens before rendering rather than echo them verbatim.
 *
 * This is an app-only display concern (no new published symbol). It masks:
 *   - env-var secret expansions: `$AWS_SECRET_…`, `${API_TOKEN}`, etc.
 *   - credential file paths: `~/.aws/credentials`, `.ssh/id_*`, `.netrc`, `.env`
 *
 * It is intentionally conservative: it preserves the command shape (so the
 * operator can still recognize what was attempted) while never echoing the
 * secret material itself.
 */

const REDACTED = "[REDACTED]";

// `$AWS_SECRET_ACCESS_KEY`, `${MY_API_TOKEN}`, `$DB_PASSWORD`, `$SOME_KEY` —
// any env expansion whose name contains SECRET|TOKEN|PASSWORD|KEY. Mirrors the
// kernel's `echo_secret_env` rule (command-classify.ts).
const SECRET_ENV = /\$\{?[A-Z_]*(?:SECRET|TOKEN|PASSWORD|KEY)[A-Z_]*\}?/g;

// Credential file paths. Mirrors the kernel's `read_credentials_file` rule.
const CREDENTIAL_PATH =
  /(?:[~./][\w./-]*)?(?:\.aws\/credentials|\.ssh\/id_[\w-]+|\.netrc|\.env)\b/g;

/**
 * Returns the command with secret-bearing tokens masked. Pure + deterministic
 * (no clock/RNG); safe to call in render.
 */
export function redactCommand(command: string): string {
  return command.replace(SECRET_ENV, REDACTED).replace(CREDENTIAL_PATH, REDACTED);
}
