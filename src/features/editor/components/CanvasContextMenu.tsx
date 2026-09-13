"use client";

import { StickyNote } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import styles from "./canvas-context-menu.module.css";

export interface CanvasContextMenuProps {
  position: { x: number; y: number };
  onAddStickyNote: () => void;
  onClose: () => void;
}

export function CanvasContextMenu({
  position,
  onAddStickyNote,
  onClose,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && !menuRef.current?.contains(activeElement)) {
      previousFocusRef.current = activeElement;
    }
    itemRef.current?.focus({ preventScroll: true });
  }, [position.x, position.y]);

  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onClose, { passive: true, capture: true });
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const restoreFocus = () => {
    if (previousFocusRef.current?.isConnected) {
      previousFocusRef.current.focus({ preventScroll: true });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Menu shortcuts must not select, move, or delete the canvas selection.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      restoreFocus();
      onClose();
    } else if (event.key === "Tab") {
      // Let the browser advance from the original focus target normally.
      restoreFocus();
      onClose();
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      itemRef.current?.focus({ preventScroll: true });
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Canvas options"
      className={`${styles.menu} nodrag nopan nowheel`}
      style={{ left: position.x, top: position.y }}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        ref={itemRef}
        type="button"
        role="menuitem"
        className={styles.item}
        onClick={() => {
          onClose();
          onAddStickyNote();
        }}
      >
        <StickyNote size={15} aria-hidden="true" />
        Add sticky note
      </button>
    </div>
  );
}
