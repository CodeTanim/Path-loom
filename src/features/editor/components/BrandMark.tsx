import type { ComponentPropsWithoutRef } from "react";
import { Waypoints } from "lucide-react";

export type BrandMarkProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  /** Hides the wordmark while keeping an accessible name. */
  compact?: boolean;
};

/** Pathloom's compact path-and-branch identity mark. */
export function BrandMark({
  compact = false,
  className = "",
  ...props
}: BrandMarkProps) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 text-[#191b1f] ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[#191b1f] text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_5px_14px_rgba(25,27,31,0.16)]"
      >
        <span className="absolute -right-2 -top-3 size-6 rounded-full bg-[#ee6f4d] blur-[1px]" />
        <Waypoints className="relative size-[18px]" strokeWidth={2.25} />
      </span>

      {compact ? (
        <span className="sr-only">Pathloom</span>
      ) : (
        <span className="text-[17px] font-semibold tracking-[-0.035em]">
          pathloom
        </span>
      )}
    </span>
  );
}

export default BrandMark;
