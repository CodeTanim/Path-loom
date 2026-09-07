import { describe, expect, it } from "vitest";

import { analyzeProject, checkoutProject, type ProjectDocument } from "../../src/domain";
import {
  applyNodePositions,
  buildEditorEdges,
  buildEditorNodes,
  interactionNodeId,
  moveEditorNodeWithDependents,
  preserveNodePositions,
  unresolvedNodeId,
} from "../../src/features/editor/graph";

function cloneProject(): ProjectDocument {
  return structuredClone(checkoutProject);
}

describe("editor graph projection", () => {
  it("materializes every interaction and exposes exact source and target states", () => {
    const project = cloneProject();
    const nodes = buildEditorNodes(project, analyzeProject(project));
    const edges = buildEditorEdges(project);

    expect(
      project.interactions.every((interaction) =>
        nodes.some((node) => node.id === interactionNodeId(interaction.id)),
      ),
    ).toBe(true);
    expect(
      nodes.find((node) => node.id === interactionNodeId("submit-payment"))?.data,
    ).toMatchObject({ sourceStateLabel: "Ready" });
    expect(edges.find((edge) => edge.id === "edge:into:submit-payment")?.label).toBe(
      "Submit payment · Ready",
    );
    expect(edges.find((edge) => edge.id === "edge:payment-succeeds")?.label).toBe(
      "Payment Succeeds → Success",
    );
  });

  it("stagger derives sibling positions and persists moved interaction positions", () => {
    const project = cloneProject();
    project.interactions.push({
      id: "checkout-help",
      name: "Get help",
      kind: "navigation",
      trigger: "click",
      sourceNodeId: "checkout",
      sourceStateId: "checkout-idle",
      outcomes: [],
    });
    const nodes = buildEditorNodes(project, analyzeProject(project));
    const first = nodes.find(
      (node) => node.id === interactionNodeId("submit-payment"),
    );
    const sibling = nodes.find(
      (node) => node.id === interactionNodeId("checkout-help"),
    );

    expect(sibling?.position.y).toBe((first?.position.y ?? 0) + 105);

    const moved = nodes.map((node) =>
      node.id === interactionNodeId("checkout-help")
        ? { ...node, position: { x: 777, y: 333 } }
        : node,
    );
    const updated = applyNodePositions(project, moved);

    expect(
      updated.interactions.find((interaction) => interaction.id === "checkout-help")
        ?.position,
    ).toEqual({ x: 777, y: 333 });
  });

  it("moves unresolved outcome placeholders with their interaction", () => {
    const project = cloneProject();
    const nodes = buildEditorNodes(project, analyzeProject(project));
    const interactionId = interactionNodeId("submit-payment");
    const unresolvedId = unresolvedNodeId("device-goes-offline");
    const interaction = nodes.find((node) => node.id === interactionId)!;
    const unresolved = nodes.find((node) => node.id === unresolvedId)!;
    const nextPosition = {
      x: interaction.position.x + 90,
      y: interaction.position.y - 40,
    };

    const moved = moveEditorNodeWithDependents(
      project,
      nodes,
      interactionId,
      nextPosition,
      interaction.position,
    );

    expect(moved.find((node) => node.id === interactionId)?.position).toEqual(
      nextPosition,
    );
    expect(moved.find((node) => node.id === unresolvedId)?.position).toEqual({
      x: unresolved.position.x + 90,
      y: unresolved.position.y - 40,
    });
  });

  it("materializes preserved interaction positions for reload stability", () => {
    const project = cloneProject();
    const initialNodes = buildEditorNodes(project, analyzeProject(project));
    const changedProject: ProjectDocument = {
      ...project,
      interactions: project.interactions.map((interaction) =>
        interaction.id === "submit-payment"
          ? { ...interaction, sourceNodeId: "declined", sourceStateId: null }
          : interaction,
      ),
    };
    const preservedNodes = preserveNodePositions(
      buildEditorNodes(changedProject, analyzeProject(changedProject)),
      initialNodes,
    );
    const positionedProject = applyNodePositions(changedProject, preservedNodes);
    const reloadedNodes = buildEditorNodes(
      positionedProject,
      analyzeProject(positionedProject),
    );

    expect(
      reloadedNodes.find(
        (node) => node.id === interactionNodeId("submit-payment"),
      )?.position,
    ).toEqual(
      preservedNodes.find(
        (node) => node.id === interactionNodeId("submit-payment"),
      )?.position,
    );
  });
});
