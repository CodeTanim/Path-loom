import Link from "next/link";
import { GitBranch } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./account.module.css";

export function AccountPage({
  enabled,
  children,
  returnPath = "/",
}: {
  enabled: boolean;
  children?: ReactNode;
  returnPath?: string;
}) {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        <GitBranch size={23} aria-hidden="true" />
        Pathloom
      </Link>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>YOUR FLOWS, WITH YOU</p>
        <h1>{enabled ? "Make room for your next idea." : "Keep creating as a guest."}</h1>
        <p>
          {enabled
            ? "Sign in to save your flows online and pick up where you left off."
            : "Sign-in and cloud saving aren't connected on this installation yet. You can still create and save projects on this device."}
        </p>
      </div>
      {enabled && children}
      <Link href={returnPath} className={styles.guestLink}>
        Continue as a guest <span aria-hidden="true">→</span>
      </Link>
    </main>
  );
}
