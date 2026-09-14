import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";

const PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_SERVER_URL = "http://127.0.0.1:47823";
const STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "canceled"];

const tools = [
  {
    name: "taskboard_health",
    description: "Check whether the configured Dashi Taskboard service is reachable.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "taskboard_list_projects",
    description: "List projects from the configured Dashi Taskboard service.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "taskboard_list_issues",
    description: "List issues in a Dashi Taskboard project. This tool is read-only.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1, maxLength: 128 },
        status: { type: "string", enum: STATUSES },
        archived: { type: "string", enum: ["true", "false", "all"] },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "taskboard_get_issue",
    description: "Get one Dashi Taskboard issue by its exact identifier or id. This tool is read-only.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: { type: "string", minLength: 1, maxLength: 128 },
      },
      required: ["issueId"],
      additionalProperties: false,
    },
  },
];

let initialized = false;
const readline = createInterface({ input: stdin, crlfDelay: Infinity });

readline.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    sendJsonRpc(null, -32700, { message: "Parse error" });
    return;
  }
  handleMessage(message).catch((error) => {
    if (message?.id !== undefined) {
      sendJsonRpc(message.id, -32603, { message: error?.message ?? "Internal error" });
    }
  });
});

readline.on("close", () => {
  process.exitCode = 0;
});

async function handleMessage(message) {
  if (message?.jsonrpc !== "2.0") {
    sendJsonRpc(message?.id ?? null, -32600, { message: "Invalid Request" });
    return;
  }
  if (message.method === "initialize") {
    sendResult(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "dashi-taskboard", version: "0.1.0" },
    });
    return;
  }
  if (message.method === "notifications/initialized") {
    initialized = true;
    return;
  }
  if (message.method === "ping") {
    sendResult(message.id, {});
    return;
  }
  if (message.method === "tools/list") {
    sendResult(message.id, { tools });
    return;
  }
  if (message.method === "tools/call") {
    const params = message.params ?? {};
    sendResult(message.id, await callTool(params.name, params.arguments ?? {}));
    return;
  }
  if (message.id === undefined) return;
  sendJsonRpc(message.id, -32601, { message: `Unknown method: ${message.method}` });
}

async function callTool(name, args) {
  try {
    if (!initialized) throw new Error("MCP server is not initialized");
    if (name === "taskboard_health") {
      assertNoArguments(args);
      return textResult(await requestTaskboard("/health"));
    }
    if (name === "taskboard_list_projects") {
      assertNoArguments(args);
      return textResult(await requestTaskboard("/api/projects"));
    }
    if (name === "taskboard_list_issues") {
      assertAllowedArguments(args, new Set(["projectId", "status", "archived"]));
      const query = new URLSearchParams({ projectId: requiredString(args, "projectId") });
      if (args.status !== undefined) query.set("status", requiredEnum(args, "status", STATUSES));
      if (args.archived !== undefined) query.set("archived", requiredEnum(args, "archived", ["true", "false", "all"]));
      return textResult(await requestTaskboard(`/api/tasks?${query}`));
    }
    if (name === "taskboard_get_issue") {
      const issueId = requiredString(args, "issueId");
      return textResult(await requestTaskboard(`/api/tasks/${encodeURIComponent(issueId)}`));
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: error?.message ?? "Tool call failed" }],
      isError: true,
    };
  }
}

async function requestTaskboard(path) {
  const response = await fetch(new URL(path, serverUrlFromEnvironment()), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Taskboard request failed (${response.status}): ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Taskboard returned a non-JSON response");
  }
}

function serverUrlFromEnvironment() {
  const raw = process.env.CODEX_TASKBOARD_URL ?? DEFAULT_SERVER_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`CODEX_TASKBOARD_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:") throw new Error("CODEX_TASKBOARD_URL must use http");
  if (!isLoopbackHostname(url.hostname)) throw new Error("CODEX_TASKBOARD_URL must point to a loopback host");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("CODEX_TASKBOARD_URL may only contain an origin and optional port");
  }
  return url;
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function assertNoArguments(args) {
  if (!isPlainObject(args) || Object.keys(args).length > 0) {
    throw new Error("This tool does not accept arguments");
  }
}

function assertAllowedArguments(args, names) {
  if (!isPlainObject(args)) throw new Error("Tool arguments must be an object");
  for (const name of Object.keys(args)) {
    if (!names.has(name)) throw new Error(`Unsupported argument: ${name}`);
  }
}

function requiredString(args, name) {
  if (!isPlainObject(args)) throw new Error("Tool arguments must be an object");
  const value = args[name];
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error(`${name} must contain 1 to 128 characters`);
  }
  return value;
}

function requiredEnum(args, name, values) {
  const value = requiredString(args, name);
  if (!values.includes(value)) throw new Error(`${name} must be one of: ${values.join(", ")}`);
  return value;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function sendResult(id, result) {
  writeLine({ jsonrpc: "2.0", id, result });
}

function sendJsonRpc(id, code, data) {
  writeLine({ jsonrpc: "2.0", id, error: { code, message: data.message, data } });
}

function writeLine(value) {
  stdout.write(`${JSON.stringify(value)}\n`);
}
