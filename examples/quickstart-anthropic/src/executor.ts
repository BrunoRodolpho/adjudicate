/**
 * Adopter-shaped executor that wraps the Pack's in-memory handlers.
 *
 * In production this is where the adopter calls their PIX provider
 * (Mercado Pago, Stripe Brazil, Cielo, etc.). For the demo we just
 * route to the inMemoryPixHandlers shipped by the Pack.
 */

import type { IntentEnvelope } from "@adjudicate/core";
import {
  inMemoryPixHandlers,
  type PixIntentKind,
  type PixState,
} from "@adjudicate/pack-payments-pix";
import type { AdopterExecutor } from "@adjudicate/anthropic";

export function createPixExecutor(): AdopterExecutor<
  PixIntentKind,
  unknown,
  PixState
> {
  return {
    async invokeRead(name, input, state) {
      switch (name) {
        case "list_pix_charges":
          return Array.from(state.charges.values()).map((c) => ({
            id: c.id,
            amountCentavos: c.amountCentavos,
            status: c.status,
          }));
        case "get_pix_charge": {
          const id = (input as { chargeId?: string })?.chargeId;
          if (typeof id !== "string") {
            throw new Error("get_pix_charge requires chargeId");
          }
          return state.charges.get(id) ?? null;
        }
        default:
          throw new Error(`Unknown read tool: ${name}`);
      }
    },
    async invokeIntent(envelope: IntentEnvelope<PixIntentKind, unknown>) {
      const handler = inMemoryPixHandlers[envelope.kind];
      if (!handler) {
        throw new Error(`No handler for intent kind: ${envelope.kind}`);
      }
      return handler(envelope.payload, {} as PixState);
    },
  };
}
