import {
  MarkerType,
  Position,
  type Node,
} from "@xyflow/react";

import type {
  CanvasPosition,
  CoreUIStateKind,
  Interaction,
  OutcomeKind,
  ProjectAnalysis,
  ProjectDocument,
  UIStateKind,
} from "@/domain";
import type {
  ConnectorSide,
  InteractionNodeData,
  ScreenNodeData,
} from "./components/FlowNodes";
import type { PathloomEdge } from "./components/EditableEdge";
import type { ScreenPreviewVariant } from "./components/ScreenPreview";

export const interactionNodeId = (interactionId: string) =>
  `interaction:${interactionId}`;

export const unresolvedNodeId = (outcomeId: string) =>
  `unresolved:${outcomeId}`;

export const STATE_VARIANTS: Record<
  CoreUIStateKind,
  ScreenPreviewVariant
> = {
  idle: "checkout",
  loading: "loading",
  success: "success",
  empty: "orders",
  error: "error",
  offline: "retry",
  unauthorized: "login",
};

export const OUTCOME_COLORS: Record<OutcomeKind, string> = {
  success: "#2f8f61",
  failure: "#d65b52",
  timeout: "#d48a25",
  offline: "#8b7345",
  unauthorized: "#7567c8",
  alternate: "#728079",
};

const humanize = (value: string) =>
  value
    .replaceAll("-", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());

export function variantForState(
  kind: UIStateKind | undefined,
  fallback: ScreenPreviewVariant,
): ScreenPreviewVariant {
  if (!kind || kind === "custom") return fallback;
  return STATE_VARIANTS[kind];
}

function warningForNode(
  nodeId: string,
  analysis: ProjectAnalysis,
): string | undefined {
  if (analysis.unreachableNodeIds.includes(nodeId)) {
    return "Unreachable from the start screen";
  }
  const missing = analysis.missingStates.find(
    (finding) => finding.nodeId === nodeId,
  );
  if (missing) return `Missing ${humanize(missing.stateKind)} state`;
  if (analysis.deadEndNodeIds.includes(nodeId)) return "Flow ends unexpectedly";
  return undefined;
}

function interactionPosition(
  project: ProjectDocument,
  interaction: Interaction,
) {
  if (interaction.position) return interaction.position;
  const source = project.nodes.find(
    (node) => node.id === interaction.sourceNodeId,
  );
  const siblingIndex = project.interactions
    .filter((item) => item.sourceNodeId === interaction.sourceNodeId)
    .findIndex((item) => item.id === interaction.id);
  return {
    x: (source?.position.x ?? 0) + 330,
    y: (source?.position.y ?? 0) + 55 + Math.max(siblingIndex, 0) * 105,
  };
}

function unresolvedPosition(
  project: ProjectDocument,
  interaction: Interaction,
  outcomeIndex: number,
) {
  const actionPosition = interactionPosition(project, interaction);
  return {
    x: actionPosition.x + 330,
    y: actionPosition.y + 300 + outcomeIndex * 52,
  };
}

const SCREEN_NODE_WIDTH = 246;
const INTERACTION_NODE_WIDTH = 202;
const UNRESOLVED_NODE_WIDTH = 188;

interface ProjectedGeometry {
  position: CanvasPosition;
  width: number;
}

interface PortUsage {
  inputs: Set<ConnectorSide>;
  outputs: Set<ConnectorSide>;
}

function projectedGeometries(project: ProjectDocument) {
  const geometries = new Map<string, ProjectedGeometry>();
  project.nodes.forEach((node) => {
    geometries.set(node.id, {
      position: node.position,
      width: SCREEN_NODE_WIDTH,
    });
  });
  project.interactions.forEach((interaction) => {
    geometries.set(interactionNodeId(interaction.id), {
      position: interactionPosition(project, interaction),
      width: INTERACTION_NODE_WIDTH,
    });
    interaction.outcomes.forEach((outcome, outcomeIndex) => {
      if (outcome.target !== null) return;
      geometries.set(unresolvedNodeId(outcome.id), {
        position: unresolvedPosition(project, interaction, outcomeIndex),
        width: UNRESOLVED_NODE_WIDTH,
      });
    });
  });
  return geometries;
}

/** Chooses the two facing horizontal ports for a projected connection. */
export function connectorSidesFor(
  geometries: Map<string, ProjectedGeometry>,
  sourceId: string,
  targetId: string,
): { source: ConnectorSide; target: ConnectorSide } {
  const source = geometries.get(sourceId);
  const target = geometries.get(targetId);
  if (!source || !target) return { source: "right", target: "left" };
  const sourceCenterX = source.position.x + source.width / 2;
  const targetCenterX = target.position.x + target.width / 2;
  return targetCenterX >= sourceCenterX
    ? { source: "right", target: "left" }
    : { source: "left", target: "right" };
}

