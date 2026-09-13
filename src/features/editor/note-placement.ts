import { STICKY_NOTE_DEFAULT_HEIGHT, STICKY_NOTE_DEFAULT_WIDTH, type CanvasPosition } from "../../domain/model";

export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const INSET = 12;

function keepInside(value: number, start: number, end: number) {
  return Math.min(Math.max(value, start), Math.max(start, end));
}

/** Screen coordinates: conversion to flow space happens at the current pan/zoom. */
export function stickyNoteScreenPosition(
  bounds: CanvasBounds,
  zoom: number,
  requested?: CanvasPosition,
): CanvasPosition {
  const width = STICKY_NOTE_DEFAULT_WIDTH * zoom;
  const height = STICKY_NOTE_DEFAULT_HEIGHT * zoom;
  return {
    x: keepInside(requested?.x ?? bounds.left + (bounds.width - width) / 2,
      bounds.left + INSET, bounds.left + bounds.width - width - INSET),
    y: keepInside(requested?.y ?? bounds.top + (bounds.height - height) / 2,
      bounds.top + INSET, bounds.top + bounds.height - height - INSET),
  };
}

/** Keep the context menu inside the canvas without changing the insertion point. */
export function canvasMenuPosition(bounds: CanvasBounds, point: CanvasPosition): CanvasPosition {
  return {
    x: keepInside(point.x, bounds.left + INSET, bounds.left + bounds.width - 196 - INSET),
    y: keepInside(point.y, bounds.top + INSET, bounds.top + bounds.height - 48 - INSET),
  };
}
