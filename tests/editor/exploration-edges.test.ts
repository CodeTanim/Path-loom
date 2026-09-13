import { describe, expect, it } from "vitest";
import type { ExplorationCheck, ExplorationSummary } from "../../src/domain/exploration";
import type { PathloomEdge } from "../../src/features/editor/components/EditableEdge";
import { withExplorationStatus } from "../../src/features/editor/exploration-edges";

const edge: PathloomEdge = {
  id: "edge:paid", source: "interaction:pay", target: "confirmation", type: "pathloom",
  label: "Paid → Success", style: { stroke: "#2f8f61", strokeWidth: 1.7 },
  data: { interactionId: "pay", outcomeId: "paid", kind: "success", route: { bendOffset: { x: 20, y: 30 } } },
};

function check(state: string, status: ExplorationCheck["status"]): ExplorationCheck {
  return { key: state, interactionId: "pay", outcomeId: "paid", sourceNodeId: "checkout", sourceStateId: state,
    sourceName: "Checkout", sourceStateName: state, interactionName: "Pay", outcomeName: "Paid", status, fingerprint: "fixture" };
}

function summary(checks: ExplorationCheck[]): ExplorationSummary {
  return { checks, total: checks.length, explored: checks.filter((item) => item.status === "explored").length,
    unexplored: checks.filter((item) => item.status === "unexplored").length,
    needsFix: checks.filter((item) => item.status === "needs-fix").length,
    unreachable: checks.filter((item) => item.status === "unreachable").length };
}

describe("saved exploration edge presentation", () => {
  it("adds unexplored labels and dashes without replacing outcome color or manual routing", () => {
    const result = withExplorationStatus([edge], summary([check("ready", "unexplored")]))[0];
    expect(result.label).toBe("Paid → Success · Unexplored");
    expect(result.style).toMatchObject({ stroke: "#2f8f61", strokeDasharray: "5 4" });
    expect(result.data?.route).toEqual(edge.data?.route);
    expect(edge.label).toBe("Paid → Success");
    expect(edge.style?.strokeDasharray).toBeUndefined();
  });

  it("shows partial exploration for a multi-state action", () => {
    const result = withExplorationStatus([edge], summary([check("ready", "explored"), check("error", "unexplored")]))[0];
    expect(result.label).toBe("Paid → Success · 1/2 explored");
    expect(result.data?.explorationPending).toBe(true);
  });

  it("shows the exact source-state status when choosing an outcome", () => {
    const progress = summary([check("ready", "explored"), check("error", "unexplored")]);
    expect(withExplorationStatus([edge], progress, { interactionId: "pay", stateId: "ready" })[0].label)
      .toBe("Paid → Success · Explored");
    expect(withExplorationStatus([edge], progress, { interactionId: "pay", stateId: "error" })[0].label)
      .toBe("Paid → Success · Unexplored");
  });

  it.each(["needs-fix", "unreachable"] as const)("does not present %s as an explorable check", (status) => {
    const result = withExplorationStatus([edge], summary([check("ready", status)]))[0];
    expect(result.data?.explorationPending).toBe(false);
    expect(result.label).toContain(status === "needs-fix" ? "Needs fixing" : "Unreachable");
  });

  it("leaves screen-to-action connections and unmatched edges unchanged", () => {
    const incoming: PathloomEdge = { ...edge, id: "edge:into:pay", data: { interactionId: "pay" } };
    expect(withExplorationStatus([incoming], summary([check("ready", "unexplored")]))[0]).toBe(incoming);
    expect(withExplorationStatus([edge], summary([]))[0]).toBe(edge);
  });
});
