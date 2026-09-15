import {
  CORE_UI_STATE_KINDS,
  EXPLORATION_FINGERPRINT_MAX_LENGTH,
  EXPLORATION_VISIT_LIMIT,
  OUTCOME_REVIEW_LIMIT,
  OUTCOME_REVIEW_NOTE_MAX_LENGTH,
  STICKY_NOTE_LIMIT,
  STICKY_NOTE_MAX_HEIGHT,
  STICKY_NOTE_MAX_TEXT_LENGTH,
  STICKY_NOTE_MAX_WIDTH,
  STICKY_NOTE_MIN_HEIGHT,
  STICKY_NOTE_MIN_WIDTH,
  type FlowNodeKind,
  type InteractionKind,
  type InteractionTrigger,
  type OutcomeKind,
  type PathloomDocument,
  type UIStateKind,
} from "./model";

const FLOW_NODE_KINDS = new Set<FlowNodeKind>([
  "screen",
  "decision",
  "terminal",
]);
const UI_STATE_KINDS = new Set<UIStateKind>([
  ...CORE_UI_STATE_KINDS,
  "custom",
]);
const INTERACTION_KINDS = new Set<InteractionKind>([
  "navigation",
  "async",
  "local",
  "system",
]);
const INTERACTION_TRIGGERS = new Set<InteractionTrigger>([
  "click",
  "submit",
  "change",
  "timer",
  "system",
]);
const OUTCOME_KINDS = new Set<OutcomeKind>([
  "success",
  "failure",
  "timeout",
  "offline",
  "unauthorized",
  "alternate",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableReference(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function hasUniqueEntityIds(values: readonly unknown[]) {
  const ids = new Set<string>();

  for (const value of values) {
    if (!isRecord(value) || !isNonEmptyString(value.id) || ids.has(value.id)) {
      return false;
    }

    ids.add(value.id);
  }

  return true;
}

function hasGloballyUniqueOutcomeIds(interactions: readonly unknown[]) {
  const ids = new Set<string>();

  for (const interaction of interactions) {
    if (!isRecord(interaction) || !Array.isArray(interaction.outcomes)) {
      return false;
    }

    for (const outcome of interaction.outcomes) {
      if (
        !isRecord(outcome) ||
        !isNonEmptyString(outcome.id) ||
        ids.has(outcome.id)
      ) {
        return false;
      }

      ids.add(outcome.id);
    }
  }

  return true;
}

function hasSafeProjectedIds(
  nodes: readonly unknown[],
  interactions: readonly unknown[],
) {
  const nodeIds = new Set(
    nodes
      .filter(isRecord)
      .map((node) => node.id)
      .filter(isNonEmptyString),
  );
  if (
    [...nodeIds].some(
      (id) =>
        id.startsWith("interaction:") ||
        id.startsWith("unresolved:") ||
        id.startsWith("note:"),
    )
  ) {
    return false;
  }

  const incomingEdgeIds = new Set<string>();
  for (const interaction of interactions) {
    if (!isRecord(interaction) || !isNonEmptyString(interaction.id)) return false;
    incomingEdgeIds.add(`edge:into:${interaction.id}`);
  }

  for (const interaction of interactions) {
    if (!isRecord(interaction) || !Array.isArray(interaction.outcomes)) {
      return false;
    }
    for (const outcome of interaction.outcomes) {
      if (
        !isRecord(outcome) ||
        !isNonEmptyString(outcome.id) ||
        incomingEdgeIds.has(`edge:${outcome.id}`)
      ) {
        return false;
      }
    }
  }

  return true;
}

function hasOptionalString(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || typeof record[key] === "string";
}

function isPosition(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isOptionalEdgeRoute(value: unknown) {
  return (
    value === undefined ||
    (isRecord(value) && isPosition(value.bendOffset))
  );
}

function isSize(value: unknown) {
  return (
    value === undefined ||
    (isRecord(value) &&
      typeof value.width === "number" &&
      Number.isFinite(value.width) &&
      typeof value.height === "number" &&
      Number.isFinite(value.height))
  );
}

function isStickyNote(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.text === "string" &&
    value.text.length <= STICKY_NOTE_MAX_TEXT_LENGTH &&
    isPosition(value.position) &&
    isRecord(value.size) &&
    typeof value.size.width === "number" &&
    Number.isFinite(value.size.width) &&
    value.size.width >= STICKY_NOTE_MIN_WIDTH &&
    value.size.width <= STICKY_NOTE_MAX_WIDTH &&
    typeof value.size.height === "number" &&
    Number.isFinite(value.size.height) &&
    value.size.height >= STICKY_NOTE_MIN_HEIGHT &&
    value.size.height <= STICKY_NOTE_MAX_HEIGHT
  );
}

function isExploration(value: unknown) {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.visits) ||
    value.visits.length > EXPLORATION_VISIT_LIMIT
  ) {
    return false;
  }

  // References may be stale after an edit or an import; reconciliation handles
  // their meaning. The storage boundary only checks the bounded JSON shape.
  return value.visits.every(
    (visit) =>
      isRecord(visit) &&
      isNonEmptyString(visit.interactionId) &&
      isNonEmptyString(visit.outcomeId) &&
      isNonEmptyString(visit.sourceStateId) &&
      isNonEmptyString(visit.fingerprint) &&
      visit.fingerprint.length <= EXPLORATION_FINGERPRINT_MAX_LENGTH,
  );
}

function isOutcomeReviews(value: unknown) {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.items) ||
    value.items.length > OUTCOME_REVIEW_LIMIT
  ) return false;

  const keys = new Set<string>();
  // Source references may become stale after editing. Keep the review so users
  // can resolve it explicitly; reconciliation only removes deleted outcomes.
  return value.items.every((review) => {
    if (
      !isRecord(review) ||
      !isNonEmptyString(review.interactionId) ||
      !isNonEmptyString(review.outcomeId) ||
      !isNonEmptyString(review.sourceNodeId) ||
      !isNullableReference(review.sourceStateId) ||
      typeof review.note !== "string" ||
      review.note.length > OUTCOME_REVIEW_NOTE_MAX_LENGTH ||
      (review.status !== "needs-work" && review.status !== "resolved")
    ) return false;

    const key = JSON.stringify([review.interactionId, review.outcomeId]);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function isState(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.kind === "string" &&
    UI_STATE_KINDS.has(value.kind as UIStateKind) &&
    hasOptionalString(value, "description")
  );
}

function isNode(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.kind === "string" &&
    FLOW_NODE_KINDS.has(value.kind as FlowNodeKind) &&
    hasOptionalString(value, "description") &&
    isPosition(value.position) &&
    isSize(value.size) &&
    Array.isArray(value.states) &&
    value.states.every(isState) &&
    hasUniqueEntityIds(value.states) &&
    isNullableReference(value.initialStateId) &&
    (value.requiredStateKinds === undefined ||
      (Array.isArray(value.requiredStateKinds) &&
        value.requiredStateKinds.every(
          (kind) =>
            typeof kind === "string" &&
            CORE_UI_STATE_KINDS.includes(
              kind as (typeof CORE_UI_STATE_KINDS)[number],
            ),
        )))
  );
}

