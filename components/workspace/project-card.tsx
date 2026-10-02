import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { projectDocumentsLabel, projectNumberLabel, projectStatusLabel } from "@/lib/projects/card";

export function ProjectCard({
  href,
  name,
  projectNumber,
  documentCount,
  openCount,
  active = false,
}: {
  href: string;
  name: string;
  projectNumber: string | null;
  documentCount: number;
  openCount: number;
  active?: boolean;
}) {
  const className = ["project-card", openCount > 0 && "needs-attention", active && "is-active"].filter(Boolean).join(" ");
  return (
    <Link className={className} href={href} aria-current={active ? "page" : undefined}>
      <span className="project-card-name">{name}</span>
      <span className="project-card-number">{projectNumberLabel(projectNumber)}</span>
      <span className="project-card-docs">{projectDocumentsLabel(documentCount)}</span>
      <span className="project-card-status">
        <Badge className={openCount > 0 ? "status-attention" : "status-processed"}>{projectStatusLabel(openCount)}</Badge>
      </span>
    </Link>
  );
}
