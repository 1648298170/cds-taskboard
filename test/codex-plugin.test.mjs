import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const pluginRoot = path.resolve("codex-plugin");

test("codex plugin manifest declares skills and the MCP server", async () => {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const mcp = JSON.parse(await readFile(path.join(pluginRoot, ".mcp.json"), "utf8"));

  assert.equal(manifest.name, "dashi-taskboard");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(mcp.mcpServers.dashi_taskboard.command, "node");
});

test("codex plugin MCP server exposes read-only tools backed by the Taskboard API", async (t) => {
  const requested = [];
  const api = createServer((request, response) => {
    requested.push(request.url);
    const url = new URL(request.url, "http://127.0.0.1");
    let body = {};
    if (url.pathname === "/api/projects") body = { projects: [{ id: "demo" }] };
    if (url.pathname === "/api/tasks") body = { tasks: [{ identifier: "DAS-2" }] };
    if (url.pathname === "/api/tasks/DAS-2") body = { task: { identifier: "DAS-2" } };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  t.after(() => api.close());

  const child = spawn(process.execPath, [path.join(pluginRoot, "server", "mcp-server.mjs")], {
    env: {
      ...process.env,
      CODEX_TASKBOARD_URL: `http://127.0.0.1:${api.address().port}`,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const responses = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "taskboard_list_projects", arguments: {} } });
  send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "taskboard_list_issues", arguments: { projectId: "demo" } } });
  send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "taskboard_get_issue", arguments: { issueId: "DAS-2" } } });

  while (responses.length < 5) await once(child.stdout, "data");
  const [, toolsResponse, projectsResponse, issuesResponse, issueResponse] = responses;
  assert.deepEqual(toolsResponse.result.tools.map((tool) => tool.name), [
    "taskboard_health",
    "taskboard_list_projects",
    "taskboard_list_issues",
    "taskboard_get_issue",
  ]);
  assert.equal(JSON.parse(projectsResponse.result.content[0].text).projects[0].id, "demo");
  assert.equal(JSON.parse(issuesResponse.result.content[0].text).tasks[0].identifier, "DAS-2");
  assert.equal(JSON.parse(issueResponse.result.content[0].text).task.identifier, "DAS-2");
  assert.deepEqual(requested, ["/api/projects", "/api/tasks?projectId=demo", "/api/tasks/DAS-2"]);
});
