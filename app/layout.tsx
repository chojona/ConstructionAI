import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { AppShell } from "@/components/workspace/app-shell";
import { loadAppShell } from "@/lib/workspace/appShellData";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Construction AI", template: "%s · Construction AI" },
  description: "Trustworthy construction project intelligence from source documents.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const { projects, viewer } = await loadAppShell();
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppShell projects={projects} viewer={viewer}>{children}</AppShell>
      </body>
    </html>
  );
}
