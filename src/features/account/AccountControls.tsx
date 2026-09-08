"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { LogIn } from "lucide-react";
import { usePathname } from "next/navigation";

import { useAccount } from "./AccountProvider";
import styles from "./account.module.css";

export function AccountControls({
  signInLabel = "Sign in",
  className,
}: {
  signInLabel?: string;
  className?: string;
}) {
  const { enabled, isLoaded, userId, email } = useAccount();
  const pathname = usePathname() || "/";

  if (!enabled) {
    return <span className={styles.guestLabel}>Guest</span>;
  }
  if (!isLoaded) {
    return <span className={styles.guestLabel} role="status">Loading account…</span>;
  }
  if (userId) {
    return (
      <div className={styles.userControl} title={email ?? "Your account"}>
        <UserButton />
      </div>
    );
  }

  return (
    <SignInButton
      mode="modal"
      forceRedirectUrl={pathname}
      signUpForceRedirectUrl={pathname}
    >
      <button type="button" className={className ?? styles.signInButton}>
        <LogIn size={16} aria-hidden="true" />
        {signInLabel}
      </button>
    </SignInButton>
  );
}
