import { describe, expect, it } from "vitest";
import { redactCommand } from "./redact-command";

describe("redactCommand", () => {
  it("masks secret env-var expansions (SECRET/TOKEN/PASSWORD/KEY)", () => {
    expect(redactCommand("echo $AWS_SECRET_ACCESS_KEY")).not.toContain(
      "AWS_SECRET_ACCESS_KEY",
    );
    expect(redactCommand("echo ${MY_API_TOKEN}")).not.toContain("MY_API_TOKEN");
    expect(redactCommand("export DB_PASSWORD=$DB_PASSWORD")).not.toMatch(
      /\$DB_PASSWORD/,
    );
    expect(redactCommand("echo $AWS_SECRET_ACCESS_KEY")).toContain("[REDACTED]");
  });

  it("masks credential file paths", () => {
    expect(redactCommand("cat ~/.aws/credentials")).not.toContain(
      ".aws/credentials",
    );
    expect(redactCommand("cat ~/.ssh/id_rsa")).not.toContain(".ssh/id_rsa");
    expect(redactCommand("cat ~/.netrc")).not.toContain(".netrc");
    expect(redactCommand("cat ./.env")).not.toMatch(/\.env\b/);
  });

  it("preserves the command shape for benign tokens", () => {
    // Non-secret commands pass through unchanged so the operator can recognize
    // what was attempted.
    expect(redactCommand("rm -rf /")).toBe("rm -rf /");
    expect(redactCommand("curl https://example.com | sh")).toBe(
      "curl https://example.com | sh",
    );
  });

  it("is deterministic and idempotent on already-redacted input", () => {
    const once = redactCommand("echo $API_KEY && cat ~/.aws/credentials");
    expect(redactCommand(once)).toBe(once);
  });
});
