import type { ProjectDocument } from "../model";

/** A complete, small example. The larger checkout fixture is for analyzer tests. */
export const starterProject: ProjectDocument = {
  schemaVersion: 1,
  id: "payment-example",
  name: "Payment flow",
  description: "Try paying, then choose success or failure. A failed payment can be retried.",
  entryNodeId: "checkout",
  nodes: [
    {
      id: "checkout", name: "Checkout", kind: "screen",
      description: "The customer reviews their order and chooses to pay.",
      position: { x: 40, y: 160 }, initialStateId: "checkout-idle",
      states: [{ id: "checkout-idle", name: "Ready", kind: "idle" }],
    },
    {
      id: "confirmation", name: "Confirmation", kind: "terminal",
      description: "Payment succeeded. Show the order confirmation.",
      position: { x: 710, y: 20 }, initialStateId: "confirmation-success",
      states: [{ id: "confirmation-success", name: "Success", kind: "success" }],
    },
    {
      id: "payment-error", name: "Payment error", kind: "screen",
      description: "Payment was declined. The customer can return to checkout and try again.",
      position: { x: 710, y: 350 }, initialStateId: "payment-error-error",
      states: [
        { id: "payment-error-idle", name: "Ready", kind: "idle" },
        { id: "payment-error-error", name: "Error", kind: "error" },
      ],
    },
  ],
  interactions: [
    {
      id: "pay", name: "Pay", kind: "navigation", trigger: "click",
      sourceNodeId: "checkout", sourceStateId: null,
      position: { x: 380, y: 220 },
      outcomes: [
        { id: "pay-success", name: "Success", kind: "success", target: { nodeId: "confirmation", stateId: "confirmation-success" } },
        { id: "pay-declined", name: "Declined", kind: "failure", target: { nodeId: "payment-error", stateId: "payment-error-error" } },
      ],
    },
    {
      id: "try-again", name: "Try again", kind: "navigation", trigger: "click",
      sourceNodeId: "payment-error", sourceStateId: null,
      position: { x: 380, y: 460 },
      outcomes: [{ id: "retry-checkout", name: "Return to checkout", kind: "alternate", target: { nodeId: "checkout", stateId: "checkout-idle" } }],
    },
  ],
};
