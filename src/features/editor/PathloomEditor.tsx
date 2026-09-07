"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  CheckCircle2,
  GitBranch,
  MousePointer2,
  Monitor,
  Scan,
  Square,
  Type,
} from "lucide-react";

import {
  analyzeProject,
  checkoutProject,
  parsePathloomDocument,
  type AnalysisIssue,
  type CoreUIStateKind,
  type FlowNode,
  type FlowNodeKind,
  type Interaction,
  type Outcome,
  type OutcomeKind,
  type ProjectDocument,
  type UIState,
} from "@/domain";
import { Inspector } from "./Inspector";
import { LeftSidebar } from "./LeftSidebar";
import {
  SimulationTray,
  type SimulationCursor,
} from "./SimulationTray";
import { Topbar, type EditorMode, type SaveStatus } from "./Topbar";
import { screenNodeTypes } from "./components/FlowNodes";
import styles from "./editor.module.css";
import {
  applyNodePositions,
  buildEditorEdges,
  buildEditorNodes,
  interactionNodeId,
  moveEditorNodeWithDependents,
  preserveNodePositions,
  unresolvedNodeId,
  variantForState,
} from "./graph";

const STORAGE_KEY = "pathloom:v1:project:checkout-recovery";
const HISTORY_LIMIT = 50;

const OUTCOME_TARGET_KINDS: Partial<Record<OutcomeKind, CoreUIStateKind>> = {
  success: "success",
  failure: "error",
  timeout: "error",
  offline: "offline",
  unauthorized: "unauthorized",
};

const initialAnalysis = analyzeProject(checkoutProject);
const initialNodes = buildEditorNodes(checkoutProject, initialAnalysis);

interface EditorSnapshot {
  project: ProjectDocument;
  nodes: Node[];
  selectedId: string | null;
}

interface SimulationState {
  cursor: SimulationCursor;
  journey: string[];
  traversedEdgeIds: string[];
  visitedNodeIds: string[];
}

const titleCase = (value: string) =>
  value
    .replaceAll("-", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());

const entityId = (prefix: string) => {
  const suffix = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
};

function initialSimulation(project: ProjectDocument): SimulationState {
  const entry = project.nodes.find((node) => node.id === project.entryNodeId);
  if (!entry) {
    return {
      cursor: {
        type: "blocked",
        reason: "broken",
        label: "Missing start screen",
        detail:
          "The configured start screen no longer exists. Set a valid start screen in Design mode.",
        nodeId: project.entryNodeId,
        stateId: null,
      },
      journey: ["Missing start screen"],
      traversedEdgeIds: [],
      visitedNodeIds: [],
    };
  }

  const stateId = resolveInitialStateId(entry);
  if (stateId === null) {
    return {
      cursor: {
        type: "blocked",
        reason: "broken",
        label: "Missing start state",
        detail:
          "The start screen does not have a valid initial state. Set one in Design mode before running the flow.",
        nodeId: entry.id,
        stateId: null,
      },
      journey: [entry.name, "Missing initial state"],
      traversedEdgeIds: [],
      visitedNodeIds: [],
    };
  }

  return {
    cursor: { type: "node", nodeId: entry.id, stateId },
    journey: [entry.name],
    traversedEdgeIds: [],
    visitedNodeIds: [entry.id],
  };
}

function resolveInitialStateId(node: FlowNode): string | null {
  if (node.initialStateId === null) return null;
  return node.states.some((state) => state.id === node.initialStateId)
    ? node.initialStateId
    : null;
}

function cloneNodes(nodes: Node[]) {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
}

function issueFocusId(issue: AnalysisIssue) {
  switch (issue.type) {
    case "missing-entry-node":
    case "unreachable-node":
    case "dead-end":
      return issue.nodeId;
    case "missing-state":
      return issue.finding.nodeId;
    case "outcome-state-kind-mismatch":
      return interactionNodeId(issue.mismatch.interactionId);
    case "missing-outcome":
      return interactionNodeId(issue.interactionId);
    case "unresolved-branch":
      return unresolvedNodeId(issue.branch.outcomeId);
    case "broken-branch":
      return interactionNodeId(issue.branch.interactionId);
  }
}

