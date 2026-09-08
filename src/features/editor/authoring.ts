import type { CanvasPosition, ProjectDocument } from "@/domain";

/** Keep new cards clear of screens, actions, and unresolved outcome placeholders. */
export function freeScreenPosition(
  occupied: { position: CanvasPosition; type?: string }[],
  preferred: CanvasPosition,
): CanvasPosition {
  const candidate = { x: Math.round(preferred.x / 10) * 10, y: Math.round(preferred.y / 10) * 10 };
  while (occupied.some((node) => {
    const height = node.type === "interaction" ? 110 : node.type === "output" ? 60 : 260;
    const width = node.type === "interaction" ? 220 : 270;
    return candidate.x < node.position.x + width + 30 && candidate.x + 300 > node.position.x &&
      candidate.y < node.position.y + height + 30 && candidate.y + 290 > node.position.y;
  })) {
    candidate.y += 310;
  }
  return candidate;
}

function getStateReferenceReason(project: ProjectDocument, nodeId: string, stateId: string): string | null {
  const isDefault = project.nodes.find((node) => node.id === nodeId)?.initialStateId === stateId;
  if (project.entryNodeId === nodeId && isDefault) return "This is the flow’s initial state.";
  if (project.interactions.some((action) => action.sourceNodeId === nodeId && action.sourceStateId === stateId)) {
    return "An action is only available in this state.";
  }
  if (project.interactions.some((action) => action.outcomes.some((outcome) =>
    outcome.target?.nodeId === nodeId && outcome.target.stateId === stateId,
  ))) {
    return "An outcome arrives in this state.";
  }
  if (isDefault && project.interactions.some((action) => action.outcomes.some((outcome) =>
    outcome.target?.nodeId === nodeId && outcome.target.stateId === null,
  ))) {
    return "An outcome uses this screen’s initial state.";
  }
  return null;
}

export function stateIsReferenced(project: ProjectDocument, nodeId: string, stateId: string): boolean {
  return getStateReferenceReason(project, nodeId, stateId) !== null;
}

/** Shared by the state picker and mutation so disabled controls explain the same safeguards. */
export function getStateRemovalReason(project: ProjectDocument, nodeId: string, stateId: string): string | null {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) return "This screen no longer exists.";
  if (!node.states.some((state) => state.id === stateId)) return "This state no longer exists.";
  if (node.states.length < 2) return "Keep at least one state on this screen.";
  return getStateReferenceReason(project, nodeId, stateId);
}

/** Refuse to silently redirect existing paths when removing a state. */
export function removeUnusedState(project: ProjectDocument, nodeId: string, stateId: string): ProjectDocument {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node || getStateRemovalReason(project, nodeId, stateId)) return project;
  const states = node.states.filter((state) => state.id !== stateId);
  return {
    ...project,
    nodes: project.nodes.map((item) => item.id === nodeId ? {
      ...item, states,
      initialStateId: item.initialStateId === stateId ? states[0].id : item.initialStateId,
    } : item),
  };
}
