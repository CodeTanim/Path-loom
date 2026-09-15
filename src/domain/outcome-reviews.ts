import { analyzeProject, type ProjectAnalysis } from "./analyze";
import {
  OUTCOME_REVIEW_LIMIT,
  OUTCOME_REVIEW_NOTE_MAX_LENGTH,
  type OutcomeReview,
  type ProjectDocument,
} from "./model";

export interface OutcomeReviewItem extends OutcomeReview {
  key: string;
  sourceName: string;
  sourceStateName: string;
  interactionName: string;
  outcomeName: string;
  canRevisit: boolean;
  reason?: string;
}

export interface OutcomeReviewSummary {
  items: OutcomeReviewItem[];
  open: number;
  resolved: number;
  total: number;
}

/** JSON encoding avoids collisions when imported IDs contain punctuation. */
export function outcomeReviewKey(interactionId: string, outcomeId: string) {
  return JSON.stringify([interactionId, outcomeId]);
}

function ownedOutcomeKeys(project: ProjectDocument) {
  return new Set(project.interactions.flatMap((interaction) =>
    interaction.outcomes.map((outcome) => outcomeReviewKey(interaction.id, outcome.id)),
  ));
}

function sameReview(left: OutcomeReview, right: OutcomeReview) {
  return left.interactionId === right.interactionId &&
    left.outcomeId === right.outcomeId &&
    left.sourceNodeId === right.sourceNodeId &&
    left.sourceStateId === right.sourceStateId &&
    left.note === right.note &&
    left.status === right.status;
}

export function getOutcomeReview(
  project: ProjectDocument,
  interactionId: string,
  outcomeId: string,
): OutcomeReview | null {
  const owner = project.interactions.find((interaction) => interaction.id === interactionId);
  if (!owner?.outcomes.some((outcome) => outcome.id === outcomeId)) return null;
  return project.outcomeReviews?.items.find((review) =>
    review.interactionId === interactionId && review.outcomeId === outcomeId,
  ) ?? null;
}

/**
 * Current reviews override snapshot reviews during design Undo/Redo, so a newer
 * note or resolution is not silently undone. Snapshot-only reviews can return
 * when their deleted outcome is restored. Never invalidate flags after edits.
 */
export function reconcileOutcomeReviews(
  project: ProjectDocument,
  preferredReviews: readonly OutcomeReview[] = [],
): ProjectDocument {
  if (!project.outcomeReviews && preferredReviews.length === 0) return project;
  const owned = ownedOutcomeKeys(project);
  const preferred = new Map<string, OutcomeReview>();
  for (const review of preferredReviews) {
    const key = outcomeReviewKey(review.interactionId, review.outcomeId);
    if (owned.has(key)) preferred.set(key, review);
  }
  // Honor the persisted limit even when two valid history snapshots contain
  // disjoint reviews. Existing current records have priority over restorations.
  const preferredKeys = new Set([...preferred.keys()].slice(0, OUTCOME_REVIEW_LIMIT));
  const reviews = new Map<string, OutcomeReview>();
  let snapshotSlots = OUTCOME_REVIEW_LIMIT - preferredKeys.size;
  for (const review of project.outcomeReviews?.items ?? []) {
    const key = outcomeReviewKey(review.interactionId, review.outcomeId);
    if (!owned.has(key) || reviews.has(key)) continue;
    if (preferredKeys.has(key)) {
      reviews.set(key, preferred.get(key)!);
    } else if (!preferred.has(key) && snapshotSlots > 0) {
      reviews.set(key, review);
      snapshotSlots -= 1;
    }
  }
  for (const key of preferredKeys) {
    if (!reviews.has(key)) reviews.set(key, preferred.get(key)!);
  }
  const items = [...reviews.values()];
  const previous = project.outcomeReviews?.items;
  if (!previous && items.length === 0) return project;
  if (previous && previous.length === items.length &&
    previous.every((review, index) => sameReview(review, items[index]))) return project;
  return { ...project, outcomeReviews: { version: 1, items } };
}

