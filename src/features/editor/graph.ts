import {
  MarkerType,
  type Edge,
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
  InteractionNodeData,
  ScreenNodeData,
} from "./components/FlowNodes";
import type { ScreenPreviewVariant } from "./components/ScreenPreview";

export const interactionNodeId = (interactionId: string) =>
  `interaction:${interactionId}`;

export const unresolvedNodeId = (outcomeId: string) =>
  `unresolved:${outcomeId}`;

const ROUTES: Record<string, string> = {
  checkout: "/checkout",
  confirmation: "/order/confirmed",
  declined: "/checkout/payment",
  retry: "/checkout/retry",
  "sign-in": "/login?return=checkout",
  "legacy-receipt": "/orders/:id/receipt",
  offline: "/checkout/offline",
};

const NODE_VARIANTS: Record<string, ScreenPreviewVariant> = {
  checkout: "checkout",
  confirmation: "success",
  declined: "error",
  retry: "retry",
  "sign-in": "login",
  "legacy-receipt": "orders",
  offline: "retry",
};

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

export function buildEditorNodes(
  project: ProjectDocument,
  analysis: ProjectAnalysis,
): Node[] {
  const nodes: Node[] = project.nodes.map((node) => {
    const initialState = node.states.find(
      (state) => state.id === node.initialStateId,
    );
    const data: ScreenNodeData = {
      label: node.name,
      route: ROUTES[node.id] ?? `/${node.id}`,
      variant:
        NODE_VARIANTS[node.id] ??
        variantForState(initialState?.kind, "checkout"),
      stateLabel: initialState?.name ?? "Invalid initial state",
      stateCount: node.states.length,
      isStart: project.entryNodeId === node.id,
      canStartInteractions: node.kind !== "terminal",
      warning: warningForNode(node.id, analysis),
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
    };
    nodes.push({
      id: interactionNodeId(interaction.id),
      type: "interaction",
      position: interactionPosition(project, interaction),
      data,
    });

    interaction.outcomes.forEach((outcome, outcomeIndex) => {
      if (outcome.target !== null) return;
      nodes.push({
        id: unresolvedNodeId(outcome.id),
        type: "output",
        position: unresolvedPosition(project, interaction, outcomeIndex),
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
  source: string,
  interaction: Interaction,
  outcomeIndex: number,
): Edge {
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
  return {
    id: `edge:${outcome.id}`,
    source,
    sourceHandle: "out",
    target:
      outcome.target?.nodeId ?? unresolvedNodeId(outcome.id),
    targetHandle: outcome.target ? "in" : undefined,
    type: "smoothstep",
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
    },
  };
}

export function buildEditorEdges(project: ProjectDocument): Edge[] {
  const edges: Edge[] = [];

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
    edges.push({
      id: `edge:into:${interaction.id}`,
      source: interaction.sourceNodeId,
      sourceHandle: "out",
      target: interactionNodeId(interaction.id),
      targetHandle: "in",
      type: "smoothstep",
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
      data: { interactionId: interaction.id },
    });

    interaction.outcomes.forEach((_, outcomeIndex) => {
      edges.push(
        edgeForOutcome(
          project,
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
