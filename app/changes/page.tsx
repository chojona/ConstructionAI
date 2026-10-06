import Link from "next/link";
import { CiteChip } from "@/components/review/cite-chip";
import { EmptyChanges } from "@/components/review/changes-empty";
import { FactBadges } from "@/components/review/fact-badges";
import { Badge } from "@/components/ui/badge";
import { listProjects } from "@/lib/projects/service";
import { listAttention } from "@/lib/review/attention";
import { changePageCite, changeRowTitle } from "@/lib/review/changeRow";
import { queueBadges, showAiSuggested } from "@/lib/review/factBadge";
import { portfolioUploadHref } from "@/lib/review/emptyState";
import { findingDomId } from "@/lib/review/evidenceLocation";
import { authorizePage } from "@/lib/auth/pageAccess";
import { getProjectReview } from "@/lib/review/service";

export const dynamic = "force-dynamic";

export default async function ChangesPage() {
  const { organizationId } = await authorizePage("read");
  const projects = await listProjects(organizationId);
  const groups = await Promise.all(projects.map(async (project) => ({ project, items: listAttention((await getProjectReview(organizationId, project.id)).findings) })));
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  return <main className="page">
    <div className="page-heading"><div><p className="eyebrow">Across your projects</p><h1>Changes</h1><p className="lede">Open changes that need attention, with the source evidence beside them.</p></div><Badge className={count ? "severity-high" : "severity-low"}>{count} open</Badge></div>
    {groups.filter((group) => group.items.length).map(({ project, items }) => <section className="review-block" key={project.id}><div className="section-heading"><h2><Link href={`/projects/${project.id}?view=changes`}>{project.name}</Link> <span className="heading-sub">Needs attention</span></h2><span className="count">{items.length} open</span></div><ul className="change-list">{items.map((item) => <li key={item.finding.subjectKey}><Link className="change-card" href={`/projects/${project.id}?view=changes#${findingDomId(item.finding.subjectKey)}`}><span className="change-card-copy"><span className="row-title">{changeRowTitle(item.finding)}</span><span className="row-meta">{item.finding.documentTitle}</span><FactBadges badges={queueBadges(item.finding)} suggested={showAiSuggested(item.finding.currentDecision)} /></span><CiteChip {...changePageCite(item.finding)} /><span className="row-open">Review</span></Link></li>)}</ul></section>)}
    {!count && <EmptyChanges href={portfolioUploadHref(groups.map(({ project }) => project))} />}
  </main>;
}
