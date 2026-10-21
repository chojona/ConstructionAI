import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { AppShell } from "@/components/workspace/app-shell";
import { enforceLegalPublishDuringBuild, legalLinksEnabled } from "@/lib/legal/publish";
import { loadAppShell } from "@/lib/workspace/appShellData";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "ConstructionAI", template: "%s · ConstructionAI" },
  description: "Trustworthy construction project intelligence from source documents.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  enforceLegalPublishDuringBuild();
  await connection();
  const { projects, viewer, canManagePeople } = await loadAppShell();
  const showLegalLinks = legalLinksEnabled();
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppShell projects={projects} viewer={viewer} canManagePeople={canManagePeople} showLegalLinks={showLegalLinks}>{children}</AppShell>
      </body>
    </html>
  );
}
