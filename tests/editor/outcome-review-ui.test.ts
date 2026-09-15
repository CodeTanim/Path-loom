import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getExplorationSummary, getOutcomeReviewSummary, OUTCOME_REVIEW_LIMIT, setOutcomeReview, type OutcomeReview, type ProjectDocument } from "../../src/domain";
import { starterProject } from "../../src/domain/samples/starter";
import { ExplorationPanel } from "../../src/features/editor/ExplorationPanel";
import { OutcomeReviewControl } from "../../src/features/editor/OutcomeReviewControl";
import { SimulationTray } from "../../src/features/editor/SimulationTray";

const successContext = { interactionId: "pay", outcomeId: "pay-success", sourceNodeId: "checkout", sourceStateId: "checkout-idle" };
const successReview: OutcomeReview = { ...successContext, status: "needs-work", note: "The confirmation needs an order number." };

function trayMarkup(project: ProjectDocument = starterProject, overrides: Partial<ComponentProps<typeof SimulationTray>> = {}) {
  return renderToStaticMarkup(createElement(SimulationTray, {
    project,
    cursor: { type: "interaction", id: "pay", nodeId: "checkout", stateId: "checkout-idle" },
    journey: ["Checkout", "Pay"],
    canGoBack: true,
    onChooseInteraction: vi.fn(),
    onChooseOutcome: vi.fn(),
    onBack: vi.fn(),
    onRestart: vi.fn(),
    onExit: vi.fn(),
    exploration: getExplorationSummary(project),
    onReviewChange: vi.fn(),
    ...overrides,
  }));
}

function panelMarkup(project: ProjectDocument) {
  return renderToStaticMarkup(createElement(ExplorationPanel, {
    summary: getExplorationSummary(project),
    issueCount: 0,
    onExploreNext: vi.fn(),
    onCheckFlow: vi.fn(),
    reviews: getOutcomeReviewSummary(project),
    onReviewChange: vi.fn(),
    onRevisitReview: vi.fn(),
  }));
}

function controlMarkup(overrides: Partial<ComponentProps<typeof OutcomeReviewControl>> = {}) {
  return renderToStaticMarkup(createElement(OutcomeReviewControl, {
    context: successContext,
    actionName: "Pay",
    outcomeName: "Success",
    contextLabel: "Checkout · Ready",
    atLimit: false,
    onChange: vi.fn(),
    ...overrides,
  }));
}

function expectNoNestedButtons(markup: string) {
  let depth = 0;
  for (const tag of markup.match(/<\/?button\b[^>]*>/g) ?? []) {
    if (tag.startsWith("</")) depth -= 1;
    else {
      expect(depth).toBe(0);
      depth += 1;
    }
  }
  expect(depth).toBe(0);
}

