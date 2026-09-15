import { useEffect, useRef } from "react";

import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, CircleAlert, Flag, Monitor, RotateCcw, X } from "lucide-react";

import { getOutcomeReview, OUTCOME_REVIEW_LIMIT, type ExplorationSummary, type Outcome, type OutcomeReview, type ProjectDocument } from "../../domain";
import { OutcomeReviewControl } from "./OutcomeReviewControl";
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
  exploration?: ExplorationSummary;
  onExploreNext?: () => void;
  recommendedCheckKey?: string | null;
  onCheckFlow?: () => void;
  flowIssueCount?: number;
  recentOutcome?: Pick<OutcomeReview, "interactionId" | "outcomeId" | "sourceNodeId" | "sourceStateId">;
  reviewOutcomeId?: string | null;
  onReviewChange?: (review: OutcomeReview) => void;
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

function reviewContextLabel(project: ProjectDocument, context: Pick<OutcomeReview, "sourceNodeId" | "sourceStateId">) {
  const source = project.nodes.find((node) => node.id === context.sourceNodeId);
  const state = source?.states.find((item) => item.id === context.sourceStateId);
  return `${source?.name || "Missing screen"} · ${state?.name || (context.sourceStateId === null ? "No recorded state" : "Missing state")}`;
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
  exploration,
  onExploreNext,
  recommendedCheckKey,
  onCheckFlow,
  flowIssueCount = 0,
  recentOutcome,
  reviewOutcomeId,
  onReviewChange,
}: SimulationTrayProps) {
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);
  const cursorNode = project.nodes.find((node) => node.id === cursor.nodeId);
  const currentNode = cursor.type === "node" ? cursorNode : undefined;
  const currentInteraction = cursor.type === "interaction"
    ? project.interactions.find((interaction) => interaction.id === cursor.id)
    : undefined;
  const currentState = cursorNode?.states.find((state) => state.id === cursor.stateId);
  const atReviewLimit = (project.outcomeReviews?.items.length ?? 0) >= OUTCOME_REVIEW_LIMIT;
  const recentInteraction = cursor.type !== "interaction" && recentOutcome
    ? project.interactions.find((interaction) => interaction.id === recentOutcome.interactionId)
    : undefined;
  const recentBranch = recentInteraction?.outcomes.find((outcome) => outcome.id === recentOutcome?.outcomeId);
  const recentReview = recentOutcome ? getOutcomeReview(project, recentOutcome.interactionId, recentOutcome.outcomeId) : null;
  const currentChecks = new Map(exploration?.checks
    .filter((check) => check.interactionId === currentInteraction?.id && check.sourceStateId === cursor.stateId)
    .map((check) => [check.outcomeId, check]));
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
  const isReviewShortcut = journey[0]?.startsWith("Review shortcut:") ?? false;
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

      {exploration && (
        <div className={styles.explorationRow}>
          <div className={styles.explorationProgress}>
            <span aria-live="polite" aria-atomic="true"><strong>{exploration.explored} of {exploration.total}</strong> outcome checks explored</span>
            <small>Followed in Preview, not approved.</small>
          </div>
          <div className={styles.explorationActions}>
            {exploration.needsFix + exploration.unreachable > 0 && (
              <span className={styles.blockedCount}>{exploration.needsFix + exploration.unreachable} check{exploration.needsFix + exploration.unreachable === 1 ? "" : "s"} blocked</span>
            )}
            {flowIssueCount > 0 && onCheckFlow && (
              <button className={styles.flowIssuesButton} onClick={onCheckFlow} type="button">
                <CircleAlert aria-hidden="true" size={12} />
                View flow issues ({flowIssueCount})
              </button>
            )}
            {onExploreNext && (
              <button className={styles.nextOutcomeButton} disabled={exploration.unexplored === 0} onClick={onExploreNext} type="button">
                Explore next outcome <ArrowRight aria-hidden="true" size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.previewPanel}>
        <div className={styles.currentScreen}>
          <div aria-atomic="true" aria-live="polite">
          <div className={styles.screenStatus}>
            {isBlocked || isDeadEnd ? <CircleAlert aria-hidden="true" size={17} /> : isComplete ? <CheckCircle2 aria-hidden="true" size={17} /> : <Monitor aria-hidden="true" size={17} />}
            {statusLabel}
          </div>
          <h2 ref={statusHeadingRef} tabIndex={-1}>{title}</h2>
          {!isBlocked && currentState && <span className={styles.stateBadge}>{currentState.name}</span>}
          {!isBlocked && description && <p className={styles.screenDescription}>{description}</p>}
          </div>
        </div>

        <div className={`${styles.previewChoicesPane}${recentOutcome && recentInteraction && recentBranch && onReviewChange ? ` ${styles.withRecentOutcome}` : ""}`}>
          {recentOutcome && recentInteraction && recentBranch && onReviewChange && (
            <div aria-label="Last outcome review" className={styles.recentReview}>
              <div className={styles.recentReviewContext}>
                <span className={styles.recentReviewLabel}>Last outcome</span>
                <strong>{recentInteraction.name} → {recentBranch.name}</strong>
                <p>{reviewContextLabel(project, recentReview ?? recentOutcome)}</p>
              </div>
              <OutcomeReviewControl
                actionName={recentInteraction.name}
                atLimit={atReviewLimit}
                context={recentOutcome}
                contextLabel={reviewContextLabel(project, recentReview ?? recentOutcome)}
                key={`${recentOutcome.interactionId}-${recentOutcome.outcomeId}`}
                onChange={onReviewChange}
                outcomeName={recentBranch.name}
                review={recentReview ?? undefined}
              />
            </div>
          )}

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
            {currentInteraction && onReviewChange && <p className={styles.reviewNotice}>Flag an outcome without following it. Flags are separate from exploration.</p>}
            {isReviewShortcut && <p className={styles.shortcutNotice}>Review shortcut: jumped to a source state. The setup path is not counted.</p>}
            <div className={styles.choiceList}>
              {availableInteractions.map((interaction) => (
                <button className={styles.choice} key={interaction.id} onClick={() => onChooseInteraction(interaction.id)} type="button">
                  <span><strong>{interaction.name}</strong><small>{interaction.outcomes.length} possible outcome{interaction.outcomes.length === 1 ? "" : "s"}</small></span>
                  <ArrowRight aria-hidden="true" size={17} />
                </button>
              ))}
              {currentInteraction?.outcomes.map((outcome) => {
                const check = currentChecks.get(outcome.id);
                const isRecommended = check?.key === recommendedCheckKey && check?.status === "unexplored";
                const needsFix = check?.status === "needs-fix" || check?.status === "unreachable";
                const review = getOutcomeReview(project, currentInteraction.id, outcome.id);
                const isReviewTarget = reviewOutcomeId === outcome.id;
                const context = { interactionId: currentInteraction.id, outcomeId: outcome.id, sourceNodeId: cursor.nodeId, sourceStateId: cursor.stateId };
                return (
                  <div className={styles.outcomeChoice} key={outcome.id}>
                  <button className={`${styles.choice}${isRecommended ? ` ${styles.recommendedChoice}` : ""}${isReviewTarget ? ` ${styles.reviewTargetChoice}` : ""}`} onClick={() => onChooseOutcome(currentInteraction.id, outcome.id)} type="button">
                    <span className={styles.outcomeTitle}>
                      <span aria-hidden="true" className={styles.outcomeDot} style={{ background: OUTCOME_COLORS[outcome.kind] }} />
                      <span>
                        <strong>{outcome.name}</strong>
                        <small>{destinationLabel(project, outcome)}</small>
                        {outcome.condition && <small>If {outcome.condition}</small>}
                        {isReviewTarget && <span className={styles.reviewTargetLabel}><Flag aria-hidden="true" size={11} />Review this outcome</span>}
                        {check && (
                          <span className={`${styles.outcomeCheck} ${check.status === "explored" ? styles.exploredCheck : needsFix ? styles.blockedCheck : ""}`}>
                            {check.status === "explored" ? <Check aria-hidden="true" size={11} /> : needsFix ? <CircleAlert aria-hidden="true" size={11} /> : <Circle aria-hidden="true" size={9} />}
                            {check.status === "explored" ? "Explored" : needsFix ? "Needs fixing" : isRecommended ? "Explore this outcome" : "Not explored"}
                          </span>
                        )}
                      </span>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                  {onReviewChange && (
                    <OutcomeReviewControl
                      actionName={currentInteraction.name}
                      atLimit={atReviewLimit}
                      context={context}
                      contextLabel={reviewContextLabel(project, review ?? context)}
                      highlighted={isReviewTarget}
                      key={`${outcome.id}-${isReviewTarget}`}
                      onChange={onReviewChange}
                      outcomeName={outcome.name}
                      review={review ?? undefined}
                    />
                  )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
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
