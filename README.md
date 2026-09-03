# super-productivity-rest-mcp — HTTP transport

An [MCP](https://modelcontextprotocol.io) server that exposes [Super Productivity](https://super-productivity.com/)'s built-in **Local REST API** as MCP tools — so Claude (or any other MCP client) can list, create, update, archive and control your tasks, projects and tags through plain conversation.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Transport: Streamable HTTP](https://img.shields.io/badge/transport-streamable--http-blue)

> **Branches**
> - **`http-transport`** (this branch) — serves MCP over **Streamable HTTP** on `http://127.0.0.1:3877/mcp`. Use this for **Claude Cowork** and any other client that connects to an MCP server by URL.
> - **`main`** — the original **stdio** version, spawned as a local subprocess. Use that for Claude Code.
>
> Same 15 tools, same Super Productivity Local REST API underneath — only the transport differs.

## Why this exists

Super Productivity ships with a [Local REST API](https://github.com/super-productivity/super-productivity/blob/master/docs/wiki/3.01-API.md) (`http://127.0.0.1:3876`), but it doesn't speak MCP — it's a plain REST API. This project is a thin, direct translation layer between the two:

- **Talks directly to the official Local REST API** — no Super Productivity plugin to install, no Node-execution permission to grant, no file-based polling. One HTTP request per tool call.
- **Full coverage** of everything the Local REST API exposes: task CRUD (including delete), archive/restore, current-task control (start/stop/set/get), projects, tags, and health/status — 15 tools total, mapped 1:1 to the API's endpoints.
- **URL-based transport.** Runs as a long-lived local HTTP server on `127.0.0.1:3877`, so clients that connect to MCP servers over a URL — Claude Cowork, Claude Desktop, the web UIs — can reach it exactly the way they reach a local Obsidian MCP server.
- **Handles the access-token variant.** Some Super Productivity versions require a bearer token for the Local REST API and some don't — this server supports both via an optional environment variable.
- **Zero extra runtime dependencies** beyond Node.js and the MCP SDK — no Python, no Super Productivity plugin bundle, no web framework (the HTTP server is Node's built-in `node:http`).

## Prerequisites

- [Super Productivity](https://super-productivity.com/) desktop app (Electron — the Local REST API is not available in the web version)
- Node.js 18+
- An MCP client that connects to a server **by URL** — e.g. Claude Cowork or Claude Desktop. The client must run on the **same machine** as this server (the endpoint is bound to `127.0.0.1`).

## 1. Enable the Local REST API in Super Productivity

Go to **Settings → Misc → Enable local REST API**. This starts a server on `http://127.0.0.1:3876` (the port is fixed and not configurable). It only accepts connections from localhost.

Check whether your installation also requires an access token:

```bash
curl -i http://127.0.0.1:3876/tasks
```

- **`200 OK`** with a task list → no token needed, skip the `SP_REST_TOKEN` parts below.
- **`401 Unauthorized`** → copy the token from **Settings → Misc → Access Token**; you'll need it in step 3.

## 2. Install

```bash
git clone -b http-transport https://github.com/mrswer/super-productivity-rest-mcp.git
cd super-productivity-rest-mcp
npm install
```

## 3. Run the server

Unlike the stdio version, this server is a **long-lived process** — start it yourself and leave it running (it does not get spawned on demand by the client).

Without a token:

```bash
npm start
```

With a token:

```bash
SP_REST_TOKEN=your-token-here npm start
```

You should see:

```
super-productivity-rest-mcp (Streamable HTTP) listening on http://127.0.0.1:3877/mcp
Proxying Super Productivity Local REST API at http://127.0.0.1:3876
```

Keep this running in a terminal, or supervise it however you like (a `systemd --user` unit, `pm2`, a login item, etc.). To confirm it's up:

```bash
curl http://127.0.0.1:3877/
# {"name":"super-productivity-rest-mcp","transport":"streamable-http","mcpEndpoint":"/mcp"}
```

## 4. Register with your MCP client

The MCP endpoint is:

```
http://127.0.0.1:3877/mcp
```

### Claude Cowork / Claude Desktop

Add a local MCP server (the same place you added your local Obsidian server) and point it at `http://127.0.0.1:3877/mcp`. No authentication, no OAuth — it's a localhost-only endpoint.

### Claude Code

Claude Code can also use an HTTP MCP server:

```bash
claude mcp add super-productivity --scope user --transport http http://127.0.0.1:3877/mcp
```

```bash
claude mcp list
# super-productivity: http://127.0.0.1:3877/mcp (HTTP) - ✔ Connected
```

### Any other MCP client

Use its "remote"/"URL"/"HTTP" server option with `http://127.0.0.1:3877/mcp`. This server implements the **Streamable HTTP** transport (`POST` for requests, `GET` for the SSE stream, `DELETE` to end a session).

## Usage

Ask your MCP client things like:

- "Show my tasks for today"
- "Create a task 'Review PR #42' in the Work project"
- "What's my currently running task?"
- "Mark task X as done"

By default, `sp_list_tasks` **excludes completed tasks** (`includeDone` defaults to `false`), matching a typical "what's left to do" view. Ask for "including completed tasks" if you want the full count to match what Super Productivity's UI shows for the day.

## Available tools

| Tool | Description |
|---|---|
| `sp_health` | Check whether the Local REST API is reachable and ready |
| `sp_get_status` | Get the current task and task counts |
| `sp_list_tasks` | List tasks, filterable by title, project, tag, completion state, source |
| `sp_get_task` | Get a single task by id |
| `sp_create_task` | Create a task (supports subtasks via `parentId`) |
| `sp_update_task` | Update a task's title, notes, project, tags, estimate, due date, etc. |
| `sp_delete_task` | Delete a task |
| `sp_start_task` | Start a task (set as current) |
| `sp_archive_task` | Archive a task |
| `sp_restore_task` | Restore an archived task |
| `sp_get_current_task` | Get the currently active task, if any |
| `sp_set_current_task` | Set or clear the current task |
| `sp_stop_current_task` | Stop the current task |
| `sp_list_projects` | List projects, optionally filtered by title |
| `sp_list_tags` | List tags, optionally filtered by title |

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SP_REST_TOKEN` | Only if your Super Productivity requires it | — | Bearer token from Settings → Misc → Access Token |
| `SP_REST_BASE_URL` | No | `http://127.0.0.1:3876` | Override if Super Productivity runs on a different host |
| `MCP_HTTP_HOST` | No | `127.0.0.1` | Interface this server binds to. Keep it on loopback unless you know what you're doing |
| `MCP_HTTP_PORT` | No | `3877` | Port for this server's MCP endpoint |
| `MCP_HTTP_PATH` | No | `/mcp` | Path the MCP endpoint is served under |

This server does **not** load `.env` files — export the variables in the shell that runs `npm start`. See `.env.example` for a template.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Client shows the server as failed / not connected | The server process isn't running, or the URL/port is wrong | Start it with `npm start`; check `curl http://127.0.0.1:3877/` |
| `EADDRINUSE` on startup | Port 3877 already taken | Set `MCP_HTTP_PORT` to a free port and update the client URL |
| "Could not reach Super Productivity's Local REST API" | Super Productivity isn't running, or the Local REST API is disabled | Start Super Productivity, enable it in Settings → Misc |
| `401 Unauthorized` / "Authorization token required" | This installation requires a token that isn't configured | Get the token from Settings → Misc → Access Token, start with `SP_REST_TOKEN=… npm start` |
| Task counts don't match the Super Productivity UI | Completed tasks are excluded by default | Ask for "including completed tasks" |

## Security notes

- This server binds to `127.0.0.1` by default, so it's only reachable from the same machine. It has **no authentication** — anything that can reach the port has full control of your Super Productivity data. Don't set `MCP_HTTP_HOST=0.0.0.0` or expose the port through a tunnel/router without putting your own auth in front of it.
- The Super Productivity Local REST API likewise only accepts connections from `127.0.0.1`.
- Treat your `SP_REST_TOKEN`, if you have one, like any other credential — don't commit it, export it in the environment instead of hardcoding it.

## Limitations

- Requires the Super Productivity **desktop** app (Electron) — the Local REST API isn't available in the web build.
- The server and the MCP client must run on the same machine (localhost-only, no auth). Exposing it beyond localhost is your responsibility to secure.
- Re-parenting a task (moving it under a different parent) isn't supported by the underlying Local REST API — this is a limitation of Super Productivity's API, not this server.

## Contributing

Issues and PRs are welcome. If you hit a bug or want a tool that Super Productivity's Local REST API supports but this server doesn't yet expose, open an issue.

## Support

If this project saved you some time, you're welcome to [buy me a coffee ☕](https://ko-fi.com/mrswer).

## License

MIT — see [LICENSE](LICENSE).
