import { CircleAlert, CircleCheck, CircleDot, LoaderCircle, LockKeyhole, WifiOff } from "lucide-react";

import styles from "../preview.module.css";

// Retained for persisted graph previews and existing callers. These control the
// visual tone only; they no longer imply a prebuilt checkout or sign-in screen.
export type ScreenPreviewVariant =
  | "checkout"
  | "loading"
  | "success"
  | "error"
  | "retry"
  | "login"
  | "orders";

export type ScreenPreviewProps = {
  variant: ScreenPreviewVariant;
  compact?: boolean;
  screenName?: string;
  stateName?: string;
  description?: string;
};

const tones = {
  checkout: { icon: CircleDot, color: "#6657d9", name: "Idle" },
  loading: { icon: LoaderCircle, color: "#6657d9", name: "Loading" },
  success: { icon: CircleCheck, color: "#267968", name: "Success" },
  error: { icon: CircleAlert, color: "#b7473f", name: "Error" },
  retry: { icon: WifiOff, color: "#a05d0b", name: "Offline" },
  login: { icon: LockKeyhole, color: "#676970", name: "Unauthorized" },
  orders: { icon: CircleDot, color: "#676970", name: "Empty" },
} satisfies Record<ScreenPreviewVariant, { icon: typeof CircleDot; color: string; name: string }>;

/** An honest state summary, not an invented application mockup. */
export function ScreenPreview({
  variant,
  compact = false,
  screenName = "Screen",
  stateName,
  description,
}: ScreenPreviewProps) {
  const tone = tones[variant];
  const Icon = tone.icon;
  const label = stateName ?? tone.name;

  return (
    <div
      aria-label={`${screenName}, ${label} state`}
      className={`${styles.stateCard} ${compact ? styles.stateCardCompact : ""}`}
    >
      <span className={styles.stateCardIcon} style={{ color: tone.color }}>
        <Icon aria-hidden="true" size={compact ? 15 : 20} strokeWidth={1.8} />
      </span>
      <div className={styles.stateCardBody}>
        <span className={styles.stateCardLabel}>State preview</span>
        <strong>{label}</strong>
        {description ? <p>{description}</p> : !compact ? <p>No description added yet.</p> : null}
      </div>
    </div>
  );
}

export default ScreenPreview;
