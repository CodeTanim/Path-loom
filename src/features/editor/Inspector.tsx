"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Copy,
  GitBranch,
  MoreHorizontal,
  Plus,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";

import {
  CORE_UI_STATE_KINDS,
  type AnalysisIssue,
  type CoreUIStateKind,
  type Interaction,
  type InteractionKind,
  type InteractionTrigger,
  type Outcome,
  type OutcomeKind,
  type ProjectAnalysis,
  type ProjectDocument,
} from "@/domain";
import { ScreenPreview } from "./components/ScreenPreview";
import { OUTCOME_COLORS, interactionNodeId, variantForState } from "./graph";
import styles from "./editor.module.css";

type InspectorTab = "details" | "states" | "logic";

interface InspectorProps {
  project: ProjectDocument;
  analysis: ProjectAnalysis;
  selectedId: string | null;
  coverageOpen: boolean;
  previewKind: CoreUIStateKind;
  onCloseCoverage: () => void;
  onPreviewKind: (kind: CoreUIStateKind) => void;
  onRenameNode: (nodeId: string, name: string) => void;
  onCreateState: (nodeId: string, kind: CoreUIStateKind) => void;
  onAddInteraction: (sourceNodeId?: string) => void;
  onAddOutcome: (interactionId: string) => string;
  onUpdateInteraction: (
    interactionId: string,
    patch: Partial<
      Pick<Interaction, "name" | "kind" | "trigger" | "sourceStateId">
    >,
  ) => void;
  onUpdateOutcome: (
    interactionId: string,
    outcomeId: string,
    patch: Partial<Pick<Outcome, "name" | "kind" | "target">>,
  ) => void;
  onFocusIssue: (issue: AnalysisIssue) => void;
  onFixIssue: (issue: AnalysisIssue) => void;
  onStubAction: (label: string) => void;
}

const INTERACTION_KINDS: InteractionKind[] = [
  "navigation",
  "async",
  "local",
  "system",
];

const INTERACTION_TRIGGERS: InteractionTrigger[] = [
  "click",
  "submit",
  "change",
  "timer",
  "system",
];

const OUTCOME_KINDS: OutcomeKind[] = [
  "success",
  "failure",
  "timeout",
  "offline",
  "unauthorized",
  "alternate",
];

const titleCase = (value: string) =>
  value
    .replaceAll("-", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());

function issueEntityId(issue: AnalysisIssue): string | null {
  switch (issue.type) {
    case "missing-entry-node":
    case "unreachable-node":
    case "dead-end":
      return issue.nodeId;
    case "missing-state":
      return issue.finding.nodeId;
    case "unresolved-branch":
      return interactionNodeId(issue.branch.interactionId);
    case "broken-branch":
      return interactionNodeId(issue.branch.interactionId);
    case "outcome-state-kind-mismatch":
      return interactionNodeId(issue.mismatch.interactionId);
  }
}

function issueTitle(issue: AnalysisIssue, project: ProjectDocument) {
  const nodeName = (id: string) =>
    project.nodes.find((node) => node.id === id)?.name ?? titleCase(id);
  const interactionName = (id: string) =>
    project.interactions.find((interaction) => interaction.id === id)?.name ??
    titleCase(id);

  switch (issue.type) {
    case "unresolved-branch": {
      const interaction = project.interactions.find(
        (item) => item.id === issue.branch.interactionId,
      );
      const outcome = interaction?.outcomes.find(
        (item) => item.id === issue.branch.outcomeId,
      );
      return `${interactionName(issue.branch.interactionId)} has an unresolved ${titleCase(outcome?.kind ?? "outcome")} branch`;
    }
    case "unreachable-node":
      return `${nodeName(issue.nodeId)} is unreachable`;
    case "missing-state":
      return `${nodeName(issue.finding.nodeId)} has no ${titleCase(issue.finding.stateKind)} state`;
    case "dead-end":
      return `${nodeName(issue.nodeId)} ends unexpectedly`;
    case "broken-branch":
      return `A branch points to missing content`;
    case "outcome-state-kind-mismatch":
      return `${interactionName(issue.mismatch.interactionId)} lands on ${titleCase(issue.mismatch.actualStateKind)} instead of ${titleCase(issue.mismatch.expectedStateKind)}`;
    case "missing-entry-node":
      return `This flow has no valid start screen`;
  }
}

