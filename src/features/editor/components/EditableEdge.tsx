"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
} from "@xyflow/react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { EdgeRoute, OutcomeKind } from "@/domain";

export type RouteCommit = (
  edgeId: string,
  route: EdgeRoute | undefined,
) => void;

export type PathloomEdgeData = {
  interactionId?: string;
  outcomeId?: string;
  kind?: OutcomeKind;
  route?: EdgeRoute;
  editable?: boolean;
  onRouteCommit?: RouteCommit;
} & Record<string, unknown>;

export type PathloomEdge = Edge<PathloomEdgeData, "pathloom">;

type Point = { x: number; y: number };

const EXIT_DISTANCE = 18;

function direction(position: Position) {
  switch (position) {
    case Position.Left:
      return { x: -1, y: 0 };
    case Position.Right:
      return { x: 1, y: 0 };
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Bottom:
      return { x: 0, y: 1 };
  }
  return { x: 1, y: 0 };
}

function samePoint(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function simplifyPoints(points: Point[]) {
  const result: Point[] = [];
  for (const point of points) {
    if (result.at(-1) && samePoint(result.at(-1)!, point)) continue;
    const previous = result.at(-1);
    const beforePrevious = result.at(-2);
    if (
      previous &&
      beforePrevious &&
      ((beforePrevious.x === previous.x && previous.x === point.x) ||
        (beforePrevious.y === previous.y && previous.y === point.y))
    ) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
  }
  return result;
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointToward(from: Point, to: Point, amount: number): Point {
  const length = distance(from, to);
  if (length === 0) return from;
  const ratio = amount / length;
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function roundedPath(points: Point[], radius = 8) {
  const compact = simplifyPoints(points);
  if (compact.length === 0) return "";
  if (compact.length === 1) return `M ${compact[0].x} ${compact[0].y}`;

  let path = `M ${compact[0].x} ${compact[0].y}`;
  for (let index = 1; index < compact.length - 1; index += 1) {
    const previous = compact[index - 1];
    const corner = compact[index];
    const next = compact[index + 1];
    const cornerRadius = Math.min(
      radius,
      distance(previous, corner) / 2,
      distance(corner, next) / 2,
    );
    const entry = pointToward(corner, previous, cornerRadius);
    const exit = pointToward(corner, next, cornerRadius);
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const last = compact.at(-1)!;
  return `${path} L ${last.x} ${last.y}`;
}

/** Builds a free two-dimensional orthogonal route through one draggable point. */
export function buildManualEdgePath({
  source,
  sourcePosition,
  target,
  targetPosition,
  waypoint,
}: {
  source: Point;
  sourcePosition: Position;
  target: Point;
  targetPosition: Position;
  waypoint: Point;
}) {
  const sourceDirection = direction(sourcePosition);
  const targetDirection = direction(targetPosition);
  const sourceExit = {
    x: source.x + sourceDirection.x * EXIT_DISTANCE,
    y: source.y + sourceDirection.y * EXIT_DISTANCE,
  };
  const targetExit = {
    x: target.x + targetDirection.x * EXIT_DISTANCE,
    y: target.y + targetDirection.y * EXIT_DISTANCE,
  };
  const beforeWaypoint =
    sourceDirection.x === 0
      ? { x: sourceExit.x, y: waypoint.y }
      : { x: waypoint.x, y: sourceExit.y };
  const afterWaypoint =
    targetDirection.x === 0
      ? { x: waypoint.x, y: targetExit.y }
      : { x: targetExit.x, y: waypoint.y };

  return roundedPath([
    source,
    sourceExit,
    beforeWaypoint,
    waypoint,
    afterWaypoint,
    targetExit,
    target,
  ]);
}

function sameRoute(a: EdgeRoute | undefined, b: EdgeRoute | undefined) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.bendOffset.x - b.bendOffset.x) < 0.01 &&
    Math.abs(a.bendOffset.y - b.bendOffset.y) < 0.01
  );
}

function canonicalRoute(route: EdgeRoute | undefined) {
  if (
    route &&
    Math.abs(route.bendOffset.x) < 0.5 &&
    Math.abs(route.bendOffset.y) < 0.5
  ) {
    return undefined;
  }
  return route;
}

/** A Pathloom edge with a selected-only, persisted routing handle. */
export function EditableEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
  selected,
}: EdgeProps<PathloomEdge>) {
  const { screenToFlowPosition } = useReactFlow();
  const [draftRoute, setDraftRoute] = useState<
    EdgeRoute | null | undefined
  >(null);
  const routeRef = useRef<EdgeRoute | undefined>(data?.route);
  const pointerStartRef = useRef<EdgeRoute | undefined>(undefined);
  const keyboardStartRef = useRef<EdgeRoute | undefined>(undefined);
  const activePointerIdRef = useRef<number | null>(null);
  const keyboardDirtyRef = useRef(false);

  useEffect(() => {
    if (
      activePointerIdRef.current === null &&
      !keyboardDirtyRef.current
    ) {
      routeRef.current = data?.route;
      keyboardStartRef.current = data?.route;
    }
  }, [data?.route]);

  const [automaticPath, automaticCenterX, automaticCenterY] =
    getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 8,
      offset: EXIT_DISTANCE,
    });
  const activeRoute = draftRoute === null ? data?.route : draftRoute;
  const waypoint = {
    x: automaticCenterX + (activeRoute?.bendOffset.x ?? 0),
    y: automaticCenterY + (activeRoute?.bendOffset.y ?? 0),
  };
  const path = activeRoute
    ? buildManualEdgePath({
        source: { x: sourceX, y: sourceY },
        sourcePosition,
        target: { x: targetX, y: targetY },
        targetPosition,
        waypoint,
      })
    : automaticPath;
  const labelX = activeRoute ? waypoint.x : automaticCenterX;
  const labelY = (activeRoute ? waypoint.y : automaticCenterY) - 20;
  const routeLabel = typeof label === "string" ? label : "arrow";

  const routeFromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const point = screenToFlowPosition(
      { x: event.clientX, y: event.clientY },
      { snapToGrid: false },
    );
    return canonicalRoute({
      bendOffset: {
        x: Math.round(point.x - automaticCenterX),
        y: Math.round(point.y - automaticCenterY),
      },
    });
  };

  const finishPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    const nextRoute = routeFromPointer(event);
    activePointerIdRef.current = null;
    routeRef.current = nextRoute;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraftRoute(null);
    if (!sameRoute(nextRoute, pointerStartRef.current)) {
      data?.onRouteCommit?.(id, nextRoute);
    }
  };

  const cancelPointerDrag = (pointerId: number) => {
    if (activePointerIdRef.current !== pointerId) return;
    activePointerIdRef.current = null;
    routeRef.current = pointerStartRef.current;
    setDraftRoute(null);
  };

  const commitKeyboardRoute = (button?: HTMLButtonElement) => {
    if (!keyboardDirtyRef.current) return;
    keyboardDirtyRef.current = false;
    const nextRoute = canonicalRoute(routeRef.current);
    routeRef.current = nextRoute;
    keyboardStartRef.current = nextRoute;
    setDraftRoute(null);
    if (!sameRoute(nextRoute, keyboardStartRef.current)) {
      data?.onRouteCommit?.(id, nextRoute);
    }
    button?.blur();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      keyboardDirtyRef.current = false;
      routeRef.current = data?.route;
      keyboardStartRef.current = data?.route;
      setDraftRoute(null);
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      keyboardDirtyRef.current = false;
      routeRef.current = undefined;
      keyboardStartRef.current = undefined;
      setDraftRoute(null);
      if (data?.route) data.onRouteCommit?.(id, undefined);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitKeyboardRoute(event.currentTarget);
      return;
    }
    const movement: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const vector = movement[event.key];
    if (!vector) return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 10;
    const current = routeRef.current?.bendOffset ?? { x: 0, y: 0 };
    const nextRoute = {
      bendOffset: {
        x: current.x + vector.x * step,
        y: current.y + vector.y * step,
      },
    };
    keyboardDirtyRef.current = true;
    routeRef.current = nextRoute;
    setDraftRoute(nextRoute);
  };

  return (
    <>
      <BaseEdge
        interactionWidth={interactionWidth ?? 24}
        label={label}
        labelBgBorderRadius={labelBgBorderRadius}
        labelBgPadding={labelBgPadding}
        labelBgStyle={labelBgStyle}
        labelShowBg={labelShowBg}
        labelStyle={labelStyle}
        labelX={labelX}
        labelY={labelY}
        markerEnd={markerEnd}
        markerStart={markerStart}
        path={path}
        style={{ ...style, strokeLinecap: "round", strokeLinejoin: "round" }}
      />

      {selected && data?.editable && (
        <EdgeLabelRenderer>
          <button
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete Escape Enter"
            aria-label={`Drag to reroute ${routeLabel}`}
            className="nodrag nopan grid size-5 cursor-grab touch-none place-items-center rounded-full border-[3px] border-[#fffefa] bg-[#6657d9] shadow-[0_2px_8px_rgba(49,40,125,0.35)] transition-transform hover:scale-110 active:cursor-grabbing active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6657d9]"
            onBlur={() => commitKeyboardRoute()}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              keyboardDirtyRef.current = false;
              routeRef.current = undefined;
              keyboardStartRef.current = undefined;
              setDraftRoute(null);
              if (data.route) data.onRouteCommit?.(id, undefined);
            }}
            onFocus={() => {
              keyboardStartRef.current = data.route;
              routeRef.current = data.route;
            }}
            onKeyDown={handleKeyDown}
            onPointerCancel={(event) => {
              if (activePointerIdRef.current !== event.pointerId) return;
              cancelPointerDrag(event.pointerId);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerDown={(event) => {
              if (
                !event.isPrimary ||
                event.button !== 0 ||
                activePointerIdRef.current !== null
              ) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              activePointerIdRef.current = event.pointerId;
              pointerStartRef.current = data.route;
              if (keyboardDirtyRef.current) {
                keyboardDirtyRef.current = false;
              } else {
                routeRef.current = data.route;
                setDraftRoute(null);
              }
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onLostPointerCapture={(event) => {
              cancelPointerDrag(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (activePointerIdRef.current !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              const nextRoute = routeFromPointer(event);
              routeRef.current = nextRoute;
              setDraftRoute(nextRoute);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              finishPointerDrag(event);
            }}
            style={{
              pointerEvents: "all",
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${waypoint.x}px, ${waypoint.y}px)`,
            }}
            title="Drag to reroute · Arrow keys nudge · Double-click or Delete resets"
            type="button"
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-white"
            />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Stable registry for React Flow; recreating this map causes renderer warnings. */
export const pathloomEdgeTypes = {
  pathloom: EditableEdge,
} satisfies EdgeTypes;
