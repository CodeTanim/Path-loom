import type {
  CoreUIStateKind,
  FlowNode,
  Interaction,
  Outcome,
  OutcomeKind,
  ProjectDocument,
  UIStateKind,
} from "./model";

export type BrokenBranchReason =
  | "missing-source-node"
  | "missing-source-state"
  | "missing-target-node"
  | "missing-target-state"
  | "missing-target-initial-state"
  | "terminal-source-node";

export interface BrokenBranch {
  interactionId: string;
  outcomeId: string | null;
  reason: BrokenBranchReason;
  referencedId: string;
}

export interface UnresolvedBranch {
  interactionId: string;
  outcomeId: string;
  sourceNodeId: string;
}

export type MissingStateRule =
  | "screen-idle"
  | "async-loading"
  | "outcome-target"
  | "node-requirement";

export interface MissingState {
  nodeId: string;
  stateKind: CoreUIStateKind;
  rule: MissingStateRule;
  reason: string;
}

export interface StatePair {
  nodeId: string;
  stateId: string;
}

export interface OutcomeStateKindMismatch {
  interactionId: string;
  outcomeId: string;
  outcomeKind: OutcomeKind;
  targetNodeId: string;
  targetStateId: string;
  expectedStateKind: CoreUIStateKind;
  actualStateKind: UIStateKind;
}

export type EntryPointErrorReason =
  | "missing-entry-node"
  | "missing-entry-initial-state";

export type AnalysisIssue =
  | {
      type: "missing-entry-node";
      severity: "error";
      nodeId: string;
      reason: EntryPointErrorReason;
      stateId: string | null;
      message: string;
    }
  | {
      type: "broken-branch";
      severity: "error";
      branch: BrokenBranch;
      message: string;
    }
  | {
      type: "unresolved-branch";
      severity: "warning";
      branch: UnresolvedBranch;
      message: string;
    }
  | {
      type: "missing-outcome";
      severity: "warning";
      interactionId: string;
      message: string;
    }
  | {
      type: "unreachable-node";
      severity: "warning";
      nodeId: string;
      message: string;
    }
  | {
      type: "dead-end";
      severity: "warning";
      nodeId: string;
      stateId: string;
      message: string;
    }
  | {
      type: "outcome-state-kind-mismatch";
      severity: "warning";
      mismatch: OutcomeStateKindMismatch;
      message: string;
    }
  | {
      type: "missing-state";
      severity: "warning";
      finding: MissingState;
      message: string;
    };

export interface AnalysisSummary {
  totalNodes: number;
  reachableNodes: number;
  unreachableNodes: number;
  deadEnds: number;
  brokenBranches: number;
  unresolvedBranches: number;
  missingStates: number;
  outcomeStateKindMismatches: number;
  missingOutcomes: number;
  errors: number;
  warnings: number;
}

export interface ProjectAnalysis {
  /** Reachable state pairs in node/state document order. */
  reachableStatePairs: StatePair[];
  reachableNodeIds: string[];
  unreachableNodeIds: string[];
  /** Reachable, non-terminal states without a valid outgoing outcome. */
  deadEndStatePairs: StatePair[];
  /** Unique node IDs retained for existing graph and inspector consumers. */
  deadEndNodeIds: string[];
  brokenBranches: BrokenBranch[];
  unresolvedBranches: UnresolvedBranch[];
  missingStates: MissingState[];
  outcomeStateKindMismatches: OutcomeStateKindMismatch[];
  /** Interactions that cannot continue because they define no outcomes. */
  missingOutcomeInteractionIds: string[];
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
}

const OUTCOME_STATE_REQUIREMENTS: Partial<
  Record<OutcomeKind, CoreUIStateKind>
> = {
  success: "success",
  failure: "error",
  timeout: "error",
  offline: "offline",
  unauthorized: "unauthorized",
};

