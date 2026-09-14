import { describe, expect, it } from "vitest";

import {
  groupProjectsByFolder,
  workspaceFolderLabel,
  workspaceProjectName,
} from "./projectFolders";

describe("projectFolders", () => {
  it("groups workspace projects by their parent folder case-insensitively", () => {
    const groups = groupProjectsByFolder([
      { id: "api", workspacePath: "D:/Work/platform/api" },
      { id: "web", workspacePath: "D:\\work\\platform\\web" },
      { id: "cli", workspacePath: "/opt/tools/cli" },
      { id: "notes", workspacePath: null },
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "D:/Work/platform",
      "opt/tools",
      null,
    ]);
    expect(groups[0].projects.map((project) => project.id)).toEqual(["api", "web"]);
    expect(groups[2].projects.map((project) => project.id)).toEqual(["notes"]);
  });

  it("handles roots and derives project names", () => {
    expect(workspaceFolderLabel("D:/repo")).toBe("D:");
    expect(workspaceFolderLabel("/")).toBeNull();
    expect(workspaceProjectName("D:\\Work\\platform\\api")).toBe("api");
    expect(workspaceProjectName("/")).toBe("");
  });
});