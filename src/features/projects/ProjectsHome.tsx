"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountControls } from "@/features/account/AccountControls";
import { useAccount } from "@/features/account/AccountProvider";
import { ProjectsDashboard } from "./ProjectsDashboard";
import { createProject, duplicateProject, getProject, loadLibrary, mergeCloudProject, renameProject, saveProject, type LocalProject } from "./library";
import { listCloudProjects, projectError, saveCloudProject } from "./cloud-client";
import { acknowledgeCloudSave, combineProjects } from "./sync";

export function ProjectsHome({ cloudAvailable }: { cloudAvailable: boolean }) {
  const account = useAccount();
  return <ProjectsHomeSession key={account.userId ?? "guest"} cloudAvailable={cloudAvailable} />;
}

function ProjectsHomeSession({ cloudAvailable }: { cloudAvailable: boolean }) {
  const account = useAccount();
  const router = useRouter();
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const { userId, isLoaded } = account;

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    async function load() {
      try {
        const guest = loadLibrary(window.localStorage);
        let owned = userId ? loadLibrary(window.localStorage, userId) : [];
        if (!cancelled) { setProjects(combineProjects(guest, owned)); setError(null); }
        if (userId && cloudAvailable) {
          const remote = await listCloudProjects();
          if (cancelled) return;
          // Re-read after the network request: another tab may have saved meanwhile.
          owned = loadLibrary(window.localStorage, userId);
          for (const project of remote) {
            saveProject(window.localStorage, mergeCloudProject(owned.find((entry) => entry.id === project.id), project, userId), userId);
          }
          if (!cancelled) setProjects(combineProjects(loadLibrary(window.localStorage), loadLibrary(window.localStorage, userId)));
        }
      } catch (cause) {
        if (!cancelled) setError(projectError(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId, isLoaded, cloudAvailable, refresh]);

  function store(record: LocalProject, scope: string | null = userId) {
    const saved = saveProject(window.localStorage, record, scope);
    setProjects((current) => combineProjects(current.filter((entry) => entry.id !== saved.id), [saved]));
    setError(null);
    return saved;
  }

  function create(kind: "blank" | "example", name: string) {
    try {
      const record = store(createProject(kind, name));
      router.push(`/projects/${encodeURIComponent(record.id)}`);
    } catch (cause) { setError(projectError(cause)); }
  }

  function duplicate(id: string) {
    try {
      const record = (userId ? getProject(window.localStorage, id, userId) : undefined) ?? getProject(window.localStorage, id);
      if (record) store(duplicateProject(record));
    }
    catch (cause) { setError(projectError(cause)); }
  }

  async function rename(id: string, name: string) {
    try {
      const owned = userId ? getProject(window.localStorage, id, userId) : undefined;
      const record = owned ?? getProject(window.localStorage, id);
      if (!record) return;
      const sent = store(renameProject(record, name), owned ? userId : null);
      if (sent.cloud && userId && cloudAvailable) {
        const cloud = await saveCloudProject(sent);
        const current = loadLibrary(window.localStorage, userId).find((project) => project.id === id) ?? sent;
        store(acknowledgeCloudSave(current, sent, cloud, userId));
      }
    } catch (cause) { setError(projectError(cause)); }
  }

  return <ProjectsDashboard projects={projects} account={account} cloudAvailable={cloudAvailable}
    loading={loading || !isLoaded} error={error} onCreate={create} onDuplicate={duplicate}
    onRename={(id, name) => { void rename(id, name); }} onOpen={(id) => router.push(`/projects/${encodeURIComponent(id)}`)}
    onRefresh={() => { setLoading(true); setRefresh((value) => value + 1); }} accountControls={<AccountControls />} />;
}
