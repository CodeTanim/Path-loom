"use client";

import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  CircleAlert,
  CircleDot,
  GitBranch,
  Monitor,
  MousePointerClick,
  Play,
} from "lucide-react";

import {
  ScreenPreview,
  type ScreenPreviewVariant,
} from "./ScreenPreview";

export type ScreenNodeData = {
  label: string;
  route: string;
  variant: ScreenPreviewVariant;
  stateLabel: string;
  stateCount: number;
  description?: string;
  isStart?: boolean;
  canStartInteractions?: boolean;
  warning?: boolean | string;
  active?: boolean;
  dimmed?: boolean;
  inputSides: ConnectorSide[];
  outputSides: ConnectorSide[];
};

export type InteractionNodeData = {
  label: string;
  trigger: string;
  sourceStateLabel: string;
  outcomeCount: number;
  active?: boolean;
  dimmed?: boolean;
  inputSides: ConnectorSide[];
  outputSides: ConnectorSide[];
};

export type ConnectorSide = "left" | "right";

export type PathloomScreenNode = Node<ScreenNodeData, "screen">;
export type PathloomInteractionNode = Node<
  InteractionNodeData,
  "interaction"
>;

const handleClassName =
  "nodrag nopan !size-3 !border-[3px] !border-[#fffefa] !bg-[#6657d9] shadow-[0_0_0_1px_rgba(102,87,217,0.35)] transition-transform hover:!scale-125";

const connectorSides = ["left", "right"] as const;

const handlePosition: Record<ConnectorSide, Position> = {
  left: Position.Left,
  right: Position.Right,
};

function handleOffset(type: "source" | "target") {
  return { top: type === "target" ? "42%" : "58%" };
}

function handleVisibility(active: boolean, isConnectable: boolean) {
  if (active) return "!opacity-100";
  return isConnectable
    ? "!opacity-0 group-hover:!opacity-55 hover:!opacity-100"
    : "pointer-events-none !opacity-0";
}

function ConnectorHandles({
  allowOutput = true,
  inputSides,
  isConnectable,
  label,
  outputSides,
}: {
  allowOutput?: boolean;
  inputSides: ConnectorSide[];
  isConnectable: boolean;
  label: string;
  outputSides: ConnectorSide[];
}) {
  return (
    <>
      {connectorSides.map((side) => (
        <Handle
          aria-label={`Connect an incoming path to ${label} from the ${side}`}
          className={`${handleClassName} ${handleVisibility(inputSides.includes(side), isConnectable)}`}
          id={`in-${side}`}
          isConnectable={isConnectable}
          isConnectableStart={false}
          key={`in-${side}`}
          position={handlePosition[side]}
          style={handleOffset("target")}
          title={`Incoming path to ${label}`}
          type="target"
        />
      ))}
      {connectorSides.map((side) => (
        <Handle
          aria-label={`Start an outgoing path from ${label} on the ${side}`}
          className={`${handleClassName} ${handleVisibility(outputSides.includes(side), isConnectable && allowOutput)}`}
          id={`out-${side}`}
          isConnectable={isConnectable && allowOutput}
          isConnectableEnd={false}
          key={`out-${side}`}
          position={handlePosition[side]}
          style={{
            ...handleOffset("source"),
            zIndex: 2,
          }}
          title={`Outgoing path from ${label}`}
          type="source"
        />
      ))}
    </>
  );
}

const stateTone: Record<ScreenPreviewVariant, string> = {
  checkout: "bg-[#eeebff] text-[#594bc7]",
  loading: "bg-[#eeebff] text-[#594bc7]",
  success: "bg-[#e5f4ef] text-[#267968]",
  error: "bg-[#fae9e6] text-[#b7473f]",
  retry: "bg-[#fff2d8] text-[#a05d0b]",
  login: "bg-[#f0efeb] text-[#5d5f65]",
  orders: "bg-[#e5f4ef] text-[#267968]",
};

function nodeFrameClass({
  active,
  dimmed,
  selected,
}: {
  active?: boolean;
  dimmed?: boolean;
  selected: boolean;
}) {
  const border = active
    ? "border-[#ee6f4d] shadow-[0_0_0_3px_rgba(238,111,77,0.14),0_12px_28px_rgba(25,27,31,0.12)]"
    : selected
      ? "border-[#6657d9] shadow-[0_0_0_3px_rgba(102,87,217,0.13),0_10px_25px_rgba(25,27,31,0.1)]"
      : "border-[#d9d7cf] shadow-[0_7px_20px_rgba(25,27,31,0.09)] hover:border-[#c7c4bb] hover:shadow-[0_10px_26px_rgba(25,27,31,0.11)]";

  return `${border} ${dimmed ? "opacity-35 grayscale-[0.35]" : "opacity-100"}`;
}

