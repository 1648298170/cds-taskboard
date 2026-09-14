export interface WorkspaceProject {
  workspacePath: string | null;
}

export interface ProjectFolderGroup<TProject extends WorkspaceProject> {
  key: string;
  label: string | null;
  projects: TProject[];
}

export const UNMAPPED_PROJECT_FOLDER_KEY = "__unmapped__";

function normalizedWorkspacePath(workspacePath: string): string {
  return workspacePath.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

export function workspaceFolderLabel(workspacePath: string): string | null {
  const segments = normalizedWorkspacePath(workspacePath).split("/").filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.length === 1) return "/";
  return segments.slice(0, -1).join("/");
}

export function workspaceProjectName(workspacePath: string): string {
  const segments = normalizedWorkspacePath(workspacePath).split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

export function groupProjectsByFolder<TProject extends WorkspaceProject>(
  projects: TProject[],
): Array<ProjectFolderGroup<TProject>> {
  const groups = new Map<string, ProjectFolderGroup<TProject>>();
  for (const project of projects) {
    const label = project.workspacePath === null ? null : workspaceFolderLabel(project.workspacePath);
    const key = label === null
      ? UNMAPPED_PROJECT_FOLDER_KEY
      : label.toLocaleLowerCase("en-US");
    const group = groups.get(key);
    if (group) {
      group.projects.push(project);
      continue;
    }
    groups.set(key, { key, label, projects: [project] });
  }

  const mapped = [...groups.values()].filter((group) => group.label !== null);
  const unmapped = groups.get(UNMAPPED_PROJECT_FOLDER_KEY);
  return unmapped ? [...mapped, unmapped] : mapped;
}