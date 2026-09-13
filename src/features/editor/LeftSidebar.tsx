"use client";

import { useState } from "react";
import { Monitor, MousePointerClick, Plus, Search, StickyNote } from "lucide-react";

import type { ProjectAnalysis, ProjectDocument } from "@/domain";
import { interactionNodeId, stickyNoteNodeId } from "./graph";
import styles from "./editor.module.css";
import shellStyles from "./shell-controls.module.css";

interface LeftSidebarProps {
  project: ProjectDocument;
  analysis: ProjectAnalysis;
  selectedId: string | null;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onAddScreen: () => void;
  onAddStickyNote: () => void;
  onAddInteraction: () => void;
  onLoadExample?: () => void;
}

export function LeftSidebar({
  project,
  selectedId,
  readOnly = false,
  onSelect,
  onAddScreen,
  onAddStickyNote,
  onLoadExample,
}: LeftSidebarProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const notes = (project.stickyNotes ?? []).filter((note) =>
    (note.text || "Sticky note").toLocaleLowerCase().includes(normalizedQuery),
  );
  const screenGroups = project.nodes.flatMap((node) => {
    const matchesScreen = node.name.toLocaleLowerCase().includes(normalizedQuery);
    const actions = project.interactions.filter(
      (action) =>
        action.sourceNodeId === node.id &&
        (matchesScreen || action.name.toLocaleLowerCase().includes(normalizedQuery)),
    );
    return matchesScreen || actions.length > 0 ? [{ node, actions }] : [];
  });

  return (
    <aside aria-label="Flow outline" className={styles.leftPanel}>
      <div className={shellStyles.sidebarHeader}>
        <div className={shellStyles.sidebarTitle}>
          <h2>Screens</h2>
          <span>{project.nodes.length}</span>
        </div>
        <button
          className={`${styles.primaryButton} ${shellStyles.addScreen}`}
          disabled={readOnly}
          onClick={onAddScreen}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
          Add screen
        </button>
        <button
          className={`${styles.secondaryButton} ${shellStyles.addNote}`}
          disabled={readOnly}
          onClick={onAddStickyNote}
          type="button"
        >
          <StickyNote aria-hidden="true" size={14} /> Add sticky note
        </button>
        <label className={styles.searchBox}>
          <Search aria-hidden="true" size={12} />
          <span className={styles.srOnly}>Search screens, actions, and notes</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a screen, action, or note"
            type="search"
            value={query}
          />
        </label>
      </div>

      <nav aria-label="Screens, actions, and notes" className={shellStyles.screenList}>
        {screenGroups.map(({ node, actions }) => (
          <div className={shellStyles.screenGroup} key={node.id}>
            <button
              aria-pressed={selectedId === node.id}
              className={`${shellStyles.screenItem} ${selectedId === node.id ? shellStyles.selectedItem : ""}`}
              onClick={() => onSelect(node.id)}
              type="button"
            >
              <Monitor aria-hidden="true" size={14} />
              <span className={shellStyles.itemCopy}>
                <span className={shellStyles.itemName}>{node.name}</span>
                <span className={shellStyles.itemDetail}>
                  {node.states.length} {node.states.length === 1 ? "state" : "states"}
                </span>
              </span>
              {project.entryNodeId === node.id && (
                <span className={shellStyles.startBadge}>Start</span>
              )}
            </button>
            {actions.length > 0 && (
              <div className={shellStyles.nestedActions}>
                {actions.map((action) => {
                  const id = interactionNodeId(action.id);
                  return (
                    <button
                      aria-pressed={selectedId === id}
                      className={`${shellStyles.actionItem} ${selectedId === id ? shellStyles.selectedItem : ""}`}
                      key={action.id}
                      onClick={() => onSelect(id)}
                      title={`${action.name} · ${action.outcomes.length} ${action.outcomes.length === 1 ? "outcome" : "outcomes"}`}
                      type="button"
                    >
                      <MousePointerClick aria-hidden="true" size={12} />
                      <span className={shellStyles.itemName}>{action.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {screenGroups.length === 0 && notes.length === 0 && (
          <p className={shellStyles.emptyList}>
            {normalizedQuery
              ? `No screens, actions, or notes match “${query}”.`
              : "Add your first screen to start a flow."}
          </p>
        )}
        {notes.length > 0 && (
          <section aria-label="Sticky notes" className={shellStyles.notesSection}>
            <h3>Notes <span>{(project.stickyNotes ?? []).length}</span></h3>
            {notes.map((note) => {
              const id = stickyNoteNodeId(note.id);
              return (
                <button
                  aria-pressed={selectedId === id}
                  className={`${shellStyles.actionItem} ${selectedId === id ? shellStyles.selectedItem : ""}`}
                  key={note.id}
                  onClick={() => onSelect(id)}
                  type="button"
                >
                  <StickyNote aria-hidden="true" size={13} />
                  <span className={shellStyles.itemName}>{note.text.trim().split("\n")[0] || "Sticky note"}</span>
                </button>
              );
            })}
          </section>
        )}
      </nav>

      <div className={shellStyles.guide}>
        <p>Build one path at a time</p>
        <ol>
          <li>Add screens</li>
          <li>Add actions &amp; outcomes</li>
          <li>Preview each path</li>
        </ol>
        {onLoadExample && (
          <button
            className={shellStyles.exampleButton}
            disabled={readOnly}
            onClick={onLoadExample}
            type="button"
          >
            Load example
          </button>
        )}
        <small>Your flow saves automatically in this browser. Check the toolbar for its save and sync status.</small>
      </div>
    </aside>
  );
}
