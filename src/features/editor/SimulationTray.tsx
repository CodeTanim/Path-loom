import { useEffect, useRef } from "react";

import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Monitor, RotateCcw, X } from "lucide-react";

import type { Outcome, ProjectDocument } from "@/domain";
import { OUTCOME_COLORS } from "./graph";
import styles from "./preview.module.css";

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

function destinationLabel(project: ProjectDocument, outcome: Outcome) {
  if (!outcome.target) return "No destination yet";
  const node = project.nodes.find((item) => item.id === outcome.target?.nodeId);
  if (!node) return "Destination screen is missing";
  const stateId = outcome.target.stateId ?? node.initialStateId;
  const state = node.states.find((item) => item.id === stateId);
  if (!state) return `${node.name} · destination state is missing`;
  return `${node.name} · ${state.name}`;
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
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);
  const cursorNode = project.nodes.find((node) => node.id === cursor.nodeId);
  const currentNode = cursor.type === "node" ? cursorNode : undefined;
  const currentInteraction = cursor.type === "interaction"
    ? project.interactions.find((interaction) => interaction.id === cursor.id)
    : undefined;
  const currentState = cursorNode?.states.find((state) => state.id === cursor.stateId);
  const cursorIsBroken = cursor.type !== "blocked" && (
    !cursorNode ||
    !currentState ||
    (cursor.type === "interaction" && (
      !currentInteraction ||
      currentInteraction.sourceNodeId !== cursor.nodeId ||
      (currentInteraction.sourceStateId !== null && currentInteraction.sourceStateId !== cursor.stateId)
    ))
  );
  const availableInteractions = currentNode && currentNode.kind !== "terminal" && !cursorIsBroken
    ? project.interactions.filter((interaction) =>
      interaction.sourceNodeId === currentNode.id &&
      (interaction.sourceStateId === null || interaction.sourceStateId === cursor.stateId),
    )
    : [];
  const isComplete = !cursorIsBroken && currentNode?.kind === "terminal";
  const isDeadEnd = !cursorIsBroken && (
    (Boolean(currentNode) && !isComplete && availableInteractions.length === 0) ||
    Boolean(currentInteraction && currentInteraction.outcomes.length === 0)
  );
  const isBlocked = cursor.type === "blocked" || cursorIsBroken;
  const isStopped = isComplete || isDeadEnd || isBlocked;
  const description = currentState?.description || cursorNode?.description;
  const statusLabel = isBlocked ? "This path needs a fix" : isComplete ? "Flow complete" : isDeadEnd ? "No next step yet" : currentInteraction ? `Action on ${cursorNode?.name}` : "Current screen";
  const title = cursor.type === "blocked"
    ? cursor.label
    : cursorIsBroken ? "Missing screen or state" : currentInteraction?.name ?? cursorNode?.name ?? "Flow preview";
  const detail = cursor.type === "blocked"
    ? cursor.detail
    : cursorIsBroken
      ? "This step refers to a screen, state, or action that is no longer available. Return to the editor to repair it."
      : isComplete
        ? "You reached a screen marked as an ending. Go back to try a different outcome, or restart the flow."
        : isDeadEnd
          ? currentInteraction
            ? "This action has no outcomes yet. Return to the editor and give it an outcome and destination."
            : `There are no actions available in ${currentState?.name ?? "this state"}. Add an action, or mark this screen as an ending.`
          : null;

  useEffect(() => {
    statusHeadingRef.current?.focus({ preventScroll: true });
  }, [cursor]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onExit]);

  return (
    <section aria-label="Flow preview" className={styles.simulation}>
      <header className={styles.previewNavigation}>
        <div className={styles.previewIntroduction}>
          <span className={styles.eyebrow}>Preview on canvas</span>
          <span>Choose an action, then an outcome.</span>
        </div>
        <div className={styles.navigationActions}>
          <button className={styles.quietButton} disabled={!canGoBack} onClick={onBack} type="button">
            <ArrowLeft aria-hidden="true" size={14} /> Back
          </button>
          <button className={styles.quietButton} onClick={onRestart} type="button">
            <RotateCcw aria-hidden="true" size={14} /> Restart flow
          </button>
          <button aria-label="Exit preview" className={styles.quietButton} onClick={onExit} title="Exit preview (Escape)" type="button">
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      </header>

      <div className={styles.previewPanel}>
        <div className={styles.currentScreen} aria-atomic="true" aria-live="polite">
          <div className={styles.screenStatus}>
            {isBlocked || isDeadEnd ? <CircleAlert aria-hidden="true" size={17} /> : isComplete ? <CheckCircle2 aria-hidden="true" size={17} /> : <Monitor aria-hidden="true" size={17} />}
            {statusLabel}
          </div>
          <h2 ref={statusHeadingRef} tabIndex={-1}>{title}</h2>
          {!isBlocked && currentState && <span className={styles.stateBadge}>{currentState.name}</span>}
          {!isBlocked && description && <p className={styles.screenDescription}>{description}</p>}
        </div>

        {isStopped ? (
          <div className={styles.stoppedChoices}>
            {detail && <p className={isComplete ? styles.completionMessage : styles.notice}>{detail}</p>}
            {isBlocked || isDeadEnd ? (
              <button className={styles.editButton} onClick={onExit} type="button">Edit this flow</button>
            ) : (
              <button className={styles.editButton} onClick={onRestart} type="button">Try another path</button>
            )}
          </div>
        ) : (
          <div className={styles.choices}>
            <h3>{currentInteraction ? "Choose an outcome" : "Choose an action"}</h3>
            <div className={styles.choiceList}>
              {availableInteractions.map((interaction) => (
                <button className={styles.choice} key={interaction.id} onClick={() => onChooseInteraction(interaction.id)} type="button">
                  <span><strong>{interaction.name}</strong><small>{interaction.outcomes.length} possible outcome{interaction.outcomes.length === 1 ? "" : "s"}</small></span>
                  <ArrowRight aria-hidden="true" size={17} />
                </button>
              ))}
              {currentInteraction?.outcomes.map((outcome) => (
                <button className={styles.choice} key={outcome.id} onClick={() => onChooseOutcome(currentInteraction.id, outcome.id)} type="button">
                  <span className={styles.outcomeTitle}>
                    <span className={styles.outcomeDot} style={{ background: OUTCOME_COLORS[outcome.kind] }} />
                    <span><strong>{outcome.name}</strong><small>{destinationLabel(project, outcome)}</small>{outcome.condition && <small>If {outcome.condition}</small>}</span>
                  </span>
                  <ArrowRight aria-hidden="true" size={17} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {journey.length > 0 && (
        <footer className={styles.journey}>
          <span className={styles.eyebrow}>Your path</span>
          <ol aria-label="Journey history">
            {journey.slice(-5).map((item, index) => (
              <li key={`${item}-${index}`}>
                {index > 0 && <ArrowRight aria-hidden="true" size={11} />}
                <span title={item}>{item}</span>
              </li>
            ))}
          </ol>
        </footer>
      )}
    </section>
  );
}