export function PathloomEditor() {
  const [project, setProject] = useState<ProjectDocument>(checkoutProject);
  const analysis = useMemo(() => analyzeProject(project), [project]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [selectedId, setSelectedId] = useState<string | null>(
    interactionNodeId("submit-payment"),
  );
  const [focusedOutcomeId, setFocusedOutcomeId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("design");
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [previewStateIds, setPreviewStateIds] = useState<Record<string, string>>({
    checkout: "checkout-idle",
  });
  const [past, setPast] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const [simulation, setSimulation] = useState<SimulationState>(() =>
    initialSimulation(checkoutProject),
  );
  const [simulationPast, setSimulationPast] = useState<SimulationState[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saving");

  const projectRef = useRef(project);
  const nodesRef = useRef(nodes);
  const modeRef = useRef(mode);
  const flowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const dragSnapshotRef = useRef<EditorSnapshot | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const requireDesignMode = useCallback(() => {
    if (modeRef.current === "design") return true;
    showToast("Exit simulation to edit this flow");
    return false;
  }, [showToast]);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = parsePathloomDocument(saved);
          if (!parsed) {
            window.localStorage.removeItem(STORAGE_KEY);
            showToast("Invalid local draft was cleared; loaded the demo flow");
          } else {
            const nextAnalysis = analyzeProject(parsed);
            const nextNodes = buildEditorNodes(parsed, nextAnalysis);
            projectRef.current = parsed;
            nodesRef.current = nextNodes;
            setProject(parsed);
            setNodes(nextNodes);
            setSimulation(initialSimulation(parsed));
          }
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus("failed");
        showToast("Local storage is unavailable; edits remain in this tab");
      } finally {
        hydratedRef.current = true;
      }
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, [setNodes, showToast]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    let statusTimer: number;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      statusTimer = window.setTimeout(() => setSaveStatus("saved"), 0);
    } catch {
      statusTimer = window.setTimeout(() => setSaveStatus("failed"), 0);
    }
    return () => window.clearTimeout(statusTimer);
  }, [project]);

  const pushPast = useCallback((snapshot: EditorSnapshot) => {
    setPast((current) => [...current.slice(-(HISTORY_LIMIT - 1)), snapshot]);
    setFuture([]);
  }, []);

  const restoreSnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      projectRef.current = snapshot.project;
      nodesRef.current = cloneNodes(snapshot.nodes);
      setProject(snapshot.project);
      setNodes(cloneNodes(snapshot.nodes));
      setSelectedId(snapshot.selectedId);
    },
    [setNodes],
  );

  const commitProject = useCallback(
    (nextProject: ProjectDocument, message?: string) => {
      if (!requireDesignMode()) return false;
      const before = {
        project: projectRef.current,
        nodes: cloneNodes(nodesRef.current),
        selectedId,
      };
      pushPast(before);
      const nextAnalysis = analyzeProject(nextProject);
      const nextNodes = preserveNodePositions(
        buildEditorNodes(nextProject, nextAnalysis),
        nodesRef.current,
      );
      const positionedProject = applyNodePositions(nextProject, nextNodes);
      projectRef.current = positionedProject;
      nodesRef.current = nextNodes;
      setProject(positionedProject);
      setNodes(nextNodes);
      setSaveStatus("saving");
      if (message) showToast(message);
      return true;
    },
    [pushPast, requireDesignMode, selectedId, setNodes, showToast],
  );

  const undo = useCallback(() => {
    if (!requireDesignMode()) return;
    const previous = past.at(-1);
    if (!previous) return;
    const current = {
      project: projectRef.current,
      nodes: cloneNodes(nodesRef.current),
      selectedId,
    };
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, HISTORY_LIMIT));
    restoreSnapshot(previous);
    showToast("Undid last edit");
  }, [past, requireDesignMode, restoreSnapshot, selectedId, showToast]);

  const redo = useCallback(() => {
    if (!requireDesignMode()) return;
    const next = future[0];
    if (!next) return;
    const current = {
      project: projectRef.current,
      nodes: cloneNodes(nodesRef.current),
      selectedId,
    };
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-(HISTORY_LIMIT - 1)), current]);
    restoreSnapshot(next);
    showToast("Redid last edit");
  }, [future, requireDesignMode, restoreSnapshot, selectedId, showToast]);

  const selectAndCenter = useCallback((id: string, closeCoverage = true) => {
    setSelectedId(id);
    setFocusedOutcomeId(null);
    if (closeCoverage) setCoverageOpen(false);
    window.setTimeout(() => {
      flowRef.current?.fitView({
        nodes: [{ id }],
        duration: 380,
        padding: 0.7,
        maxZoom: 1.05,
      });
    }, 0);
  }, []);

  const addScreen = useCallback(
    (position?: { x: number; y: number }) => {
      if (!requireDesignMode()) return;
      const id = entityId("screen");
      const initialStateId = entityId(`${id}-idle`);
      const fallbackPosition = flowRef.current?.screenToFlowPosition({
        x: window.innerWidth * 0.55,
        y: window.innerHeight * 0.5,
      });
      const node: FlowNode = {
        id,
        name: "Untitled screen",
        kind: "screen",
        description: "A new stateful step in this journey.",
        position: position ?? fallbackPosition ?? { x: 940, y: 440 },
        initialStateId,
        states: [{ id: initialStateId, name: "Idle", kind: "idle" }],
      };
      commitProject(
        { ...projectRef.current, nodes: [...projectRef.current.nodes, node] },
        "Screen added — connect it to make it reachable",
      );
      setSelectedId(id);
      setPreviewStateIds((current) => ({ ...current, [id]: initialStateId }));
    },
    [commitProject, requireDesignMode],
  );

  const deleteSelection = useCallback(() => {
    if (!requireDesignMode()) return;
    if (!selectedId) return;
    const currentProject = projectRef.current;

    if (selectedId === currentProject.entryNodeId) {
      showToast("The start screen cannot be deleted");
      return;
    }

    if (selectedId.startsWith("interaction:")) {
      const interactionId = selectedId.replace("interaction:", "");
      const nextProject = {
        ...currentProject,
        interactions: currentProject.interactions.filter(
          (interaction) => interaction.id !== interactionId,
        ),
      };
      commitProject(nextProject, "Interaction removed");
      setSelectedId(null);
      return;
    }

    const exists = currentProject.nodes.some((node) => node.id === selectedId);
    if (!exists) return;

    const nextProject: ProjectDocument = {
      ...currentProject,
      nodes: currentProject.nodes.filter((node) => node.id !== selectedId),
      interactions: currentProject.interactions
        .filter((interaction) => interaction.sourceNodeId !== selectedId)
        .map((interaction) => ({
          ...interaction,
          outcomes: interaction.outcomes.map((outcome) =>
            outcome.target?.nodeId === selectedId
              ? { ...outcome, target: null }
              : outcome,
          ),
        })),
    };
    commitProject(nextProject, "Screen removed; incoming paths are now unresolved");
    setSelectedId(null);
  }, [commitProject, requireDesignMode, selectedId, showToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (window.matchMedia("(max-width: 1039px)").matches) return;
      if (
        target?.closest(
          "input, textarea, select, button, a, [contenteditable='true']",
        )
      ) {
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z" && mode === "design") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (
        (event.key === "Backspace" || event.key === "Delete") &&
        mode === "design"
      ) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key.toLowerCase() === "n" && mode === "design") {
        event.preventDefault();
        addScreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addScreen, deleteSelection, mode, redo, undo]);

  const renameNode = useCallback(
    (nodeId: string, name: string) => {
      if (!requireDesignMode()) return;
      const nextProject = {
        ...projectRef.current,
        nodes: projectRef.current.nodes.map((node) =>
          node.id === nodeId ? { ...node, name } : node,
        ),
      };
      commitProject(nextProject, `Renamed screen to ${name}`);
    },
    [commitProject, requireDesignMode],
  );

  const setEntryNode = useCallback(
    (nodeId: string) => {
      if (!requireDesignMode()) return;
      const current = projectRef.current;
      const node = current.nodes.find((item) => item.id === nodeId);
      if (!node || resolveInitialStateId(node) === null) {
        showToast("Choose a valid initial state before setting the flow start");
        return;
      }
      commitProject({ ...current, entryNodeId: node.id }, "Flow start updated");
    },
    [commitProject, requireDesignMode, showToast],
  );

  const setInitialState = useCallback(
    (nodeId: string, stateId: string) => {
      if (!requireDesignMode()) return;
      const current = projectRef.current;
      const node = current.nodes.find((item) => item.id === nodeId);
      const state = node?.states.find((item) => item.id === stateId);
      if (!node || !state) {
        showToast("That state no longer exists on this screen");
        return;
      }
      commitProject(
        {
          ...current,
          nodes: current.nodes.map((item) =>
            item.id === node.id ? { ...item, initialStateId: state.id } : item,
          ),
        },
        `${state.name} is now the initial state`,
      );
      setPreviewStateIds((stateIds) => ({
        ...stateIds,
        [node.id]: state.id,
      }));
    },
    [commitProject, requireDesignMode, showToast],
  );

  const setNodeKind = useCallback(
    (nodeId: string, kind: FlowNodeKind) => {
      if (!requireDesignMode()) return;
      const current = projectRef.current;
      const node = current.nodes.find((item) => item.id === nodeId);
      if (!node || node.kind === kind) return;
      if (
        kind === "terminal" &&
        current.interactions.some(
          (interaction) => interaction.sourceNodeId === node.id,
        )
      ) {
        showToast("Remove this screen’s outgoing interactions before ending the flow");
        return;
      }
      commitProject(
        {
          ...current,
          nodes: current.nodes.map((item) =>
            item.id === node.id ? { ...item, kind } : item,
          ),
        },
        kind === "terminal"
          ? "Marked as an intentional ending"
          : `Screen role changed to ${titleCase(kind)}`,
      );
    },
    [commitProject, requireDesignMode, showToast],
  );

  const createState = useCallback(
    (nodeId: string, kind: CoreUIStateKind) => {
      if (!requireDesignMode()) return;
      const node = projectRef.current.nodes.find((item) => item.id === nodeId);
      if (!node || node.states.some((state) => state.kind === kind)) return;
      const stateId = entityId(`${nodeId}-${kind}`);
      const nextProject: ProjectDocument = {
        ...projectRef.current,
        nodes: projectRef.current.nodes.map((item) =>
          item.id === nodeId
            ? {
                ...item,
                initialStateId:
                  resolveInitialStateId(item) ?? item.states[0]?.id ?? stateId,
                states: [
                  ...item.states,
                  {
                    id: stateId,
                    name: titleCase(kind),
                    kind,
                  },
                ],
              }
            : item,
        ),
      };
      commitProject(nextProject, `${titleCase(kind)} state created`);
      setPreviewStateIds((current) => ({ ...current, [nodeId]: stateId }));
    },
    [commitProject, requireDesignMode],
  );

  const addInteraction = useCallback(
    (requestedSourceNodeId?: string) => {
      if (!requireDesignMode()) return;
      const current = projectRef.current;
      const selectedInteraction = current.interactions.find(
        (interaction) => interactionNodeId(interaction.id) === selectedId,
      );
      const sourceNodeId =
        requestedSourceNodeId ??
        current.nodes.find((node) => node.id === selectedId)?.id ??
        selectedInteraction?.sourceNodeId ??
        current.entryNodeId;
      const sourceNode = current.nodes.find((node) => node.id === sourceNodeId);
      if (!sourceNode) {
        showToast("Select a screen before adding an interaction");
        return;
      }
      if (sourceNode.kind === "terminal") {
        showToast("Terminal screens cannot start new interactions");
        return;
      }

      const interactionId = entityId("interaction");
      const outcomeId = entityId("outcome");
      const selectedState = sourceNode.states.find(
        (state) => state.id === previewStateIds[sourceNode.id],
      );
      const interaction: Interaction = {
        id: interactionId,
        name: "New interaction",
        kind: "async",
        trigger: "click",
        sourceNodeId: sourceNode.id,
        sourceStateId:
          selectedState?.id ?? resolveInitialStateId(sourceNode) ?? null,
        outcomes: [
          {
            id: outcomeId,
            name: "New outcome",
            kind: "alternate",
            target: null,
          },
        ],
      };
      const committed = commitProject(
        { ...current, interactions: [...current.interactions, interaction] },
        "Interaction added — define its outcomes",
      );
      if (committed) {
        setSelectedId(interactionNodeId(interactionId));
        setCoverageOpen(false);
      }
    },
    [commitProject, previewStateIds, requireDesignMode, selectedId, showToast],
  );

  const addOutcome = useCallback(
    (interactionId: string) => {
      const outcomeId = entityId("outcome");
      if (!requireDesignMode()) return outcomeId;
      const current = projectRef.current;
      const exists = current.interactions.some(
        (interaction) => interaction.id === interactionId,
      );
      if (!exists) return outcomeId;

      const nextOutcome: Outcome = {
        id: outcomeId,
        name: "New outcome",
        kind: "alternate",
        target: null,
      };
      commitProject(
        {
          ...current,
          interactions: current.interactions.map((interaction) =>
            interaction.id === interactionId
              ? {
                  ...interaction,
                  outcomes: [...interaction.outcomes, nextOutcome],
                }
              : interaction,
          ),
        },
        "Outcome added — choose its kind and target",
      );
      return outcomeId;
    },
    [commitProject, requireDesignMode],
  );

  const updateInteraction = useCallback(
    (
      interactionId: string,
      patch: Partial<
        Pick<
          Interaction,
          "name" | "kind" | "trigger" | "sourceNodeId" | "sourceStateId"
        >
      >,
    ) => {
      if (!requireDesignMode()) return;
      const current = projectRef.current;
      const selectedInteraction = current.interactions.find(
        (item) => item.id === interactionId,
      );
      if (!selectedInteraction) return;
      if ("sourceNodeId" in patch || "sourceStateId" in patch) {
        const nextSourceNodeId =
          patch.sourceNodeId ?? selectedInteraction.sourceNodeId;
        const nextSource = current.nodes.find(
          (node) => node.id === nextSourceNodeId,
        );
        if (!nextSource || nextSource.kind === "terminal") {
          showToast("Choose a non-terminal source screen");
          return;
        }
        const nextSourceStateId =
          patch.sourceStateId === undefined
            ? selectedInteraction.sourceStateId
            : patch.sourceStateId;
        if (
          nextSourceStateId !== null &&
          !nextSource.states.some((state) => state.id === nextSourceStateId)
        ) {
          showToast("Choose a state that belongs to the source screen");
          return;
        }
      }
      commitProject(
        {
          ...current,
          interactions: current.interactions.map((interaction) =>
            interaction.id === interactionId
              ? { ...interaction, ...patch }
              : interaction,
          ),
        },
        "Interaction updated",
      );
    },
    [commitProject, requireDesignMode, showToast],
  );

  const updateOutcome = useCallback(
    (
      interactionId: string,
      outcomeId: string,
      patch: Partial<Pick<Outcome, "name" | "kind" | "target">>,
    ) => {
      if (!requireDesignMode()) return;
      const current = projectRef.current;
      commitProject(
        {
          ...current,
          interactions: current.interactions.map((interaction) =>
            interaction.id === interactionId
              ? {
                  ...interaction,
                  outcomes: interaction.outcomes.map((outcome) =>
                    outcome.id === outcomeId ? { ...outcome, ...patch } : outcome,
                  ),
                }
              : interaction,
          ),
        },
        "Outcome updated",
      );
    },
    [commitProject, requireDesignMode],
  );

  const focusIssue = useCallback(
    (issue: AnalysisIssue) => {
      const id = issueFocusId(issue);
      setSelectedId(id);
      setFocusedOutcomeId(
        issue.type === "unresolved-branch" || issue.type === "broken-branch"
          ? issue.branch.outcomeId
          : issue.type === "outcome-state-kind-mismatch"
            ? issue.mismatch.outcomeId
            : null,
      );
      window.setTimeout(() => {
        flowRef.current?.fitView({
          nodes: [{ id }],
          duration: 420,
          padding: 0.75,
          maxZoom: 1.05,
        });
      }, 0);
    },
    [],
  );

  const fixIssue = useCallback(
    (issue: AnalysisIssue) => {
      if (!requireDesignMode()) return;
      const current = projectRef.current;

      if (issue.type === "unresolved-branch") {
        const interaction = current.interactions.find(
          (item) => item.id === issue.branch.interactionId,
        );
        const outcome = interaction?.outcomes.find(
          (item) => item.id === issue.branch.outcomeId,
        );
        if (!interaction || !outcome) return;

        const targetKind = OUTCOME_TARGET_KINDS[outcome.kind] ?? "idle";
        const endingNodeId = entityId(`${outcome.kind}-ending`);
        const endingStateId = `${endingNodeId}-${targetKind}`;
        const sourceNode = current.nodes.find(
          (node) => node.id === interaction.sourceNodeId,
        );
        const outcomeIndex = interaction.outcomes.findIndex(
          (item) => item.id === outcome.id,
        );
        const endingNode: FlowNode = {
          id: endingNodeId,
          name:
            outcome.kind === "offline"
              ? "Offline checkout"
              : `${titleCase(outcome.name)} ending`,
          kind: "terminal",
          description: `A generated intentional ending for the ${outcome.name} outcome.`,
          position: {
            x: (sourceNode?.position.x ?? 40) + 700,
            y: (sourceNode?.position.y ?? 80) + Math.max(0, outcomeIndex) * 170,
          },
          initialStateId: endingStateId,
          states: [
            {
              id: endingStateId,
              name: titleCase(targetKind),
              kind: targetKind,
            },
          ],
        };
        const nextProject: ProjectDocument = {
          ...current,
          nodes: [...current.nodes, endingNode],
          interactions: current.interactions.map((item) =>
            item.id === interaction.id
              ? {
                  ...item,
                  outcomes: item.outcomes.map((itemOutcome) =>
                    itemOutcome.id === outcome.id
                      ? {
                          ...itemOutcome,
                          target: {
                            nodeId: endingNodeId,
                            stateId: endingStateId,
                          },
                        }
                      : itemOutcome,
                  ),
                }
              : item,
          ),
        };
        commitProject(nextProject, `${titleCase(outcome.kind)} ending created`);
        setSelectedId(endingNodeId);
        setPreviewStateIds((stateIds) => ({
          ...stateIds,
          [endingNodeId]: endingStateId,
        }));
        return;
      }

      if (issue.type === "unreachable-node") {
        const targetNode = current.nodes.find((node) => node.id === issue.nodeId);
        if (!targetNode) return;
        const targetStateId = resolveInitialStateId(targetNode);
        if (!targetStateId) {
          setSelectedId(issue.nodeId);
          setCoverageOpen(false);
          showToast(
            `Set a valid initial state on ${targetNode.name} before connecting it`,
          );
          return;
        }
        setPreviewStateIds((stateIds) => ({
          ...stateIds,
          [targetNode.id]: targetStateId,
        }));
        setSelectedId(issue.nodeId);
        setCoverageOpen(false);
        window.setTimeout(() => {
          flowRef.current?.fitView({
            nodes: [{ id: targetNode.id }],
            duration: 380,
            padding: 0.75,
            maxZoom: 1.05,
          });
        }, 0);
        showToast(
          `Choose the intended reachable source, then drag its handle to ${targetNode.name}`,
        );
        return;
      }

      if (issue.type === "outcome-state-kind-mismatch") {
        const targetNode = current.nodes.find(
          (node) => node.id === issue.mismatch.targetNodeId,
        );
        if (!targetNode) return;
        const existingState = targetNode.states.find(
          (state) => state.kind === issue.mismatch.expectedStateKind,
        );
        const targetStateId =
          existingState?.id ??
          entityId(
            `${targetNode.id}-${issue.mismatch.expectedStateKind}`,
          );
        const nextProject: ProjectDocument = {
          ...current,
          nodes: existingState
            ? current.nodes
            : current.nodes.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      states: [
                        ...node.states,
                        {
                          id: targetStateId,
                          name: titleCase(issue.mismatch.expectedStateKind),
                          kind: issue.mismatch.expectedStateKind,
                        },
                      ],
                    }
                  : node,
              ),
          interactions: current.interactions.map((interaction) =>
            interaction.id === issue.mismatch.interactionId
              ? {
                  ...interaction,
                  outcomes: interaction.outcomes.map((outcome) =>
                    outcome.id === issue.mismatch.outcomeId
                      ? {
                          ...outcome,
                          target: {
                            nodeId: targetNode.id,
                            stateId: targetStateId,
                          },
                        }
                      : outcome,
                  ),
                }
              : interaction,
          ),
        };
        commitProject(
          nextProject,
          `Outcome now targets ${titleCase(issue.mismatch.expectedStateKind)}`,
        );
        setSelectedId(interactionNodeId(issue.mismatch.interactionId));
        setFocusedOutcomeId(issue.mismatch.outcomeId);
        setPreviewStateIds((stateIds) => ({
          ...stateIds,
          [targetNode.id]: targetStateId,
        }));
        return;
      }

      if (issue.type === "missing-state") {
        createState(issue.finding.nodeId, issue.finding.stateKind);
        setSelectedId(issue.finding.nodeId);
        return;
      }

      if (issue.type === "missing-outcome") {
        addOutcome(issue.interactionId);
        setSelectedId(interactionNodeId(issue.interactionId));
        setCoverageOpen(false);
        return;
      }

      if (issue.type === "dead-end") {
        const hasOutgoingInteraction = current.interactions.some(
          (interaction) => interaction.sourceNodeId === issue.nodeId,
        );
        if (hasOutgoingInteraction) {
          const sourceNode = current.nodes.find(
            (node) => node.id === issue.nodeId,
          );
          const sourceState = sourceNode?.states.find(
            (state) => state.id === issue.stateId,
          );
          if (!sourceNode || !sourceState) return;
          const endingNodeId = entityId("ending");
          const endingStateId = entityId(`${endingNodeId}-state`);
          const endingInteractionId = entityId("end-journey");
          const stateIndex = Math.max(
            sourceNode.states.findIndex((state) => state.id === sourceState.id),
            0,
          );
          const endingNode: FlowNode = {
            id: endingNodeId,
            name: `${sourceState.name} ending`,
            kind: "terminal",
            description: `An intentional ending reached from ${sourceNode.name} in its ${sourceState.name} state.`,
            position: {
              x: sourceNode.position.x + 680,
              y: sourceNode.position.y + stateIndex * 170,
            },
            initialStateId: endingStateId,
            states: [
              {
                id: endingStateId,
                name: sourceState.name,
                kind: sourceState.kind,
              },
            ],
          };
          const endingInteraction: Interaction = {
            id: endingInteractionId,
            name: `End after ${sourceState.name}`,
            kind: "navigation",
            trigger: "system",
            position: {
              x: sourceNode.position.x + 340,
              y: sourceNode.position.y + stateIndex * 105,
            },
            sourceNodeId: sourceNode.id,
            sourceStateId: sourceState.id,
            outcomes: [
              {
                id: entityId("journey-ended"),
                name: "Journey ends",
                kind: "alternate",
                target: { nodeId: endingNode.id, stateId: endingStateId },
              },
            ],
          };
          commitProject(
            {
              ...current,
              nodes: [...current.nodes, endingNode],
              interactions: [...current.interactions, endingInteraction],
            },
            `Created an ending for ${sourceState.name}`,
          );
          setSelectedId(interactionNodeId(endingInteraction.id));
          setPreviewStateIds((stateIds) => ({
            ...stateIds,
            [endingNode.id]: endingStateId,
          }));
          return;
        }
        commitProject(
          {
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === issue.nodeId ? { ...node, kind: "terminal" } : node,
            ),
          },
          "Marked as an intentional ending",
        );
        return;
      }

      if (issue.type === "missing-entry-node") {
        const candidate =
          current.nodes.find((node) => node.id === issue.nodeId) ??
          current.nodes[0];
        if (!candidate) {
          showToast("Add a screen before setting the flow start");
          return;
        }
        const existingInitialStateId = resolveInitialStateId(candidate);
        const fallbackState = candidate.states[0] ?? {
          id: entityId(`${candidate.id}-idle`),
          name: "Idle",
          kind: "idle" as const,
        };
        commitProject(
          {
            ...current,
            entryNodeId: candidate.id,
            nodes: current.nodes.map((node) =>
              node.id === candidate.id
                ? {
                    ...node,
                    states:
                      candidate.states.length > 0
                        ? candidate.states
                        : [fallbackState],
                    initialStateId:
                      existingInitialStateId ?? fallbackState.id,
                  }
                : node,
            ),
          },
          "Start screen restored",
        );
        setSelectedId(candidate.id);
        return;
      }

      if (issue.type === "broken-branch") {
        setSelectedId(interactionNodeId(issue.branch.interactionId));
        setFocusedOutcomeId(issue.branch.outcomeId);
        setCoverageOpen(false);
        showToast("Choose a valid source or target in the interaction editor");
        return;
      }

      showToast("Select a replacement target from the canvas");
    },
    [addOutcome, commitProject, createState, requireDesignMode, showToast],
  );

  const connectNodes = useCallback(
    (connection: Connection) => {
      if (!requireDesignMode()) return;
      if (!connection.source || !connection.target) return;
      const current = projectRef.current;
      const targetNode = current.nodes.find(
        (node) => node.id === connection.target,
      );
      if (!targetNode) return;
      const targetState =
        targetNode.states.find(
          (state) => state.id === previewStateIds[targetNode.id],
        ) ??
        targetNode.states.find((state) => state.id === targetNode.initialStateId);
      if (!targetState) {
        showToast("Set a valid target state before connecting this screen");
        return;
      }

      if (connection.source.startsWith("interaction:")) {
        const interactionId = connection.source.replace("interaction:", "");
        const sourceInteraction = current.interactions.find(
          (interaction) => interaction.id === interactionId,
        );
        if (!sourceInteraction) return;
        const nextProject: ProjectDocument = {
          ...current,
          interactions: current.interactions.map((interaction) =>
            interaction.id === interactionId
              ? {
                  ...interaction,
                  outcomes: [
                    ...interaction.outcomes,
                    {
                      id: entityId("outcome"),
                      name: "New outcome",
                      kind: "alternate",
                      target: {
                        nodeId: targetNode.id,
                        stateId: targetState.id,
                      },
                    },
                  ],
                }
              : interaction,
          ),
        };
        commitProject(nextProject, "Outcome connected");
        return;
      }

      const sourceNode = current.nodes.find(
        (node) => node.id === connection.source,
      );
      if (!sourceNode) return;
      if (sourceNode.kind === "terminal") {
        showToast("Intentional endings cannot start new interactions");
        return;
      }
      const sourceState = sourceNode.states.find(
        (state) => state.id === previewStateIds[sourceNode.id],
      );
      const interaction: Interaction = {
        id: entityId("interaction"),
        name: "Continue",
        kind: "navigation",
        trigger: "click",
        sourceNodeId: connection.source,
        sourceStateId:
          sourceState?.id ?? resolveInitialStateId(sourceNode) ?? null,
        outcomes: [
          {
            id: entityId("outcome"),
            name: "Next",
            kind: "alternate",
            target: { nodeId: targetNode.id, stateId: targetState.id },
          },
        ],
      };
      commitProject(
        { ...current, interactions: [...current.interactions, interaction] },
        "Screens connected",
      );
    },
    [commitProject, previewStateIds, requireDesignMode, showToast],
  );

  const syncPreviewToCursor = useCallback((cursor: SimulationCursor) => {
    const node = projectRef.current.nodes.find(
      (item) => item.id === cursor.nodeId,
    );
    if (!node) return;
    const state = node.states.find((item) => item.id === cursor.stateId);
    if (!state) return;
    setPreviewStateIds((current) =>
      current[node.id] === state.id
        ? current
        : { ...current, [node.id]: state.id },
    );
  }, []);

  const runSimulation = useCallback(() => {
    const next = initialSimulation(projectRef.current);
    modeRef.current = "simulate";
    setMode("simulate");
    setCoverageOpen(false);
    setSimulation(next);
    setSimulationPast([]);
    syncPreviewToCursor(next.cursor);

    const entryExists = projectRef.current.nodes.some(
      (node) => node.id === projectRef.current.entryNodeId,
    );
    setSelectedId(entryExists ? projectRef.current.entryNodeId : null);
    if (entryExists) {
      flowRef.current?.fitView({
        nodes: [{ id: projectRef.current.entryNodeId }],
        duration: 400,
        padding: 0.65,
        maxZoom: 1.05,
      });
    }
  }, [syncPreviewToCursor]);

  const stopSimulation = useCallback(() => {
    modeRef.current = "design";
    setMode("design");
    setSimulationPast([]);
    showToast("Simulation ended — the document was not changed");
  }, [showToast]);

  const chooseInteraction = useCallback(
    (interactionId: string) => {
      if (simulation.cursor.type !== "node") return;
      const sourceNode = projectRef.current.nodes.find(
        (node) => node.id === simulation.cursor.nodeId,
      );
      const interaction = projectRef.current.interactions.find(
        (item) =>
          item.id === interactionId &&
          item.sourceNodeId === simulation.cursor.nodeId &&
          (item.sourceStateId === null ||
            item.sourceStateId === simulation.cursor.stateId),
      );
      if (!sourceNode || sourceNode.kind === "terminal" || !interaction) return;

      setSimulationPast((items) => [...items, simulation]);
      setSimulation((current) => ({
        ...current,
        cursor: {
          type: "interaction",
          id: interactionId,
          nodeId: simulation.cursor.nodeId,
          stateId: simulation.cursor.stateId,
        },
        journey: [...current.journey, interaction.name],
        traversedEdgeIds: [
          ...current.traversedEdgeIds,
          `edge:into:${interactionId}`,
        ],
      }));
      const actionId = interactionNodeId(interactionId);
      if (nodesRef.current.some((node) => node.id === actionId)) {
        setSelectedId(actionId);
      }
    },
    [simulation],
  );

  const chooseOutcome = useCallback(
    (interactionId: string, outcomeId: string) => {
      if (
        simulation.cursor.type !== "interaction" ||
        simulation.cursor.id !== interactionId
      ) {
        return;
      }
      const interaction = projectRef.current.interactions.find(
        (item) => item.id === interactionId,
      );
      const outcome = interaction?.outcomes.find((item) => item.id === outcomeId);
      if (!interaction || !outcome) return;
      setSimulationPast((items) => [...items, simulation]);

      if (!outcome.target) {
        setSimulation((current) => ({
          ...current,
          cursor: {
            type: "blocked",
            reason: "unresolved",
            label: outcome.name,
            detail:
              "This outcome has no target. Connect it in Design mode to continue.",
            nodeId: simulation.cursor.nodeId,
            stateId: simulation.cursor.stateId,
            outcomeId: outcome.id,
          },
          journey: [...current.journey, `[${outcome.name}]`, "Blocked"],
          traversedEdgeIds: [...current.traversedEdgeIds, `edge:${outcome.id}`],
        }));
        setSelectedId(unresolvedNodeId(outcome.id));
        return;
      }

      const destination = projectRef.current.nodes.find(
        (node) => node.id === outcome.target?.nodeId,
      );
      if (!destination) {
        setSimulation((current) => ({
          ...current,
          cursor: {
            type: "blocked",
            reason: "broken",
            label: outcome.name,
            detail: `The target screen ${outcome.target!.nodeId} no longer exists. Repair this branch in Design mode.`,
            nodeId: simulation.cursor.nodeId,
            stateId: simulation.cursor.stateId,
            outcomeId: outcome.id,
          },
          journey: [...current.journey, `[${outcome.name}]`, "Broken"],
          traversedEdgeIds: [...current.traversedEdgeIds, `edge:${outcome.id}`],
        }));
        return;
      }

      const destinationStateId =
        outcome.target.stateId ?? resolveInitialStateId(destination);
      if (
        outcome.target.stateId !== null &&
        !destination.states.some((state) => state.id === outcome.target!.stateId)
      ) {
        setSimulation((current) => ({
          ...current,
          cursor: {
            type: "blocked",
            reason: "broken",
            label: outcome.name,
            detail: `The target state ${outcome.target!.stateId} no longer exists on ${destination.name}. Repair this branch in Design mode.`,
            nodeId: simulation.cursor.nodeId,
            stateId: simulation.cursor.stateId,
            outcomeId: outcome.id,
          },
          journey: [...current.journey, `[${outcome.name}]`, "Broken"],
          traversedEdgeIds: [...current.traversedEdgeIds, `edge:${outcome.id}`],
        }));
        return;
      }
      if (destinationStateId === null) {
        setSimulation((current) => ({
          ...current,
          cursor: {
            type: "blocked",
            reason: "broken",
            label: outcome.name,
            detail: `${destination.name} does not have a valid initial state. Repair the target screen in Design mode.`,
            nodeId: simulation.cursor.nodeId,
            stateId: simulation.cursor.stateId,
            outcomeId: outcome.id,
          },
          journey: [...current.journey, `[${outcome.name}]`, "Broken"],
          traversedEdgeIds: [...current.traversedEdgeIds, `edge:${outcome.id}`],
        }));
        return;
      }

      const nextCursor: SimulationCursor = {
        type: "node",
        nodeId: destination.id,
        stateId: destinationStateId,
      };
      syncPreviewToCursor(nextCursor);
      setSimulation((current) => ({
        ...current,
        cursor: nextCursor,
        journey: [
          ...current.journey,
          `[${outcome.name}]`,
          destination.name,
        ],
        traversedEdgeIds: [...current.traversedEdgeIds, `edge:${outcome.id}`],
        visitedNodeIds: [...current.visitedNodeIds, destination.id],
      }));
      setSelectedId(destination.id);
      window.setTimeout(() => {
        flowRef.current?.fitView({
          nodes: [{ id: destination.id }],
          duration: 420,
          padding: 0.7,
          maxZoom: 1.05,
        });
      }, 0);
    },
    [simulation, syncPreviewToCursor],
  );

  const backSimulation = useCallback(() => {
    const previous = simulationPast.at(-1);
    if (!previous) return;
    setSimulation(previous);
    setSimulationPast((items) => items.slice(0, -1));
    syncPreviewToCursor(previous.cursor);
    let focusId = previous.cursor.nodeId;
    if (previous.cursor.type === "interaction") {
      focusId = interactionNodeId(previous.cursor.id);
    } else if (
      previous.cursor.type === "blocked" &&
      previous.cursor.reason === "unresolved" &&
      previous.cursor.outcomeId
    ) {
      focusId = unresolvedNodeId(previous.cursor.outcomeId);
    }
    setSelectedId(focusId);
    const visibleFocusId = nodesRef.current.some((node) => node.id === focusId)
      ? focusId
      : previous.cursor.nodeId;
    window.setTimeout(() => {
      flowRef.current?.fitView({
        nodes: [{ id: visibleFocusId }],
        duration: 360,
        padding: 0.7,
        maxZoom: 1.05,
      });
    }, 0);
  }, [simulationPast, syncPreviewToCursor]);

  const previewState = useMemo<UIState | null>(() => {
    const selectedNode = project.nodes.find((node) => node.id === selectedId);
    if (!selectedNode) return null;
    const selectedPreview = selectedNode.states.find(
      (state) => state.id === previewStateIds[selectedNode.id],
    );
    if (selectedPreview) return selectedPreview;
    const initial = selectedNode.states.find(
      (state) => state.id === selectedNode.initialStateId,
    );
    return initial ?? selectedNode.states[0] ?? null;
  }, [previewStateIds, project.nodes, selectedId]);

  const displayNodes = useMemo<Node[]>(() => {
    const interactionId =
      simulation.cursor.type === "interaction"
        ? interactionNodeId(simulation.cursor.id)
        : null;
    const activeId =
      interactionId && nodes.some((node) => node.id === interactionId)
        ? interactionId
        : simulation.cursor.nodeId;
    const visited = new Set(simulation.visitedNodeIds);

    return nodes.map((node) => {
      const data = { ...node.data } as Record<string, unknown>;
      if (node.type === "screen") {
        const projectNode = project.nodes.find((item) => item.id === node.id);
        const state = projectNode?.states.find(
          (item) => item.id === previewStateIds[node.id],
        );
        if (state) {
          data.variant = variantForState(
            state.kind,
            data.variant as Parameters<typeof variantForState>[1],
          );
          data.stateLabel = state.name;
        }
      }
      if (mode === "simulate") {
        data.active = activeId === node.id;
        data.dimmed = activeId !== node.id && !visited.has(node.id);
      } else {
        data.active = false;
        data.dimmed = false;
      }
      return { ...node, data, selected: node.id === selectedId };
    });
  }, [mode, nodes, previewStateIds, project.nodes, selectedId, simulation]);

  const displayEdges = useMemo(() => {
    const edges = buildEditorEdges(project);
    if (mode !== "simulate") return edges;
    const traversed = new Set(simulation.traversedEdgeIds);
    return edges.map((edge) => {
      const active = traversed.has(edge.id);
      return {
        ...edge,
        animated: active,
        hidden: edge.hidden ? !active : false,
        style: {
          ...edge.style,
          opacity: active ? 1 : 0.2,
          strokeWidth: active ? 2.8 : 1.4,
        },
        labelStyle: {
          ...edge.labelStyle,
          opacity: active ? 1 : 0.28,
        },
      };
    });
  }, [mode, project, simulation.traversedEdgeIds]);

  const handleNodeDragStart = useCallback(() => {
    if (modeRef.current !== "design") return;
    dragSnapshotRef.current = {
      project: projectRef.current,
      nodes: cloneNodes(nodesRef.current),
      selectedId,
    };
  }, [selectedId]);

  const handleNodeDragStop = useCallback<OnNodeDrag<Node>>(
    (_event, draggedNode) => {
      const before = dragSnapshotRef.current;
      dragSnapshotRef.current = null;
      if (
        modeRef.current !== "design" ||
        !before ||
        (!projectRef.current.nodes.some((node) => node.id === draggedNode.id) &&
          !projectRef.current.interactions.some(
            (interaction) => interactionNodeId(interaction.id) === draggedNode.id,
          ))
      ) {
        return;
      }
      const beforeNode = before.nodes.find((node) => node.id === draggedNode.id);
      if (!beforeNode) return;
      if (
        beforeNode.position.x === draggedNode.position.x &&
        beforeNode.position.y === draggedNode.position.y
      ) {
        return;
      }
      const currentNodes = moveEditorNodeWithDependents(
        projectRef.current,
        nodesRef.current,
        draggedNode.id,
        draggedNode.position,
        beforeNode.position,
      );
      pushPast(before);
      const nextProject = applyNodePositions(projectRef.current, currentNodes);
      nodesRef.current = currentNodes;
      projectRef.current = nextProject;
      setNodes(currentNodes);
      setProject(nextProject);
      setSaveStatus("saving");
    },
    [pushPast, setNodes],
  );

  const handleNodesChange = useCallback<OnNodesChange<Node>>(
    (changes) => {
      onNodesChange(changes);
      const selectedChange = [...changes]
        .reverse()
        .find((change) => change.type === "select" && change.selected);
      if (selectedChange?.type === "select") {
        setSelectedId(selectedChange.id);
        return;
      }
      if (
        selectedId &&
        changes.some(
          (change) =>
            change.type === "select" &&
            change.id === selectedId &&
            !change.selected,
        )
      ) {
        setSelectedId(null);
      }
    },
    [onNodesChange, selectedId],
  );

  return (
    <main className={styles.shell}>
      <section className={styles.viewportGuard} role="status">
        <span className={styles.viewportGuardIcon}>
          <Monitor aria-hidden="true" size={24} />
        </span>
        <h1>Pathloom needs a wider canvas</h1>
        <p>
          Open this editor in a desktop window at least 1040 pixels wide. Your
          local flow stays saved while you resize.
        </p>
      </section>
      <Topbar
        canRedo={mode === "design" && future.length > 0}
        canUndo={mode === "design" && past.length > 0}
        coverageOpen={coverageOpen}
        flowLabel={project.name}
        issueCount={analysis.issues.length}
        mode={mode}
        onModeChange={(nextMode) =>
          nextMode === "simulate" ? runSimulation() : stopSimulation()
        }
        onRedo={redo}
        onRun={runSimulation}
        onStop={stopSimulation}
        onToggleCoverage={() => {
          if (mode === "simulate") {
            showToast("Exit simulation to repair coverage findings");
            return;
          }
          setCoverageOpen((open) => !open);
        }}
        onUndo={undo}
        projectLabel="Local project"
        saveStatus={saveStatus}
      />

      <LeftSidebar
        analysis={analysis}
        onAddInteraction={() => addInteraction()}
        onAddScreen={() => addScreen()}
        onSelect={selectAndCenter}
        project={project}
        selectedId={selectedId}
      />

      <section
        aria-label="Flow canvas"
        className={`${styles.canvas} ${coverageOpen ? styles.coverageCanvas : ""}`}
      >
        <div
          className={`${styles.canvasModeLabel} ${coverageOpen ? styles.coverageModeLabel : ""}`}
        >
          {coverageOpen ? (
            <>
              <Scan aria-hidden="true" size={11} /> Coverage overlay
            </>
          ) : mode === "simulate" ? (
            <>
              <CheckCircle2 aria-hidden="true" size={11} /> Live journey
            </>
          ) : (
            <>
              <GitBranch aria-hidden="true" size={11} /> State graph
            </>
          )}
        </div>

        {mode === "design" && (
          <div aria-label="Canvas tools" className={styles.canvasToolbar} role="toolbar">
          <span
            className={`${styles.toolButton} ${styles.toolActive}`}
            title="Selection is active"
          >
            <MousePointer2 aria-hidden="true" size={14} />
          </span>
          <span aria-hidden="true" className={styles.toolbarDivider} />
          <button
            aria-label="Add screen"
            className={styles.toolButton}
            onClick={() => addScreen()}
            title="Add screen (N)"
            type="button"
          >
            <Monitor aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Add branch"
            className={styles.toolButton}
            onClick={() => addInteraction()}
            title="Add branch"
            type="button"
          >
            <GitBranch aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Add text"
            className={styles.toolButton}
            disabled
            title="Freeform text is planned after the MVP"
            type="button"
          >
            <Type aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Add shape"
            className={styles.toolButton}
            disabled
            title="Freeform shapes are planned after the MVP"
            type="button"
          >
            <Square aria-hidden="true" size={14} />
          </button>
          </div>
        )}

        <ReactFlow
          colorMode="light"
          deleteKeyCode={null}
          edges={displayEdges}
          elementsSelectable={mode === "design"}
          fitView
          fitViewOptions={{
            padding: 0.08,
            minZoom: 0.46,
            maxZoom: 0.95,
          }}
          maxZoom={1.8}
          minZoom={0.25}
          multiSelectionKeyCode="Shift"
          nodeTypes={screenNodeTypes}
          nodes={displayNodes}
          nodesConnectable={mode === "design"}
          nodesDraggable={mode === "design"}
          onConnect={connectNodes}
          onEdgeClick={(_event, edge) => {
            const interactionId = edge.data?.interactionId;
            if (typeof interactionId === "string") {
              setSelectedId(interactionNodeId(interactionId));
              setFocusedOutcomeId(
                typeof edge.data?.outcomeId === "string"
                  ? edge.data.outcomeId
                  : null,
              );
              setCoverageOpen(false);
            }
          }}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onNodeClick={(_event, node) => {
            setSelectedId(node.id);
            setFocusedOutcomeId(null);
            setCoverageOpen(false);
          }}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodesChange={handleNodesChange}
          onPaneClick={(event) => {
            if (event.detail === 2 && mode === "design") {
              const position = flowRef.current?.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              });
              addScreen(position);
              return;
            }
            setSelectedId(null);
          }}
          panOnDrag={[0, 1]}
          selectionOnDrag
          snapGrid={[10, 10]}
          snapToGrid
          zoomOnDoubleClick={false}
        >
          <Background
            color={coverageOpen ? "#d9b267" : "#b8c1ba"}
            gap={20}
            size={1.05}
            variant={BackgroundVariant.Dots}
          />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>

        {mode === "simulate" && (
          <SimulationTray
            canGoBack={simulationPast.length > 0}
            cursor={simulation.cursor}
            journey={simulation.journey}
            onBack={backSimulation}
            onChooseInteraction={chooseInteraction}
            onChooseOutcome={chooseOutcome}
            onExit={stopSimulation}
            onRestart={runSimulation}
            project={project}
          />
        )}

        {mode === "design" && (
          <div className={styles.canvasHint}>Double-click to add a screen · Drag handles to connect</div>
        )}
        {toast && (
          <div aria-live="polite" className={styles.toast} role="status">
            <CheckCircle2 aria-hidden="true" color="#2f8f61" size={13} />
            {toast}
          </div>
        )}
      </section>

      <Inspector
        analysis={analysis}
        coverageOpen={coverageOpen}
        initialOutcomeId={focusedOutcomeId}
        key={`${selectedId ?? "no-selection"}:${focusedOutcomeId ?? "default"}`}
        onAddInteraction={addInteraction}
        onAddOutcome={addOutcome}
        onCloseCoverage={() => setCoverageOpen(false)}
        onCreateState={createState}
        onFixIssue={fixIssue}
        onFocusIssue={focusIssue}
        onPreviewState={(stateId) => {
          if (!selectedId || mode === "simulate") return;
          setPreviewStateIds((current) => ({
            ...current,
            [selectedId]: stateId,
          }));
        }}
        onRenameNode={renameNode}
        onSetEntryNode={setEntryNode}
        onSetInitialState={setInitialState}
        onSetNodeKind={setNodeKind}
        onUpdateInteraction={updateInteraction}
        onUpdateOutcome={updateOutcome}
        previewStateId={previewState?.id ?? null}
        project={project}
        readOnly={mode === "simulate"}
        selectedId={selectedId}
      />
    </main>
  );
}

export default PathloomEditor;
