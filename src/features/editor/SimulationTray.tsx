import {
  ArrowLeft,
  CheckCircle2,
  CircleStop,
  Play,
  RotateCcw,
  X,
} from "lucide-react";

import type { ProjectDocument } from "@/domain";
import { OUTCOME_COLORS } from "./graph";
import styles from "./editor.module.css";

export type SimulationCursor =
  | { type: "node"; nodeId: string; stateId: string | null }
  | {
      type: "interaction";
      id: string;
      nodeId: string;
      stateId: string | null;
    }
  | {
      type: "blocked";
      reason: "unresolved" | "broken";
      label: string;
      detail: string;
      nodeId: string;
      stateId: string | null;
      outcomeId?: string;
    };

interface SimulationTrayProps {
  project: ProjectDocument;
  cursor: SimulationCursor;
  journey: string[];
  canGoBack: boolean;
  onChooseInteraction: (interactionId: string) => void;
  onChooseOutcome: (interactionId: string, outcomeId: string) => void;
  onBack: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export function SimulationTray({
  project,
  cursor,
  journey,
  canGoBack,
  onChooseInteraction,
  onChooseOutcome,
  onBack,
  onRestart,
  onExit,
}: SimulationTrayProps) {
  const cursorNode = project.nodes.find((node) => node.id === cursor.nodeId);
  const currentNode = cursor.type === "node" ? cursorNode : undefined;
  const currentInteraction =
    cursor.type === "interaction"
      ? project.interactions.find((interaction) => interaction.id === cursor.id)
      : undefined;
  const currentState = cursorNode?.states.find(
    (state) => state.id === cursor.stateId,
  );
  const cursorIsBroken =
    cursor.type !== "blocked" &&
    (!cursorNode ||
      (cursor.stateId !== null && !currentState) ||
      (cursor.type === "interaction" &&
        (!currentInteraction ||
          currentInteraction.sourceNodeId !== cursor.nodeId ||
          (currentInteraction.sourceStateId !== null &&
            currentInteraction.sourceStateId !== cursor.stateId))));
  const availableInteractions =
    currentNode && currentNode.kind !== "terminal" && !cursorIsBroken
    ? project.interactions.filter(
        (interaction) =>
          interaction.sourceNodeId === currentNode.id &&
          (interaction.sourceStateId === null ||
            interaction.sourceStateId === cursor.stateId),
      )
    : [];
  const isComplete = Boolean(currentNode) && currentNode?.kind === "terminal";
  const isDeadEnd =
    (!cursorIsBroken &&
      Boolean(currentNode) &&
      !isComplete &&
      availableInteractions.length === 0) ||
    (!cursorIsBroken &&
      Boolean(currentInteraction && currentInteraction.outcomes.length === 0));
  const isBlocked = cursor.type === "blocked";
  const entryName =
    project.nodes.find((node) => node.id === project.entryNodeId)?.name ?? "Start";
  const stateContext = currentState
    ? ` in the ${currentState.name} state`
    : "";

  const title =
    cursor.type === "blocked"
      ? cursor.reason === "unresolved"
        ? `Unhandled: ${cursor.label}`
        : `Broken: ${cursor.label}`
      : currentInteraction?.name ?? currentNode?.name ?? "Flow simulator";
  const detail =
    cursor.type === "blocked"
      ? cursor.detail
      : cursorIsBroken
        ? "The simulator could not resolve this node, state, or interaction. Repair the broken reference in Design mode."
        : isComplete
          ? `This branch has reached an intentional ending${stateContext}.`
          : isDeadEnd
            ? `No action is defined from this screen${stateContext}. Add a branch in Design mode to continue.`
            : currentInteraction
              ? "Choose which real-world outcome should happen next."
              : `Choose the next user action available${stateContext}.`;

  const statusLabel = isBlocked
    ? cursor.reason === "unresolved"
      ? "Unhandled branch"
      : "Broken branch"
    : cursorIsBroken
      ? "Broken branch"
      : isComplete
        ? "Journey complete"
        : isDeadEnd
          ? "Unhandled dead end"
          : "Live simulation";

  return (
    <section aria-label="Flow simulator" className={styles.simulationTray}>
      <div className={styles.trayStep}>
        <div className={styles.trayKicker}>{statusLabel}</div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>

      <div className={styles.trayMain}>
        <div className={styles.journeyRow} aria-label="Journey history">
          {journey.slice(-4).map((item, index) => (
            <span key={`${item}-${index}`} className="contents">
              {index > 0 && <span aria-hidden="true">→</span>}
              <span
                className={`${styles.journeyChip} ${index === journey.slice(-4).length - 1 ? styles.journeyCurrent : ""}`}
              >
                {item}
              </span>
            </span>
          ))}
        </div>

        <div className={styles.trayPrompt}>
          {isBlocked || cursorIsBroken
            ? "Coverage caught this before users did"
            : isComplete
              ? "Run another branch to compare behavior"
              : isDeadEnd
                ? "This state needs an outgoing action or intentional ending"
                : currentInteraction
                  ? `${currentInteraction.outcomes.length} possible outcomes`
                  : `${availableInteractions.length} available action${availableInteractions.length === 1 ? "" : "s"}`}
        </div>

        <div className={styles.outcomeButtons}>
          {availableInteractions.map((interaction) => (
            <button
              className={styles.outcomeButton}
              key={interaction.id}
              onClick={() => onChooseInteraction(interaction.id)}
              type="button"
            >
              <Play aria-hidden="true" fill="currentColor" size={9} />
              {interaction.name}
            </button>
          ))}

          {!cursorIsBroken &&
            currentInteraction?.outcomes.map((outcome) => (
              <button
                className={styles.outcomeButton}
                key={outcome.id}
                onClick={() => onChooseOutcome(currentInteraction.id, outcome.id)}
                style={{ borderColor: `${OUTCOME_COLORS[outcome.kind]}66` }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={styles.semanticDot}
                  style={{ background: OUTCOME_COLORS[outcome.kind] }}
                />
                {outcome.name}
              </button>
            ))}

          {(isComplete || isDeadEnd || isBlocked || cursorIsBroken) && (
            <button className={styles.outcomeButton} onClick={onRestart} type="button">
              {isComplete ? (
                <CheckCircle2 aria-hidden="true" color="#2f8f61" size={11} />
              ) : (
                <CircleStop aria-hidden="true" color="#d65b52" size={11} />
              )}
              Restart at {entryName}
            </button>
          )}
        </div>
      </div>

      <div className={styles.trayActions}>
        <button
          aria-label="Exit simulation"
          className={styles.iconButton}
          onClick={onExit}
          title="Exit simulation"
          type="button"
        >
          <X aria-hidden="true" size={14} />
        </button>
        <div className={styles.trayIconRow}>
          <button
            aria-label="Previous simulation step"
            className={styles.iconButton}
            disabled={!canGoBack}
            onClick={onBack}
            title="Back"
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={14} />
          </button>
          <button
            aria-label="Restart simulation"
            className={styles.iconButton}
            onClick={onRestart}
            title="Restart"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
