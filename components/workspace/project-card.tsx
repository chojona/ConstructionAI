import Link from "next/link";
import { projectCardMeta, projectNumberLabel } from "@/lib/projects/card";

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
  return (
    <Link className={`project-card${active ? " is-active" : ""}`} href={href} aria-current={active ? "page" : undefined}>
      <span className="project-card-name">{name}</span>
      <span className="project-card-sub">
        <span className="project-card-number">{projectNumberLabel(projectNumber)}</span>
        <span className="project-card-meta">{projectCardMeta(documentCount, openCount)}</span>
      </span>
    </Link>
  );
}
