import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleStop,
  Play,
  Redo2,
  Undo2,
} from "lucide-react";

import { BrandMark } from "./components/BrandMark";
import styles from "./editor.module.css";

export type EditorMode = "design" | "simulate";

interface TopbarProps {
  projectLabel?: string;
  flowLabel?: string;
  mode: EditorMode;
  issueCount: number;
  coverageOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onModeChange: (mode: EditorMode) => void;
  onToggleCoverage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRun: () => void;
  onStop: () => void;
}

export function Topbar({
  projectLabel = "Acme Shop",
  flowLabel = "Checkout recovery",
  mode,
  issueCount,
  coverageOpen,
  canUndo,
  canRedo,
  onModeChange,
  onToggleCoverage,
  onUndo,
  onRedo,
  onRun,
  onStop,
}: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.brandGroup}>
        <BrandMark />
        <span aria-hidden="true" className={styles.brandDivider} />
        <nav aria-label="Project breadcrumb" className={styles.breadcrumbs}>
          <span className={styles.breadcrumbProject}>{projectLabel}</span>
          <ChevronRight aria-hidden="true" size={11} />
          <span className={styles.breadcrumbFlow}>{flowLabel}</span>
        </nav>
        <span className={styles.saveState}>
          <span aria-hidden="true" className={styles.saveDot} />
          Saved locally
        </span>
      </div>

      <div className={styles.topbarCenter}>
        <div aria-label="Editor mode" className={styles.modeSwitch} role="group">
          <button
            aria-pressed={mode === "design"}
            className={`${styles.segmentButton} ${mode === "design" ? styles.segmentActive : ""}`}
            onClick={() => onModeChange("design")}
            type="button"
          >
            Design
          </button>
          <button
            aria-pressed={mode === "simulate"}
            className={`${styles.segmentButton} ${mode === "simulate" ? styles.segmentActive : ""}`}
            onClick={() => onModeChange("simulate")}
            type="button"
          >
            <Play aria-hidden="true" size={10} />
            Simulate
          </button>
        </div>
      </div>

      <div className={styles.topbarActions}>
        <button
          aria-label="Undo"
          className={styles.iconButton}
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (⌘Z)"
          type="button"
        >
          <Undo2 aria-hidden="true" size={15} />
        </button>
        <button
          aria-label="Redo"
          className={styles.iconButton}
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (⇧⌘Z)"
          type="button"
        >
          <Redo2 aria-hidden="true" size={15} />
        </button>

        <button
          aria-pressed={coverageOpen}
          className={`${styles.coverageButton} ${coverageOpen ? styles.coverageActive : ""}`}
          onClick={onToggleCoverage}
          type="button"
        >
          {issueCount > 0 ? (
            <AlertTriangle aria-hidden="true" size={13} />
          ) : (
            <Check aria-hidden="true" size={13} />
          )}
          <span>Coverage</span>
          <span className={styles.issueCount}>{issueCount}</span>
        </button>

        {mode === "simulate" ? (
          <button className={styles.secondaryButton} onClick={onStop} type="button">
            <CircleStop aria-hidden="true" size={13} />
            Stop run
          </button>
        ) : (
          <button className={styles.primaryButton} onClick={onRun} type="button">
            <Play aria-hidden="true" fill="currentColor" size={12} />
            Run flow
          </button>
        )}
      </div>
    </header>
  );
}
