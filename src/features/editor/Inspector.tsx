"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, GitBranch, Plus, Trash2, X } from "lucide-react";
import {
  type AnalysisIssue,
  type CoreUIStateKind,
  type FlowNodeKind,
  type Interaction,
  type InteractionKind,
  type InteractionTrigger,
  type Outcome,
  type OutcomeKind,
  type ProjectAnalysis,
  type ProjectDocument,
} from "@/domain";
import { StatePicker } from "./StatePicker";
import { OUTCOME_COLORS, interactionNodeId } from "./graph";
import shared from "./editor.module.css";
import styles from "./inspector.module.css";

interface InspectorProps {
  project: ProjectDocument;
  analysis: ProjectAnalysis;
  selectedId: string | null;
  coverageOpen: boolean;
  initialOutcomeId?: string | null;
  previewStateId: string | null;
  readOnly: boolean;
  onCloseCoverage: () => void;
  onPreviewState: (stateId: string) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onCreateState: (nodeId: string, kind: CoreUIStateKind) => void;
  onSetEntryNode: (nodeId: string) => void;
  onSetInitialState: (nodeId: string, stateId: string) => void;
  onSetNodeKind: (nodeId: string, kind: FlowNodeKind) => void;
  onAddInteraction: (sourceNodeId?: string) => void;
  onAddOutcome: (interactionId: string) => string;
  onSelect: (id: string) => void;
  onDeleteSelection: () => void;
  onDeleteState: (nodeId: string, stateId: string) => void;
  onDeleteOutcome: (interactionId: string, outcomeId: string) => void;
  onUpdateInteraction: (interactionId: string, patch: Partial<Pick<Interaction, "name" | "kind" | "trigger" | "sourceNodeId" | "sourceStateId">>) => void;
  onUpdateOutcome: (interactionId: string, outcomeId: string, patch: Partial<Pick<Outcome, "name" | "kind" | "target">>) => void;
  onFocusIssue: (issue: AnalysisIssue) => void;
  onFixIssue: (issue: AnalysisIssue) => void;
}

const INTERACTION_KINDS: Record<InteractionKind, string> = {
  navigation: "Go to another screen", async: "Wait for a response",
  local: "Update this screen", system: "System event",
};
const INTERACTION_TRIGGERS: InteractionTrigger[] = ["click", "submit", "change", "timer", "system"];
const OUTCOME_KINDS: Record<OutcomeKind, string> = {
  success: "Success", failure: "Error", timeout: "Timeout", offline: "Offline",
  unauthorized: "Session expired", alternate: "Other",
};
const titleCase = (value: string) => value.replaceAll("-", " ").replace(/(^|\s)\S/g, (character) => character.toUpperCase());

function issueTitle(issue: AnalysisIssue, project: ProjectDocument) {
  const nodeName = (id: string) => project.nodes.find((node) => node.id === id)?.name ?? "This screen";
  const actionName = (id: string) => project.interactions.find((action) => action.id === id)?.name ?? "This action";
  switch (issue.type) {
    case "unresolved-branch": {
      const outcome = project.interactions.find((action) => action.id === issue.branch.interactionId)?.outcomes.find((item) => item.id === issue.branch.outcomeId);
      return `${outcome?.name ?? "An outcome"} needs a destination`;
    }
    case "unreachable-node": return `${nodeName(issue.nodeId)} is not connected`;
    case "missing-state": return `${nodeName(issue.finding.nodeId)} needs a ${issue.finding.stateKind} state`;
    case "dead-end": return `${nodeName(issue.nodeId)} needs a next step or an ending`;
    case "broken-branch": return `${actionName(issue.branch.interactionId)} has a missing connection`;
    case "outcome-state-kind-mismatch": return `${actionName(issue.mismatch.interactionId)} reaches an unexpected state`;
    case "missing-entry-node": return "Choose where the flow starts";
    case "missing-outcome": return `${actionName(issue.interactionId)} needs an outcome`;
  }
}

