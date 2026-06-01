/**
 * KernelIdentity — placeholder seam for signing kernel-emitted artefacts.
 *
 * Per SA6 §3.5 ("don't ship now; reserve seam") the v0.1 release ships the
 * **shape** of a kernel-identity signature without the actual cryptography.
 * The `attest()` method, when called, throws — the seam exists so adopters
 * can plumb the identifier through audit emissions and route handlers in
 * v0.1, and a future v0.2 can land sigstore/in-toto signing without
 * widening the public type.
 *
 * Adopter pattern:
 *   const identity: KernelIdentity = {
 *     id: "kernel://prod/us-east-1",
 *     version: "0.1.0-experimental",
 *   };
 *   const ctx = createRuntimeContext({ kernelIdentity: identity, ... });
 *
 * Future v0.2 may add an `attest()` implementation that returns a
 * detached signature over a JSON-canonical AuditRecord; the type is
 * pre-shaped to receive it.
 */

export interface KernelIdentity {
  /** Stable identifier for the kernel instance. E.g. `kernel://prod/us-east-1`. */
  readonly id: string;
  /** Semver of the kernel build. */
  readonly version: string;
  /**
   * Reserved seam for v0.2 attestation. v0.1 implementations either omit
   * this field or supply an `attest` that throws — calling it MUST surface
   * the unimplemented state, not silently return empty bytes.
   */
  readonly attest?: () => Promise<Uint8Array>;
}

/**
 * Construct a v0.1 KernelIdentity with the attestation seam stubbed out.
 * The throw is documented so adopters who reach for `attest()` get a
 * loud, locatable failure rather than empty bytes that look valid.
 */
export function createKernelIdentity(
  id: string,
  version: string,
): KernelIdentity {
  return {
    id,
    version,
    attest: async () => {
      throw new Error(
        "KernelIdentity.attest is reserved for v0.2 (sigstore/in-toto). Not implemented in v0.1.",
      );
    },
  };
}
