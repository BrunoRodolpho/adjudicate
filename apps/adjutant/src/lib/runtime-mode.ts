/**
 * Runtime-mode helper for the Adjutant operator app.
 *
 * Only `isProductionEnv` is needed here — it gates the reference admin-auth
 * fail-closed behaviour. Checked against both `ADJUDICATE_ENV` (the framework's
 * explicit env switch) and the standard `NODE_ENV` so either signal trips the
 * guard. `next build` sets NODE_ENV=production.
 */
export function isProductionEnv(): boolean {
  return (
    process.env.ADJUDICATE_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}