function isTarget(value: unknown) {
  return (
    value === null ||
    (isRecord(value) &&
      isNonEmptyString(value.nodeId) &&
      isNullableReference(value.stateId))
  );
}

function isOutcome(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.kind === "string" &&
    OUTCOME_KINDS.has(value.kind as OutcomeKind) &&
    hasOptionalString(value, "description") &&
    hasOptionalString(value, "condition") &&
    isTarget(value.target) &&
    isOptionalEdgeRoute(value.route)
  );
}

function isInteraction(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.kind === "string" &&
    INTERACTION_KINDS.has(value.kind as InteractionKind) &&
    typeof value.trigger === "string" &&
    INTERACTION_TRIGGERS.has(value.trigger as InteractionTrigger) &&
    (value.position === undefined || isPosition(value.position)) &&
    isNonEmptyString(value.sourceNodeId) &&
    isNullableReference(value.sourceStateId) &&
    Array.isArray(value.outcomes) &&
    value.outcomes.every(isOutcome) &&
    isOptionalEdgeRoute(value.incomingRoute)
  );
}

/** Structural boundary for documents entering from local storage or imports. */
export function isPathloomDocument(value: unknown): value is PathloomDocument {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    hasOptionalString(value, "description") &&
    isNonEmptyString(value.entryNodeId) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isNode) &&
    hasUniqueEntityIds(value.nodes) &&
    Array.isArray(value.interactions) &&
    value.interactions.every(isInteraction) &&
    hasUniqueEntityIds(value.interactions) &&
    hasGloballyUniqueOutcomeIds(value.interactions) &&
    hasSafeProjectedIds(value.nodes, value.interactions) &&
    (value.stickyNotes === undefined ||
      (Array.isArray(value.stickyNotes) &&
        value.stickyNotes.length <= STICKY_NOTE_LIMIT &&
        value.stickyNotes.every(isStickyNote) &&
        hasUniqueEntityIds(value.stickyNotes))) &&
    isExploration(value.exploration) &&
    isOutcomeReviews(value.outcomeReviews)
  );
}

export function parsePathloomDocument(serialized: string): PathloomDocument | null {
  try {
    const value: unknown = JSON.parse(serialized);
    return isPathloomDocument(value) ? value : null;
  } catch {
    return null;
  }
}
