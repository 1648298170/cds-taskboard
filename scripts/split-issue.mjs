#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const DEFAULT_URL = "http://127.0.0.1:47823";
const USAGE = `Usage: node scripts/split-issue.mjs <PARENT_ID> --new-title "TITLE" --spec <FILE>
                             [--project ID] [--status STATUS] [--thread-id ID]
                             [--url URL] [--dry-run]

Splits a parent issue into child issues. Each non-empty spec line is:

  title|labels|priority|git-branch|worktree-path|description

Empty fields inherit the parent issue. "\\n" in a description becomes a newline.`;

function parseArgs(argv) {
  const options = {
    parentId: null,
    newTitle: null,
    spec: null,
    project: null,
    status: "backlog",
    threadId: null,
    url: process.env.CODEX_TASKBOARD_URL?.replace(/\/$/, "") || DEFAULT_URL,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--new-title") options.newTitle = argv[++index];
    else if (arg === "--spec") options.spec = argv[++index];
    else if (arg === "--project") options.project = argv[++index];
    else if (arg === "--status") options.status = argv[++index];
    else if (arg === "--thread-id") options.threadId = argv[++index];
    else if (arg === "--url") options.url = String(argv[++index]).replace(/\/$/, "");
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (options.parentId === null && !arg.startsWith("-")) options.parentId = arg;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.parentId || !options.newTitle || !options.spec) {
    throw new Error(USAGE);
  }
  return options;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail = body?.error ? `${body.error.code}: ${body.error.message}` : String(body).slice(0, 300);
    throw new Error(`${response.status} ${response.statusText} — ${detail}`);
  }
  return body;
}

function developmentContext(row) {
  if (row.worktreePath) {
    return { type: "worktree", path: row.worktreePath, branch: row.worktreeBranch || null };
  }
  if (row.gitBranch) return { type: "branch", branch: row.gitBranch };
  return undefined;
}

function parseSpec(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [title, labels, priority, gitBranch, worktreePath, description] = line.split("|");
      if (!title?.trim()) throw new Error(`Spec line is missing a title: ${line}`);
      return {
        title: title.trim(),
        labels: labels?.trim() || null,
        priority: priority?.trim() || null,
        gitBranch: gitBranch?.trim() || null,
        worktreePath: worktreePath?.trim() || null,
        worktreeBranch: null,
        description: description?.trim().replaceAll("\\n", "\n") || null,
      };
    });
}

const options = parseArgs(process.argv.slice(2));
const rows = parseSpec(await readFile(options.spec, "utf8"));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTask(reference) {
  if (UUID_PATTERN.test(reference)) {
    return requestJson(`${options.url}/api/tasks/${encodeURIComponent(reference)}`);
  }
  const tasks = await requestJson(`${options.url}/api/tasks?archived=all`);
  const match = (tasks.tasks ?? []).find(
    (task) => task.identifier?.toLowerCase() === reference.toLowerCase(),
  );
  if (!match) throw new Error(`Parent issue not found: ${reference}`);
  return match;
}

const parent = await resolveTask(options.parentId);
if (!parent?.id) throw new Error(`Parent issue not found: ${options.parentId}`);

const plan = rows.map((row) => ({
  row,
  projectId: options.project ?? parent.projectId,
  labels: row.labels ? [...new Set(row.labels.split(",").map((v) => v.trim()).filter(Boolean))] : parent.labels,
  priority: row.priority || parent.priority,
  developmentContext: developmentContext(row),
}));

if (options.dryRun) {
  console.log(JSON.stringify({ parent: parent.id, newTitle: options.newTitle, children: plan }, null, 2));
  process.exit(0);
}

const patchedParent = await requestJson(`${options.url}/api/tasks/${encodeURIComponent(parent.id)}`, {
  method: "PATCH",
  body: JSON.stringify({
    version: parent.version,
    title: options.newTitle,
    developmentContext: null,
    ...(options.threadId ? { threadId: options.threadId } : {}),
  }),
});

const children = [];
for (const entry of plan) {
  const created = await requestJson(`${options.url}/api/tasks`, {
    method: "POST",
    body: JSON.stringify({
      projectId: entry.projectId,
      title: entry.row.title,
      description: entry.row.description ?? "",
      status: options.status,
      priority: entry.priority,
      labels: entry.labels,
      developmentContext: entry.developmentContext,
      ...(options.threadId ? { threadId: options.threadId } : {}),
    }),
  });
  await requestJson(
    `${options.url}/api/tasks/${encodeURIComponent(created.task.id)}/relations/parent/${encodeURIComponent(parent.id)}`,
    {
      method: "POST",
      body: JSON.stringify({
        version: created.task.version,
        ...(options.threadId ? { threadId: options.threadId } : {}),
      }),
    },
  );
  children.push({
    id: created.task.id,
    identifier: created.task.identifier,
    title: created.task.title,
  });
}

const parentTask = patchedParent.task ?? patchedParent;
console.log(JSON.stringify({
  parent: { id: parentTask.id, identifier: parentTask.identifier, title: parentTask.title },
  children,
}, null, 2));
