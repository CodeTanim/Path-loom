/**
 * Pathloom's domain model is intentionally made only of JSON-compatible values.
 * The editor can persist a ProjectDocument without converting classes, dates, or
 * functions first.
 */

export const CORE_UI_STATE_KINDS = [
  "idle",
  "loading",
  "success",
  "empty",
  "error",
  "offline",
  "unauthorized",
] as const;

export type CoreUIStateKind = (typeof CORE_UI_STATE_KINDS)[number];
export type UIStateKind = CoreUIStateKind | "custom";

export type FlowNodeKind = "screen" | "decision" | "terminal";

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface UIState {
  id: string;
  name: string;
  kind: UIStateKind;
  description?: string;
}

export interface FlowNode {
  id: string;
  name: string;
  kind: FlowNodeKind;
  description?: string;
  position: CanvasPosition;
  size?: CanvasSize;
  states: UIState[];
  /** The state shown when a branch targets the node without naming a state. */
  initialStateId: string | null;
  /** Extra project-specific coverage expectations, in addition to built-in rules. */
  requiredStateKinds?: CoreUIStateKind[];
}

export type InteractionKind = "navigation" | "async" | "local" | "system";

export type InteractionTrigger =
  | "click"
  | "submit"
  | "change"
  | "timer"
  | "system";

export type OutcomeKind =
  | "success"
  | "failure"
  | "timeout"
  | "offline"
  | "unauthorized"
  | "alternate";

export interface OutcomeTarget {
  nodeId: string;
  /** null means the target node's initial state. */
  stateId: string | null;
}

export interface Outcome {
  id: string;
  name: string;
  kind: OutcomeKind;
  description?: string;
  condition?: string;
  /** null represents a deliberately sketched but unresolved branch. */
  target: OutcomeTarget | null;
}

export interface Interaction {
  id: string;
  name: string;
  kind: InteractionKind;
  trigger: InteractionTrigger;
  sourceNodeId: string;
  /** null means the interaction is available from the node as a whole. */
  sourceStateId: string | null;
  outcomes: Outcome[];
}

export interface ProjectDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  entryNodeId: string;
  nodes: FlowNode[];
  interactions: Interaction[];
}

/** Product-name alias for callers that prefer a more explicit document type. */
export type PathloomDocument = ProjectDocument;
