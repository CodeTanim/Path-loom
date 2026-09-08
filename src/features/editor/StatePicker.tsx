import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Eye } from "lucide-react";

import { CORE_UI_STATE_KINDS, type CoreUIStateKind, type FlowNode, type ProjectDocument, type UIState } from "@/domain";
import { getStateRemovalReason } from "./authoring";
import styles from "./state-picker.module.css";

interface StatePickerProps {
  project: ProjectDocument;
  node: FlowNode;
  previewStateId: string | null;
  disabled: boolean;
  onPreview: (stateId: string) => void;
  onAdd: (nodeId: string, kind: CoreUIStateKind) => void;
  onRemove: (nodeId: string, stateId: string) => void;
  onSetInitial: (nodeId: string, stateId: string) => void;
}

const stateLabel = (kind: string) => kind[0].toUpperCase() + kind.slice(1);

export function StatePicker({ project, node, previewStateId, disabled, onPreview, onAdd, onRemove, onSetInitial }: StatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const previewState = node.states.find((state) => state.id === previewStateId)
    ?? node.states.find((state) => state.id === node.initialStateId);
  const entries: { key: string; kind: CoreUIStateKind | "custom"; state?: UIState }[] = CORE_UI_STATE_KINDS.flatMap((kind) => {
    const supported = node.states.filter((state) => state.kind === kind);
    return supported.length
      ? supported.map((state, index) => ({ key: `${kind}-${index}`, kind, state }))
      : [{ key: `${kind}-0`, kind }];
  });
  entries.push(...node.states.filter((state) => state.kind === "custom").map((state) => ({ key: state.id, kind: state.kind, state })));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div ref={containerRef} className={styles.picker}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}>
      <button ref={triggerRef} aria-label={`States: ${previewState?.name ?? "Choose states"}`} aria-expanded={open} aria-controls={menuId}
        aria-describedby={`${menuId}-canvas${previewState?.id === node.initialStateId ? ` ${menuId}-initial` : ""}`}
        className={styles.trigger} disabled={disabled} onClick={() => setOpen((current) => !current)} type="button">
        <span className={styles.triggerCopy}><span>{previewState?.name ?? "Choose states"}</span><small id={`${menuId}-canvas`}>On canvas</small></span>
        {previewState?.id === node.initialStateId && <span className={styles.initial} id={`${menuId}-initial`}>Initial</span>}
        <ChevronDown aria-hidden="true" size={16} className={open ? styles.chevronOpen : undefined} />
      </button>
      {open && (
        <div id={menuId} className={styles.menu} role="group" aria-label="Supported states">
          <p className={styles.help}>Check states to include them. Click a name to show it on the canvas.</p>
          <div className={styles.options}>
            {entries.map(({ key, kind, state }) => {
              const name = state?.name ?? stateLabel(kind);
              const selected = Boolean(state && state.id === previewState?.id);
              const reason = state ? getStateRemovalReason(project, node.id, state.id) : null;
              const reasonId = `${menuId}-${key}-reason`;
              return (
                <div className={`${styles.option} ${selected ? styles.selected : ""}`} key={key}>
                  <input aria-label={`Support ${name}`} aria-describedby={reason ? reasonId : undefined} type="checkbox"
                    checked={Boolean(state)} disabled={disabled || Boolean(reason)}
                    onChange={(event) => {
                      if (event.target.checked && kind !== "custom") onAdd(node.id, kind);
                      else if (state) onRemove(node.id, state.id);
                    }} />
                  <div className={styles.optionBody}>
                    <button className={styles.stateName} aria-label={`${state ? "Preview" : "Add and preview"} ${name}`} aria-pressed={selected}
                      aria-describedby={state?.id === node.initialStateId ? `${menuId}-${key}-initial` : undefined}
                      disabled={disabled} type="button" onClick={() => {
                        if (state) onPreview(state.id);
                        else if (kind !== "custom") onAdd(node.id, kind);
                      }}>
                      <span>{name}</span>
                      {state?.id === node.initialStateId && <span className={styles.initial} id={`${menuId}-${key}-initial`}>Initial</span>}
                      {selected && <Eye aria-label="Shown on canvas" size={13} />}
                    </button>
                    {state && name.toLowerCase() !== kind && <small className={styles.kind}>{stateLabel(kind)}</small>}
                    {reason && <small className={styles.reason} id={reasonId}>{reason}</small>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.footer}>
            {previewState && previewState.id !== node.initialStateId ? (
              <button className={styles.setInitial} disabled={disabled} type="button" onClick={() => {
                triggerRef.current?.focus();
                onSetInitial(node.id, previewState.id);
              }}>
                Make {previewState.name} the initial state
              </button>
            ) : <span>Initial is used when arriving without a specific state.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
