import { describe, expect, it } from "vitest";
import { canvasMenuPosition, stickyNoteScreenPosition } from "../../src/features/editor/note-placement";

const bounds = { left: 220, top: 48, width: 930, height: 650 };

describe("sticky-note placement in the current viewport", () => {
  it.each([0.25, 0.5, 1, 1.8])("centers the full note within the canvas at zoom %s", (zoom) => {
    const point = stickyNoteScreenPosition(bounds, zoom);
    expect(point.x + 240 * zoom / 2).toBe(bounds.left + bounds.width / 2);
    expect(point.y + 200 * zoom / 2).toBe(bounds.top + bounds.height / 2);
  });

  it("uses the actual canvas rectangle instead of the whole window", () => {
    expect(stickyNoteScreenPosition({ left: 360, top: 80, width: 800, height: 500 }, 1))
      .toEqual({ x: 640, y: 230 });
  });

  it.each([0.25, 0.5, 1, 1.8])("preserves an in-bounds right-click at zoom %s", (zoom) => {
    expect(stickyNoteScreenPosition(bounds, zoom, { x: 340, y: 200 })).toEqual({ x: 340, y: 200 });
  });

  it("keeps the whole note visible near the bottom-right edge", () => {
    expect(stickyNoteScreenPosition(bounds, 1, { x: 1140, y: 690 }))
      .toEqual({ x: 898, y: 486 });
  });

  it("keeps a corner visible when the zoomed note is larger than the view", () => {
    expect(stickyNoteScreenPosition({ left: 220, top: 48, width: 300, height: 250 }, 1.8))
      .toEqual({ x: 232, y: 60 });
  });

  it.each([{ x: 950, y: -720 }, { x: -2400, y: 3800 }])("allows a panned view to convert its screen point without recentering: %j", (pan) => {
    const zoom = 0.5;
    const point = stickyNoteScreenPosition(bounds, zoom, { x: 600, y: 340 });
    // The React Flow conversion subtracts the pane origin and current pan.
    const flow = { x: (point.x - bounds.left - pan.x) / zoom, y: (point.y - bounds.top - pan.y) / zoom };
    expect({ x: flow.x * zoom + pan.x + bounds.left, y: flow.y * zoom + pan.y + bounds.top })
      .toEqual({ x: 600, y: 340 });
  });

  it("clamps the menu separately from the note insertion point", () => {
    const click = { x: 1140, y: 690 };
    expect(canvasMenuPosition(bounds, click)).toEqual({ x: 942, y: 638 });
    expect(click).toEqual({ x: 1140, y: 690 });
  });
});
