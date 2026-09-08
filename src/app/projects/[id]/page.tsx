import { ProjectWorkspace } from "@/features/projects/ProjectWorkspace";
import { serviceConfiguration } from "@/lib/server/config";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectWorkspace id={id} cloudAvailable={serviceConfiguration().cloud} />;
}
