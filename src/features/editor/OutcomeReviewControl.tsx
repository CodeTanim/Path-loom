import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronRight, Flag, RotateCcw } from "lucide-react";

import { OUTCOME_REVIEW_NOTE_MAX_LENGTH, type OutcomeReview } from "../../domain";
import styles from "./outcome-review.module.css";

interface OutcomeReviewControlProps {
  context: Pick<OutcomeReview, "interactionId" | "outcomeId" | "sourceNodeId" | "sourceStateId">;
  review?: OutcomeReview;
  actionName: string;
  outcomeName: string;
  contextLabel: string;
  atLimit: boolean;
  highlighted?: boolean;
  onChange: (review: OutcomeReview) => void;
}

/** Review controls are siblings of traversal buttons: reviewing never advances Preview. */
export function OutcomeReviewControl({
  context, review, actionName, outcomeName, contextLabel, atLimit, highlighted = false, onChange,
}: OutcomeReviewControlProps) {
  const [expanded, setExpanded] = useState(highlighted);
  const noteId = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const focusNewNoteRef = useRef(false);
  const label = `${actionName} → ${outcomeName}`;

  useEffect(() => {
    if (highlighted) detailsRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  useEffect(() => {
    if (review && focusNewNoteRef.current) {
      focusNewNoteRef.current = false;
      noteRef.current?.focus();
    }
  }, [review]);

  if (!review) {
    return (
      <div className={styles.control}>
        <button
          aria-label={`Flag ${label} as needs work`}
          className={styles.flagButton}
          disabled={atLimit}
          onClick={() => {
            focusNewNoteRef.current = true;
            setExpanded(true);
            onChange({ ...context, status: "needs-work", note: "" });
          }}
          type="button"
        >
          <Flag aria-hidden="true" size={12} /> Flag needs work
        </button>
        {atLimit && <p className={styles.limit}>Review limit reached. Existing flags can still be edited.</p>}
      </div>
    );
  }

  return (
    <details
      className={`${styles.control} ${styles.details}${highlighted ? ` ${styles.highlighted}` : ""}`}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      open={expanded}
      ref={detailsRef}
    >
      <summary aria-label={`Review ${label}: ${review.status === "needs-work" ? "needs work" : "resolved"}`}>
        {review.status === "needs-work" ? <Flag aria-hidden="true" size={12} /> : <Check aria-hidden="true" size={12} />}
        <span>{review.status === "needs-work" ? "Needs work" : "Resolved"} · {review.note ? "Review note" : "Add note"}</span>
        <ChevronRight aria-hidden="true" className={styles.chevron} size={12} />
      </summary>
      <div className={styles.body}>
        <p className={styles.context}>Outcome flag · {contextLabel}</p>
        <label htmlFor={noteId}>Review note for {label} <span>(optional)</span></label>
        <textarea
          id={noteId}
          ref={noteRef}
          maxLength={OUTCOME_REVIEW_NOTE_MAX_LENGTH}
          onChange={(event) => onChange({ ...review, note: event.target.value })}
          placeholder="What needs attention?"
          rows={2}
          value={review.note}
        />
        <div className={styles.actions}>
          <small>{review.note.length}/{OUTCOME_REVIEW_NOTE_MAX_LENGTH}</small>
          <button
            aria-label={`${review.status === "needs-work" ? "Resolve" : "Reopen"} flag for ${label}`}
            className={styles.statusButton}
            onClick={() => onChange({ ...review, status: review.status === "needs-work" ? "resolved" : "needs-work" })}
            type="button"
          >
            {review.status === "needs-work" ? <Check aria-hidden="true" size={12} /> : <RotateCcw aria-hidden="true" size={12} />}
            {review.status === "needs-work" ? "Resolve" : "Reopen"}
          </button>
        </div>
      </div>
    </details>
  );
}
