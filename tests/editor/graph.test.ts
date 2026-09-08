import { describe, expect, it } from "vitest";

import { analyzeProject, checkoutProject, type ProjectDocument } from "../../src/domain";
import { starterProject } from "../../src/domain/samples/starter";
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
  it("attaches starter flow edges to the nearest side of each node", () => {
    const edges = buildEditorEdges(structuredClone(starterProject));

    expect(edges.find((edge) => edge.id === "edge:into:pay")).toMatchObject({
      sourceHandle: "out-right",
      targetHandle: "in-left",
      type: "pathloom",
    });
    expect(edges.find((edge) => edge.id === "edge:pay-success")).toMatchObject({
      sourceHandle: "out-right",
      targetHandle: "in-left",
      type: "pathloom",
    });
    expect(edges.find((edge) => edge.id === "edge:pay-declined")).toMatchObject({
      sourceHandle: "out-right",
      targetHandle: "in-left",
      type: "pathloom",
    });
    expect(edges.find((edge) => edge.id === "edge:into:try-again")).toMatchObject({
      sourceHandle: "out-left",
      targetHandle: "in-right",
      type: "pathloom",
    });
    expect(edges.find((edge) => edge.id === "edge:retry-checkout")).toMatchObject({
      sourceHandle: "out-left",
      targetHandle: "in-right",
      type: "pathloom",
    });
  });

  it("recomputes connector sides when nodes move across one another", () => {
    const project = structuredClone(starterProject);
    project.interactions.find((interaction) => interaction.id === "try-again")!.position = {
      x: 1_050,
      y: 460,
    };
    project.nodes.find((node) => node.id === "checkout")!.position = {
      x: 1_390,
      y: 160,
    };

    const edges = buildEditorEdges(project);

    expect(edges.find((edge) => edge.id === "edge:into:try-again")).toMatchObject({
      sourceHandle: "out-right",
      targetHandle: "in-left",
    });
    expect(edges.find((edge) => edge.id === "edge:retry-checkout")).toMatchObject({
      sourceHandle: "out-right",
      targetHandle: "in-left",
    });
  });

  it("projects persisted route hints onto their rendered edges", () => {
    const project = structuredClone(starterProject);
    const pay = project.interactions.find((interaction) => interaction.id === "pay")!;
    pay.incomingRoute = { bendOffset: { x: 35, y: -20 } };
    pay.outcomes[0].route = { bendOffset: { x: -15, y: 45 } };

    const edges = buildEditorEdges(project);

    expect(edges.find((edge) => edge.id === "edge:into:pay")?.data).toMatchObject({
      route: { bendOffset: { x: 35, y: -20 } },
    });
    expect(edges.find((edge) => edge.id === "edge:pay-success")?.data).toMatchObject({
      route: { bendOffset: { x: -15, y: 45 } },
    });
  });

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
