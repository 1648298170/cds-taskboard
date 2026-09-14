import path from "node:path";

// Workspace paths describe a directory on the Codex host, which can be a
// different platform from the server process (for example a Linux container
// serving a Windows host), so accept POSIX and Windows absolute paths.
export function isAbsoluteWorkspacePath(value) {
  return typeof value === "string"
    && (path.posix.isAbsolute(value) || path.win32.isAbsolute(value));
}