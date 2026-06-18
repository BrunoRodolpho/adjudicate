/**
 * Pure command-risk classification for CLI/terminal agents (ADR-123).
 *
 * Defense-in-depth, NOT a sandbox: a regex/prefix rule table over a proposed
 * shell command. Deterministic — no clock/I/O/RNG. The rule tables are frozen
 * module constants; adopters may override per call.
 */

export type CommandRiskCategory = "destructive" | "network" | "credential" | "safe";

export interface CommandRule {
  readonly category: Exclude<CommandRiskCategory, "safe">;
  /** Stable rule id for audit detail + dedup. */
  readonly id: string;
  readonly test: (command: string) => boolean;
  /** Baseline disposition for this rule when no strippable flag applies. */
  readonly severity: "refuse" | "confirm";
}

export interface CommandClassification {
  readonly category: CommandRiskCategory;
  readonly matchedRuleIds: ReadonlyArray<string>;
  readonly disposition: "refuse" | "confirm" | "rewrite" | "safe";
}

export interface FlagStripRule {
  /** The dangerous flag token to strip (matched as a whole word). */
  readonly flag: string;
  /** Only strip on commands this predicate matches. */
  readonly appliesTo: (command: string) => boolean;
}

// Case-insensitive (defense-in-depth: catch `RM`/`DD` on case-insensitive
// filesystems and obfuscation attempts, not just lowercase canonical names).
// The left-boundary class includes path + shell-substitution characters so a
// path-qualified (`/bin/rm`) or substitution-embedded (`` `rm -rf /` ``,
// `$(rm ...)`) invocation still classifies as destructive — a bare `\s`/`;`/`|`
// boundary missed those and let them fall through to "safe".
const isRm = (c: string) => /(^|[\s;&|/$(){}`])\s*rm(\s|$)/i.test(c);

/**
 * Irrecoverable `rm` targets: the filesystem root (`/`, `/*`), the entire home
 * directory (`~`, `~/`, `~/*`), and `$HOME`/`${HOME}`. A target like `/tmp/x` or
 * `~/Downloads` is NOT catastrophic (it falls through to the recoverable CONFIRM
 * tier) — only the whole-root / whole-home targets refuse outright. Any `rm`
 * against these (with or without flags) is irrecoverable, so flags are irrelevant.
 */
const CATASTROPHIC_RM_TARGET = /(^|\s)(\/\*?|~\/?\*?|\$\{?HOME\}?)(\s|$)/i;

/** Frozen default rule table. Exported for testing + override. */
export const DEFAULT_COMMAND_RULES: ReadonlyArray<CommandRule> = Object.freeze([
  // Irrecoverable destruction → REFUSE outright.
  { id: "rm_rf_root", category: "destructive", severity: "refuse", test: (c) => isRm(c) && CATASTROPHIC_RM_TARGET.test(c) },
  { id: "fork_bomb", category: "destructive", severity: "refuse", test: (c) => /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/.test(c) },
  { id: "dd_to_device", category: "destructive", severity: "refuse", test: (c) => /\bdd\b[^\n]*of=\/dev\//i.test(c) },
  { id: "mkfs", category: "destructive", severity: "refuse", test: (c) => /\bmkfs(\.\w+)?\b/i.test(c) },
  // Irrecoverable disk wipe / writing to a raw block device (covers `of=/dev/sdX`
  // and both `>/dev/sdX` and `> /dev/sdX` redirect forms).
  { id: "shred", category: "destructive", severity: "refuse", test: (c) => /(^|[\s;&|/$(){}`])shred(\s|$)/i.test(c) },
  { id: "write_block_device", category: "destructive", severity: "refuse", test: (c) => /(\bof\s*=\s*|>\s*)\/dev\/(sd|nvme|hd|vd|disk|mmcblk)/i.test(c) },
  // Raw-device partition / filesystem tools — destructive intent on a block device.
  { id: "disk_partition_tool", category: "destructive", severity: "refuse", test: (c) => /(^|[\s;&|/$(){}`])(wipefs|sgdisk|parted|fdisk|cfdisk|sfdisk|mkswap)(\s|$)/i.test(c) },
  // Recursive / world-writable chmod against the filesystem root or home.
  { id: "chmod_catastrophic", category: "destructive", severity: "refuse", test: (c) => /(^|[\s;&|/$(){}`])chmod\b/i.test(c) && /(\s-[^\s]*[Rr]\b|\s0?777\b)/.test(c) && CATASTROPHIC_RM_TARGET.test(c) },
  // Recoverable-ish destruction → CONFIRM (or REWRITE if a flag is strippable).
  { id: "rm_recursive", category: "destructive", severity: "confirm", test: (c) => isRm(c) && /-[^\s]*r/i.test(c) },
  // Network exfil/execution.
  { id: "curl_pipe_shell", category: "network", severity: "confirm", test: (c) => /\b(curl|wget)\b[^\n]*\|\s*(sh|bash|zsh)\b/.test(c) },
  { id: "outbound_fetch", category: "network", severity: "confirm", test: (c) => /\b(curl|wget|nc|netcat)\b/.test(c) },
  // Credential exposure.
  { id: "read_credentials_file", category: "credential", severity: "confirm", test: (c) => /(\.aws\/credentials|\.ssh\/id_|\.netrc|\/\.env\b|(^|\/)\.env(\s|$))/.test(c) },
  { id: "echo_secret_env", category: "credential", severity: "confirm", test: (c) => /\$\{?[A-Z_]*(SECRET|TOKEN|PASSWORD|KEY)[A-Z_]*\}?/.test(c) },
]);

/** Flags that are purely safety-disabling and safe to strip under a REWRITE. */
export const DEFAULT_FLAG_STRIP_RULES: ReadonlyArray<FlagStripRule> = Object.freeze([
  { flag: "--no-preserve-root", appliesTo: isRm },
  { flag: "-f", appliesTo: (c) => isRm(c) },
  { flag: "--force", appliesTo: isRm },
]);

/** Pure classifier. Returns the highest-severity category + matched rule ids. */
export function classifyCommand(
  command: string,
  rules: ReadonlyArray<CommandRule> = DEFAULT_COMMAND_RULES,
): CommandClassification {
  const matched = rules.filter((r) => r.test(command));
  if (matched.length === 0) {
    return { category: "safe", matchedRuleIds: [], disposition: "safe" };
  }
  const matchedRuleIds = matched.map((r) => r.id);
  const anyRefuse = matched.some((r) => r.severity === "refuse");
  // Category precedence: destructive > credential > network.
  const category: CommandRiskCategory = matched.some((r) => r.category === "destructive")
    ? "destructive"
    : matched.some((r) => r.category === "credential")
      ? "credential"
      : "network";
  return {
    category,
    matchedRuleIds,
    disposition: anyRefuse ? "refuse" : "confirm",
  };
}

/** Pure flag-sanitizer. Returns the sanitized command + the flags removed. */
export function stripDangerousFlags(
  command: string,
  rules: ReadonlyArray<FlagStripRule> = DEFAULT_FLAG_STRIP_RULES,
): { readonly command: string; readonly stripped: ReadonlyArray<string> } {
  let out = command;
  const stripped: string[] = [];
  for (const rule of rules) {
    if (!rule.appliesTo(command)) continue;
    const re = new RegExp(`(^|\\s)${rule.flag.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?=\\s|$)`, "g");
    if (re.test(out)) {
      out = out.replace(re, "$1").replace(/\s{2,}/g, " ").trimEnd();
      stripped.push(rule.flag);
    }
  }
  return { command: out, stripped };
}