function nodeHasState(node: FlowNode, stateId: string): boolean {
  return node.states.some((state) => state.id === stateId);
}

function resolveInitialStateId(node: FlowNode): string | null {
  if (node.initialStateId === null) return null;
  return nodeHasState(node, node.initialStateId) ? node.initialStateId : null;
}

function resolveOutcomeTarget(
  outcome: Outcome,
  nodesById: ReadonlyMap<string, FlowNode>,
): StatePair | null {
  if (outcome.target === null) return null;

  const targetNode = nodesById.get(outcome.target.nodeId);
  if (!targetNode) return null;

  const stateId = outcome.target.stateId ?? resolveInitialStateId(targetNode);
  if (stateId === null || !nodeHasState(targetNode, stateId)) return null;

  return { nodeId: targetNode.id, stateId };
}

function statePairKey({ nodeId, stateId }: StatePair): string {
  return JSON.stringify([nodeId, stateId]);
}

function inspectBranchReferences(
  project: ProjectDocument,
  nodesById: ReadonlyMap<string, FlowNode>,
): { brokenBranches: BrokenBranch[]; unresolvedBranches: UnresolvedBranch[] } {
  const brokenBranches: BrokenBranch[] = [];
  const unresolvedBranches: UnresolvedBranch[] = [];

  for (const interaction of project.interactions) {
    const sourceNode = nodesById.get(interaction.sourceNodeId);

    if (!sourceNode) {
      brokenBranches.push({
        interactionId: interaction.id,
        outcomeId: null,
        reason: "missing-source-node",
        referencedId: interaction.sourceNodeId,
      });
    } else if (
      interaction.sourceStateId !== null &&
      !nodeHasState(sourceNode, interaction.sourceStateId)
    ) {
      brokenBranches.push({
        interactionId: interaction.id,
        outcomeId: null,
        reason: "missing-source-state",
        referencedId: interaction.sourceStateId,
      });
    } else if (sourceNode.kind === "terminal") {
      brokenBranches.push({
        interactionId: interaction.id,
        outcomeId: null,
        reason: "terminal-source-node",
        referencedId: interaction.sourceNodeId,
      });
    }

    for (const outcome of interaction.outcomes) {
      if (outcome.target === null) {
        unresolvedBranches.push({
          interactionId: interaction.id,
          outcomeId: outcome.id,
          sourceNodeId: interaction.sourceNodeId,
        });
        continue;
      }

      const targetNode = nodesById.get(outcome.target.nodeId);
      if (!targetNode) {
        brokenBranches.push({
          interactionId: interaction.id,
          outcomeId: outcome.id,
          reason: "missing-target-node",
          referencedId: outcome.target.nodeId,
        });
      } else if (
        outcome.target.stateId !== null &&
        !nodeHasState(targetNode, outcome.target.stateId)
      ) {
        brokenBranches.push({
          interactionId: interaction.id,
          outcomeId: outcome.id,
          reason: "missing-target-state",
          referencedId: outcome.target.stateId,
        });
      } else if (
        outcome.target.stateId === null &&
        resolveInitialStateId(targetNode) === null
      ) {
        brokenBranches.push({
          interactionId: interaction.id,
          outcomeId: outcome.id,
          reason: "missing-target-initial-state",
          referencedId: targetNode.id,
        });
      }
    }
  }

  return { brokenBranches, unresolvedBranches };
}