/** A screen/state card rendered as a React Flow node. */
export function ScreenNode({
  data,
  isConnectable,
  selected,
}: NodeProps<PathloomScreenNode>) {
  const warningText =
    typeof data.warning === "string" ? data.warning : "Coverage issue";
  const stateCountLabel = `${data.stateCount} ${data.stateCount === 1 ? "state" : "states"}`;
  const accessibleLabel = [
    data.isStart ? "Start screen" : "Screen",
    data.label,
    `current state ${data.stateLabel}`,
    stateCountLabel,
    data.warning ? warningText : undefined,
    data.active ? "active in simulation" : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      aria-label={accessibleLabel}
      className={`group relative w-[246px] rounded-[16px] border bg-[#fffefa] p-2.5 text-[#191b1f] transition-[border-color,box-shadow,opacity,filter] duration-200 ${nodeFrameClass({ active: data.active, dimmed: data.dimmed, selected })}`}
      role="group"
    >
      <ConnectorHandles
        allowOutput={data.canStartInteractions !== false}
        inputSides={data.inputSides}
        isConnectable={isConnectable}
        label={data.label}
        outputSides={data.outputSides}
      />

      <div className="mb-2 flex items-start justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#f0efeb] text-[#5e6066]">
            <Monitor className="size-3.5" strokeWidth={2.1} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold leading-[16px] tracking-[-0.015em]">
              {data.label}
            </span>
            <span className="block truncate font-mono text-[8.5px] leading-[13px] text-[#87847c]">
              Screen
            </span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {data.isStart && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#191b1f] px-1.5 py-1 text-[7px] font-bold uppercase leading-none tracking-[0.08em] text-white">
              <Play className="size-2 fill-current" strokeWidth={2.4} aria-hidden="true" />
              Start
            </span>
          )}
          {data.warning && (
            <span
              aria-label={warningText}
              className="grid size-5 place-items-center rounded-full bg-[#fff2d8] text-[#a05d0b]"
              role="img"
              title={warningText}
            >
              <CircleAlert className="size-3" strokeWidth={2.3} aria-hidden="true" />
            </span>
          )}
        </div>
      </div>

      <ScreenPreview
        compact
        description={data.description}
        screenName={data.label}
        stateName={data.stateLabel}
        variant={data.variant}
      />

      <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
        <span
          className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-semibold leading-none ${stateTone[data.variant]}`}
        >
          <CircleDot className="size-2.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
          <span className="truncate">{data.stateLabel}</span>
        </span>
        <span className="shrink-0 text-[8px] font-medium text-[#817e76]">
          {stateCountLabel}
        </span>
      </div>

      {data.active && (
        <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex size-4" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ee6f4d] opacity-35 motion-reduce:animate-none" />
          <span className="relative inline-flex size-4 rounded-full border-[3px] border-[#fffefa] bg-[#ee6f4d]" />
        </span>
      )}

    </div>
  );
}

/** A user action that fans out into one or more outcomes. */
export function InteractionNode({
  data,
  isConnectable,
  selected,
}: NodeProps<PathloomInteractionNode>) {
  const outcomeLabel = `${data.outcomeCount} ${data.outcomeCount === 1 ? "outcome" : "outcomes"}`;

  return (
    <div
      aria-label={`Interaction ${data.label}, trigger ${data.trigger}, from ${data.sourceStateLabel}, ${outcomeLabel}${data.active ? ", active in simulation" : ""}`}
      className={`group relative w-[202px] rounded-[14px] border bg-[#fffefa] px-3 py-2.5 text-[#191b1f] transition-[border-color,box-shadow,opacity,filter] duration-200 ${nodeFrameClass({ active: data.active, dimmed: data.dimmed, selected })}`}
      role="group"
    >
      <ConnectorHandles
        inputSides={data.inputSides}
        isConnectable={isConnectable}
        label={`${data.label} interaction`}
        outputSides={data.outputSides}
      />

      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[#eeebff] text-[#594bc7]">
          <MousePointerClick className="size-4" strokeWidth={2.1} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold leading-4 tracking-[-0.01em]">
            {data.label}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="max-w-[86px] truncate rounded-[4px] bg-[#f1f0eb] px-1.5 py-0.5 font-mono text-[7.5px] font-medium leading-[11px] text-[#676970]">
              {data.trigger}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[7.5px] font-semibold text-[#6657d9]">
              <GitBranch className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
              {outcomeLabel}
            </span>
          </div>
          <div className="mt-1 truncate text-[7.5px] font-medium text-[#85827b]">
            From {data.sourceStateLabel}
          </div>
        </div>
      </div>

      {data.active && (
        <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex size-4" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ee6f4d] opacity-35 motion-reduce:animate-none" />
          <span className="relative inline-flex size-4 rounded-full border-[3px] border-[#fffefa] bg-[#ee6f4d]" />
        </span>
      )}

    </div>
  );
}

/** Stable registry for use with React Flow's `nodeTypes` prop. */
export const screenNodeTypes = {
  screen: ScreenNode,
  interaction: InteractionNode,
} satisfies NodeTypes;
