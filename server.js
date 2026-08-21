#!/usr/bin/env node
/**
 * MCP server that wraps Super Productivity's built-in "Local REST API".
 *
 * Prerequisites:
 *   - Super Productivity desktop app running
 *   - Settings -> Misc -> "Enable local REST API" turned on
 *     (this exposes http://127.0.0.1:3876, localhost-only)
 *   - Some Super Productivity versions also require an access token:
 *     Settings -> Misc -> Access Token. If yours does, set it in the
 *     SP_REST_TOKEN environment variable when registering this server
 *     (see README.md).
 *
 * This server exposes that REST API as MCP tools so Claude Desktop can
 * read and manage your Super Productivity tasks, projects and tags.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.SP_REST_BASE_URL || "http://127.0.0.1:3876";
const TOKEN = process.env.SP_REST_TOKEN;

/** Thin wrapper around fetch() that talks to the Super Productivity Local REST API. */
async function spFetch(path, { method = "GET", body } = {}) {
  const url = `${BASE_URL}${path}`;
  let res;
  try {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Could not reach Super Productivity's Local REST API at ${url}. ` +
        `Make sure Super Productivity is running and Settings -> Misc -> ` +
        `"Enable local REST API" is turned on. Underlying error: ${err.message}`
    );
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Super Productivity API returned a non-JSON response (HTTP ${res.status}) for ${method} ${path}`);
  }

  if (!json.ok) {
    const code = json.error?.code ?? "UNKNOWN_ERROR";
    const message = json.error?.message ?? "Unknown error";
    const hint =
      res.status === 401
        ? TOKEN
          ? " (the configured SP_REST_TOKEN was rejected — copy the current value from Settings -> Misc -> Access Token in Super Productivity, it may have been regenerated)"
          : " (this Super Productivity instance requires a token: set the SP_REST_TOKEN environment variable to the value from Settings -> Misc -> Access Token)"
        : "";
    throw new Error(`Super Productivity API error [${code}]: ${message} (HTTP ${res.status})${hint}`);
  }

  return json.data;
}

function asText(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

const server = new McpServer({
  name: "super-productivity-rest-mcp",
  version: "1.0.0",
});

// --- Health / status -------------------------------------------------------

server.tool(
  "sp_health",
  "Check whether the Super Productivity Local REST API is reachable and ready.",
  {},
  async () => asText(await spFetch("/health"))
);

server.tool(
  "sp_get_status",
  "Get the current task and task counts from Super Productivity.",
  {},
  async () => asText(await spFetch("/status"))
);

// --- Tasks -------------------------------------------------------------

server.tool(
  "sp_list_tasks",
  "List tasks from Super Productivity, optionally filtered by title, project, tag or completion state.",
  {
    query: z.string().optional().describe("Filter by title, case-insensitive substring match"),
    projectId: z.string().optional().describe("Filter by project id"),
    tagId: z.string().optional().describe('Filter by tag id. Use "TODAY" for tasks scheduled for today'),
    includeDone: z.boolean().optional().describe("Include completed tasks (default false)"),
    source: z.enum(["active", "archived", "all"]).optional().describe('Which task set to search (default "active")'),
  },
  async (args) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return asText(await spFetch(`/tasks${qs ? `?${qs}` : ""}`));
  }
);

server.tool(
  "sp_get_task",
  "Get a single Super Productivity task by its id.",
  { id: z.string().describe("Task id") },
  async ({ id }) => asText(await spFetch(`/tasks/${encodeURIComponent(id)}`))
);

server.tool(
  "sp_create_task",
  "Create a new task in Super Productivity.",
  {
    title: z.string().describe("Task title (required)"),
    notes: z.string().optional(),
    projectId: z.string().optional().describe('Project id, e.g. "INBOX_PROJECT" for the inbox'),
    tagIds: z.array(z.string()).optional(),
    parentId: z
      .string()
      .optional()
      .describe(
        "Create as a subtask of this top-level task id. Cannot be combined with projectId or tagIds."
      ),
    timeEstimate: z.number().optional().describe("Estimated duration in milliseconds"),
    timeSpent: z.number().optional().describe("Time already spent on the task, in milliseconds"),
    dueDay: z.string().optional().describe("Due date, day only, no specific time (\"Termin\") as YYYY-MM-DD. Use dueWithTime instead if a specific time matters."),
    dueWithTime: z.number().optional().describe("Due date and time (\"Termin do\") as a timestamp in ms since epoch. Use this instead of dueDay when the deadline has a specific time, not just a day."),
    plannedAt: z.number().optional().describe("When you plan to work on the task (\"Zaplanuj\"), as a timestamp in ms since epoch — distinct from the due date."),
    isDone: z.boolean().optional(),
  },
  async (args) => asText(await spFetch("/tasks", { method: "POST", body: args }))
);

server.tool(
  "sp_update_task",
  "Update an existing Super Productivity task. Note: parentId and subTaskIds cannot be changed this way.",
  {
    id: z.string().describe("Task id"),
    title: z.string().optional(),
    notes: z.string().optional(),
    isDone: z.boolean().optional(),
    projectId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    timeEstimate: z.number().optional(),
    timeSpent: z.number().optional(),
    dueDay: z.string().optional().describe("Due date, day only, no specific time (\"Termin\") as YYYY-MM-DD. Use dueWithTime instead if a specific time matters."),
    dueWithTime: z.number().optional().describe("Due date and time (\"Termin do\") as a timestamp in ms since epoch."),
    plannedAt: z.number().optional().describe("When you plan to work on the task (\"Zaplanuj\"), as a timestamp in ms since epoch."),
  },
  async ({ id, ...updates }) =>
    asText(await spFetch(`/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: updates }))
);

