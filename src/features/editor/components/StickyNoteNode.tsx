"use client";

import {
  NodeResizeControl,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { GripHorizontal, Grip, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import {
  STICKY_NOTE_MAX_HEIGHT,
  STICKY_NOTE_MAX_TEXT_LENGTH,
  STICKY_NOTE_MAX_WIDTH,
  STICKY_NOTE_MIN_HEIGHT,
  STICKY_NOTE_MIN_WIDTH,
} from "@/domain";

import styles from "./sticky-note.module.css";

type NoteGeometry = { x: number; y: number; width: number; height: number };

export type StickyNoteNodeData = {
  noteId: string;
  text: string;
  readOnly?: boolean;
  onTextChange?: (id: string, text: string) => void;
  onTextEditEnd?: (id: string) => void;
  onResizeStart?: () => void;
  onResizeEnd?: (id: string, geometry: NoteGeometry) => void;
  onDelete?: (id: string) => void;
};

export type PathloomStickyNoteNode = Node<StickyNoteNodeData, "stickyNote">;

/** Canvas-only annotation: no connection handles or simulation behavior. */
export function StickyNoteNode({
  data,
  id,
  selected,
}: NodeProps<PathloomStickyNoteNode>) {
  const { getNode } = useReactFlow();
  const editable = !data.readOnly;

  function handleResizeKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    // Keep a resize gesture from also moving the selected React Flow node.
    event.stopPropagation();
    if (!editable || !data.onResizeEnd) return;

    const step = event.shiftKey ? 40 : 10;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!delta) return;
    event.preventDefault();

    const node = getNode(id);
    if (!node) return;
    const width =
      typeof node.style?.width === "number"
        ? node.style.width
        : (node.width ?? node.measured?.width ?? STICKY_NOTE_MIN_WIDTH);
    const height =
      typeof node.style?.height === "number"
        ? node.style.height
        : (node.height ?? node.measured?.height ?? STICKY_NOTE_MIN_HEIGHT);
    const nextWidth = Math.max(
      STICKY_NOTE_MIN_WIDTH,
      Math.min(STICKY_NOTE_MAX_WIDTH, width + delta[0]),
    );
    const nextHeight = Math.max(
      STICKY_NOTE_MIN_HEIGHT,
      Math.min(STICKY_NOTE_MAX_HEIGHT, height + delta[1]),
    );
    if (nextWidth === width && nextHeight === height) return;

    data.onResizeStart?.();
    data.onResizeEnd(data.noteId, {
      ...node.position,
      width: nextWidth,
      height: nextHeight,
    });
  }

  return (
    <div
      aria-label="Sticky note"
      className={`${styles.note} ${selected ? styles.selected : ""}`}
      role="group"
    >
      <div
        className={`sticky-note-drag-handle ${styles.header}`}
        title={editable ? "Drag to move sticky note" : "Sticky note"}
      >
        <span className={styles.title}>
          <GripHorizontal aria-hidden="true" size={14} />
          Sticky note
        </span>
        {editable && data.onDelete && (
          <button
            aria-label="Delete sticky note"
            className={`nodrag nopan ${styles.deleteButton}`}
            onClick={(event) => {
              event.stopPropagation();
              data.onDelete?.(data.noteId);
            }}
            title="Delete sticky note"
            type="button"
          >
            <Trash2 aria-hidden="true" size={13} />
          </button>
        )}
      </div>

      <textarea
        aria-label="Sticky note text"
        className={`nodrag nopan nowheel ${styles.text}`}
        maxLength={STICKY_NOTE_MAX_TEXT_LENGTH}
        onBlur={() => data.onTextEditEnd?.(data.noteId)}
        onChange={(event) => {
          if (editable) data.onTextChange?.(data.noteId, event.target.value);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder="Write a note…"
        readOnly={!editable}
        value={data.text}
      />

      {editable && (
        <div aria-hidden="true" className={styles.footer}>
          {selected ? "Drag corner to resize" : "Select to resize"}
        </div>
      )}

      {editable && selected && (
        <NodeResizeControl
          className={styles.resizeControl}
          maxHeight={STICKY_NOTE_MAX_HEIGHT}
          maxWidth={STICKY_NOTE_MAX_WIDTH}
          minHeight={STICKY_NOTE_MIN_HEIGHT}
          minWidth={STICKY_NOTE_MIN_WIDTH}
          onResizeEnd={(_event, geometry) => {
            data.onResizeEnd?.(data.noteId, geometry);
          }}
          onResizeStart={() => data.onResizeStart?.()}
          position="bottom-right"
        >
          <button
            aria-label="Resize sticky note"
            className={`nodrag nopan ${styles.resizeButton}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleResizeKeyDown}
            title="Drag to resize, or use arrow keys. Hold Shift for larger steps."
            type="button"
          >
            <Grip aria-hidden="true" size={15} />
          </button>
        </NodeResizeControl>
      )}
    </div>
  );
}
