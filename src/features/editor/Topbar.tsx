import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Play,
  Redo2,
  Undo2,
} from "lucide-react";

import { BrandMark } from "./components/BrandMark";
import styles from "./editor.module.css";
import shellStyles from "./shell-controls.module.css";

export type EditorMode = "design" | "simulate";
export type SaveStatus = "saving" | "saved" | "failed";

interface TopbarProps {
  projectLabel?: string;
  flowLabel?: string;
  saveStatus?: SaveStatus;
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
  projectLabel = "Pathloom",
  flowLabel = "Your flow",
  saveStatus = "saved",
  mode,
  issueCount,
  coverageOpen,
  canUndo,
  canRedo,
  onToggleCoverage,
  onUndo,
  onRedo,
  onRun,
  onStop,
}: TopbarProps) {
  const saveLabel =
    saveStatus === "failed"
      ? "Local save failed"
      : saveStatus === "saving"
        ? "Saving in this browser"
        : "Saved in this browser";

  return (
    <header className={`${styles.topbar} ${shellStyles.topbar}`}>
      <div className={styles.brandGroup}>
        <BrandMark />
        <span aria-hidden="true" className={styles.brandDivider} />
        <span
          className={shellStyles.flowName}
          title={`${projectLabel} / ${flowLabel}`}
        >
          {flowLabel}
        </span>
        <span
          aria-live="polite"
          className={`${styles.saveState} ${shellStyles.saveState}`}
        >
          <span
            aria-hidden="true"
            className={`${styles.saveDot} ${
              saveStatus === "failed"
                ? styles.saveDotFailed
                : saveStatus === "saving"
                  ? styles.saveDotSaving
                  : ""
            }`}
          />
          {saveLabel}
        </span>
      </div>

      <div className={styles.topbarActions}>
        {mode === "design" && (
          <>
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
              className={`${shellStyles.checkButton} ${coverageOpen ? shellStyles.checkActive : ""}`}
              onClick={onToggleCoverage}
              title="Find unfinished paths and unreachable screens"
              type="button"
            >
              {issueCount > 0 ? (
                <AlertTriangle aria-hidden="true" size={13} />
              ) : (
                <Check aria-hidden="true" size={13} />
              )}
              <span>Check flow</span>
              <span className={shellStyles.issueCount}>{issueCount}</span>
            </button>
          </>
        )}

        {mode === "simulate" ? (
          <button className={styles.primaryButton} onClick={onStop} type="button">
            <ArrowLeft aria-hidden="true" size={13} />
            Back to editor
          </button>
        ) : (
          <button className={styles.primaryButton} onClick={onRun} type="button">
            <Play aria-hidden="true" fill="currentColor" size={12} />
            Preview
          </button>
        )}
      </div>
    </header>
  );
}
