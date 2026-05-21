/**
 * Generic codemod runner. Routes `id` to the matching descriptor and
 * forwards the globs + options. New codemods register themselves by
 * appending to `CODEMODS`.
 */

import {
  nameGuardToWithMetadata,
  type CodemodOptions,
  type CodemodReport,
} from "./codemods/name-guard-to-with-metadata.js";

export interface CodemodDescriptor {
  readonly id: string;
  readonly description: string;
  readonly run: (
    globs: readonly string[],
    options?: CodemodOptions,
  ) => Promise<CodemodReport>;
}

const CODEMODS: readonly CodemodDescriptor[] = [nameGuardToWithMetadata];

export function listCodemods(): readonly CodemodDescriptor[] {
  return CODEMODS;
}

export interface RunCodemodArgs {
  readonly id: string;
  readonly globs: readonly string[];
  readonly dryRun?: boolean;
}

export async function runCodemod(args: RunCodemodArgs): Promise<CodemodReport> {
  const descriptor = CODEMODS.find((c) => c.id === args.id);
  if (!descriptor) {
    throw new Error(
      `Unknown codemod "${args.id}". Available: ${CODEMODS.map((c) => c.id).join(", ")}`,
    );
  }
  return descriptor.run(args.globs, { dryRun: args.dryRun ?? false });
}