function issueDescription(issue: AnalysisIssue) {
  switch (issue.type) {
    case "unresolved-branch":
      return "This outcome exists, but the simulator has nowhere to go when it happens.";
    case "unreachable-node":
      return "No journey from the start screen can reach this screen.";
    case "missing-state":
      return issue.finding.reason;
    case "dead-end":
      return "Users can arrive here, but no next action or intentional ending is defined.";
    case "broken-branch":
      return "The linked screen or state was removed and needs a new target.";
    case "outcome-state-kind-mismatch":
      return `This ${titleCase(issue.mismatch.outcomeKind)} outcome should target the ${titleCase(issue.mismatch.expectedStateKind)} presentation of its screen.`;
    case "missing-entry-node":
      return "Choose a screen where the simulator should begin.";
  }
}

function issueAction(issue: AnalysisIssue, project: ProjectDocument) {
  switch (issue.type) {
    case "unresolved-branch": {
      const interaction = project.interactions.find(
        (item) => item.id === issue.branch.interactionId,
      );
      const outcome = interaction?.outcomes.find(
        (item) => item.id === issue.branch.outcomeId,
      );
      return `Create ${titleCase(outcome?.kind ?? "target")} ending`;
    }
    case "unreachable-node":
      return "Connect to flow";
    case "missing-state":
      return `Add ${titleCase(issue.finding.stateKind)} state`;
    case "dead-end":
      return "Add ending";
    case "broken-branch":
      return "Choose target";
    case "outcome-state-kind-mismatch":
      return `Use ${titleCase(issue.mismatch.expectedStateKind)} state`;
    case "missing-entry-node":
      return "Set start screen";
  }
}