function findReachableStatePairs(
  project: ProjectDocument,
  nodesById: ReadonlyMap<string, FlowNode>,
): StatePair[] {
  const entryNode = nodesById.get(project.entryNodeId);
  if (!entryNode) return [];

  const entryStateId = resolveInitialStateId(entryNode);
  if (entryStateId === null) return [];

  const interactionsBySource = new Map<string, Interaction[]>();
  for (const interaction of project.interactions) {
    if (!nodesById.has(interaction.sourceNodeId)) continue;
    const interactions = interactionsBySource.get(interaction.sourceNodeId) ?? [];
    interactions.push(interaction);
    interactionsBySource.set(interaction.sourceNodeId, interactions);
  }

  const entryPair = { nodeId: entryNode.id, stateId: entryStateId };
  const reachablePairKeys = new Set<string>([statePairKey(entryPair)]);
  const queue: StatePair[] = [entryPair];

  while (queue.length > 0) {
    const sourcePair = queue.shift()!;
    const sourceNode = nodesById.get(sourcePair.nodeId)!;
    if (sourceNode.kind === "terminal") continue;

    const interactions = interactionsBySource.get(sourcePair.nodeId) ?? [];

    for (const interaction of interactions) {
      if (
        interaction.sourceStateId !== null &&
        interaction.sourceStateId !== sourcePair.stateId
      ) {
        continue;
      }

      for (const outcome of interaction.outcomes) {
        const targetPair = resolveOutcomeTarget(outcome, nodesById);
        if (!targetPair) continue;

        const targetKey = statePairKey(targetPair);
        if (reachablePairKeys.has(targetKey)) continue;
        reachablePairKeys.add(targetKey);
        queue.push(targetPair);
      }
    }
  }

  return project.nodes.flatMap((node) =>
    node.states
      .filter((state) =>
        reachablePairKeys.has(
          statePairKey({ nodeId: node.id, stateId: state.id }),
        ),
      )
      .map((state) => ({ nodeId: node.id, stateId: state.id })),
  );
}

function findDeadEndStatePairs(
  project: ProjectDocument,
  nodesById: ReadonlyMap<string, FlowNode>,
  reachableStatePairs: readonly StatePair[],
): StatePair[] {
  const interactionsBySource = new Map<string, Interaction[]>();
  for (const interaction of project.interactions) {
    const interactions = interactionsBySource.get(interaction.sourceNodeId) ?? [];
    interactions.push(interaction);
    interactionsBySource.set(interaction.sourceNodeId, interactions);
  }

  return reachableStatePairs.filter((pair) => {
    const node = nodesById.get(pair.nodeId);
    if (!node || node.kind === "terminal") return false;

    const interactions = interactionsBySource.get(pair.nodeId) ?? [];
    return !interactions.some(
      (interaction) =>
        (interaction.sourceStateId === null ||
          interaction.sourceStateId === pair.stateId) &&
        interaction.outcomes.some(
          (outcome) => resolveOutcomeTarget(outcome, nodesById) !== null,
        ),
    );
  });
}

function findMissingStates(
  project: ProjectDocument,
  nodesById: ReadonlyMap<string, FlowNode>,
): MissingState[] {
  const requirements = new Map<
    string,
    Map<CoreUIStateKind, Omit<MissingState, "nodeId" | "stateKind">>
  >();

  const requireState = (
    nodeId: string,
    stateKind: CoreUIStateKind,
    rule: MissingStateRule,
    reason: string,
  ) => {
    const nodeRequirements = requirements.get(nodeId) ?? new Map();
    // The first matching rule is the clearest reason and keeps findings unique.
    if (!nodeRequirements.has(stateKind)) {
      nodeRequirements.set(stateKind, { rule, reason });
    }
    requirements.set(nodeId, nodeRequirements);
  };

  for (const node of project.nodes) {
    if (node.kind === "screen") {
      requireState(
        node.id,
        "idle",
        "screen-idle",
        "Interactive screens need a stable idle state.",
      );
    }

    for (const stateKind of node.requiredStateKinds ?? []) {
      requireState(
        node.id,
        stateKind,
        "node-requirement",
        `The node explicitly requires the ${stateKind} state.`,
      );
    }
  }

  for (const interaction of project.interactions) {
    if (interaction.kind === "async" && nodesById.has(interaction.sourceNodeId)) {
      requireState(
        interaction.sourceNodeId,
        "loading",
        "async-loading",
        "Async interactions need a loading state while work is pending.",
      );
    }

    for (const outcome of interaction.outcomes) {
      const requiredState = OUTCOME_STATE_REQUIREMENTS[outcome.kind];
      if (!requiredState) continue;

      const targetPair = resolveOutcomeTarget(outcome, nodesById);
      if (!targetPair) continue;

      requireState(
        targetPair.nodeId,
        requiredState,
        "outcome-target",
        `${outcome.kind} outcomes should land on a ${requiredState} state.`,
      );
    }
  }

  const findings: MissingState[] = [];
  for (const node of project.nodes) {
    const presentKinds = new Set(node.states.map((state) => state.kind));
    const nodeRequirements = requirements.get(node.id);
    if (!nodeRequirements) continue;

    for (const [stateKind, finding] of nodeRequirements) {
      if (!presentKinds.has(stateKind)) {
        findings.push({ nodeId: node.id, stateKind, ...finding });
      }
    }
  }

  return findings;
}

