# Dashi Taskboard Codex Plugin

This is the first Codex plugin integration slice. It packages the `manage-taskboard` skill and a read-only MCP server that talks to an already-running local Taskboard service.

## Included tools

- `taskboard_health`
- `taskboard_list_projects`
- `taskboard_list_issues`
- `taskboard_get_issue`

The MCP server reads `CODEX_TASKBOARD_URL` and defaults to `http://127.0.0.1:47823`. Only loopback HTTP origins are accepted.

Service lifecycle management and mutating MCP tools are intentionally deferred. Continue using the launcher or Docker service for this iteration.
