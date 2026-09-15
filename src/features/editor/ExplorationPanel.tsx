import { ArrowRight, Check, ChevronRight, Circle, CircleAlert, Flag, ListChecks, RotateCcw, Unplug } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { ExplorationCheck, ExplorationSummary, OutcomeReview, OutcomeReviewItem, OutcomeReviewSummary } from "@/domain";
import styles from "./exploration.module.css";

interface ExplorationPanelProps {
  summary: ExplorationSummary;
  issueCount: number;
  onExploreNext: () => void;
  onCheckFlow: () => void;
  reviews?: OutcomeReviewSummary;
  onRevisitReview?: (interactionId: string, outcomeId: string) => void;
  onReviewChange?: (review: OutcomeReview) => void;
}

const statusLabels: Record<ExplorationCheck["status"], string> = {
  unexplored: "Not explored",
  explored: "Explored",
  "needs-fix": "Needs fixing",
  unreachable: "Unreachable",
};

function CheckStatus({ status }: { status: ExplorationCheck["status"] }) {
  const Icon = status === "explored" ? Check : status === "needs-fix" ? CircleAlert : status === "unreachable" ? Unplug : Circle;
  return <Icon aria-hidden="true" size={13} />;
}

function ReviewItem({ item, onRevisitReview, onReviewChange }: {
  item: OutcomeReviewItem;
  onRevisitReview?: ExplorationPanelProps["onRevisitReview"];
  onReviewChange?: ExplorationPanelProps["onReviewChange"];
}) {
  const label = `${item.interactionName} → ${item.outcomeName}`;
  return (
    <li className={styles.reviewItem}>
      <strong>{label}</strong>
      <span className={styles.context}>{item.sourceName} · {item.sourceStateName}</span>
      <p className={item.note ? styles.reviewNote : styles.noReviewNote}>{item.note || "No note added."}</p>
      {item.reason && <p className={styles.reason}>{item.reason}</p>}
      <div className={styles.reviewActions}>
        {onRevisitReview && (
          <button aria-label={`${item.canRevisit ? "Revisit" : "Show in editor"}: ${label}`} onClick={() => onRevisitReview(item.interactionId, item.outcomeId)} type="button">
            {item.canRevisit ? "Revisit" : "Show in editor"}<ArrowRight aria-hidden="true" size={11} />
          </button>
        )}
        {onReviewChange && (
          <button aria-label={`${item.status === "needs-work" ? "Resolve" : "Reopen"} flag for ${label}`} onClick={() => onReviewChange({ ...item, status: item.status === "needs-work" ? "resolved" : "needs-work" })} type="button">
            {item.status === "needs-work" ? <Check aria-hidden="true" size={11} /> : <RotateCcw aria-hidden="true" size={11} />}
            {item.status === "needs-work" ? "Resolve" : "Reopen"}
          </button>
        )}
      </div>
    </li>
  );
}

