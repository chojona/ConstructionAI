import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { listProjects } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { decisionReturnPath } from "@/lib/review/evidenceLocation";
import { getProjectReview } from "@/lib/review/service";
import { currentOrganizationId } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function ChangesPage() {
  const organizationId = currentOrganizationId();
  const projects = await listProjects(organizationId);
  const groups = await Promise.all(projects.map(async (project) => ({ project, items: listAttention((await getProjectReview(organizationId, project.id)).findings) })));
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  return <main className="page">
    <div className="page-heading"><div><p className="eyebrow">Across your projects</p><h1>Needs attention</h1><p className="lede">Open changes waiting for a decision, with the source evidence beside them.</p></div><Badge className={count ? "severity-high" : "severity-low"}>{count} open</Badge></div>
    {groups.filter((group) => group.items.length).map(({ project, items }) => <section className="review-block" key={project.id}><div className="section-heading"><h2><Link href={`/projects/${project.id}`}>{project.name}</Link></h2><span className="count">{items.length} open</span></div><div className="list">{items.map((item) => <Link className="list-row" href={decisionReturnPath(project.id, item.finding.subjectKey)} key={item.finding.subjectKey}><div><p className="row-title">{item.finding.label}</p><p className="row-meta">{item.finding.documentTitle} · {item.finding.revisionLabel}</p></div><div className="row-side"><SeverityBadge severity={item.severity} /></div></Link>)}</div></section>)}
    {!count && <div className="empty"><CheckCheck size={20} aria-hidden /><strong>Nothing needs attention</strong><span>Upload a revision in a project to start a review.</span><Link href="/projects" className="return-link">Go to projects</Link></div>}
  </main>;
}