describe("outcome review controls", () => {
  it("offers a distinct flag button for each outcome without nesting it in traversal", () => {
    const markup = trayMarkup();
    expect(markup).toContain('aria-label="Flag Pay → Success as needs work"');
    expect(markup).toContain('aria-label="Flag Pay → Declined as needs work"');
    expect(markup).toContain("Flag an outcome without following it. Flags are separate from exploration.");
    expect(markup).toContain("0 of 3");
    expect(markup).toContain("not approved");
    expectNoNestedButtons(markup);
  });

  it("remains backward compatible when review callbacks are omitted", () => {
    const markup = trayMarkup(starterProject, { onReviewChange: undefined });
    expect(markup).toContain("Choose an outcome");
    expect(markup).not.toContain("Flag needs work");
    expect(markup).not.toContain("Review note");
  });

  it("identifies the existing outcome and recorded source state in its note editor", () => {
    const markup = trayMarkup(setOutcomeReview(starterProject, successReview));
    expect(markup).toContain("Review note for Pay → Success");
    expect(markup).toContain("Outcome flag · Checkout · Ready");
    expect(markup).toContain(successReview.note);
    expect(markup).toContain('maxLength="1000"');
    expect(markup).toContain('aria-label="Resolve flag for Pay → Success"');
    expect(markup).not.toContain('aria-label="Flag Pay → Success as needs work"');
    expect(markup).toContain("0 of 3");
  });

  it("keeps source context from an earlier flag when viewed in another state", () => {
    const project = structuredClone(starterProject);
    project.nodes[0].states.push({ id: "checkout-loading", name: "Loading", kind: "loading" });
    const markup = trayMarkup(setOutcomeReview(project, successReview), {
      cursor: { type: "interaction", id: "pay", nodeId: "checkout", stateId: "checkout-loading" },
    });
    expect(markup).toContain("Outcome flag · Checkout · Ready");
    expect(markup).not.toContain("Outcome flag · Checkout · Loading");
  });

  it("uses unique textarea IDs and labels for multiple outcome notes", () => {
    const project = setOutcomeReview(setOutcomeReview(starterProject, successReview), { ...successReview, outcomeId: "pay-declined", note: "Explain retry." });
    const markup = trayMarkup(project);
    const ids = [...markup.matchAll(/<textarea[^>]*id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(markup).toContain(`for="${id}"`);
    expect(markup).toContain("Review note for Pay → Success");
    expect(markup).toContain("Review note for Pay → Declined");
    expectNoNestedButtons(markup);
  });

  it("opens and identifies a revisited flag without calling it unexplored", () => {
    const markup = trayMarkup(setOutcomeReview(starterProject, successReview), { reviewOutcomeId: "pay-success" });
    expect(markup).toContain("Review this outcome");
    expect(markup).toMatch(/<details[^>]*open=""/);
    expect(markup).not.toContain("Explore this outcome");
    expect(markup).toContain("0 of 3");
  });

  it("shows the just-followed outcome at a completed screen", () => {
    const markup = trayMarkup(starterProject, {
      cursor: { type: "node", nodeId: "confirmation", stateId: "confirmation-success" },
      recentOutcome: successContext,
    });
    expect(markup).toContain("Flow complete");
    expect(markup).toContain('aria-label="Last outcome review"');
    expect(markup).toContain("Pay → Success");
    expect(markup).toContain("Checkout · Ready");
    expect(markup).toContain('aria-label="Flag Pay → Success as needs work"');
    expect(markup).not.toContain('aria-label="Flag Pay → Declined as needs work"');
  });

  it("allows reviewing the attempted outcome when the path is blocked", () => {
    const markup = trayMarkup(starterProject, {
      cursor: { type: "blocked", nodeId: "checkout", stateId: "checkout-idle", reason: "unresolved", label: "Missing destination", detail: "Connect this outcome first.", outcomeId: "pay-success" },
      recentOutcome: successContext,
    });
    expect(markup).toContain("This path needs a fix");
    expect(markup).toContain("Edit this flow");
    expect(markup).toContain('aria-label="Flag Pay → Success as needs work"');
    expect(markup).toContain("0 of 3");
  });

  it("shows the last outcome alongside next-screen actions", () => {
    const markup = trayMarkup(starterProject, {
      cursor: { type: "node", nodeId: "payment-error", stateId: "payment-error-error" },
      recentOutcome: { ...successContext, outcomeId: "pay-declined" },
    });
    expect(markup).toContain("Choose an action");
    expect(markup).toContain("Try again");
    expect(markup).toContain('aria-label="Flag Pay → Declined as needs work"');
  });

  it("does not duplicate last-outcome controls while choosing the next action's outcomes", () => {
    const markup = trayMarkup(starterProject, { recentOutcome: successContext });
    expect(markup).not.toContain('aria-label="Last outcome review"');
    expect(markup.match(/aria-label="Flag Pay → Success as needs work"/g)).toHaveLength(1);
  });

  it("hides stale recent outcomes that no longer belong to an action", () => {
    const markup = trayMarkup(starterProject, {
      cursor: { type: "node", nodeId: "checkout", stateId: "checkout-idle" },
      recentOutcome: { ...successContext, outcomeId: "missing" },
    });
    expect(markup).not.toContain("Last outcome");
  });

  it("disables only new flags at capacity and explains the limit", () => {
    const markup = controlMarkup({ atLimit: true });
    expect(markup).toMatch(/<button[^>]*aria-label="Flag Pay → Success as needs work"[^>]*disabled=""/);
    expect(markup).toContain("Review limit reached. Existing flags can still be edited.");
    const existing = controlMarkup({ atLimit: true, review: successReview });
    expect(existing).not.toContain("disabled=");
    expect(existing).toContain("Resolve flag for Pay → Success");
  });

  it("applies the project capacity to current-outcome flag controls", () => {
    const project: ProjectDocument = { ...starterProject, outcomeReviews: { version: 1, items: Array.from({ length: OUTCOME_REVIEW_LIMIT }, (_, index) => ({ ...successReview, interactionId: `stored-${index}` })) } };
    const markup = trayMarkup(project);
    expect(markup.match(/aria-label="Flag [^"]+"[^>]*disabled=""/g)).toHaveLength(2);
  });

  it("keeps resolved notes and offers explicit reopening", () => {
    const markup = controlMarkup({ review: { ...successReview, status: "resolved" } });
    expect(markup).toContain("Resolved · Review note");
    expect(markup).toContain(successReview.note);
    expect(markup).toContain('aria-label="Reopen flag for Pay → Success"');
    expect(markup).not.toContain('aria-label="Resolve flag for');
  });

  it("escapes review text instead of rendering user HTML", () => {
    const markup = controlMarkup({ review: { ...successReview, note: '<script>alert("no")</script>' } });
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
  });
});

describe("outcome flags in Flow review", () => {
  it("keeps flags and the exploration checklist as separate collapsed sections", () => {
    const markup = panelMarkup(setOutcomeReview(starterProject, successReview));
    expect(markup).toContain('aria-label="Outcome review flags"');
    expect(markup).toContain('aria-label="Outcomes needing work"');
    expect(markup).toContain('aria-label="Outcome checklist"');
    expect(markup).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    expect(markup).toContain("Your outcome flags, separate from exploration and automatic flow issues.");
    expect(markup).toContain(successReview.note);
    expect(markup).toContain("Checkout · Ready");
    expect(markup).toContain('aria-label="Revisit: Pay → Success"');
    expect(markup).toContain('aria-label="Resolve flag for Pay → Success"');
    expect(markup).toContain("0 of 3");
    expect(markup).not.toContain("View flow issues");
  });

  it("provides an editor fallback and reason for a missing recorded state", () => {
    const markup = panelMarkup(setOutcomeReview(starterProject, { ...successReview, sourceStateId: "deleted-state" }));
    expect(markup).toContain('aria-label="Show in editor: Pay → Success"');
    expect(markup).not.toContain('aria-label="Revisit: Pay → Success"');
    expect(markup).toContain("The recorded source state is missing.");
    expect(markup).toContain("Checkout · Missing state");
    expect(markup).toContain('aria-label="Resolve flag for Pay → Success"');
  });

  it("keeps resolved flags discoverable without turning resolution into approval", () => {
    const markup = panelMarkup(setOutcomeReview(starterProject, { ...successReview, status: "resolved" }));
    expect(markup).toContain("Resolved flags (1)");
    expect(markup).toContain("1 resolved");
    expect(markup).toContain('aria-label="Resolved outcome flags"');
    expect(markup).toContain('aria-label="Reopen flag for Pay → Success"');
    expect(markup).toContain("Resolving is not approval of the flow.");
    expect(markup).toContain(successReview.note);
    expect(markup).not.toContain('aria-label="Outcomes needing work"');
  });

  it("gives the empty state guidance without claiming there are no problems", () => {
    const markup = panelMarkup(starterProject);
    expect(markup).toContain("No open flags. Flag an outcome during Preview when something needs attention.");
    expect(markup).not.toContain("Everything works");
    expect(markup).not.toContain("Resolved flags");
  });
});
