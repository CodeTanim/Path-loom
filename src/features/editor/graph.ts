import {
  MarkerType,
  type Edge,
  type Node,
} from "@xyflow/react";

import type {
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

function displayInteraction(interaction: Interaction) {
  return interaction.kind === "async" || interaction.outcomes.length > 1;
}

function interactionPosition(
  project: ProjectDocument,
  interaction: Interaction,
) {
  const source = project.nodes.find(
    (node) => node.id === interaction.sourceNodeId,
  );
  return {
    x: (source?.position.x ?? 0) + 330,
    y: (source?.position.y ?? 0) + 55,
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
      stateLabel: humanize(initialState?.kind ?? "idle"),
      stateCount: node.states.length,
      isStart: project.entryNodeId === node.id,
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
    if (displayInteraction(interaction)) {
      const data: InteractionNodeData = {
        label: interaction.name,
        trigger: humanize(interaction.trigger),
        outcomeCount: interaction.outcomes.length,
      };
      nodes.push({
        id: interactionNodeId(interaction.id),
        type: "interaction",
        position: interactionPosition(project, interaction),
        data,
        draggable: false,
      });
    }

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
  source: string,
  interaction: Interaction,
  outcomeIndex: number,
): Edge {
  const outcome = interaction.outcomes[outcomeIndex];
  const color = OUTCOME_COLORS[outcome.kind];
  return {
    id: `edge:${outcome.id}`,
    source,
    sourceHandle: "out",
    target:
      outcome.target?.nodeId ?? unresolvedNodeId(outcome.id),
    targetHandle: outcome.target ? "in" : undefined,
    type: "smoothstep",
    label: humanize(outcome.name),
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
    if (displayInteraction(interaction)) {
      edges.push({
        id: `edge:into:${interaction.id}`,
        source: interaction.sourceNodeId,
        sourceHandle: "out",
        target: interactionNodeId(interaction.id),
        targetHandle: "in",
        type: "smoothstep",
        label: interaction.name,
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
            interactionNodeId(interaction.id),
            interaction,
            outcomeIndex,
          ),
        );
      });
      continue;
    }

    interaction.outcomes.forEach((_, outcomeIndex) => {
      edges.push(
        edgeForOutcome(
          interaction.sourceNodeId,
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
  };
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
