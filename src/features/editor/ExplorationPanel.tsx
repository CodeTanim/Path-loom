import { ArrowRight, Check, ChevronRight, Circle, CircleAlert, ListChecks, Unplug } from "lucide-react";

import type { ExplorationCheck, ExplorationSummary } from "@/domain";
import styles from "./exploration.module.css";

interface ExplorationPanelProps {
  summary: ExplorationSummary;
  issueCount: number;
  onExploreNext: () => void;
  onCheckFlow: () => void;
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

export function ExplorationPanel({ summary, issueCount, onExploreNext, onCheckFlow }: ExplorationPanelProps) {
  const blockedCount = summary.needsFix + summary.unreachable;

  return (
    <section aria-label="Flow exploration" className={`${styles.panel} nodrag nopan nowheel`}>
      <header className={styles.header}>
        <ListChecks aria-hidden="true" size={14} />
        <h2>Flow review</h2>
      </header>

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
    </section>
  );
}
