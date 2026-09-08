import { ProjectsHome } from "@/features/projects/ProjectsHome";
import { serviceConfiguration } from "@/lib/server/config";

export default function Home() {
  return <ProjectsHome cloudAvailable={serviceConfiguration().cloud} />;
}