server.tool(
  "sp_delete_task",
  "Delete a Super Productivity task.",
  { id: z.string().describe("Task id") },
  async ({ id }) => asText(await spFetch(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }))
);

server.tool(
  "sp_start_task",
  "Start a task (set it as the current/active task) in Super Productivity.",
  { id: z.string().describe("Task id") },
  async ({ id }) => asText(await spFetch(`/tasks/${encodeURIComponent(id)}/start`, { method: "POST" }))
);

server.tool(
  "sp_archive_task",
  "Archive a Super Productivity task.",
  { id: z.string().describe("Task id") },
  async ({ id }) => asText(await spFetch(`/tasks/${encodeURIComponent(id)}/archive`, { method: "POST" }))
);

server.tool(
  "sp_restore_task",
  "Restore a previously archived Super Productivity task.",
  { id: z.string().describe("Task id") },
  async ({ id }) => asText(await spFetch(`/tasks/${encodeURIComponent(id)}/restore`, { method: "POST" }))
);

// --- Current task control -----------------------------------------------

server.tool(
  "sp_get_current_task",
  "Get the task that is currently active/running in Super Productivity, if any.",
  {},
  async () => asText(await spFetch("/task-control/current"))
);

server.tool(
  "sp_set_current_task",
  "Set (or clear) the currently active task in Super Productivity.",
  { taskId: z.string().nullable().describe("Task id to make current, or null to clear it") },
  async ({ taskId }) =>
    asText(await spFetch("/task-control/current", { method: "POST", body: { taskId } }))
);

server.tool(
  "sp_stop_current_task",
  "Stop the currently active task in Super Productivity (no task remains current).",
  {},
  async () => asText(await spFetch("/task-control/stop", { method: "POST" }))
);

// --- Projects & tags ------------------------------------------------------

server.tool(
  "sp_list_projects",
  "List Super Productivity projects, optionally filtered by title.",
  { query: z.string().optional().describe("Filter by title, case-insensitive substring match") },
  async ({ query }) => asText(await spFetch(`/projects${query ? `?query=${encodeURIComponent(query)}` : ""}`))
);

server.tool(
  "sp_list_tags",
  "List Super Productivity tags, optionally filtered by title.",
  { query: z.string().optional().describe("Filter by title, case-insensitive substring match") },
  async ({ query }) => asText(await spFetch(`/tags${query ? `?query=${encodeURIComponent(query)}` : ""}`))
);

// --- Boot -------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
