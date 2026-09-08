"use client";

import { ClerkProvider, useUser } from "@clerk/nextjs";
import { createContext, useContext, type ReactNode } from "react";

export interface AccountState {
  enabled: boolean;
  isLoaded: boolean;
  userId: string | null;
  email: string | null;
}

const guestAccount: AccountState = {
  enabled: false,
  isLoaded: true,
  userId: null,
  email: null,
};

const AccountContext = createContext<AccountState>(guestAccount);

function ClerkAccount({ children }: { children: ReactNode }) {
  const { isLoaded, user } = useUser();
  return (
    <AccountContext.Provider
      value={{
        enabled: true,
        isLoaded,
        userId: user?.id ?? null,
        email: user?.primaryEmailAddress?.emailAddress ?? null,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function AccountProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) {
    return (
      <AccountContext.Provider value={guestAccount}>
        {children}
      </AccountContext.Provider>
    );
  }

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorPrimary: "#267968",
          colorForeground: "#23332d",
          colorBackground: "#fffefa",
          borderRadius: "0.8rem",
          fontFamily: '"SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        },
      }}
    >
      <ClerkAccount>{children}</ClerkAccount>
    </ClerkProvider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
