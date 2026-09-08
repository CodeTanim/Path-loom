"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudUpload } from "lucide-react";
import type { ProjectDocument } from "@/domain";
import { AccountControls } from "@/features/account/AccountControls";
import { useAccount } from "@/features/account/AccountProvider";
import { PathloomEditor } from "@/features/editor/PathloomEditor";
import { duplicateProject, getProject, mergeCloudProject, saveProject, updateProject, type LocalProject } from "./library";
import { CloudError, getCloudProject, projectError, saveCloudProject } from "./cloud-client";
import { acknowledgeCloudSave } from "./sync";
import styles from "./workspace.module.css";

export function ProjectWorkspace({ id, cloudAvailable }: { id: string; cloudAvailable: boolean }) {
  const account = useAccount();
  if (!account.isLoaded) return <WorkspaceMessage>Loading your account…</WorkspaceMessage>;
  return <WorkspaceSession key={`${account.userId ?? "guest"}:${id}`} id={id} cloudAvailable={cloudAvailable} userId={account.userId} />;
}

function WorkspaceMessage({ children }: { children: React.ReactNode }) {
  return <main className={styles.message}><h1>Your flow</h1><div>{children}</div><Link href="/">Back to your flows</Link></main>;
}

function WorkspaceSession({ id, cloudAvailable, userId }: { id: string; cloudAvailable: boolean; userId: string | null }) {
  const [record, setRecord] = useState<LocalProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reload, setReload] = useState(0);
  const current = useRef<LocalProject | null>(null);
  const storageScope = useRef<string | null>(null);
  const lastStored = useRef<LocalProject | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const router = useRouter();

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const owned = userId ? getProject(window.localStorage, id, userId) : undefined;
        let local = owned ?? getProject(window.localStorage, id);
        if (userId && cloudAvailable && (owned?.cloud || !local)) {
          try {
            const remote = await getCloudProject(id);
            if (cancelled) return;
            local = mergeCloudProject(getProject(window.localStorage, id, userId), remote, userId);
            saveProject(window.localStorage, local, userId);
          } catch (cause) {
            if (!local) throw cause;
            if (!cancelled) setError(projectError(cause));
          }
        }
        if (!cancelled) {
          current.current = local ?? null;
          storageScope.current = owned || local?.cloud ? userId : null;
          lastStored.current = local ?? null;
          setRecord(local ?? null);
          if (!local) setError("This flow is not saved in this browser or account. Sign in to the account that owns it, or return to your flows.");
        }
      } catch (cause) { if (!cancelled) setError(projectError(cause)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [id, userId, cloudAvailable, reload]);

  const persist = useCallback((document: ProjectDocument) => {
    if (!current.current) return;
    const next = updateProject(current.current, document);
    current.current = next;
    setRecord(next);
    try {
      const latest = getProject(window.localStorage, next.id, storageScope.current);
      if (latest && lastStored.current && JSON.stringify(latest) !== JSON.stringify(lastStored.current)) {
        throw new Error("This flow changed in another tab. Your edits remain in this tab; save a copy to keep both versions.");
      }
      lastStored.current = saveProject(window.localStorage, next, storageScope.current);
      setLocalError(null);
    } catch (cause) {
      setLocalError(projectError(cause));
      throw cause;
    }
  }, []);

  const sync = useCallback(async () => {
    const sent = current.current;
    if (!sent || !userId || !cloudAvailable || inFlight.current) return;
    if (sent.cloud && sent.cloud.ownerId !== userId) return;
    try {
      const latest = getProject(window.localStorage, sent.id, storageScope.current);
      if (latest && lastStored.current && JSON.stringify(latest) !== JSON.stringify(lastStored.current)) {
        throw new Error("This flow changed in another tab. Save a copy to keep your version before uploading.");
      }
    } catch (cause) {
      setLocalError(projectError(cause));
      return;
    }
    inFlight.current = true;
    setSyncing(true);
    setError(null);
    try {
      // Claim the draft for this account before the first request. Navigation
      // during upload must not leave newer edits behind a stale guest backup.
      if (storageScope.current !== userId) {
        const owned = getProject(window.localStorage, sent.id, userId);
        if (owned) throw new CloudError("This account already has a copy of this flow. Save a separate copy to keep both versions.", 409);
        lastStored.current = saveProject(window.localStorage, sent, userId);
        storageScope.current = userId;
      }
      const cloud = await saveCloudProject(sent);
      if (!alive.current || !current.current) return;
      const next = acknowledgeCloudSave(current.current, sent, cloud, userId);
      current.current = next;
      setRecord(next);
      try {
        const latest = getProject(window.localStorage, next.id, userId);
        if (latest && lastStored.current && storageScope.current === userId && JSON.stringify(latest) !== JSON.stringify(lastStored.current)) {
          throw new Error("This flow changed in another tab during sync. Your edits remain here; save a copy to keep both versions.");
        }
        lastStored.current = saveProject(window.localStorage, next, userId);
        storageScope.current = userId;
        setLocalError(null);
      } catch (cause) { setLocalError(projectError(cause)); }
      setConflict(false);
    } catch (cause) {
      if (alive.current) {
        setError(projectError(cause));
        setConflict(cause instanceof CloudError && cause.status === 409);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setSyncing(false);
    }
  }, [userId, cloudAvailable]);

  useEffect(() => {
    if (!record?.cloud || !record.dirty || error || conflict || syncing || localError) return;
    const timer = window.setTimeout(() => { void sync(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [record, error, conflict, syncing, localError, sync]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (localError || (current.current?.cloud && current.current.dirty)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [localError]);

  function leave() {
    if (localError && !window.confirm("Your latest changes are only in this tab. Leave without saving them?")) return;
    router.push("/");
  }

  function saveCopy() {
    if (!current.current) return;
    try {
      const copy = duplicateProject(current.current);
      saveProject(window.localStorage, copy, storageScope.current);
      router.push(`/projects/${encodeURIComponent(copy.id)}`);
    } catch (cause) { setLocalError(projectError(cause)); }
  }

  if (loading) return <WorkspaceMessage>Opening your flow…</WorkspaceMessage>;
  if (!record) return <WorkspaceMessage><p role="alert">{error}</p><AccountControls /><button onClick={() => { setLoading(true); setReload((value) => value + 1); }} type="button">Try again</button></WorkspaceMessage>;

  const saveLabel = localError ? "Local save failed" : syncing ? "Saving online…" : record.cloud
    ? record.dirty ? "Saved here · sync pending" : "Saved online" : "Saved in this browser";

  return <div className={styles.workspace}>
    {(error || localError) && <div className={styles.banner} role="alert">
      <span>{localError ?? error}{conflict ? " Your edits are kept here. Save a separate copy to keep both versions." : ""}</span>
      {localError ? <><button type="button" onClick={saveCopy}>Save a copy</button><button type="button" onClick={() => { if (current.current) { try { persist(current.current.document); } catch { /* Error remains visible. */ } } }}>Retry browser save</button></>
        : conflict ? <button type="button" onClick={saveCopy}>Save a copy</button>
        : <button type="button" disabled={syncing} onClick={() => { void sync(); }}>Retry sync</button>}
    </div>}
    <PathloomEditor initialProject={record.document} onPersist={persist} onExit={leave} saveLabel={saveLabel}
      extraActions={<>
        {userId && cloudAvailable && <button className={styles.cloudButton} type="button" disabled={syncing || conflict || Boolean(localError) || Boolean(record.cloud && !record.dirty)} onClick={() => { void sync(); }}>
          <CloudUpload aria-hidden="true" size={14} />{syncing ? "Saving…" : record.cloud ? "Sync" : "Save online"}
        </button>}
        <AccountControls signInLabel="Sign in" />
      </>} />
  </div>;
}
