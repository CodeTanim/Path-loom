import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CanvasContextMenu } from "../../src/features/editor/components/CanvasContextMenu";

describe("canvas context menu", () => {
  it("renders one clearly named menu action with native keyboard activation", () => {
    const markup = renderToStaticMarkup(createElement(CanvasContextMenu, {
      position: { x: 350, y: 225 },
      onAddStickyNote: vi.fn(),
      onClose: vi.fn(),
    }));

    expect(markup).toContain('role="menu" aria-label="Canvas options"');
    expect(markup).toContain('type="button" role="menuitem"');
    expect(markup.match(/role="menuitem"/g)).toHaveLength(1);
    expect(markup).toContain("Add sticky note");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("uses the caller's viewport coordinates without changing canvas position", () => {
    const markup = renderToStaticMarkup(createElement(CanvasContextMenu, {
      position: { x: 475.5, y: 315.25 },
      onAddStickyNote: vi.fn(),
      onClose: vi.fn(),
    }));

    expect(markup).toContain('style="left:475.5px;top:315.25px"');
    expect(markup).toContain("nodrag nopan nowheel");
  });

  it("does not create notes or access browser effects during server rendering", () => {
    const onAddStickyNote = vi.fn();
    const onClose = vi.fn();

    expect(() => renderToStaticMarkup(createElement(CanvasContextMenu, {
      position: { x: 0, y: 0 },
      onAddStickyNote,
      onClose,
    }))).not.toThrow();
    expect(onAddStickyNote).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
