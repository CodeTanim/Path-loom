"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Cloud,
  Copy,
  GitBranch,
  HardDrive,
  LoaderCircle,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { BrandMark } from "../editor/components/BrandMark";
import type { LocalProject } from "./library";
import styles from "./dashboard.module.css";

export interface ProjectsDashboardProps {
  projects: LocalProject[];
  account: {
    enabled: boolean;
    isLoaded: boolean;
    userId: string | null;
    email: string | null;
  };
  cloudAvailable: boolean;
  loading: boolean;
  error: string | null;
  accountControls?: ReactNode;
  onCreate: (kind: "blank" | "example", name: string) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRefresh: () => void;
}

type NameEditor = { kind: "create" } | { kind: "rename"; id: string; name: string };

function formattedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently edited";
  return `Edited ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)}`;
}

function FlowNameDialog({
  editor,
  onClose,
  onSave,
}: {
  editor: NameEditor;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameId = useId();
  const [name, setName] = useState(editor.kind === "rename" ? editor.name : "");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => dialog?.close();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) onSave(name.trim());
  }

  return (
    <dialog
      aria-labelledby={titleId}
      className={styles.dialog}
      onCancel={onClose}
      ref={dialogRef}
    >
      <form onSubmit={handleSubmit}>
        <div className={styles.dialogHeading}>
          <h2 id={titleId}>{editor.kind === "create" ? "Start a new flow" : "Rename flow"}</h2>
          <button aria-label="Close" className={styles.iconButton} onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <p>
          {editor.kind === "create"
            ? "Give your flow a name. You can change it anytime."
            : "Choose a name that makes this flow easy to find."}
        </p>
        <label className={styles.inputLabel} htmlFor={nameId}>Flow name</label>
        <input
          className={styles.nameInput}
          id={nameId}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Customer sign-up"
          ref={inputRef}
          required
          value={name}
        />
        <div className={styles.dialogActions}>
          <button className={styles.secondaryButton} onClick={onClose} type="button">Cancel</button>
          <button className={styles.primaryButton} disabled={!name.trim()} type="submit">
            {editor.kind === "create" ? "Create flow" : "Save name"}
            {editor.kind === "create" && <ArrowRight aria-hidden="true" size={15} />}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function FlowCard({
  project,
  onOpen,
  onDuplicate,
  onRename,
}: {
  project: LocalProject;
  onOpen: () => void;
  onDuplicate: () => void;
  onRename: () => void;
}) {
  const { document } = project;
  const screenCount = document.nodes.length;
  const outcomeCount = document.interactions.reduce((count, action) => count + action.outcomes.length, 0);
  const start = document.nodes.find((node) => node.id === document.entryNodeId);
  const stateCount = document.nodes.reduce((count, node) => count + node.states.length, 0);
  const storageLabel = project.cloud ? (project.dirty ? "Changes to sync" : "Saved online") : "On this device";

  return (
    <article className={styles.card}>
      <button aria-label={`Open ${document.name}`} className={styles.cardMain} onClick={onOpen} type="button">
        <div className={styles.cardPreview}>
          <div className={styles.previewTop}>
            <span className={styles.flowIcon}><GitBranch aria-hidden="true" size={19} /></span>
            <span className={`${styles.storageBadge} ${project.cloud && !project.dirty ? styles.cloudBadge : ""}`}>
              {project.cloud ? <Cloud aria-hidden="true" size={12} /> : <HardDrive aria-hidden="true" size={12} />}
              {storageLabel}
            </span>
          </div>
          <div className={styles.startPreview}>
            <span className={styles.startDot} aria-hidden="true" />
            <span className={styles.startLabel}>{start ? "Starts at" : "Ready to begin"}</span>
            <span className={styles.startName}>{start?.name ?? "Add your first screen"}</span>
          </div>
        </div>
        <div className={styles.cardContent}>
          <h3>{document.name}</h3>
          <div className={styles.cardStats}>
            <span><Monitor aria-hidden="true" size={13} />{screenCount} {screenCount === 1 ? "screen" : "screens"}</span>
            <span><GitBranch aria-hidden="true" size={13} />{outcomeCount} {outcomeCount === 1 ? "outcome" : "outcomes"}</span>
            <span>{stateCount} {stateCount === 1 ? "state" : "states"}</span>
          </div>
          <span className={styles.openFlow}>Open flow <ArrowRight aria-hidden="true" size={15} /></span>
        </div>
      </button>
      <div className={styles.cardFooter}>
        <time dateTime={project.updatedAt}>{formattedDate(project.updatedAt)}</time>
        <div className={styles.cardTools}>
          <button aria-label={`Rename ${document.name}`} className={styles.iconButton} onClick={onRename} title="Rename flow" type="button">
            <Pencil aria-hidden="true" size={14} />
          </button>
          <button aria-label={`Duplicate ${document.name}`} className={styles.iconButton} onClick={onDuplicate} title="Duplicate flow" type="button">
            <Copy aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProjectsDashboard({
  projects,
  account,
  cloudAvailable,
  loading,
  error,
  accountControls,
  onCreate,
  onOpen,
  onDuplicate,
  onRename,
  onRefresh,
}: ProjectsDashboardProps) {
  const [query, setQuery] = useState("");
  const [nameEditor, setNameEditor] = useState<NameEditor | null>(null);
  const searchId = useId();
  const filteredProjects = projects.filter((project) =>
    project.document.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const signedIn = Boolean(account.userId);
  const canSync = signedIn && cloudAvailable;
  const saveMessage = canSync
    ? "Save flows across devices with your account. A copy stays in this browser."
    : account.enabled && cloudAvailable
      ? "Your flows stay in this browser. Sign in to save them across devices."
      : "Your flows are saved in this browser. Cloud saving is not available yet.";

  function saveName(name: string) {
    if (nameEditor?.kind === "rename") onRename(nameEditor.id, name);
    else onCreate("blank", name);
    setNameEditor(null);
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <BrandMark />
          <span className={styles.headerDivider} aria-hidden="true" />
          <span className={styles.headerLabel}>Workspace</span>
          <div className={styles.account}>
            {account.isLoaded ? (
              <span className={styles.accountLabel}>{account.email ?? (signedIn ? "Your account" : "Guest workspace")}</span>
            ) : <span className={styles.accountLabel}>Loading account…</span>}
            {accountControls}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section aria-labelledby="flows-heading" className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>A place for every path</p>
            <h1 id="flows-heading">Your flows</h1>
            <p className={styles.intro}>Map what happens next. Make room for what could go wrong.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.secondaryButton} disabled={loading && projects.length === 0} onClick={() => onCreate("example", "Checkout example")} type="button">
              <GitBranch aria-hidden="true" size={15} />Try an example
            </button>
            <button className={styles.primaryButton} disabled={loading && projects.length === 0} onClick={() => setNameEditor({ kind: "create" })} type="button">
              <Plus aria-hidden="true" size={17} />New flow
            </button>
          </div>
        </section>

        <div className={styles.storageNotice}>
          <span className={styles.noticeIcon}>{canSync ? <Cloud aria-hidden="true" size={17} /> : <HardDrive aria-hidden="true" size={17} />}</span>
          <p>{saveMessage}</p>
          {canSync && <span className={styles.noticeTag}><Check aria-hidden="true" size={12} />Cloud workspace</span>}
        </div>

        {error && (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button className={styles.textButton} disabled={loading} onClick={onRefresh} type="button">Try again</button>
          </div>
        )}

        <section aria-label="Saved flows">
          <div className={styles.toolbar}>
            <h2>All flows <span>{projects.length}</span></h2>
            <div className={styles.toolbarTools}>
              <div className={styles.search}>
                <Search aria-hidden="true" size={15} />
                <label className={styles.srOnly} htmlFor={searchId}>Search flows</label>
                <input id={searchId} onChange={(event) => setQuery(event.target.value)} placeholder="Search flows…" type="search" value={query} />
              </div>
              <button aria-label="Refresh flows" className={styles.refreshButton} disabled={loading} onClick={onRefresh} title="Refresh flows" type="button">
                <RefreshCw aria-hidden="true" className={loading ? styles.spinning : undefined} size={16} />
              </button>
            </div>
          </div>

          {loading && projects.length === 0 ? (
            <div className={styles.empty} role="status">
              <LoaderCircle aria-hidden="true" className={styles.spinning} size={24} />
              <h3>Opening your workspace…</h3>
            </div>
          ) : filteredProjects.length > 0 ? (
            <div className={styles.grid}>
              {filteredProjects.map((project) => (
                <FlowCard
                  key={project.id}
                  onDuplicate={() => onDuplicate(project.id)}
                  onOpen={() => onOpen(project.id)}
                  onRename={() => setNameEditor({ kind: "rename", id: project.id, name: project.document.name })}
                  project={project}
                />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>{query.trim() ? <Search aria-hidden="true" size={23} /> : <GitBranch aria-hidden="true" size={25} />}</span>
              <h3>{query.trim() ? "No matching flows" : "Your next idea starts here"}</h3>
              <p>{query.trim() ? "Try a different name, or clear your search." : "Start with a screen, add an action, and explore where it leads."}</p>
              {query.trim() ? (
                <button className={styles.secondaryButton} onClick={() => setQuery("")} type="button">Clear search</button>
              ) : (
                <button className={styles.primaryButton} onClick={() => setNameEditor({ kind: "create" })} type="button"><Plus aria-hidden="true" size={16} />Create your first flow</button>
              )}
            </div>
          )}
        </section>
        <p className={styles.footerNote}>Screens, states, and every path between them.</p>
      </main>

      {nameEditor && <FlowNameDialog editor={nameEditor} onClose={() => setNameEditor(null)} onSave={saveName} />}
    </div>
  );
}