function issueDescription(issue: AnalysisIssue) {
  switch (issue.type) {
    case "unresolved-branch": return "Choose the screen users should see when this happens.";
    case "unreachable-node": return "There is no path from the start screen to this screen yet.";
    case "missing-state": return issue.finding.reason;
    case "dead-end": return "Add an action to continue, or mark this screen as the end of the flow.";
    case "broken-branch":
      switch (issue.branch.reason) {
        case "missing-source-node": return "The screen this action belongs to was removed. Choose another screen.";
        case "missing-source-state": return "The state this action starts from was removed. Choose another state.";
        case "terminal-source-node": return "This action belongs to an ending. Choose a screen that continues the flow.";
        case "missing-target-node": return "The destination screen was removed. Choose another destination.";
        case "missing-target-state": return "The destination state was removed. Choose another state.";
        case "missing-target-initial-state": return "Choose the state to show on the destination screen.";
      }
    case "outcome-state-kind-mismatch": return `This outcome is marked ${OUTCOME_KINDS[issue.mismatch.outcomeKind].toLowerCase()}, but its destination shows ${issue.mismatch.actualStateKind}.`;
    case "missing-entry-node": return "Set a start screen and a default state before previewing.";
    case "missing-outcome": return "Add at least one possible result for this action.";
  }
}

function issueAction(issue: AnalysisIssue, project: ProjectDocument) {
  switch (issue.type) {
    case "unresolved-branch": return "Create an ending screen";
    case "unreachable-node": return "Connect this screen";
    case "missing-state": return `Add ${titleCase(issue.finding.stateKind)} state`;
    case "dead-end": return project.interactions.some((action) => action.sourceNodeId === issue.nodeId) ? "Create an ending" : "Mark as ending";
    case "broken-branch": return issue.branch.reason.startsWith("missing-source") || issue.branch.reason === "terminal-source-node" ? "Choose starting screen" : "Choose destination";
    case "outcome-state-kind-mismatch": return `Use ${titleCase(issue.mismatch.expectedStateKind)} state`;
    case "missing-entry-node": return "Set start screen";
    case "missing-outcome": return "Add outcome";
  }
}

