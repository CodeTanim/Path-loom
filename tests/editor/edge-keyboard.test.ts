import { Position } from "@xyflow/react";
import {
  createElement,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EdgeRoute } from "../../src/domain";
import {
  EditableEdge,
  type RouteCommit,
} from "../../src/features/editor/components/EditableEdge";

const rendered = vi.hoisted(() => ({
  capture: vi.fn<(button: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>) => void>(),
}));

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children: Parameters<typeof rendered.capture>[0] }) => {
    rendered.capture(children);
    return children;
  },
  useReactFlow: () => ({ screenToFlowPosition: (point: unknown) => point }),
}));

const route = (x: number, y: number): EdgeRoute => ({ bendOffset: { x, y } });

/**
 * Exercise the real rendered keyboard callbacks with React's real refs. The
 * Node suite does not have a DOM; canvas draft rendering is verified in-browser.
 * Only React Flow's provider/portal boundary is replaced here.
 */
function renderHandle(initialRoute?: EdgeRoute, commit = vi.fn<RouteCommit>()) {
  rendered.capture.mockClear();
  renderToStaticMarkup(createElement(EditableEdge, {
    id: "edge:pay-success",
    source: "pay",
    target: "confirmation",
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: true,
    data: { editable: true, route: initialRoute, onRouteCommit: commit },
  }));
  const element = rendered.capture.mock.lastCall?.[0];
  if (!element) throw new Error("Selected edge did not render a route handle");
  const props = element.props;
  const button = {
    blur: vi.fn(() => props.onBlur?.({ currentTarget: button } as unknown as FocusEvent<HTMLButtonElement>)),
  };
  props.onFocus?.({ currentTarget: button } as unknown as FocusEvent<HTMLButtonElement>);

  return {
    commit,
    blur: button.blur,
    key(key: string, shiftKey = false) {
      props.onKeyDown?.({
        key,
        shiftKey,
        currentTarget: button,
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent<HTMLButtonElement>);
    },
  };
}

describe("edge route keyboard editing", () => {
  it("commits accumulated nudges on Enter exactly once, including its blur", () => {
    const handle = renderHandle();
    handle.key("ArrowRight");
    handle.key("ArrowDown");
    expect(handle.commit).not.toHaveBeenCalled();

    handle.key("Enter");
    handle.blur();

    expect(handle.commit).toHaveBeenCalledExactlyOnceWith("edge:pay-success", route(10, 10));
    expect(handle.blur).toHaveBeenCalled();
  });

  it("commits a changed route when focus leaves without Enter", () => {
    const handle = renderHandle();
    handle.key("ArrowLeft");
    handle.blur();
    handle.blur();

    expect(handle.commit).toHaveBeenCalledExactlyOnceWith("edge:pay-success", route(-10, 0));
  });

  it("cancels a draft on Escape without committing on blur", () => {
    const handle = renderHandle(route(20, -30));
    handle.key("ArrowUp");
    handle.key("Escape");
    handle.blur();

    expect(handle.commit).not.toHaveBeenCalled();
  });

  it.each([undefined, route(20, -30)])("does not commit an unchanged route (%j)", (initialRoute) => {
    const handle = renderHandle(initialRoute);
    handle.key("Enter");
    handle.blur();

    expect(handle.commit).not.toHaveBeenCalled();
  });

  it.each([undefined, route(20, -30)])("does not commit net-zero nudges (%j)", (initialRoute) => {
    const handle = renderHandle(initialRoute);
    handle.key("ArrowRight");
    handle.key("ArrowLeft");
    handle.key("Enter");

    expect(handle.commit).not.toHaveBeenCalled();
  });

  it("nudges an existing manual route in one-pixel steps with Shift", () => {
    const handle = renderHandle(route(20, -30));
    handle.key("ArrowRight", true);
    handle.key("ArrowUp", true);
    handle.key("Enter");

    expect(handle.commit).toHaveBeenCalledExactlyOnceWith("edge:pay-success", route(21, -31));
  });

  it("returns to automatic routing when nudges bring the offset to zero", () => {
    const handle = renderHandle(route(10, 0));
    handle.key("ArrowLeft");
    handle.key("Enter");

    expect(handle.commit).toHaveBeenCalledExactlyOnceWith("edge:pay-success", undefined);
  });

  it("starts the next edit from the previously committed route", () => {
    const first = renderHandle();
    first.key("ArrowRight");
    first.key("Enter");
    expect(first.commit).toHaveBeenCalledExactlyOnceWith("edge:pay-success", route(10, 0));

    const second = renderHandle(first.commit.mock.calls[0][1], first.commit);
    second.key("ArrowDown");
    second.blur();

    expect(first.commit).toHaveBeenCalledTimes(2);
    expect(first.commit).toHaveBeenLastCalledWith("edge:pay-success", route(10, 10));
  });
});
