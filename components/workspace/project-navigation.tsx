import Link from "next/link";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "changes", label: "Changes" },
  { id: "documents", label: "Documents" },
  { id: "heavyjob", label: "HeavyJob" },
] as const;

export type ProjectView = (typeof tabs)[number]["id"];

export function parseProjectView(value: string | undefined): ProjectView {
  return tabs.some((tab) => tab.id === value) ? value as ProjectView : "overview";
}

export function ProjectNavigation({ projectId, active, openCount }: { projectId: string; active: ProjectView; openCount?: number }) {
  return <nav className="workspace-tabs" aria-label="Project">
    {tabs.map((tab) => {
      const href = tab.id === "overview" ? `/projects/${projectId}` : `/projects/${projectId}?view=${tab.id}`;
      const current = active === tab.id;
      return (
        <Link key={tab.id} href={href} className={current ? "is-active" : ""} aria-current={current ? "page" : undefined}>
          {tab.label}
          {tab.id === "changes" && openCount !== undefined ? <span className="tab-count">{openCount}</span> : null}
        </Link>
      );
    })}
  </nav>;
}