function portUsageFor(project: ProjectDocument) {
  const geometries = projectedGeometries(project);
  const usage = new Map<string, PortUsage>();
  const portsFor = (id: string) => {
    const current = usage.get(id);
    if (current) return current;
    const created = {
      inputs: new Set<ConnectorSide>(),
      outputs: new Set<ConnectorSide>(),
    };
    usage.set(id, created);
    return created;
  };
  const includeConnection = (sourceId: string, targetId: string) => {
    const sides = connectorSidesFor(geometries, sourceId, targetId);
    portsFor(sourceId).outputs.add(sides.source);
    portsFor(targetId).inputs.add(sides.target);
  };

  project.interactions.forEach((interaction) => {
    const actionId = interactionNodeId(interaction.id);
    includeConnection(interaction.sourceNodeId, actionId);
    interaction.outcomes.forEach((outcome) => {
      includeConnection(
        actionId,
        outcome.target?.nodeId ?? unresolvedNodeId(outcome.id),
      );
    });
  });

  return { geometries, usage };
}

function sidesOrDefault(
  sides: Set<ConnectorSide> | undefined,
  fallback: ConnectorSide,
) {
  return sides && sides.size > 0 ? [...sides].sort() : [fallback];
}

export function buildEditorNodes(
  project: ProjectDocument,
  analysis: ProjectAnalysis,
): Node[] {
  const { usage } = portUsageFor(project);
  const nodes: Node[] = project.nodes.map((node) => {
    const initialState = node.states.find(
      (state) => state.id === node.initialStateId,
    );
    const data: ScreenNodeData = {
      label: node.name,
      description: initialState?.description ?? node.description,
      route: node.id,
      variant: variantForState(initialState?.kind, "checkout"),
      stateLabel: initialState?.name ?? "Invalid initial state",
      stateCount: node.states.length,
      isStart: project.entryNodeId === node.id,
      canStartInteractions: node.kind !== "terminal",
      warning: warningForNode(node.id, analysis),
      inputSides: sidesOrDefault(usage.get(node.id)?.inputs, "left"),
      outputSides:
        node.kind === "terminal"
          ? []
          : sidesOrDefault(usage.get(node.id)?.outputs, "right"),
    };
    return {
      id: node.id,
      type: "screen",
      position: node.position,
      data,
    };
  });

  for (const interaction of project.interactions) {
    const sourceNode = project.nodes.find(
      (node) => node.id === interaction.sourceNodeId,
    );
    const sourceState = sourceNode?.states.find(
      (state) => state.id === interaction.sourceStateId,
    );
    const data: InteractionNodeData = {
      label: interaction.name,
      trigger: humanize(interaction.trigger),
      sourceStateLabel:
        interaction.sourceStateId === null
          ? "All states"
          : sourceState?.name ?? "Missing state",
      outcomeCount: interaction.outcomes.length,
      inputSides: sidesOrDefault(
        usage.get(interactionNodeId(interaction.id))?.inputs,
        "left",
      ),
      outputSides: sidesOrDefault(
        usage.get(interactionNodeId(interaction.id))?.outputs,
        "right",
      ),
    };
    nodes.push({
      id: interactionNodeId(interaction.id),
      type: "interaction",
      position: interactionPosition(project, interaction),
      data,
    });

    interaction.outcomes.forEach((outcome, outcomeIndex) => {
      if (outcome.target !== null) return;
      const placeholderId = unresolvedNodeId(outcome.id);
      const targetSide = sidesOrDefault(
        usage.get(placeholderId)?.inputs,
        "left",
      )[0];
      nodes.push({
        id: placeholderId,
        type: "output",
        position: unresolvedPosition(project, interaction, outcomeIndex),
        targetPosition:
          targetSide === "left" ? Position.Left : Position.Right,
        data: { label: `Choose target · ${outcome.name}` },
        selectable: true,
        draggable: false,
        style: {
          width: 188,
          minHeight: 42,
          display: "grid",
          placeItems: "center",
          padding: "9px 12px",
          border: "1px dashed #d4a35e",
          borderRadius: 9,
          color: "#855718",
          background: "#fff8e8",
          boxShadow: "0 4px 12px rgba(84, 65, 31, 0.06)",
          fontSize: 9,
          fontWeight: 650,
        },
      });
    });
  }

  return nodes;
}