export function ExplorationPanel({ summary, issueCount, onExploreNext, onCheckFlow, reviews, onRevisitReview, onReviewChange }: ExplorationPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const contentId = useId();
  const blockedCount = summary.needsFix + summary.unreachable;
  const progressLabel = summary.total === 0 ? "no outcomes yet" : `${summary.explored} of ${summary.total} outcome checks explored`;
  const flagsLabel = reviews ? `, ${reviews.open} open ${reviews.open === 1 ? "flag" : "flags"}` : "";

  useEffect(() => {
    if (!expanded) return;

    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        setExpanded(false);
      }
    }

    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [expanded]);

  return (
    <section
      aria-label="Flow exploration"
      className={`${styles.panel} ${expanded ? styles.expanded : ""} nodrag nopan nowheel`}
      onKeyDown={(event) => {
        if (expanded && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setExpanded(false);
          toggleRef.current?.focus();
        }
      }}
      ref={panelRef}
    >
      <h2 className={styles.heading}>
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          aria-label={`Flow review, ${progressLabel}${flagsLabel}`}
          className={styles.toggle}
          onClick={() => setExpanded((value) => !value)}
          ref={toggleRef}
          title={expanded ? "Collapse flow review" : "Open flow review"}
          type="button"
        >
          <ListChecks aria-hidden="true" className={styles.reviewIcon} size={14} />
          <span>Flow review</span>
          <span className={styles.compactProgress} title="Explored means followed in Preview, not approved.">
            {summary.total === 0 ? "No outcomes" : `${summary.explored}/${summary.total} explored`}
          </span>
          {reviews && (
            <span className={`${styles.flagCount} ${reviews.open > 0 ? styles.hasFlags : ""}`} title={`${reviews.open} open ${reviews.open === 1 ? "flag" : "flags"}`}>
              <Flag aria-hidden="true" size={11} />{reviews.open}
            </span>
          )}
          <ChevronRight aria-hidden="true" className={styles.toggleChevron} size={12} />
        </button>
      </h2>

      <div className={styles.content} hidden={!expanded} id={contentId}>
        {summary.total === 0 ? (
          <p className={styles.empty}>Add actions and outcomes to start exploring.</p>
        ) : (
          <>
            <p aria-live="polite" aria-atomic="true" className={styles.progress}>
              <strong>{summary.explored} of {summary.total}</strong> outcome checks explored
            </p>
            <progress aria-label="Outcome checks explored" className={styles.progressBar} max={summary.total} value={summary.explored} />
            <p className={styles.caption}>Explored means followed in Preview, not approved.</p>
            <div className={styles.counts}>
              <span><Circle aria-hidden="true" size={10} />{summary.unexplored} not explored</span>
              {summary.needsFix > 0 && <span className={styles.warning}><CircleAlert aria-hidden="true" size={11} />{summary.needsFix} {summary.needsFix === 1 ? "needs" : "need"} fixing</span>}
              {summary.unreachable > 0 && <span className={styles.warning}><Unplug aria-hidden="true" size={11} />{summary.unreachable} unreachable</span>}
            </div>
            <button className={styles.exploreButton} disabled={summary.unexplored === 0} onClick={onExploreNext} type="button">
              Explore next outcome <ArrowRight aria-hidden="true" size={13} />
            </button>
            {summary.unexplored === 0 && (
              <p className={styles.caption}>
                {blockedCount > 0
                  ? "Fix the blocked checks to keep exploring."
                  : "All current outcome checks explored. This is not a sign-off."}
              </p>
            )}
          </>
        )}

        {issueCount > 0 && (
          <button className={styles.issuesButton} onClick={onCheckFlow} type="button">
            <CircleAlert aria-hidden="true" size={12} />
            View flow issues{issueCount > 0 ? ` (${issueCount})` : ""}
            <ChevronRight aria-hidden="true" size={12} />
          </button>
        )}

        {reviews && (
          <details aria-label="Outcome review flags" className={styles.reviews}>
            <summary><Flag aria-hidden="true" size={12} />Needs work <span aria-live="polite" aria-atomic="true">{reviews.open}</span>{reviews.resolved > 0 && <small>{reviews.resolved} resolved</small>}<ChevronRight aria-hidden="true" className={styles.reviewChevron} size={12} /></summary>
            <p className={styles.reviewCaption}>Your outcome flags, separate from exploration and automatic flow issues.</p>
            {reviews.open > 0 ? (
              <ul aria-label="Outcomes needing work" className={styles.reviewList}>
                {reviews.items.filter((item) => item.status === "needs-work").map((item) => <ReviewItem item={item} key={item.key} onReviewChange={onReviewChange} onRevisitReview={onRevisitReview} />)}
              </ul>
            ) : <p className={styles.reviewCaption}>No open flags. Flag an outcome during Preview when something needs attention.</p>}
            {reviews.resolved > 0 && (
              <details className={styles.resolvedReviews}>
                <summary><ChevronRight aria-hidden="true" size={12} />Resolved flags ({reviews.resolved})</summary>
                <p className={styles.reviewCaption}>Resolved flags keep their notes. Resolving is not approval of the flow.</p>
                <ul aria-label="Resolved outcome flags" className={styles.reviewList}>
                  {reviews.items.filter((item) => item.status === "resolved").map((item) => <ReviewItem item={item} key={item.key} onReviewChange={onReviewChange} onRevisitReview={onRevisitReview} />)}
                </ul>
              </details>
            )}
          </details>
        )}

        {summary.total > 0 && (
          <details className={styles.details}>
            <summary><ChevronRight aria-hidden="true" size={12} />Outcome checklist</summary>
            <p className={styles.scope}>Checks cover modeled outcomes in reachable states. Unreachable actions need fixing. Relevant edits return affected checks to not explored.</p>
            <ul aria-label="Outcome checklist" className={styles.checklist}>
              {summary.checks.map((check) => (
                <li className={styles.check} key={check.key}>
                  <div className={styles.checkTitle}>
                    <strong>{check.interactionName} → {check.outcomeName}</strong>
                    <span className={`${styles.status} ${check.status === "explored" ? styles.explored : check.status === "unexplored" ? "" : styles.warning}`}>
                      <CheckStatus status={check.status} />{statusLabels[check.status]}
                    </span>
                  </div>
                  <span className={styles.context}>{check.sourceName} · {check.sourceStateName}</span>
                  {check.reason && <p className={styles.reason}>{check.reason}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
