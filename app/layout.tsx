import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { AppShell } from "@/components/workspace/app-shell";
import { listProjects } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { getProjectReview } from "@/lib/review/service";
import { currentOrganizationId } from "@/lib/tenancy";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Construction AI", template: "%s · Construction AI" },
  description: "Trustworthy construction project intelligence from source documents.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const organizationId = currentOrganizationId();
  const projects = await listProjects(organizationId);
  const cards = await Promise.all(projects.map(async (project) => {
    const review = await getProjectReview(organizationId, project.id);
    return {
      id: project.id,
      name: project.name,
      projectNumber: project.projectNumber,
      documentCount: project.documentCount,
      openCount: listAttention(review.findings).length,
    };
  }));
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppShell projects={cards}>{children}</AppShell>
      </body>
    </html>
  );
}
