import type { ProjectDocument } from "../../domain/model";

export interface CloudProject {
  id: string;
  document: ProjectDocument;
  revision: number;
  updatedAt: string;
}
