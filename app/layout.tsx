import type { Metadata } from "next";
import { AppShell } from "@/components/workspace/app-shell";
import { listProjects } from "@/lib/projects/service";
import { currentOrganizationId } from "@/lib/tenancy";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Construction AI", template: "%s · Construction AI" },
  description: "Trustworthy construction project intelligence from source documents.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const projects = await listProjects(currentOrganizationId());
  return (
    <html lang="en">
      <body>
        <AppShell projects={projects.map(({ id, name, projectNumber }) => ({ id, name, projectNumber }))}>{children}</AppShell>
      </body>
    </html>
  );
}
