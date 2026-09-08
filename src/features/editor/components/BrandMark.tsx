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
      className={`inline-flex items-center gap-2 text-inherit ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-[5px] bg-[#72e4b1] text-[#143529]"
      >
        <Waypoints className="size-[18px]" strokeWidth={2} />
      </span>

      {compact ? (
        <span className="sr-only">Pathloom</span>
      ) : (
        <span className="text-[15px] font-semibold tracking-[-0.025em]">
          pathloom
        </span>
      )}
    </span>
  );
}

export default BrandMark;
