import { requireUser } from "../../../lib/server/auth";
import { errorResponse, privateJson, readProjectBody } from "../../../lib/server/http";
import { parseCreateProjectBody } from "../../../lib/server/project-input";
import { createProject, listProjects } from "../../../lib/server/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUser();
    return privateJson({ projects: await listProjects(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUser();
    const document = parseCreateProjectBody(await readProjectBody(request));
    return privateJson({ project: await createProject(userId, document) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
