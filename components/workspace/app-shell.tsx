"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, FolderKanban, HardHat, Layers3, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { projectNumberLabel } from "@/lib/projects/card";
import { readSidebarCollapsed, writeSidebarCollapsed } from "@/lib/workspace/sidebarState";

function readCollapsed() {
  return readSidebarCollapsed(window.localStorage);
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("construction-ai:sidebar", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("construction-ai:sidebar", onChange);
  };
}

type Project = {
  id: string;
  name: string;
  projectNumber: string | null;
  documentCount: number;
  openCount: number;
};

export function AppShell({ projects, children }: { projects: Project[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const commands = [
    { href: "/projects", name: "Projects", detail: "Workspace" },
    { href: "/changes", name: "Changes", detail: "Needs attention" },
    ...projects.map((project) => ({ href: `/projects/${project.id}`, name: project.name, detail: projectNumberLabel(project.projectNumber) })),
  ].filter((command) => `${command.name} ${command.detail}`.toLowerCase().includes(query.toLowerCase()));

  function openSearch() {
    setQuery("");
    dialog.current?.showModal();
  }

  function toggleSidebar() {
    try { writeSidebarCollapsed(window.localStorage, !collapsed); } catch { /* Sidebar stays usable when storage is blocked. */ }
    window.dispatchEvent(new Event("construction-ai:sidebar"));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else openSearch();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app-shell${collapsed ? " is-collapsed" : ""}`}>
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-head">
          <Link href="/projects" className="brand" aria-label="Construction AI"><span className="brand-mark"><HardHat size={18} aria-hidden /></span><span className="brand-copy">Construction AI<small>Project intelligence</small></span></Link>
          <button type="button" className="icon-button sidebar-collapse" aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleSidebar}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        </div>
        <button ref={trigger} className="search-trigger" aria-label="Find a project or command" aria-haspopup="dialog" onClick={openSearch}><Search size={15} aria-hidden /><span>Find a project…</span><kbd>⌘K</kbd></button>
        <p className="nav-heading">Workspace</p>
        <nav className="nav-stack" aria-label="Main">
          <Link className={`nav-row ${pathname === "/projects" ? "is-active" : ""}`} aria-current={pathname === "/projects" ? "page" : undefined} aria-label="Projects" href="/projects"><FolderKanban size={16} aria-hidden /><span className="nav-label">Projects</span></Link>
          <Link className={`nav-row ${pathname === "/changes" ? "is-active" : ""}`} aria-current={pathname === "/changes" ? "page" : undefined} aria-label="Changes" href="/changes"><Layers3 size={16} aria-hidden /><span className="nav-copy">Changes<small>Needs attention</small></span></Link>
        </nav>
        <div className="sidebar-footer"><span className="status-dot" />Source intelligence<small>Decisions grounded in documents</small></div>
      </aside>
      <div className="workspace-body" id="workspace" tabIndex={-1}>{children}</div>
      <dialog ref={dialog} className="command-dialog" aria-labelledby="command-title" onClose={() => trigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="command-heading"><h2 id="command-title">Go to workspace</h2><button className="icon-button" aria-label="Close search" onClick={() => dialog.current?.close()}><X size={17} /></button></div>
        <label className="command-search"><Search size={18} aria-hidden /><input autoFocus aria-label="Search projects and commands" placeholder="Search projects and commands…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); dialog.current?.querySelector<HTMLAnchorElement>(".command-result")?.focus(); }
          if (event.key === "Enter") { event.preventDefault(); dialog.current?.querySelector<HTMLAnchorElement>(".command-result")?.click(); }
        }} /></label>
        <div className="command-results" onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const links = Array.from(dialog.current?.querySelectorAll<HTMLAnchorElement>(".command-result") ?? []);
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          links[(index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
        }}>
          {commands.map((command) => <Link key={command.href} href={command.href} className="command-result" onClick={() => dialog.current?.close()}><span>{command.name}<small>{command.detail}</small></span><ArrowRight size={15} aria-hidden /></Link>)}
          {!commands.length && <p className="empty">No matching projects or commands.</p>}
        </div>
        <p className="command-hint">↑ ↓ Navigate <span>↵ Open</span><span>esc Close</span></p>
      </dialog>
    </div>
  );
}
