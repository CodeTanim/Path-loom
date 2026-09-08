import { requireUser } from "../../../../lib/server/auth";
import { errorResponse, privateJson, readProjectBody } from "../../../../lib/server/http";
import { parseUpdateProjectBody, validateProjectId } from "../../../../lib/server/project-input";
import { getProject, updateProject } from "../../../../lib/server/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: ProjectRouteContext) {
  try {
    const userId = await requireUser();
    const { id } = await context.params;
    validateProjectId(id);
    return privateJson({ project: await getProject(userId, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: ProjectRouteContext) {
  try {
    const userId = await requireUser();
    const { id } = await context.params;
    validateProjectId(id);
    const { document, revision } = parseUpdateProjectBody(
      await readProjectBody(request),
      id,
    );
    return privateJson({
      project: await updateProject(userId, id, document, revision),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
