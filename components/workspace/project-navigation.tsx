import Link from "next/link";

export function ProjectNavigation({ projectId, active, openCount }: { projectId: string; active: "overview" | "changes" | "documents"; openCount?: number }) {
  return <nav className="workspace-tabs" aria-label="Project">
    {(["overview", "changes", "documents"] as const).map((tab) => <Link key={tab} href={`/projects/${projectId}${tab === "overview" ? "" : `?view=${tab}`}`} className={active === tab ? "is-active" : ""} aria-current={active === tab ? "page" : undefined}>{tab.charAt(0).toUpperCase() + tab.slice(1)}{tab === "changes" && openCount !== undefined && <span className="tab-count">{openCount}</span>}</Link>)}
  </nav>;
}
