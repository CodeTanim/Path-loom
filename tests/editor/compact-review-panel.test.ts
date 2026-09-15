import { createElement, Fragment, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getExplorationSummary, getOutcomeReviewSummary, setOutcomeReview, type OutcomeReview } from "../../src/domain";
import { starterProject } from "../../src/domain/samples/starter";
import { ExplorationPanel } from "../../src/features/editor/ExplorationPanel";

type PanelProps = ComponentProps<typeof ExplorationPanel>;

const successReview: OutcomeReview = {
  interactionId: "pay",
  outcomeId: "pay-success",
  sourceNodeId: "checkout",
  sourceStateId: "checkout-idle",
  status: "needs-work",
  note: "Show an order number.",
};

function panelProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    summary: getExplorationSummary(starterProject),
    issueCount: 0,
    onExploreNext: vi.fn(),
    onCheckFlow: vi.fn(),
    ...overrides,
  };
}

function markupFor(overrides: Partial<PanelProps> = {}) {
  return renderToStaticMarkup(createElement(ExplorationPanel, panelProps(overrides)));
}

function toggleMarkup(markup: string) {
  const toggle = markup.match(/<button\b[^>]*aria-expanded="false"[^>]*>[\s\S]*?<\/button>/)?.[0];
  expect(toggle).toBeDefined();
  return toggle!;
}

describe("compact Flow review disclosure", () => {
  it("starts collapsed with an accessible button controlling the hidden details", () => {
    const markup = markupFor();
    const toggle = toggleMarkup(markup);
    const contentId = toggle.match(/aria-controls="([^"]+)"/)?.[1];

    expect(toggle).toContain('type="button"');
    expect(toggle).toContain('aria-label="Flow review, 0 of 3 outcome checks explored"');
    expect(contentId).toBeTruthy();

    const body = markup.match(/<div\b[^>]*>/g)?.find((tag) => tag.includes(`id="${contentId}"`));
    expect(body).toContain('hidden=""');
    expect(markup).toContain('aria-label="Flow exploration"');
    expect(markup).toContain("Explore next outcome");
    expect(markup).toContain("Outcome checklist");
  });

  it("shows concise exploration progress in the collapsed button", () => {
    const summary = getExplorationSummary(starterProject);
    const partiallyExplored = {
      ...summary,
      explored: 1,
      unexplored: 2,
      checks: summary.checks.map((check, index) => index === 0 ? { ...check, status: "explored" as const } : check),
    };
    const toggle = toggleMarkup(markupFor({ summary: partiallyExplored }));

    expect(toggle).toContain("1/3 explored");
    expect(toggle).toContain('aria-label="Flow review, 1 of 3 outcome checks explored"');
  });

  it("counts only open flags in the summary while retaining resolved notes in the details", () => {
    const project = setOutcomeReview(setOutcomeReview(starterProject, successReview), {
      ...successReview,
      outcomeId: "pay-declined",
      status: "resolved",
      note: "Retry copy is now clear.",
    });
    const markup = markupFor({ reviews: getOutcomeReviewSummary(project) });
    const toggle = toggleMarkup(markup);

    expect(toggle).toContain('aria-label="Flow review, 0 of 3 outcome checks explored, 1 open flag"');
    expect(toggle).not.toContain("2 open");
    expect(markup).toContain("Show an order number.");
    expect(markup).toContain("Resolved flags (1)");
    expect(markup).toContain("Retry copy is now clear.");
  });

  it("labels multiple open flags without combining them with automatic flow issues", () => {
    const project = setOutcomeReview(setOutcomeReview(starterProject, successReview), {
      ...successReview,
      outcomeId: "pay-declined",
    });
    const markup = markupFor({ reviews: getOutcomeReviewSummary(project), issueCount: 4 });

    expect(toggleMarkup(markup)).toContain('aria-label="Flow review, 0 of 3 outcome checks explored, 2 open flags"');
    expect(markup).toContain("View flow issues (4)");
  });

  it("labels an empty flow clearly instead of displaying zero-of-zero progress", () => {
    const markup = markupFor({
      summary: { checks: [], total: 0, explored: 0, unexplored: 0, needsFix: 0, unreachable: 0 },
      reviews: { items: [], open: 0, resolved: 0, total: 0 },
    });
    const toggle = toggleMarkup(markup);

    expect(toggle).toContain("No outcomes");
    expect(toggle).toContain('aria-label="Flow review, no outcomes yet, 0 open flags"');
    expect(toggle).not.toContain("0/0");
    expect(markup).not.toContain("<progress");
    expect(markup).toContain("Add actions and outcomes to start exploring.");
  });

  it("omits flag counts when optional review data is not supplied", () => {
    const toggle = toggleMarkup(markupFor());

    expect(toggle).toContain("Flow review");
    expect(toggle).toContain("0/3 explored");
    expect(toggle).not.toContain("open flag");
    expect(toggle).not.toContain("lucide-flag");
  });

  it("gives each disclosure its own controlled content ID", () => {
    const markup = renderToStaticMarkup(createElement(Fragment, null,
      createElement(ExplorationPanel, { ...panelProps(), key: "first" }),
      createElement(ExplorationPanel, { ...panelProps(), key: "second" }),
    ));
    const ids = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      const body = markup.match(/<div\b[^>]*>/g)?.find((tag) => tag.includes(`id="${id}"`));
      expect(body).toContain('hidden=""');
    }
  });

  it("does not advance exploration, change flags, or mutate summary data on render", () => {
    const props = panelProps({
      reviews: getOutcomeReviewSummary(setOutcomeReview(starterProject, successReview)),
      onRevisitReview: vi.fn(),
      onReviewChange: vi.fn(),
    });
    const summaryBefore = structuredClone(props.summary);
    const reviewsBefore = structuredClone(props.reviews);

    renderToStaticMarkup(createElement(ExplorationPanel, props));

    expect(props.summary).toEqual(summaryBefore);
    expect(props.reviews).toEqual(reviewsBefore);
    expect(props.onExploreNext).not.toHaveBeenCalled();
    expect(props.onCheckFlow).not.toHaveBeenCalled();
    expect(props.onRevisitReview).not.toHaveBeenCalled();
    expect(props.onReviewChange).not.toHaveBeenCalled();
  });
});