function findOutcomeStateKindMismatches(
  project: ProjectDocument,
  nodesById: ReadonlyMap<string, FlowNode>,
): OutcomeStateKindMismatch[] {
  const mismatches: OutcomeStateKindMismatch[] = [];

  for (const interaction of project.interactions) {
    for (const outcome of interaction.outcomes) {
      const expectedStateKind = OUTCOME_STATE_REQUIREMENTS[outcome.kind];
      if (!expectedStateKind) continue;

      const targetPair = resolveOutcomeTarget(outcome, nodesById);
      if (!targetPair) continue;

      const targetNode = nodesById.get(targetPair.nodeId)!;
      const targetState = targetNode.states.find(
        (state) => state.id === targetPair.stateId,
      )!;
      if (targetState.kind === expectedStateKind) continue;

      mismatches.push({
        interactionId: interaction.id,
        outcomeId: outcome.id,
        outcomeKind: outcome.kind,
        targetNodeId: targetPair.nodeId,
        targetStateId: targetPair.stateId,
        expectedStateKind,
        actualStateKind: targetState.kind,
      });
    }
  }

  return mismatches;
}

function brokenBranchMessage(branch: BrokenBranch): string {
  switch (branch.reason) {
    case "missing-source-node":
      return `Interaction ${branch.interactionId} references missing source node ${branch.referencedId}.`;
    case "missing-source-state":
      return `Interaction ${branch.interactionId} references missing source state ${branch.referencedId}.`;
    case "missing-target-node":
      return `Outcome ${branch.outcomeId} references missing target node ${branch.referencedId}.`;
    case "missing-target-state":
      return `Outcome ${branch.outcomeId} references missing target state ${branch.referencedId}.`;
    case "missing-target-initial-state":
      return `Outcome ${branch.outcomeId} targets node ${branch.referencedId} without a valid initial state.`;
    case "terminal-source-node":
      return `Interaction ${branch.interactionId} uses terminal node ${branch.referencedId} as its source.`;
  }
}

