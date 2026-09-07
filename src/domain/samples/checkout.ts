import type { ProjectDocument } from "../model";

/**
 * A demo document with healthy primary paths plus three intentional findings:
 * an unresolved offline branch, an unreachable legacy screen, and a missing
 * empty state declared by the retry screen.
 */
export const checkoutProject: ProjectDocument = {
  schemaVersion: 1,
  id: "project-checkout",
  name: "Checkout recovery flow",
  description:
    "A checkout that makes success, decline, timeout, auth, and offline paths visible.",
  entryNodeId: "checkout",
  nodes: [
    {
      id: "checkout",
      name: "Checkout",
      kind: "screen",
      description: "Review the cart and submit payment.",
      position: { x: 40, y: 220 },
      size: { width: 280, height: 180 },
      initialStateId: "checkout-idle",
      states: [
        { id: "checkout-idle", name: "Ready", kind: "idle" },
        { id: "checkout-loading", name: "Submitting", kind: "loading" },
      ],
    },
    {
      id: "confirmation",
      name: "Order confirmed",
      kind: "terminal",
      position: { x: 660, y: 20 },
      size: { width: 260, height: 150 },
      initialStateId: "confirmation-success",
      states: [
        {
          id: "confirmation-success",
          name: "Success",
          kind: "success",
        },
      ],
    },
    {
      id: "declined",
      name: "Payment declined",
      kind: "screen",
      position: { x: 660, y: 200 },
      size: { width: 260, height: 170 },
      initialStateId: "declined-idle",
      states: [
        { id: "declined-idle", name: "Try another card", kind: "idle" },
        { id: "declined-error", name: "Declined", kind: "error" },
      ],
    },
    {
      id: "retry",
      name: "Payment timed out",
      kind: "screen",
      position: { x: 660, y: 400 },
      size: { width: 260, height: 170 },
      initialStateId: "retry-idle",
      requiredStateKinds: ["empty"],
      states: [
        { id: "retry-idle", name: "Ready to retry", kind: "idle" },
        { id: "retry-error", name: "Timed out", kind: "error" },
      ],
    },
    {
      id: "sign-in",
      name: "Sign in again",
      kind: "screen",
      position: { x: 660, y: 600 },
      size: { width: 260, height: 170 },
      initialStateId: "sign-in-idle",
      states: [
        { id: "sign-in-idle", name: "Sign in", kind: "idle" },
        {
          id: "sign-in-unauthorized",
          name: "Session expired",
          kind: "unauthorized",
        },
      ],
    },
    {
      id: "legacy-receipt",
      name: "Legacy receipt",
      kind: "terminal",
      description: "Kept on the canvas to demonstrate unreachable-node analysis.",
      position: { x: 940, y: 620 },
      size: { width: 240, height: 140 },
      initialStateId: "legacy-success",
      states: [{ id: "legacy-success", name: "Sent", kind: "success" }],
    },
  ],
  interactions: [
    {
      id: "submit-payment",
      name: "Submit payment",
      kind: "async",
      trigger: "submit",
      sourceNodeId: "checkout",
      sourceStateId: "checkout-idle",
      outcomes: [
        {
          id: "payment-succeeds",
          name: "Payment succeeds",
          kind: "success",
          target: {
            nodeId: "confirmation",
            stateId: "confirmation-success",
          },
        },
        {
          id: "payment-declined",
          name: "Card is declined",
          kind: "failure",
          target: { nodeId: "declined", stateId: "declined-error" },
        },
        {
          id: "payment-times-out",
          name: "Gateway times out",
          kind: "timeout",
          target: { nodeId: "retry", stateId: "retry-error" },
        },
        {
          id: "session-expires",
          name: "Session expires",
          kind: "unauthorized",
          target: {
            nodeId: "sign-in",
            stateId: "sign-in-unauthorized",
          },
        },
        {
          id: "device-goes-offline",
          name: "Device goes offline",
          kind: "offline",
          target: null,
        },
      ],
    },
    {
      id: "use-another-card",
      name: "Use another card",
      kind: "navigation",
      trigger: "click",
      sourceNodeId: "declined",
      sourceStateId: null,
      outcomes: [
        {
          id: "return-to-checkout",
          name: "Return to checkout",
          kind: "alternate",
          target: { nodeId: "checkout", stateId: "checkout-idle" },
        },
      ],
    },
    {
      id: "retry-payment",
      name: "Retry payment",
      kind: "navigation",
      trigger: "click",
      sourceNodeId: "retry",
      sourceStateId: null,
      outcomes: [
        {
          id: "retry-from-checkout",
          name: "Try again",
          kind: "alternate",
          target: { nodeId: "checkout", stateId: "checkout-idle" },
        },
      ],
    },
    {
      id: "reauthenticate",
      name: "Sign in",
      kind: "navigation",
      trigger: "submit",
      sourceNodeId: "sign-in",
      sourceStateId: "sign-in-unauthorized",
      outcomes: [
        {
          id: "session-restored",
          name: "Session restored",
          kind: "alternate",
          target: { nodeId: "checkout", stateId: "checkout-idle" },
        },
      ],
    },
  ],
};

export const sampleCheckoutProject = checkoutProject;
