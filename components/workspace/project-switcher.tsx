"use client";

import { useRouter } from "next/navigation";

type ProjectOption = { id: string; name: string; projectNumber: string | null };

export function ProjectSwitcher({ projects, currentId }: { projects: ProjectOption[]; currentId: string }) {
  const router = useRouter();
  return (
    <label className="project-switcher">
      Project
      <select
        value={projects.some((project) => project.id === currentId) ? currentId : ""}
        onChange={(event) => {
          const next = event.target.value;
          if (next && next !== currentId) router.push(`/projects/${next}`);
        }}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} · {project.projectNumber?.trim() || "No project number"}
          </option>
        ))}
      </select>
    </label>
  );
}
