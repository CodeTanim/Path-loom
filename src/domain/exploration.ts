import { analyzeProject, type ProjectAnalysis } from "./analyze";
import {
  EXPLORATION_FINGERPRINT_MAX_LENGTH,
  EXPLORATION_VISIT_LIMIT,
  type ExplorationVisit,
  type FlowNode,
  type Interaction,
  type Outcome,
  type ProjectDocument,
  type UIState,
} from "./model";

export interface ExplorationCheck {
  key: string;
  interactionId: string;
  outcomeId: string;
  sourceNodeId: string;
  sourceStateId: string | null;
  sourceName: string;
  sourceStateName: string;
  interactionName: string;
  outcomeName: string;
  status: "unexplored" | "explored" | "needs-fix" | "unreachable";
  reason?: string;
  fingerprint: string | null;
}

export interface ExplorationSummary {
  checks: ExplorationCheck[];
  total: number;
  explored: number;
  unexplored: number;
  needsFix: number;
  unreachable: number;
}

function checkKey(
  interactionId: string,
  outcomeId: string,
  sourceStateId: string | null,
) {
  return JSON.stringify([interactionId, outcomeId, sourceStateId]);
}

function compareIds(a: { id: string }, b: { id: string }) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function stateSemantics(state: UIState) {
  return [state.id, state.name, state.kind, state.description ?? ""];
}

function nodeSemantics(node: FlowNode) {
  return [node.id, node.name, node.kind, node.description ?? ""];
}

function interactionSemantics(interaction: Interaction) {
  return [
    interaction.id,
    interaction.name,
    interaction.kind,
    interaction.trigger,
    interaction.sourceNodeId,
    interaction.sourceStateId,
  ];
}

function outcomeSemantics(outcome: Outcome) {
  return [
    outcome.id,
    outcome.name,
    outcome.kind,
    outcome.description ?? "",
    outcome.condition ?? "",
    outcome.target === null
      ? null
      : [outcome.target.nodeId, outcome.target.stateId],
  ];
}

/** Explicit semantic fields avoid invalidating progress for notes or layout. */
function createFingerprint(
  project: ProjectDocument,
  source: FlowNode,
  sourceState: UIState,
  interaction: Interaction,
  outcome: Outcome,
  target: FlowNode,
  targetState: UIState,
  arrivalSemantics: string,
) {
  return JSON.stringify([
    1,
    project.entryNodeId,
    project.nodes.find((node) => node.id === project.entryNodeId)?.initialStateId,
    nodeSemantics(source),
    stateSemantics(sourceState),
    interactionSemantics(interaction),
    outcomeSemantics(outcome),
    nodeSemantics(target),
    stateSemantics(targetState),
    arrivalSemantics,
  ]);
}

/**
 * One check per outcome and reachable applicable source state. A disconnected
 * action retains one placeholder per outcome so it never disappears from review.
 */