function CoverageInspector({
  project,
  analysis,
  onClose,
  onFocusIssue,
  onFixIssue,
}: Pick<
  InspectorProps,
  "project" | "analysis" | "onFocusIssue" | "onFixIssue"
> & { onClose: () => void }) {
  const issueCount = analysis.issues.length;
  const reachabilityPercent =
    analysis.summary.totalNodes === 0
      ? 0
      : Math.round(
          (analysis.summary.reachableNodes / analysis.summary.totalNodes) * 100,
        );

  return (
    <>
      <div className={styles.rightHeader}>
        <div className={styles.panelEyebrow}>Debugger</div>
        <div className={styles.panelTitleRow}>
          <h2>Flow health</h2>
          <span className={styles.statusPill}>
            <Sparkles aria-hidden="true" size={10} />
            {analysis.summary.reachableNodes}/{analysis.summary.totalNodes} reachable
          </span>
          <button
            aria-label="Close coverage"
            className={styles.iconButton}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
      <div className={styles.inspectorBody}>
        <div className={styles.healthSummary}>
          <div className={styles.healthStat}>
            <div className={styles.healthValue}>{analysis.summary.reachableNodes}</div>
            <div className={styles.healthLabel}>Reachable</div>
          </div>
          <div className={styles.healthStat}>
            <div className={styles.healthValue}>{analysis.summary.unresolvedBranches}</div>
            <div className={styles.healthLabel}>Open paths</div>
          </div>
          <div className={styles.healthStat}>
            <div className={styles.healthValue}>{analysis.summary.missingStates}</div>
            <div className={styles.healthLabel}>States</div>
          </div>
        </div>
        <div
          className={styles.healthBar}
          aria-label={`${analysis.summary.reachableNodes} of ${analysis.summary.totalNodes} screens reachable`}
        >
          <div
            className={styles.healthBarFill}
            style={{ width: `${reachabilityPercent}%` }}
          />
        </div>

        <section className={styles.sectionBlock}>
          <h3 className={styles.sectionHeading}>
            {issueCount > 0 ? `${issueCount} findings` : "All clear"}
          </h3>
          <p className={styles.coverageIntro}>
            Pathloom traces every reachable branch and checks whether each outcome
            lands in a deliberate UI state.
          </p>

          {issueCount === 0 ? (
            <div className={styles.successCard}>
              <span className={styles.successIcon}>
                <CheckCircle2 aria-hidden="true" size={18} />
              </span>
              <h3>Every path is handled</h3>
              <p>No missing states, dangling branches, or unreachable screens.</p>
            </div>
          ) : (
            <div className={styles.issueList}>
              {analysis.issues.map((issue, index) => (
                <article className={styles.issueCard} key={`${issue.type}-${index}`}>
                  <button
                    className="w-full border-0 bg-transparent p-0 text-left"
                    onClick={() => onFocusIssue(issue)}
                    type="button"
                  >
                    <div className={styles.issueMeta}>
                      <AlertTriangle aria-hidden="true" size={10} />
                      {issue.severity} · {issueEntityId(issue)}
                    </div>
                    <h4 className={styles.issueTitle}>{issueTitle(issue, project)}</h4>
                    <p className={styles.issueBody}>{issueDescription(issue)}</p>
                  </button>
                  <button
                    className={styles.issueAction}
                    onClick={() => onFixIssue(issue)}
                    type="button"
                  >
                    <WandSparkles aria-hidden="true" size={10} />
                    {issueAction(issue, project)}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function Inspector({
  project,
  analysis,
  selectedId,
  coverageOpen,
  previewKind,
  onCloseCoverage,
  onPreviewKind,
  onRenameNode,
  onCreateState,
  onAddInteraction,
  onAddOutcome,
  onUpdateInteraction,
  onUpdateOutcome,
  onFocusIssue,
  onFixIssue,
  onStubAction,
}: InspectorProps) {
  const selectedNode = project.nodes.find((node) => node.id === selectedId);
  const selectedInteraction = project.interactions.find(
    (interaction) => interactionNodeId(interaction.id) === selectedId,
  );
  const [activeTab, setActiveTab] = useState<InspectorTab>(() =>
    selectedInteraction ? "logic" : "states",
  );
  const [editingOutcomeId, setEditingOutcomeId] = useState<string | null>(
    () => selectedInteraction?.outcomes[0]?.id ?? null,
  );

  const selectedPreviewState = selectedNode?.states.find(
    (state) => state.kind === previewKind,
  );
  const defaultKind = selectedNode?.states.find(
    (state) => state.id === selectedNode.initialStateId,
  )?.kind;
  const previewVariant = variantForState(
    previewKind,
    variantForState(defaultKind, "checkout"),
  );

  const outgoingInteractions = selectedNode
    ? project.interactions.filter(
        (interaction) => interaction.sourceNodeId === selectedNode.id,
      )
    : [];
  const sourceNode = selectedInteraction
    ? project.nodes.find((node) => node.id === selectedInteraction.sourceNodeId)
    : undefined;
  const editingOutcome = selectedInteraction?.outcomes.find(
    (outcome) => outcome.id === editingOutcomeId,
  );
  const editingTargetNode = editingOutcome?.target
    ? project.nodes.find((node) => node.id === editingOutcome.target?.nodeId)
    : undefined;

  if (coverageOpen) {
    return (
      <aside className={styles.rightPanel}>
        <CoverageInspector
          analysis={analysis}
          onClose={onCloseCoverage}
          onFixIssue={onFixIssue}
          onFocusIssue={onFocusIssue}
          project={project}
        />
      </aside>
    );
  }

  if (!selectedNode && !selectedInteraction) {
    return (
      <aside className={styles.rightPanel}>
        <div className={styles.rightHeader}>
          <div className={styles.panelEyebrow}>Inspector</div>
          <div className={styles.panelTitleRow}>
            <h2>Nothing selected</h2>
          </div>
        </div>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <GitBranch aria-hidden="true" size={18} />
          </span>
          Select a screen, action, or outcome to inspect its states and logic.
        </div>
      </aside>
    );
  }

  const title = selectedNode?.name ?? selectedInteraction?.name ?? "Selection";
  const eyebrow = selectedNode ? "Screen" : "Interaction";

  return (
    <aside className={styles.rightPanel}>
      <div className={styles.rightHeader}>
        <div className={styles.panelEyebrow}>{eyebrow}</div>
        <div className={styles.panelTitleRow}>
          <h2>{title}</h2>
          <span className={styles.statusPill}>
            <CircleDot aria-hidden="true" size={9} />
            In flow
          </span>
          <button
            aria-label="More options"
            className={styles.iconButton}
            onClick={() => onStubAction("More editing actions are coming next")}
            type="button"
          >
            <MoreHorizontal aria-hidden="true" size={15} />
          </button>
        </div>
      </div>

      <div aria-label="Inspector tabs" className={styles.tabList} role="tablist">
        {(["details", "states", "logic"] as InspectorTab[]).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={`${styles.tabButton} ${activeTab === tab ? styles.tabActive : ""}`}
            disabled={tab === "states" && Boolean(selectedInteraction)}
            key={tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            type="button"
          >
            {titleCase(tab)}
          </button>
        ))}
      </div>

      <div className={styles.inspectorBody}>
        {selectedNode && activeTab === "details" && (
          <>
            <div className={styles.field}>
              <label
                className={styles.fieldLabel}
                htmlFor={`screen-name-${selectedNode.id}`}
              >
                Name
              </label>
              <input
                className={styles.editorInput}
                defaultValue={selectedNode.name}
                id={`screen-name-${selectedNode.id}`}
                key={`${selectedNode.id}-${selectedNode.name}`}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== selectedNode.name) {
                    onRenameNode(selectedNode.id, value);
                  }
                }}
              />
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Route</div>
              <div className={styles.fieldValue}>
                <code>/{selectedNode.id}</code>
                <Copy aria-hidden="true" size={11} />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Purpose</div>
              <div className={styles.fieldValue}>
                {selectedNode.description ?? "A step in this user journey."}
              </div>
            </div>
          </>
        )}

        {selectedNode && activeTab === "states" && (
          <>
            <div className={styles.previewCard}>
              <div className={styles.previewTopline}>
                <span>State debugger</span>
                <span>{titleCase(previewKind)}</span>
              </div>
              <ScreenPreview variant={previewVariant} />
            </div>

            <section className={styles.sectionBlock}>
              <h3 className={styles.sectionHeading}>UI states</h3>
              <div className={styles.stateList}>
                {CORE_UI_STATE_KINDS.map((kind) => {
                  const state = selectedNode.states.find((item) => item.kind === kind);
                  const selected = previewKind === kind;
                  return (
                    <button
                      className={`${styles.stateRow} ${selected ? styles.stateSelected : ""}`}
                      key={kind}
                      onClick={() => onPreviewKind(kind)}
                      type="button"
                    >
                      <span className={styles.stateIcon}>
                        {state ? (
                          <Check aria-hidden="true" size={10} />
                        ) : (
                          <Plus aria-hidden="true" size={10} />
                        )}
                      </span>
                      <span className={styles.stateName}>{titleCase(kind)}</span>
                      <span
                        className={`${styles.stateStatus} ${state ? "" : styles.stateMissing}`}
                      >
                        {state ? "Defined" : "Missing"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.actionRow}>
                {!selectedPreviewState && (
                  <button
                    className={styles.stateAction}
                    onClick={() => onCreateState(selectedNode.id, previewKind)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={10} />
                    Create {titleCase(previewKind)} state
                  </button>
                )}
                <button
                  aria-label="Duplicate state"
                  className={styles.miniAction}
                  onClick={() => onStubAction("State duplication is queued for the full editor")}
                  title="Duplicate from another state"
                  type="button"
                >
                  <Copy aria-hidden="true" size={11} />
                </button>
              </div>
            </section>
          </>
        )}

        {selectedNode && activeTab === "logic" && (
          <section>
            <h3 className={styles.sectionHeading}>Outgoing actions</h3>
            {outgoingInteractions.length === 0 ? (
              <div className={styles.emptyState}>
                No action leaves this screen yet.
                <div className={styles.actionRow}>
                  <button
                    className={styles.stateAction}
                    onClick={() => onAddInteraction(selectedNode.id)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={10} /> Add action
                  </button>
                </div>
              </div>
            ) : (
              outgoingInteractions.map((interaction) => (
                <div className={styles.field} key={interaction.id}>
                  <div className={styles.fieldLabel}>{interaction.name}</div>
                  <div className={styles.fieldValue}>
                    <code>{interaction.trigger}</code>
                    <span>{interaction.outcomes.length} outcomes</span>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {selectedInteraction && activeTab === "details" && (
          <>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Trigger</div>
              <div className={styles.fieldValue}>
                <span>{titleCase(selectedInteraction.trigger)}</span>
                <code>
                  {selectedInteraction.sourceStateId
                    ? sourceNode?.states.find(
                        (state) => state.id === selectedInteraction.sourceStateId,
                      )?.name ?? "Missing state"
                    : "All states"}
                </code>
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Behavior</div>
              <div className={styles.fieldValue}>
                <span>{titleCase(selectedInteraction.kind)}</span>
                <span>{selectedInteraction.outcomes.length} branches</span>
              </div>
            </div>
          </>
        )}

        {selectedInteraction && activeTab === "logic" && (
          <>
            <div className={styles.editorGrid}>
              <label className={styles.editorField}>
                <span>Interaction name</span>
                <input
                  className={styles.editorInput}
                  defaultValue={selectedInteraction.name}
                  key={`${selectedInteraction.id}-${selectedInteraction.name}`}
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== selectedInteraction.name) {
                      onUpdateInteraction(selectedInteraction.id, { name });
                    }
                  }}
                />
              </label>
              <label className={styles.editorField}>
                <span>Trigger</span>
                <select
                  className={styles.editorSelect}
                  onChange={(event) =>
                    onUpdateInteraction(selectedInteraction.id, {
                      trigger: event.target.value as InteractionTrigger,
                    })
                  }
                  value={selectedInteraction.trigger}
                >
                  {INTERACTION_TRIGGERS.map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {titleCase(trigger)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.editorField}>
                <span>Source state</span>
                <select
                  className={styles.editorSelect}
                  onChange={(event) =>
                    onUpdateInteraction(selectedInteraction.id, {
                      sourceStateId: event.target.value || null,
                    })
                  }
                  value={selectedInteraction.sourceStateId ?? ""}
                >
                  <option value="">All states</option>
                  {sourceNode?.states.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.name} · {titleCase(state.kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.editorField}>
                <span>Behavior</span>
                <select
                  className={styles.editorSelect}
                  onChange={(event) =>
                    onUpdateInteraction(selectedInteraction.id, {
                      kind: event.target.value as InteractionKind,
                    })
                  }
                  value={selectedInteraction.kind}
                >
                  {INTERACTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {titleCase(kind)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldValue}>
                <span>{sourceNode?.name ?? "Missing source"}</span>
                <code>{selectedInteraction.outcomes.length} outcomes</code>
              </div>
            </div>
            <section className={styles.sectionBlock}>
              <h3 className={styles.sectionHeading}>Outcomes</h3>
              <div className={styles.outcomeList}>
                {selectedInteraction.outcomes.map((outcome) => {
                  const target = project.nodes.find(
                    (node) => node.id === outcome.target?.nodeId,
                  );
                  const targetState = target?.states.find(
                    (state) =>
                      state.id === (outcome.target?.stateId ?? target.initialStateId),
                  );
                  return (
                    <button
                      aria-pressed={editingOutcomeId === outcome.id}
                      className={`${styles.outcomeRow} ${
                        editingOutcomeId === outcome.id
                          ? styles.outcomeRowActive
                          : ""
                      }`}
                      key={outcome.id}
                      onClick={() => setEditingOutcomeId(outcome.id)}
                      type="button"
                    >
                      <span aria-hidden="true" className={styles.dragDots}>⠿</span>
                      <span
                        aria-hidden="true"
                        className={styles.semanticDot}
                        style={{ background: OUTCOME_COLORS[outcome.kind] }}
                      />
                      <div className={styles.outcomeCopy}>
                        <div className={styles.outcomeLabel}>{outcome.name}</div>
                        <div className={styles.outcomeTarget}>
                          {target
                            ? `→ ${target.name} · ${targetState?.name ?? "invalid state"}`
                            : "→ Choose target"}
                        </div>
                      </div>
                      <ChevronRight aria-hidden="true" color="#9aa19c" size={11} />
                    </button>
                  );
                })}
              </div>

              {editingOutcome && (
                <div className={styles.outcomeEditor}>
                  <div className={styles.outcomeEditorTitle}>Edit outcome</div>
                  <div className={styles.editorGrid}>
                    <label className={styles.editorField}>
                      <span>Name</span>
                      <input
                        className={styles.editorInput}
                        defaultValue={editingOutcome.name}
                        key={`${editingOutcome.id}-${editingOutcome.name}`}
                        onBlur={(event) => {
                          const name = event.target.value.trim();
                          if (name && name !== editingOutcome.name) {
                            onUpdateOutcome(
                              selectedInteraction.id,
                              editingOutcome.id,
                              { name },
                            );
                          }
                        }}
                      />
                    </label>
                    <label className={styles.editorField}>
                      <span>Kind</span>
                      <select
                        className={styles.editorSelect}
                        onChange={(event) =>
                          onUpdateOutcome(
                            selectedInteraction.id,
                            editingOutcome.id,
                            { kind: event.target.value as OutcomeKind },
                          )
                        }
                        value={editingOutcome.kind}
                      >
                        {OUTCOME_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {titleCase(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.editorField}>
                      <span>Target screen</span>
                      <select
                        className={styles.editorSelect}
                        onChange={(event) => {
                          const targetNode = project.nodes.find(
                            (node) => node.id === event.target.value,
                          );
                          onUpdateOutcome(
                            selectedInteraction.id,
                            editingOutcome.id,
                            {
                              target: targetNode
                                ? { nodeId: targetNode.id, stateId: null }
                                : null,
                            },
                          );
                        }}
                        value={editingOutcome.target?.nodeId ?? ""}
                      >
                        <option value="">Unresolved</option>
                        {project.nodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.editorField}>
                      <span>Target state</span>
                      <select
                        className={styles.editorSelect}
                        disabled={!editingTargetNode}
                        onChange={(event) => {
                          if (!editingTargetNode) return;
                          onUpdateOutcome(
                            selectedInteraction.id,
                            editingOutcome.id,
                            {
                              target: {
                                nodeId: editingTargetNode.id,
                                stateId:
                                  event.target.value === "__initial__"
                                    ? null
                                    : event.target.value,
                              },
                            },
                          );
                        }}
                        value={editingOutcome.target?.stateId ?? "__initial__"}
                      >
                        <option value="__initial__">
                          Initial state
                          {editingTargetNode
                            ? ` · ${
                                editingTargetNode.states.find(
                                  (state) =>
                                    state.id === editingTargetNode.initialStateId,
                                )?.name ?? "invalid"
                              }`
                            : ""}
                        </option>
                        {editingTargetNode?.states.map((state) => (
                          <option key={state.id} value={state.id}>
                            {state.name} · {titleCase(state.kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              <div className={styles.actionRow}>
                <button
                  className={styles.stateAction}
                  onClick={() => {
                    const outcomeId = onAddOutcome(selectedInteraction.id);
                    setEditingOutcomeId(outcomeId);
                  }}
                  type="button"
                >
                  <Plus aria-hidden="true" size={10} /> Add outcome
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