/** Upsert one bounded annotation without changing graph or exploration data. */
export function setOutcomeReview(
  project: ProjectDocument,
  review: OutcomeReview,
): ProjectDocument {
  const owned = ownedOutcomeKeys(project);
  const key = outcomeReviewKey(review.interactionId, review.outcomeId);
  if (!owned.has(key)) return project;

  const reconciled = reconcileOutcomeReviews(project);
  const previous = reconciled.outcomeReviews?.items ?? [];
  const index = previous.findIndex((candidate) =>
    outcomeReviewKey(candidate.interactionId, candidate.outcomeId) === key,
  );
  if (index === -1 && previous.length >= OUTCOME_REVIEW_LIMIT) return reconciled;

  // Select only the persistence shape: callers may pass a derived summary item.
  const bounded: OutcomeReview = {
    interactionId: review.interactionId,
    outcomeId: review.outcomeId,
    sourceNodeId: review.sourceNodeId,
    sourceStateId: review.sourceStateId,
    note: review.note.slice(0, OUTCOME_REVIEW_NOTE_MAX_LENGTH),
    status: review.status,
  };
  if (index !== -1 && sameReview(previous[index], bounded)) return reconciled;
  const items = [...previous];
  if (index === -1) items.push(bounded);
  else items[index] = bounded;
  return { ...reconciled, outcomeReviews: { version: 1, items } };
}

export function getOutcomeReviewSummary(
  project: ProjectDocument,
  analysis: ProjectAnalysis = analyzeProject(project),
): OutcomeReviewSummary {
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const interactions = new Map(project.interactions.map((interaction) => [interaction.id, interaction]));
  const reachable = new Set(analysis.reachableStatePairs.map((pair) =>
    JSON.stringify([pair.nodeId, pair.stateId]),
  ));
  const items: OutcomeReviewItem[] = [];
  for (const review of reconcileOutcomeReviews(project).outcomeReviews?.items ?? []) {
    const interaction = interactions.get(review.interactionId)!;
    const outcome = interaction.outcomes.find((candidate) => candidate.id === review.outcomeId)!;
    const source = nodes.get(review.sourceNodeId);
    const state = source?.states.find((candidate) => candidate.id === review.sourceStateId);
    const reason = review.sourceNodeId !== interaction.sourceNodeId
      ? "This action now starts on a different screen. Inspect it in the editor."
      : !source
        ? "The recorded source screen is missing. Inspect the action in the editor."
        : review.sourceStateId === null
          ? "No source state was recorded. Inspect the outcome in the editor."
          : !state
            ? "The recorded source state is missing. Inspect the outcome in the editor."
            : source.kind === "terminal"
              ? "The source screen now ends the flow. Inspect the action in the editor."
              : interaction.sourceStateId !== null && interaction.sourceStateId !== review.sourceStateId
                ? "This action is no longer available in the recorded state. Inspect it in the editor."
                : !reachable.has(JSON.stringify([review.sourceNodeId, review.sourceStateId]))
                  ? "The recorded source state cannot be reached from the flow's start. Inspect the outcome in the editor."
                  : undefined;
    items.push({
      ...review,
      key: outcomeReviewKey(review.interactionId, review.outcomeId),
      sourceName: source ? source.name || "Untitled screen" : "Missing screen",
      sourceStateName: state ? state.name || "Unnamed state" : review.sourceStateId === null ? "No recorded state" : "Missing state",
      interactionName: interaction.name || "Untitled action",
      outcomeName: outcome.name || "Untitled outcome",
      canRevisit: reason === undefined,
      ...(reason ? { reason } : {}),
    });
  }
  const open = items.filter((item) => item.status === "needs-work").length;
  return { items, open, resolved: items.length - open, total: items.length };
}
