import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getExplorationSummary, type ExplorationCheck, type ExplorationSummary } from "../../src/domain";
import { starterProject } from "../../src/domain/samples/starter";
import { ExplorationPanel } from "../../src/features/editor/ExplorationPanel";
import { SimulationTray } from "../../src/features/editor/SimulationTray";

function summaryFor(checks: ExplorationCheck[]): ExplorationSummary {
  return {
    checks,
    total: checks.length,
    explored: checks.filter((check) => check.status === "explored").length,
    unexplored: checks.filter((check) => check.status === "unexplored").length,
    needsFix: checks.filter((check) => check.status === "needs-fix").length,
    unreachable: checks.filter((check) => check.status === "unreachable").length,
  };
}

function panelMarkup(summary: ExplorationSummary, issueCount = 0) {
  return renderToStaticMarkup(createElement(ExplorationPanel, {
    summary,
    issueCount,
    onExploreNext: vi.fn(),
    onCheckFlow: vi.fn(),
  }));
}

function trayMarkup(exploration?: ExplorationSummary, recommendedCheckKey?: string, journey = ["Checkout", "Pay"], flowIssueCount = 0) {
  return renderToStaticMarkup(createElement(SimulationTray, {
    project: starterProject,
    cursor: { type: "interaction", id: "pay", nodeId: "checkout", stateId: "checkout-idle" },
    journey,
    canGoBack: true,
    onChooseInteraction: vi.fn(),
    onChooseOutcome: vi.fn(),
    onBack: vi.fn(),
    onRestart: vi.fn(),
    onExit: vi.fn(),
    exploration,
    recommendedCheckKey,
    onExploreNext: vi.fn(),
    onCheckFlow: vi.fn(),
    flowIssueCount,
  }));
}

describe("flow exploration panel", () => {
  it("explains how to start without showing a meaningless zero-progress bar", () => {
    const markup = panelMarkup(summaryFor([]));
    expect(markup).toContain("Add actions and outcomes to start exploring.");
    expect(markup).not.toContain("<progress");
    expect(markup).not.toContain("Explore next outcome");
  });

  it("separates exploration from structural problems and keeps the checklist collapsed", () => {
    const base = getExplorationSummary(starterProject).checks[0];
    const checks: ExplorationCheck[] = [
      { ...base, key: "visited", status: "explored" },
      { ...base, key: "pending", status: "unexplored" },
      { ...base, key: "broken", status: "needs-fix", reason: "No destination yet." },
      { ...base, key: "unreachable", status: "unreachable", sourceStateName: "No reachable state" },
    ];
    const markup = panelMarkup(summaryFor(checks), 2);
    expect(markup).toContain("1 of 4");
    expect(markup).toContain("1 not explored");
    expect(markup).toContain("1 needs fixing");
    expect(markup).toContain("1 unreachable");
    expect(markup).toContain("not approved");
    expect(markup).toContain("View flow issues (2)");
    expect(markup).toContain("Checkout · Ready");
    expect(markup).toContain("No destination yet.");
    expect(markup).toContain("No reachable state");
    expect(markup).toContain("Relevant edits return affected checks to not explored");
    expect(markup).toMatch(/<details[^>]*>/);
    expect(markup).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
  });

  it("disables next when all checks were explored without claiming the flow is approved", () => {
    const checks = getExplorationSummary(starterProject).checks.map((check) => ({ ...check, status: "explored" as const }));
    const markup = panelMarkup(summaryFor(checks));
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Explore next outcome/);
    expect(markup).toContain("All current outcome checks explored. This is not a sign-off.");
    expect(markup).not.toContain("View flow issues");
  });

  it("keeps blocked checks visible when there are no explorable checks remaining", () => {
    const base = getExplorationSummary(starterProject).checks[0];
    const markup = panelMarkup(summaryFor([{ ...base, status: "needs-fix", reason: "Missing destination." }]));
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Explore next outcome/);
    expect(markup).toContain("Fix the blocked checks to keep exploring.");
    expect(markup).not.toContain("All current outcome checks explored");
    expect(markup).not.toContain("View flow issues");
  });
});

describe("preview exploration controls", () => {
  it("keeps the original preview usable without optional exploration props", () => {
    const markup = trayMarkup();
    expect(markup).toContain("Choose an outcome");
    expect(markup).toContain("Restart flow");
    expect(markup).toContain("Exit preview");
    expect(markup).not.toContain("outcome checks explored");
  });

  it("shows progress and recommends an unexplored outcome without marking it explored", () => {
    const summary = getExplorationSummary(starterProject);
    const markup = trayMarkup(summary, summary.checks[0].key);
    expect(markup).toContain("0 of 3");
    expect(markup).toContain("outcome checks explored");
    expect(markup).toContain("Followed in Preview, not approved.");
    expect(markup).toContain("Explore this outcome");
    expect(markup).toContain("Not explored");
    expect(summary.explored).toBe(0);
  });

  it("matches status to the exact source state instead of another visit to the same action", () => {
    const summary = getExplorationSummary(starterProject);
    const actual = summary.checks[0];
    const unrelated = { ...actual, key: "other-state", sourceStateId: "other-state", status: "explored" as const };
    const markup = trayMarkup(summaryFor([...summary.checks, unrelated]), unrelated.key);
    expect(markup).not.toContain("Explore this outcome");
    expect(markup.match(/Not explored/g)).toHaveLength(2);
    expect(markup).not.toMatch(/>Explored<\//);
  });

  it("does not recommend a check already explored", () => {
    const checks = getExplorationSummary(starterProject).checks.map((check) => ({ ...check, status: "explored" as const }));
    const markup = trayMarkup(summaryFor(checks), checks[0].key);
    expect(markup).not.toContain("Explore this outcome");
    expect(markup.match(/Explored<\//g)).toHaveLength(2);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Explore next outcome/);
  });

  it("explains that review shortcuts do not count the setup journey", () => {
    const summary = getExplorationSummary(starterProject);
    const markup = trayMarkup(summary, summary.checks[0].key, ["Review shortcut: Checkout · Ready", "Pay"]);
    expect(markup).toContain("Review shortcut: jumped to a source state. The setup path is not counted.");
  });

  it("only links to flow issues when the analyzer actually has issues", () => {
    const base = getExplorationSummary(starterProject).checks[0];
    const summary = summaryFor([{ ...base, status: "needs-fix", reason: "This check is too large to save." }]);
    expect(trayMarkup(summary)).toContain("1 check blocked");
    expect(trayMarkup(summary)).not.toContain("View flow issues");
    expect(trayMarkup(summary, undefined, undefined, 2)).toContain("View flow issues (2)");
  });
});