function CoverageInspector({ project, analysis, onClose, onFocusIssue, onFixIssue }: Pick<InspectorProps, "project" | "analysis" | "onFocusIssue" | "onFixIssue"> & { onClose: () => void }) {
  return (
    <>
      <div className={styles.header}>
        <div><p className={styles.eyebrow}>Flow check</p><h2>Things to finish</h2></div>
        <button aria-label="Close flow check" className={styles.iconButton} onClick={onClose} type="button"><X size={17} aria-hidden="true" /></button>
      </div>
      <div className={styles.body}>
        <p className={styles.help}>Check the connections and states you have added. These checks update as you edit.</p>
        <p className={styles.metric}>{analysis.summary.reachableNodes} of {analysis.summary.totalNodes} screens can be reached from the start.</p>
        {analysis.issues.length === 0 ? (
          <div className={styles.clearCard}><CheckCircle2 size={22} aria-hidden="true" /><h3>No issues found in this flow</h3><p>Preview a few different outcomes to check how the journey feels.</p></div>
        ) : (
          <div className={styles.list}>
            {analysis.issues.map((issue, index) => (
              <article className={styles.issueCard} key={`${issue.type}-${index}`}>
                <div className={styles.issueHeading}><AlertTriangle size={15} aria-hidden="true" /><h3>{issueTitle(issue, project)}</h3></div>
                <p className={styles.help}>{issueDescription(issue)}</p>
                <div className={styles.buttonRow}>
                  <button className={styles.secondaryButton} onClick={() => onFocusIssue(issue)} type="button">Show in flow</button>
                  <button className={styles.textButton} onClick={() => onFixIssue(issue)} type="button">{issueAction(issue, project)}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function Inspector({
  project, analysis, selectedId, coverageOpen, initialOutcomeId, previewStateId,
  readOnly, onCloseCoverage, onPreviewState, onRenameNode, onCreateState,
  onSetEntryNode, onSetInitialState, onSetNodeKind, onAddInteraction, onAddOutcome,
  onSelect, onDeleteSelection, onDeleteState, onDeleteOutcome,
  onUpdateInteraction, onUpdateOutcome, onFocusIssue, onFixIssue,
}: InspectorProps) {
  const focusedOutcomeRef = useRef<HTMLDivElement>(null);
  const selectedNode = project.nodes.find((node) => node.id === selectedId);
  const action = project.interactions.find((item) => interactionNodeId(item.id) === selectedId);
  const sourceNode = action ? project.nodes.find((node) => node.id === action.sourceNodeId) : undefined;
  const sourceState = sourceNode?.states.find((state) => state.id === action?.sourceStateId);
  const outgoingActions = selectedNode ? project.interactions.filter((item) => item.sourceNodeId === selectedNode.id) : [];

  useEffect(() => {
    if (initialOutcomeId) focusedOutcomeRef.current?.scrollIntoView({ block: "nearest" });
  }, [initialOutcomeId]);

  if (coverageOpen) return <aside className={shared.rightPanel}><CoverageInspector project={project} analysis={analysis} onClose={onCloseCoverage} onFocusIssue={onFocusIssue} onFixIssue={onFixIssue} /></aside>;

  if (!selectedNode && !action) {
    return (
      <aside className={shared.rightPanel} aria-label="Screen and action editor">
        <div className={styles.header}><div><p className={styles.eyebrow}>Your flow</p><h2>Build one step at a time</h2></div></div>
        <div className={styles.empty}><GitBranch size={24} aria-hidden="true" /><h3>Select a screen to get started</h3><p>Give it a name, add an action, then decide where each outcome leads.</p><p>Use Preview to walk through the flow.</p></div>
      </aside>
    );
  }

  return (
    <aside className={shared.rightPanel} aria-label="Screen and action editor">
      <div className={styles.header}>
        <div><p className={styles.eyebrow}>{selectedNode ? "Screen" : "Action"}</p><h2>{selectedNode ? "Edit screen" : "What happens next?"}</h2></div>
        {selectedNode?.id === project.entryNodeId && <span className={styles.badge}>Start</span>}
      </div>
      <div className={styles.body}>
        {readOnly && <p className={styles.notice}>Close Preview to edit this flow.</p>}
        <fieldset className={styles.fieldset} disabled={readOnly}>
          <legend className={styles.srOnly}>{readOnly ? "Read-only preview details" : "Edit selected flow item"}</legend>
          {selectedNode && (
            <>
              <label className={styles.field}><span>Screen name</span>
                <input className={styles.input} defaultValue={selectedNode.name} key={`${selectedNode.id}-${selectedNode.name}`} onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (!name) event.currentTarget.value = selectedNode.name;
                  else if (name !== selectedNode.name) onRenameNode(selectedNode.id, name);
                }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              </label>
              <section className={styles.section} aria-label="Screen actions">
                <div className={styles.sectionTitle}><h3>Actions</h3><span className={styles.count}>{outgoingActions.length}</span></div>
                <p className={styles.help}>{selectedNode.kind === "terminal" ? "This screen ends the flow. Turn off the ending below to add an action." : "What can the user do on this screen?"}</p>
                {selectedNode.kind !== "terminal" && <button className={`${styles.addButton} ${styles.addOutcome}`} onClick={() => onAddInteraction(selectedNode.id)} type="button"><Plus size={15} aria-hidden="true" />Add action</button>}
                <div className={styles.list}>
                  {outgoingActions.map((item) => {
                    const scopeState = selectedNode.states.find((state) => state.id === item.sourceStateId);
                    return <button className={styles.actionCard} key={item.id} onClick={() => onSelect(interactionNodeId(item.id))} type="button"><span><strong>{item.name}</strong><small>{item.outcomes.length} outcome{item.outcomes.length === 1 ? "" : "s"}{item.sourceStateId ? ` · ${scopeState?.name ?? "Missing state"} only` : " · All states"}</small></span><ChevronRight size={16} aria-hidden="true" /></button>;
                  })}
                </div>
              </section>
              <section className={styles.section} aria-label="Screen states">
                <div className={styles.sectionTitle}><h3>States</h3><span className={styles.count}>{selectedNode.states.length}</span></div>
                <p className={styles.help}>One screen can be idle, loading, or showing an error. Choose the states it supports.</p>
                <StatePicker key={selectedNode.id} project={project} node={selectedNode} previewStateId={previewStateId} disabled={readOnly}
                  onPreview={onPreviewState} onAdd={onCreateState} onRemove={onDeleteState} onSetInitial={onSetInitialState} />
              </section>
              <section className={styles.section}>
                <label className={styles.toggle}><input type="checkbox" checked={selectedNode.kind === "terminal"} disabled={outgoingActions.length > 0} onChange={(event) => onSetNodeKind(selectedNode.id, event.target.checked ? "terminal" : "screen")} /><span>End the flow here</span></label>
                <p className={styles.help}>{outgoingActions.length > 0 ? "Remove this screen’s actions before making it an ending." : "Use this when the user’s journey is complete."}</p>
              </section>
              <details className={styles.advanced}>
                <summary>Screen settings</summary>
                {selectedNode.id === project.entryNodeId ? <p className={styles.help}>Preview starts on this screen. To delete it, set another screen as the start first.</p> : <button className={styles.secondaryButton} onClick={() => onSetEntryNode(selectedNode.id)} type="button">Start the flow here</button>}
              </details>
              <button className={styles.deleteButton} title={selectedNode.id === project.entryNodeId ? "Set another screen as the start before deleting this screen" : undefined} onClick={onDeleteSelection} type="button"><Trash2 size={14} aria-hidden="true" />Delete screen</button>
            </>
          )}
          {action && (
            <>
              {sourceNode && <button className={styles.breadcrumb} onClick={() => onSelect(sourceNode.id)} type="button"><ArrowLeft size={13} aria-hidden="true" />{sourceNode.name}</button>}
              <label className={styles.field}><span>Action name</span><input className={styles.input} placeholder="e.g. Pay, Save, Sign in" defaultValue={action.name} key={`${action.id}-${action.name}`} onBlur={(event) => {
                const name = event.target.value.trim();
                if (!name) event.currentTarget.value = action.name;
                else if (name !== action.name) onUpdateInteraction(action.id, { name });
              }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
              <p className={styles.scope}>{!sourceNode ? "Choose a starting screen in Action settings below." : action.sourceStateId ? `Available only when ${sourceNode.name} is in the ${sourceState?.name ?? "missing"} state.` : `Available in every state of ${sourceNode.name}.`}</p>
              <section className={styles.section} aria-label="Action outcomes">
                <div className={styles.sectionTitle}><h3>Possible outcomes</h3><span className={styles.count}>{action.outcomes.length}</span></div>
                <p className={styles.help}>Name each result and choose what the user sees next.</p>
                <button className={`${styles.addButton} ${styles.addOutcome}`} onClick={() => onAddOutcome(action.id)} type="button"><Plus size={15} aria-hidden="true" />Add outcome</button>
                {action.outcomes.length === 0 && <p className={styles.notice}>Add an outcome so this action has somewhere to go.</p>}
                <div className={styles.list}>
                  {action.outcomes.map((outcome, index) => {
                    const destination = project.nodes.find((node) => node.id === outcome.target?.nodeId);
                    const targetStateId = outcome.target?.stateId ?? "";
                    const targetStateIsValid = !targetStateId || destination?.states.some((state) => state.id === targetStateId);
                    return (
                      <div className={`${styles.outcomeCard} ${outcome.id === initialOutcomeId ? styles.focusedOutcome : ""}`} key={outcome.id} ref={outcome.id === initialOutcomeId ? focusedOutcomeRef : undefined}>
                        <div className={styles.outcomeHeading}><span className={styles.outcomeNumber}><i aria-hidden="true" style={{ background: OUTCOME_COLORS[outcome.kind] }} />Outcome {index + 1}</span><button className={styles.iconButton} aria-label={`Delete outcome ${outcome.name}`} title="Delete outcome" onClick={() => onDeleteOutcome(action.id, outcome.id)} type="button"><Trash2 size={14} aria-hidden="true" /></button></div>
                        <label className={styles.field}><span>When this happens</span><input className={styles.input} defaultValue={outcome.name} key={`${outcome.id}-${outcome.name}`} onBlur={(event) => {
                          const name = event.target.value.trim();
                          if (!name) event.currentTarget.value = outcome.name;
                          else if (name !== outcome.name) onUpdateOutcome(action.id, outcome.id, { name });
                        }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
                        <label className={styles.field}><span>Go to screen</span><select className={styles.select} value={outcome.target?.nodeId ?? ""} onChange={(event) => {
                          const node = project.nodes.find((item) => item.id === event.target.value);
                          onUpdateOutcome(action.id, outcome.id, { target: node ? { nodeId: node.id, stateId: null } : null });
                        }}><option value="">Choose a screen…</option>{outcome.target && !destination && <option value={outcome.target.nodeId} disabled>Screen removed — choose another</option>}{project.nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
                        {destination && <label className={styles.field}><span>Show state</span><select className={styles.select} value={targetStateId} onChange={(event) => onUpdateOutcome(action.id, outcome.id, { target: { nodeId: destination.id, stateId: event.target.value || null } })}>
                          <option value="">Default · {destination.states.find((state) => state.id === destination.initialStateId)?.name ?? "Choose a default"}</option>
                          {!targetStateIsValid && <option value={targetStateId} disabled>State removed — choose another</option>}
                          {destination.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
                        </select></label>}
                        {!destination && <p className={styles.pending}>Choose a destination to try this outcome in Preview.</p>}
                        <details className={styles.outcomeDetails}><summary>Outcome type</summary><label className={styles.field}><span className={styles.srOnly}>Outcome type for {outcome.name}</span><select className={styles.select} value={outcome.kind} onChange={(event) => onUpdateOutcome(action.id, outcome.id, { kind: event.target.value as OutcomeKind })}>{Object.entries(OUTCOME_KINDS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><p className={styles.help}>Used for branch colors and flow checks.</p></details>
                      </div>
                    );
                  })}
                </div>
              </section>
              <details className={styles.advanced}>
                <summary>Action settings</summary>
                <label className={styles.field}><span>Starting screen</span><select className={styles.select} value={action.sourceNodeId} onChange={(event) => onUpdateInteraction(action.id, { sourceNodeId: event.target.value, sourceStateId: null })}>
                  {(!sourceNode || sourceNode.kind === "terminal") && <option value={action.sourceNodeId} disabled>Choose a starting screen</option>}
                  {project.nodes.filter((node) => node.kind !== "terminal").map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select></label>
                <label className={styles.field}><span>Available in</span><select className={styles.select} value={action.sourceStateId ?? ""} disabled={!sourceNode || sourceNode.kind === "terminal"} onChange={(event) => onUpdateInteraction(action.id, { sourceStateId: event.target.value || null })}><option value="">All states</option>{action.sourceStateId && !sourceState && <option value={action.sourceStateId} disabled>State removed — choose another</option>}{sourceNode?.states.map((state) => <option key={state.id} value={state.id}>{state.name} only</option>)}</select></label>
                <label className={styles.field}><span>How it starts</span><select className={styles.select} value={action.trigger} onChange={(event) => onUpdateInteraction(action.id, { trigger: event.target.value as InteractionTrigger })}>{INTERACTION_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{titleCase(trigger)}</option>)}</select></label>
                <label className={styles.field}><span>Behavior</span><select className={styles.select} value={action.kind} onChange={(event) => onUpdateInteraction(action.id, { kind: event.target.value as InteractionKind })}>{Object.entries(INTERACTION_KINDS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
              </details>
              <button className={styles.deleteButton} onClick={onDeleteSelection} type="button"><Trash2 size={14} aria-hidden="true" />Delete action</button>
            </>
          )}
        </fieldset>
      </div>
    </aside>
  );
}
