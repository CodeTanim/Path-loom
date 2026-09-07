import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pathloom — Design every outcome",
  description:
    "A state-aware prototyping workspace for mapping user flows, failure paths, and edge cases.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#f5f4ef]">{children}</body>
    </html>
  );
}
