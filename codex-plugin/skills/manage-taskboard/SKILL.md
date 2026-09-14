---
name: manage-taskboard
description: Manage Dashi Taskboard / e-taskboard issues. Use the plugin's read-only MCP tools for status checks and issue reading; use taskctl for comments, writes, and status transitions.
---

# Manage Taskboard

Prefer the `taskboard_*` MCP tools for all read operations when this plugin is enabled. They call the configured local Taskboard HTTP API and return JSON.

Read the exact issue identifier from the user or a tool result. Never derive or rewrite an identifier prefix.

## Read workflow

1. Use `taskboard_health` when service reachability is unclear.
2. Use `taskboard_list_projects` to confirm the target project id.
3. Use `taskboard_list_issues` with the exact `projectId`.
4. Use `taskboard_get_issue` with the exact issue identifier or id.

This iteration is intentionally read-only. For comments, issue creation, relations, attachments, and status changes, follow `references/cli.md` and use the exact injected or packaged `taskctl` binary.

## Service selection

The MCP server reads `CODEX_TASKBOARD_URL` and otherwise uses `http://127.0.0.1:47823`. It accepts only loopback HTTP URLs. If a tool reports that the service is unavailable, tell the user to start the Taskboard service; do not silently switch endpoints or guess another port.

Do not expose the Taskboard HTTP API over a network only to make this plugin work. The plugin is designed to run on the same device as the Taskboard service.
