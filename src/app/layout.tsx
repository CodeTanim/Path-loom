import type { Metadata } from "next";
import { connection } from "next/server";
import { AccountProvider } from "@/features/account/AccountProvider";
import { serviceConfiguration } from "@/lib/server/config";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pathloom — Design every outcome",
  description:
    "A state-aware prototyping workspace for mapping user flows, failure paths, and edge cases.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--background)]"><AccountProvider enabled={serviceConfiguration().auth}>{children}</AccountProvider></body>
    </html>
  );
}
