import { describe, expect, it } from "vitest";

import {
  checkoutProject,
  isPathloomDocument,
  parsePathloomDocument,
  type ProjectDocument,
} from "../../src/domain";

function cloneCheckoutProject(): ProjectDocument {
  return structuredClone(checkoutProject);
}

describe("Pathloom document validation", () => {
  it("accepts the seeded project and its serialized form", () => {
    expect(isPathloomDocument(checkoutProject)).toBe(true);
    expect(parsePathloomDocument(JSON.stringify(checkoutProject))).toEqual(
      checkoutProject,
    );
  });

  it("round-trips optional incoming and outcome route hints", () => {
    const document = cloneCheckoutProject();
    document.interactions[0].incomingRoute = {
      bendOffset: { x: 40, y: -25 },
    };
    document.interactions[0].outcomes[0].route = {
      bendOffset: { x: -30, y: 65 },
    };

    expect(parsePathloomDocument(JSON.stringify(document))).toEqual(document);
  });

  it("rejects malformed route hints", () => {
    const invalidIncoming = cloneCheckoutProject();
    invalidIncoming.interactions[0].incomingRoute = {
      bendOffset: { x: Number.NaN, y: 0 },
    };
    expect(isPathloomDocument(invalidIncoming)).toBe(false);

    const invalidOutcome = cloneCheckoutProject();
    invalidOutcome.interactions[0].outcomes[0].route = {
      bendOffset: { x: 0, y: Number.POSITIVE_INFINITY },
    };
    expect(isPathloomDocument(invalidOutcome)).toBe(false);

    const missingCoordinate = cloneCheckoutProject() as unknown as Record<
      string,
      unknown
    >;
    const interactions = missingCoordinate.interactions as Array<
      Record<string, unknown>
    >;
    interactions[0].incomingRoute = { bendOffset: { x: 10 } };
    expect(isPathloomDocument(missingCoordinate)).toBe(false);
  });

  it("rejects malformed JSON and unsupported schema versions", () => {
    expect(parsePathloomDocument("{not-json")).toBeNull();
    expect(
      isPathloomDocument({ ...checkoutProject, schemaVersion: 2 }),
    ).toBe(false);
  });

  it("rejects malformed nested nodes, states, interactions, and targets", () => {
    expect(
      isPathloomDocument({
        ...checkoutProject,
        nodes: [{ ...checkoutProject.nodes[0], states: "idle" }],
      }),
    ).toBe(false);
    expect(
      isPathloomDocument({
        ...checkoutProject,
        interactions: [
          {
            ...checkoutProject.interactions[0],
            outcomes: [
              {
                ...checkoutProject.interactions[0].outcomes[0],
                target: { nodeId: 42, stateId: null },
              },
            ],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isPathloomDocument({
        ...checkoutProject,
        interactions: [
          {
            ...checkoutProject.interactions[0],
            position: { x: Number.NaN, y: 20 },
          },
        ],
      }),
    ).toBe(false);
  });

  it.each([
    ["document", (document: ProjectDocument) => (document.id = "   ")],
    ["node", (document: ProjectDocument) => (document.nodes[0].id = "")],
    [
      "state",
      (document: ProjectDocument) => (document.nodes[0].states[0].id = " "),
    ],
    [
      "interaction",
      (document: ProjectDocument) => (document.interactions[0].id = ""),
    ],
    [
      "outcome",
      (document: ProjectDocument) =>
        (document.interactions[0].outcomes[0].id = " "),
    ],
  ] satisfies Array<[string, (document: ProjectDocument) => void]>)(
    "rejects empty %s IDs",
    (_, mutate) => {
      const document = cloneCheckoutProject();
      mutate(document);

      expect(isPathloomDocument(document)).toBe(false);
    },
  );

  it("rejects duplicate node and interaction IDs", () => {
    const duplicateNodeIds = cloneCheckoutProject();
    duplicateNodeIds.nodes[1].id = duplicateNodeIds.nodes[0].id;

    expect(isPathloomDocument(duplicateNodeIds)).toBe(false);

    const duplicateInteractionIds = cloneCheckoutProject();
    duplicateInteractionIds.interactions[1].id =
      duplicateInteractionIds.interactions[0].id;

    expect(isPathloomDocument(duplicateInteractionIds)).toBe(false);
  });

  it("rejects duplicate state IDs within a node", () => {
    const document = cloneCheckoutProject();
    document.nodes[0].states[1].id = document.nodes[0].states[0].id;

    expect(isPathloomDocument(document)).toBe(false);
  });

  it("allows a state ID to be reused by a different node", () => {
    const document = cloneCheckoutProject();
    const repeatedStateId = document.nodes[0].states[0].id;
    document.nodes[1].states[0].id = repeatedStateId;
    document.nodes[1].initialStateId = repeatedStateId;
    const confirmationTarget = document.interactions[0].outcomes[0].target;

    if (confirmationTarget) {
      confirmationTarget.stateId = repeatedStateId;
    }

    expect(isPathloomDocument(document)).toBe(true);
  });

  it("rejects duplicate outcome IDs across interactions", () => {
    const document = cloneCheckoutProject();
    document.interactions[1].outcomes[0].id =
      document.interactions[0].outcomes[0].id;

    expect(isPathloomDocument(document)).toBe(false);
  });

  it("rejects IDs that collide in the projected canvas namespace", () => {
    const interactionNodeCollision = cloneCheckoutProject();
    interactionNodeCollision.nodes[0].id = "interaction:submit-payment";
    expect(isPathloomDocument(interactionNodeCollision)).toBe(false);

    const unresolvedNodeCollision = cloneCheckoutProject();
    unresolvedNodeCollision.nodes[0].id = "unresolved:payment-succeeds";
    expect(isPathloomDocument(unresolvedNodeCollision)).toBe(false);

    const edgeCollision = cloneCheckoutProject();
    edgeCollision.interactions[0].outcomes[0].id = "into:submit-payment";
    expect(isPathloomDocument(edgeCollision)).toBe(false);
  });

  it("allows state IDs that resemble former UI sentinel values", () => {
    const document = cloneCheckoutProject();
    document.nodes[0].states[0].id = "__initial__";
    document.nodes[0].initialStateId = "__initial__";

    expect(isPathloomDocument(document)).toBe(true);
  });

  it("rejects empty reference IDs while preserving non-empty broken references", () => {
    const emptyReference = cloneCheckoutProject();
    emptyReference.interactions[0].outcomes[0].target = {
      nodeId: "confirmation",
      stateId: "",
    };
    expect(isPathloomDocument(emptyReference)).toBe(false);

    const brokenReference = cloneCheckoutProject();
    brokenReference.interactions[0].outcomes[0].target = {
      nodeId: "missing-screen",
      stateId: "missing-state",
    };
    expect(isPathloomDocument(brokenReference)).toBe(true);
  });
});
