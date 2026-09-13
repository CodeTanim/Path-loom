import type { ExplorationSummary } from "../../domain/exploration";
import type { PathloomEdge } from "./components/EditableEdge";

/** Persisted exploration and this journey's animation are separate signals. */
export function withExplorationStatus(
  edges: PathloomEdge[],
  summary: ExplorationSummary,
  context?: { interactionId: string; stateId: string | null },
): PathloomEdge[] {
  const byOutcome = new Map<string, ExplorationSummary["checks"]>();
  for (const check of summary.checks) {
    const key = JSON.stringify([check.interactionId, check.outcomeId]);
    const group = byOutcome.get(key) ?? [];
    group.push(check);
    byOutcome.set(key, group);
  }
  return edges.map((edge) => {
    if (!edge.data?.outcomeId || !edge.data.interactionId) return edge;
    let checks = byOutcome.get(JSON.stringify([edge.data.interactionId, edge.data.outcomeId])) ?? [];
    if (context?.interactionId === edge.data.interactionId) {
      checks = checks.filter((check) => check.sourceStateId === context.stateId);
    }
    if (checks.length === 0) return edge;
    const explored = checks.filter((check) => check.status === "explored").length;
    const needsFix = checks.some((check) => check.status === "needs-fix");
    const unreachable = checks.every((check) => check.status === "unreachable");
    const label = needsFix ? "Needs fixing" : unreachable ? "Unreachable" : explored === checks.length
      ? "Explored" : explored > 0 ? `${explored}/${checks.length} explored` : "Unexplored";
    const pending = !needsFix && !unreachable && explored < checks.length;
    return {
      ...edge,
      label: `${edge.label} · ${label}`,
      ariaLabel: `${edge.label} · ${label}`,
      data: { ...edge.data, explorationPending: pending, explorationLabel: label },
      style: { ...edge.style, strokeDasharray: pending ? "5 4" : undefined },
      labelBgStyle: {
        ...edge.labelBgStyle,
        fill: needsFix || unreachable ? "#fff0ed" : pending ? "#fff7df" : "#eff9f3",
      },
    };
  });
}
