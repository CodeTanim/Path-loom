"use client";

import { useMemo, useState } from "react";
import {
  CircleDashed,
  GitBranch,
  Monitor,
  MousePointerClick,
  PanelLeftClose,
  Plus,
  Search,
  StickyNote,
} from "lucide-react";

import type { ProjectAnalysis, ProjectDocument } from "@/domain";
import { interactionNodeId } from "./graph";
import styles from "./editor.module.css";

interface LeftSidebarProps {
  project: ProjectDocument;
  analysis: ProjectAnalysis;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddScreen: () => void;
  onAddInteraction: () => void;
  onStubAction: (label: string) => void;
}

export function LeftSidebar({
  project,
  analysis,
  selectedId,
  onSelect,
  onAddScreen,
  onAddInteraction,
  onStubAction,
}: LeftSidebarProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const unreachable = new Set(analysis.unreachableNodeIds);

  const visibleNodes = useMemo(
    () =>
      project.nodes.filter((node) =>
        node.name.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, project.nodes],
  );
  const visibleInteractions = useMemo(
    () =>
      project.interactions.filter((interaction) =>
        interaction.name.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, project.interactions],
  );

  const itemClass = (active: boolean) =>
    `${styles.outlineItem} ${active ? styles.outlineItemActive : ""}`;

  return (
    <aside className={styles.leftPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.sectionTitle}>
          <h2>Flow</h2>
          <button
            aria-label="Collapse flow panel"
            className={styles.iconButton}
            onClick={() => onStubAction("Panel collapse is coming next")}
            title="Collapse panel"
            type="button"
          >
            <PanelLeftClose aria-hidden="true" size={14} />
          </button>
        </div>
        <label className={styles.searchBox}>
          <Search aria-hidden="true" size={12} />
          <span className={styles.srOnly}>Search flow</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a screen or action"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className={styles.quickAdds}>
        <button className={styles.quickAdd} onClick={onAddScreen} type="button">
          <Monitor aria-hidden="true" size={14} />
          <span>Screen</span>
        </button>
        <button
          className={styles.quickAdd}
          onClick={onAddInteraction}
          type="button"
        >
          <GitBranch aria-hidden="true" size={14} />
          <span>Interaction</span>
        </button>
        <button
          className={styles.quickAdd}
          onClick={() => onStubAction("Notes will live beside flow nodes")}
          type="button"
        >
          <StickyNote aria-hidden="true" size={14} />
          <span>Note</span>
        </button>
      </div>

      <div className={styles.outline}>
        <section className={styles.outlineGroup}>
          <div className={styles.outlineLabel}>Screens</div>
          {visibleNodes
            .filter((node) => !unreachable.has(node.id))
            .map((node) => (
              <button
                className={itemClass(selectedId === node.id)}
                key={node.id}
                onClick={() => onSelect(node.id)}
                type="button"
              >
                <span className={styles.outlineIcon}>
                  <Monitor aria-hidden="true" size={11} />
                </span>
                <span className={styles.outlineName}>{node.name}</span>
                <span className={styles.outlineMeta}>{node.states.length}</span>
              </button>
            ))}
        </section>

        <section className={styles.outlineGroup}>
          <div className={styles.outlineLabel}>Interactions</div>
          {visibleInteractions.map((interaction) => {
            const id = interactionNodeId(interaction.id);
            return (
              <button
                className={itemClass(selectedId === id)}
                key={interaction.id}
                onClick={() => onSelect(id)}
                type="button"
              >
                <span className={styles.outlineIcon}>
                  <MousePointerClick aria-hidden="true" size={11} />
                </span>
                <span className={styles.outlineName}>{interaction.name}</span>
                <span className={styles.outlineMeta}>
                  {interaction.outcomes.length}
                </span>
              </button>
            );
          })}
        </section>

        {analysis.unreachableNodeIds.length > 0 && (
          <section className={styles.outlineGroup}>
            <div className={styles.outlineLabel}>Unreachable</div>
            {visibleNodes
              .filter((node) => unreachable.has(node.id))
              .map((node) => (
                <button
                  className={itemClass(selectedId === node.id)}
                  key={node.id}
                  onClick={() => onSelect(node.id)}
                  type="button"
                >
                  <span className={styles.outlineIcon}>
                    <CircleDashed aria-hidden="true" size={11} />
                  </span>
                  <span className={styles.outlineName}>{node.name}</span>
                  <span aria-label="Coverage warning" className={styles.warningDot} />
                </button>
              ))}
          </section>
        )}

        {visibleNodes.length === 0 && visibleInteractions.length === 0 && (
          <div className={styles.emptyState}>
            No flow items match “{query}”.
          </div>
        )}
      </div>

      <div className={styles.shortcutFooter}>
        <span>
          Pan <kbd>Space</kbd>
        </span>
        <span>
          Add <kbd>N</kbd>
        </span>
        <span>
          Undo <kbd>⌘Z</kbd>
        </span>
        <button
          aria-label="Add screen"
          className={styles.iconButton}
          onClick={onAddScreen}
          title="Add screen"
          type="button"
        >
          <Plus aria-hidden="true" size={13} />
        </button>
      </div>
    </aside>
  );
}