export function getExplorationSummary(
  project: ProjectDocument,
  analysis: ProjectAnalysis = analyzeProject(project),
): ExplorationSummary {
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const reachableStates = new Map<string, Set<string>>();
  for (const pair of analysis.reachableStatePairs) {
    const states = reachableStates.get(pair.nodeId) ?? new Set<string>();
    states.add(pair.stateId);
    reachableStates.set(pair.nodeId, states);
  }
  const actionsBySource = new Map<string, Interaction[]>();
  for (const interaction of project.interactions) {
    const actions = actionsBySource.get(interaction.sourceNodeId) ?? [];
    actions.push(interaction);
    actionsBySource.set(interaction.sourceNodeId, actions);
  }
  const arrivals = new Map<string, string | null>();
  const arrivalSemantics = (target: FlowNode, targetState: UIState) => {
    const key = JSON.stringify([target.id, targetState.id]);
    if (arrivals.has(key)) return arrivals.get(key)!;
    // Arrival behavior is one hop deep; distant independent edits should not
    // reset the whole journey. Cache it because many outcomes may arrive here.
    const serialized = JSON.stringify(target.kind === "terminal" ? [] :
      (actionsBySource.get(target.id) ?? [])
        .filter((action) => action.sourceStateId === null || action.sourceStateId === targetState.id)
        .sort(compareIds)
        .map((action) => [
          interactionSemantics(action),
          [...action.outcomes].sort(compareIds).map(outcomeSemantics),
        ]),
    );
    const bounded = serialized.length <= EXPLORATION_FINGERPRINT_MAX_LENGTH ? serialized : null;
    arrivals.set(key, bounded);
    return bounded;
  };
  const visits = new Map<string, Set<string>>();
  for (const visit of project.exploration?.visits ?? []) {
    const key = checkKey(visit.interactionId, visit.outcomeId, visit.sourceStateId);
    const fingerprints = visits.get(key) ?? new Set<string>();
    fingerprints.add(visit.fingerprint);
    visits.set(key, fingerprints);
  }

  const checks: ExplorationCheck[] = [];
  for (const interaction of project.interactions) {
    const source = nodes.get(interaction.sourceNodeId);
    const explicitState = source?.states.find(
      (state) => state.id === interaction.sourceStateId,
    );
    const sourceReason = !source
      ? "The action's source screen is missing."
      : source.kind === "terminal"
        ? "This action starts on a screen marked as the end of the flow."
        : interaction.sourceStateId !== null && !explicitState
          ? "The action's source state is missing."
          : source.states.length === 0
            ? "The action's source screen has no states."
            : undefined;
    const applicableStates = sourceReason
      ? []
      : (source?.states ?? []).filter(
          (state) =>
            reachableStates.get(source!.id)?.has(state.id) &&
            (interaction.sourceStateId === null ||
              interaction.sourceStateId === state.id),
        );
    const contexts: (UIState | null)[] = applicableStates.length
      ? applicableStates
      : [explicitState ?? null];

    for (const outcome of interaction.outcomes) {
      const target = outcome.target ? nodes.get(outcome.target.nodeId) : undefined;
      const targetStateId = outcome.target?.stateId ?? target?.initialStateId;
      const targetState = target?.states.find((state) => state.id === targetStateId);
      const targetReason = !outcome.target
        ? "Choose a destination for this outcome."
        : !target
          ? "The outcome's destination screen is missing."
          : !targetState
            ? outcome.target.stateId === null
              ? "The destination screen needs a valid initial state."
              : "The outcome's destination state is missing."
            : undefined;

      for (const context of contexts) {
        const sourceStateId = context?.id ?? interaction.sourceStateId;
        const key = checkKey(interaction.id, outcome.id, sourceStateId);
        const check: ExplorationCheck = {
          key,
          interactionId: interaction.id,
          outcomeId: outcome.id,
          sourceNodeId: interaction.sourceNodeId,
          sourceStateId,
          sourceName: source ? source.name || "Untitled screen" : "Missing screen",
          sourceStateName: context ? context.name || "Unnamed state" : (sourceStateId ? "Missing state" : "No reachable state"),
          interactionName: interaction.name,
          outcomeName: outcome.name,
          status: "unexplored",
          fingerprint: null,
        };
        const reason = sourceReason ?? targetReason;
        if (reason) {
          check.status = "needs-fix";
          check.reason = reason;
        } else if (applicableStates.length === 0) {
          check.status = "unreachable";
          check.reason = "This action cannot be reached from the flow's start in an applicable state.";
        } else {
          const arrival = arrivalSemantics(target!, targetState!);
          const fingerprint = arrival === null ? null : createFingerprint(
            project, source!, context!, interaction, outcome, target!, targetState!,
            arrival,
          );
          if (fingerprint === null || fingerprint.length > EXPLORATION_FINGERPRINT_MAX_LENGTH) {
            check.status = "needs-fix";
            check.reason = "This branch has too much text or too many arrival choices to track. Shorten its text or split the flow.";
          } else {
            check.fingerprint = fingerprint;
            if (visits.get(key)?.has(fingerprint)) check.status = "explored";
          }
        }
        checks.push(check);
      }
    }
  }

  // The same stable set remains trackable when users reorder their document.
  const trackable = checks.filter((check) => check.fingerprint !== null);
  if (trackable.length > EXPLORATION_VISIT_LIMIT) {
    const allowed = new Set(
      trackable.map((check) => check.key).sort().slice(0, EXPLORATION_VISIT_LIMIT),
    );
    for (const check of trackable) {
      if (allowed.has(check.key)) continue;
      check.status = "needs-fix";
      check.reason = `Exploration supports ${EXPLORATION_VISIT_LIMIT.toLocaleString("en-US")} outcome-state checks per flow. Split this flow to track more.`;
      check.fingerprint = null;
    }
  }

  return {
    checks,
    total: checks.length,
    explored: checks.filter((check) => check.status === "explored").length,
    unexplored: checks.filter((check) => check.status === "unexplored").length,
    needsFix: checks.filter((check) => check.status === "needs-fix").length,
    unreachable: checks.filter((check) => check.status === "unreachable").length,
  };
}

export function getNextUnexploredCheck(summary: ExplorationSummary) {
  return summary.checks.find((check) => check.status === "unexplored") ?? null;
}

/** Remove stale records and union valid progress from another editor snapshot. */
export function reconcileExploration(
  project: ProjectDocument,
  additionalVisits: readonly ExplorationVisit[] = [],
): ProjectDocument {
  if (!project.exploration && additionalVisits.length === 0) return project;
  const checks = new Map(
    getExplorationSummary(project).checks.map((check) => [check.key, check]),
  );
  const visits = new Map<string, ExplorationVisit>();
  for (const visit of [...(project.exploration?.visits ?? []), ...additionalVisits]) {
    const key = checkKey(visit.interactionId, visit.outcomeId, visit.sourceStateId);
    const check = checks.get(key);
    if (!check?.fingerprint || check.fingerprint !== visit.fingerprint) continue;
    visits.set(key, visit);
  }
  const nextVisits = [...visits.values()];
  const previous = project.exploration?.visits;
  if (
    previous && previous.length === nextVisits.length &&
    previous.every((visit, index) => visit === nextVisits[index])
  ) return project;
  return { ...project, exploration: { version: 1, visits: nextVisits } };
}

/** Call only after the simulator has successfully followed the chosen outcome. */
export function recordExploredOutcome(
  project: ProjectDocument,
  interactionId: string,
  outcomeId: string,
  sourceStateId: string | null,
): ProjectDocument {
  if (sourceStateId === null) return project;
  const check = getExplorationSummary(project).checks.find(
    (candidate) => candidate.key === checkKey(interactionId, outcomeId, sourceStateId),
  );
  if (!check?.fingerprint || check.status !== "unexplored") return project;
  return reconcileExploration(project, [{
    interactionId, outcomeId, sourceStateId, fingerprint: check.fingerprint,
  }]);
}
