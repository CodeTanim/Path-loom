import { describe, expect, it } from "vitest";

import {
  analyzeProject,
  checkoutProject,
  parsePathloomDocument,
  type ProjectDocument,
  type StickyNote,
} from "../../src/domain";
import {
  applyNodePositions,
  buildEditorEdges,
  buildEditorNodes,
  moveEditorNodeWithDependents,
  stickyNoteNodeId,
} from "../../src/features/editor/graph";

function createProject(): ProjectDocument & { stickyNotes: StickyNote[] } {
  return {
    ...structuredClone(checkoutProject),
    stickyNotes: [
      {
        id: "submit-payment",
        text: "Review this failure path.\nKeep the recovery action obvious.",
        position: { x: -120, y: 80 },
        size: { width: 360, height: 280 },
      },
      {
        id: "second-note",
        text: "Another independent annotation",
        position: { x: 480, y: 420 },
        size: { width: 240, height: 200 },
      },
    ],
  };
}

describe("sticky-note editor graph integration", () => {
  it("projects notes with persisted geometry, a dedicated drag handle, and no connections", () => {
    const project = createProject();
    const nodes = buildEditorNodes(project, analyzeProject(project));

    for (const note of project.stickyNotes) {
      expect(nodes.find((node) => node.id === stickyNoteNodeId(note.id))).toMatchObject({
        id: `note:${note.id}`,
        type: "stickyNote",
        position: note.position,
        width: note.size.width,
        height: note.size.height,
        style: { width: note.size.width, height: note.size.height },
        dragHandle: ".sticky-note-drag-handle",
        connectable: false,
        data: { noteId: note.id, text: note.text },
      });
    }
    expect(nodes.filter((node) => node.type === "stickyNote")).toHaveLength(2);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
  });

  it("persists a moved note without changing its text, size, or other document entities", () => {
    const project = createProject();
    const before = structuredClone(project);
    const movedPosition = { x: 710.5, y: -220 };
    const note = buildEditorNodes(project, analyzeProject(project)).find(
      (node) => node.id === stickyNoteNodeId(project.stickyNotes[0].id),
    )!;

    const updated = applyNodePositions(project, [{ ...note, position: movedPosition }]);

    expect(updated.stickyNotes?.[0]).toEqual({
      ...before.stickyNotes[0],
      position: movedPosition,
    });
    expect(updated.stickyNotes?.[1]).toEqual(before.stickyNotes[1]);
    expect(updated.nodes).toEqual(before.nodes);
    expect(updated.interactions).toEqual(before.interactions);
    expect(project).toEqual(before);

    const reloaded = parsePathloomDocument(JSON.stringify(updated))!;
    expect(buildEditorNodes(reloaded, analyzeProject(reloaded)).find(
      (node) => node.id === note.id,
    )).toMatchObject({
      position: movedPosition,
      width: before.stickyNotes[0].size.width,
      height: before.stickyNotes[0].size.height,
      data: { text: before.stickyNotes[0].text },
    });
  });

  it("moves only the chosen annotation, even when its raw ID matches an action", () => {
    const project = createProject();
    const nodes = buildEditorNodes(project, analyzeProject(project));
    const before = structuredClone(nodes);
    const noteId = stickyNoteNodeId("submit-payment");
    const note = nodes.find((node) => node.id === noteId)!;
    const nextPosition = { x: note.position.x + 140, y: note.position.y - 30 };

    const moved = moveEditorNodeWithDependents(
      project,
      nodes,
      noteId,
      nextPosition,
      note.position,
    );

    expect(moved.find((node) => node.id === noteId)).toEqual({
      ...note,
      position: nextPosition,
    });
    expect(moved.filter((node) => node.id !== noteId)).toEqual(
      before.filter((node) => node.id !== noteId),
    );
    expect(nodes).toEqual(before);
  });

  it("does not introduce note edges, change flow ports, or affect coverage findings", () => {
    const project = createProject();
    const withoutNotes = structuredClone(project);
    delete (withoutNotes as ProjectDocument).stickyNotes;
    const originalAnalysis = analyzeProject(withoutNotes);
    const analysis = analyzeProject(project);
    const edges = buildEditorEdges(project);
    const nodes = buildEditorNodes(project, analysis);

    expect(analysis).toEqual(originalAnalysis);
    expect(edges).toEqual(buildEditorEdges(withoutNotes));
    expect(edges.some((edge) =>
      edge.source.startsWith("note:") || edge.target.startsWith("note:"),
    )).toBe(false);
    expect(nodes.filter((node) => node.type !== "stickyNote")).toEqual(
      buildEditorNodes(withoutNotes, originalAnalysis),
    );
  });

  it("keeps existing geometry when the position update does not include a note", () => {
    const project = createProject();
    const updated = applyNodePositions(project, []);

    expect(updated).toEqual(project);
    expect(updated.stickyNotes).toEqual(project.stickyNotes);
  });

  it("retains backward-compatible documents with no stickyNotes property", () => {
    const project = structuredClone(checkoutProject);
    delete project.stickyNotes;
    const analysis = analyzeProject(project);

    expect(buildEditorNodes(project, analysis).some((node) => node.type === "stickyNote")).toBe(false);
    expect(applyNodePositions(project, [])).toEqual(project);
    expect(applyNodePositions(project, [])).not.toHaveProperty("stickyNotes");
  });

  it("treats an explicitly empty note collection like an annotation-free canvas", () => {
    const project = structuredClone(checkoutProject);
    delete project.stickyNotes;
    const withEmptyNotes = { ...project, stickyNotes: [] };

    expect(buildEditorNodes(withEmptyNotes, analyzeProject(withEmptyNotes))).toEqual(
      buildEditorNodes(project, analyzeProject(project)),
    );
    expect(buildEditorEdges(withEmptyNotes)).toEqual(buildEditorEdges(project));
    expect(applyNodePositions(withEmptyNotes, []).stickyNotes).toEqual([]);
  });
});