function edgeForOutcome(
  project: ProjectDocument,
  geometries: Map<string, ProjectedGeometry>,
  source: string,
  interaction: Interaction,
  outcomeIndex: number,
): PathloomEdge {
  const outcome = interaction.outcomes[outcomeIndex];
  const color = OUTCOME_COLORS[outcome.kind];
  const targetNode = project.nodes.find(
    (node) => node.id === outcome.target?.nodeId,
  );
  const targetState = targetNode?.states.find(
    (state) =>
      state.id === (outcome.target?.stateId ?? targetNode.initialStateId),
  );
  const targetStateLabel = outcome.target
    ? targetState?.name ?? "Invalid state"
    : "Unresolved";
  const target = outcome.target?.nodeId ?? unresolvedNodeId(outcome.id);
  const sides = connectorSidesFor(geometries, source, target);
  return {
    id: `edge:${outcome.id}`,
    source,
    sourceHandle: `out-${sides.source}`,
    target,
    targetHandle: outcome.target ? `in-${sides.target}` : undefined,
    type: "pathloom",
    label: `${humanize(outcome.name)} → ${targetStateLabel}`,
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    style: { stroke: color, strokeWidth: 1.7 },
    labelBgPadding: [7, 4],
    labelBgBorderRadius: 7,
    labelBgStyle: {
      fill: "#fffefa",
      fillOpacity: 0.98,
      stroke: `${color}33`,
      strokeWidth: 1,
    },
    labelStyle: { fill: color, fontSize: 9, fontWeight: 650 },
    data: {
      interactionId: interaction.id,
      outcomeId: outcome.id,
      kind: outcome.kind,
      route: outcome.route,
    },
  };
}

export function buildEditorEdges(project: ProjectDocument): PathloomEdge[] {
  const geometries = projectedGeometries(project);
  const edges: PathloomEdge[] = [];

  for (const interaction of project.interactions) {
    const sourceNode = project.nodes.find(
      (node) => node.id === interaction.sourceNodeId,
    );
    const sourceState = sourceNode?.states.find(
      (state) => state.id === interaction.sourceStateId,
    );
    const sourceScope =
      interaction.sourceStateId === null
        ? "all states"
        : sourceState?.name ?? "missing state";
    const actionId = interactionNodeId(interaction.id);
    const sides = connectorSidesFor(
      geometries,
      interaction.sourceNodeId,
      actionId,
    );
    edges.push({
      id: `edge:into:${interaction.id}`,
      source: interaction.sourceNodeId,
      sourceHandle: `out-${sides.source}`,
      target: actionId,
      targetHandle: `in-${sides.target}`,
      type: "pathloom",
      label: `${interaction.name} · ${sourceScope}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#137b68",
        width: 14,
        height: 14,
      },
      style: { stroke: "#137b68", strokeWidth: 1.8 },
      labelBgPadding: [7, 4],
      labelBgBorderRadius: 7,
      labelBgStyle: {
        fill: "#fffefa",
        stroke: "#137b6833",
        strokeWidth: 1,
      },
      labelStyle: { fill: "#137b68", fontSize: 9, fontWeight: 650 },
      data: {
        interactionId: interaction.id,
        route: interaction.incomingRoute,
      },
    });

    interaction.outcomes.forEach((_, outcomeIndex) => {
      edges.push(
        edgeForOutcome(
          project,
          geometries,
          interactionNodeId(interaction.id),
          interaction,
          outcomeIndex,
        ),
      );
    });
  }

  return edges;
}

export function applyNodePositions(
  project: ProjectDocument,
  nodes: Node[],
): ProjectDocument {
  const positions = new Map(
    nodes.map((node) => [node.id, node.position] as const),
  );
  return {
    ...project,
    nodes: project.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
    interactions: project.interactions.map((interaction) => ({
      ...interaction,
      position:
        positions.get(interactionNodeId(interaction.id)) ??
        interaction.position,
    })),
  };
}

export function moveEditorNodeWithDependents(
  project: ProjectDocument,
  nodes: Node[],
  draggedNodeId: string,
  nextPosition: CanvasPosition,
  previousPosition: CanvasPosition,
): Node[] {
  const dependentNodeIds = new Set<string>();

  if (draggedNodeId.startsWith("interaction:")) {
    const interactionId = draggedNodeId.slice("interaction:".length);
    const interaction = project.interactions.find(
      (item) => item.id === interactionId,
    );
    interaction?.outcomes.forEach((outcome) => {
      if (outcome.target === null) {
        dependentNodeIds.add(unresolvedNodeId(outcome.id));
      }
    });
  }

  const delta = {
    x: nextPosition.x - previousPosition.x,
    y: nextPosition.y - previousPosition.y,
  };

  return nodes.map((node) => {
    if (node.id === draggedNodeId) {
      return { ...node, position: { ...nextPosition } };
    }
    if (dependentNodeIds.has(node.id)) {
      return {
        ...node,
        position: {
          x: node.position.x + delta.x,
          y: node.position.y + delta.y,
        },
      };
    }
    return node;
  });
}

export function preserveNodePositions(next: Node[], current: Node[]): Node[] {
  const currentPositions = new Map(
    current.map((node) => [node.id, node.position] as const),
  );
  return next.map((node) => ({
    ...node,
    position: currentPositions.get(node.id) ?? node.position,
  }));
}