/** Analyze a snapshot without mutating it. Ordering follows the document for stable UI output. */
export function analyzeProject(project: ProjectDocument): ProjectAnalysis {
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const { brokenBranches, unresolvedBranches } = inspectBranchReferences(
    project,
    nodesById,
  );
  const reachableStatePairs = findReachableStatePairs(project, nodesById);
  const reachable = new Set(reachableStatePairs.map((pair) => pair.nodeId));
  const reachableNodeIds = project.nodes
    .filter((node) => reachable.has(node.id))
    .map((node) => node.id);
  const unreachableNodeIds = project.nodes
    .filter((node) => !reachable.has(node.id))
    .map((node) => node.id);
  const deadEndStatePairs = findDeadEndStatePairs(
    project,
    nodesById,
    reachableStatePairs,
  );
  const deadEndNodes = new Set(deadEndStatePairs.map((pair) => pair.nodeId));
  const deadEndNodeIds = project.nodes
    .filter((node) => deadEndNodes.has(node.id))
    .map((node) => node.id);
  const missingStates = findMissingStates(project, nodesById);
  const outcomeStateKindMismatches = findOutcomeStateKindMismatches(
    project,
    nodesById,
  );
  const missingOutcomeInteractionIds = project.interactions
    .filter((interaction) => interaction.outcomes.length === 0)
    .map((interaction) => interaction.id);

  const issues: AnalysisIssue[] = [];

  const entryNode = nodesById.get(project.entryNodeId);
  if (!entryNode) {
    issues.push({
      type: "missing-entry-node",
      severity: "error",
      nodeId: project.entryNodeId,
      reason: "missing-entry-node",
      stateId: null,
      message: `Entry node ${project.entryNodeId} does not exist.`,
    });
  } else if (resolveInitialStateId(entryNode) === null) {
    issues.push({
      type: "missing-entry-node",
      severity: "error",
      nodeId: entryNode.id,
      reason: "missing-entry-initial-state",
      stateId: entryNode.initialStateId,
      message:
        entryNode.initialStateId === null
          ? `Entry node ${entryNode.id} does not define an initial state.`
          : `Entry node ${entryNode.id} references missing initial state ${entryNode.initialStateId}.`,
    });
  }

  for (const branch of brokenBranches) {
    issues.push({
      type: "broken-branch",
      severity: "error",
      branch,
      message: brokenBranchMessage(branch),
    });
  }
  for (const branch of unresolvedBranches) {
    issues.push({
      type: "unresolved-branch",
      severity: "warning",
      branch,
      message: `Outcome ${branch.outcomeId} does not have a target yet.`,
    });
  }
  for (const interactionId of missingOutcomeInteractionIds) {
    issues.push({
      type: "missing-outcome",
      severity: "warning",
      interactionId,
      message: `Interaction ${interactionId} does not define any outcomes.`,
    });
  }
  for (const nodeId of unreachableNodeIds) {
    issues.push({
      type: "unreachable-node",
      severity: "warning",
      nodeId,
      message: `Node ${nodeId} cannot be reached from the entry node.`,
    });
  }
  for (const pair of deadEndStatePairs) {
    issues.push({
      type: "dead-end",
      severity: "warning",
      nodeId: pair.nodeId,
      stateId: pair.stateId,
      message: `State ${pair.stateId} on node ${pair.nodeId} has no valid outgoing branch.`,
    });
  }
  for (const mismatch of outcomeStateKindMismatches) {
    issues.push({
      type: "outcome-state-kind-mismatch",
      severity: "warning",
      mismatch,
      message: `Outcome ${mismatch.outcomeId} is ${mismatch.outcomeKind} but targets ${mismatch.targetStateId} (${mismatch.actualStateKind}); expected a ${mismatch.expectedStateKind} state.`,
    });
  }
  for (const finding of missingStates) {
    issues.push({
      type: "missing-state",
      severity: "warning",
      finding,
      message: `Node ${finding.nodeId} is missing its ${finding.stateKind} state.`,
    });
  }

  return {
    reachableStatePairs,
    reachableNodeIds,
    unreachableNodeIds,
    deadEndStatePairs,
    deadEndNodeIds,
    brokenBranches,
    unresolvedBranches,
    missingStates,
    outcomeStateKindMismatches,
    missingOutcomeInteractionIds,
    issues,
    summary: {
      totalNodes: project.nodes.length,
      reachableNodes: reachableNodeIds.length,
      unreachableNodes: unreachableNodeIds.length,
      deadEnds: deadEndStatePairs.length,
      brokenBranches: brokenBranches.length,
      unresolvedBranches: unresolvedBranches.length,
      missingStates: missingStates.length,
      outcomeStateKindMismatches: outcomeStateKindMismatches.length,
      missingOutcomes: missingOutcomeInteractionIds.length,
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
    },
  };
}
