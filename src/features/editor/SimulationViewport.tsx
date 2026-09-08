import { useEffect } from "react";
import { useNodesInitialized, useReactFlow, useStore } from "@xyflow/react";

import { interactionNodeId, unresolvedNodeId } from "./graph";
import type { SimulationCursor } from "./SimulationTray";

export function simulationFocusId(cursor: SimulationCursor) {
  if (cursor.type === "interaction") return interactionNodeId(cursor.id);
  if (
    cursor.type === "blocked" &&
    cursor.reason === "unresolved" &&
    cursor.outcomeId
  ) {
    return unresolvedNodeId(cursor.outcomeId);
  }
  return cursor.nodeId;
}

/** Keep the current step in view after both cursor and canvas-size changes. */
export function SimulationViewport({ cursor }: { cursor: SimulationCursor | null }) {
  const initialized = useNodesInitialized();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const { fitView, getNode } = useReactFlow();

  useEffect(() => {
    if (!cursor || !initialized || width <= 0 || height <= 0) return;
    const node = getNode(simulationFocusId(cursor)) ?? getNode(cursor.nodeId);
    if (!node) return;

    void fitView({
      nodes: [{ id: node.id }],
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420,
      padding: 0.6,
      maxZoom: 1.05,
    });
  }, [cursor, initialized, width, height, fitView, getNode]);

  return null;
}
