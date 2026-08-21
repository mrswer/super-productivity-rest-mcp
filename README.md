# super-productivity-rest-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes [Super Productivity](https://super-productivity.com/)'s built-in **Local REST API** as MCP tools — so Claude (or any other MCP client) can list, create, update, archive and control your tasks, projects and tags through plain conversation.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

## Why this exists

Super Productivity ships with a [Local REST API](https://github.com/super-productivity/super-productivity/blob/master/docs/wiki/3.01-API.md) (`http://127.0.0.1:3876`), but it doesn't speak MCP — it's a plain REST API. This project is a thin, direct translation layer between the two, with a few design choices that set it apart from other Super Productivity MCP integrations:

- **Talks directly to the official Local REST API** — no Super Productivity plugin to install, no Node-execution permission to grant, no file-based polling. One HTTP request per tool call.
- **Full coverage** of everything the Local REST API exposes: task CRUD (including delete), archive/restore, current-task control (start/stop/set/get), projects, tags, and health/status — 15 tools total, mapped 1:1 to the API's endpoints.
- **Handles the access-token variant.** Some Super Productivity versions require a bearer token for the Local REST API and some don't — this server supports both via an optional environment variable.
- **Zero extra runtime dependencies** beyond Node.js — no Python, no Super Productivity plugin bundle.

## Prerequisites

- [Super Productivity](https://super-productivity.com/) desktop app (Electron — the Local REST API is not available in the web version)
- Node.js 18+
- An MCP client — this README focuses on [Claude Code](https://code.claude.com/docs), but any MCP client that supports local (stdio) servers will work

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
git clone https://github.com/mrswer/super-productivity-rest-mcp.git
cd super-productivity-rest-mcp
npm install
```

## 3. Register with Claude Code

The server's name must come **before** the `--scope`/`-e` flags, or the CLI misparses the following arguments as more environment variables.

Without a token:

```bash
claude mcp add super-productivity --scope user -- node /absolute/path/to/super-productivity-rest-mcp/server.js
```

With a token:

```bash
claude mcp add super-productivity --scope user -e SP_REST_TOKEN=your-token-here -- node /absolute/path/to/super-productivity-rest-mcp/server.js
```

`--scope user` registers the server for every project, in both the `claude` CLI and the Claude Code UI (they share the same `~/.claude.json`).

Verify:

```bash
claude mcp list
# super-productivity: node /path/to/server.js - ✔ Connected
```

### Other MCP clients

Any client that supports local stdio servers works the same way — point it at `node /absolute/path/to/server.js`, and set `SP_REST_TOKEN` (and optionally `SP_REST_BASE_URL`) in its environment-variable configuration if needed. See `.env.example` for the variables this server reads (note: it does **not** load `.env` files automatically — your MCP client must pass real environment variables).

> **Note on remote/cloud chat clients:** this server uses stdio transport and must run on the same machine as Super Productivity. It will not work with a cloud-hosted chat client (e.g. a browser-based Claude session) that requires a remote `https://` MCP endpoint — only with clients that can spawn a local process, such as Claude Code.

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
| `SP_REST_BASE_URL` | No | `http://127.0.0.1:3876` | Override if running the server on a different host than Super Productivity |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `✘ Failed to connect` in `claude mcp list` | Wrong path to `server.js`, or dependencies not installed | Check the path (`claude mcp get super-productivity`), run `npm install` in the project directory |
| "Could not reach Super Productivity's Local REST API" | Super Productivity isn't running, or the Local REST API is disabled | Start Super Productivity, enable it in Settings → Misc |
| `401 Unauthorized` / "Authorization token required" | This installation requires a token that isn't configured | Get the token from Settings → Misc → Access Token, pass it as `SP_REST_TOKEN` (see step 3) |
| `Invalid environment variable format: <server-name>` when running `claude mcp add` | Argument order — `-e` before the server name | Put the server name right after `add`, before `--scope`/`-e` |
| Task counts don't match the Super Productivity UI | Completed tasks are excluded by default | Ask for "including completed tasks" |

## Security notes

- The Local REST API only accepts connections from `127.0.0.1` — it is not reachable from other machines unless you deliberately expose it (not recommended).
- This server runs as a local subprocess over stdio; it is not a network service and doesn't listen on any port itself.
- Treat your `SP_REST_TOKEN`, if you have one, like any other credential — don't commit it, and pass it via your MCP client's environment-variable configuration rather than hardcoding it.

## Limitations

- Requires the Super Productivity **desktop** app (Electron) — the Local REST API isn't available in the web build.
- Uses stdio transport only; there is no bundled HTTP/remote transport. If you need to reach this from a cloud-hosted MCP client, you'd need to front it with your own HTTP transport and a tunnel — out of scope for this project.
- Re-parenting a task (moving it under a different parent) isn't supported by the underlying Local REST API — this is a limitation of Super Productivity's API, not this server.

## Contributing

Issues and PRs are welcome. If you hit a bug or want a tool that Super Productivity's Local REST API supports but this server doesn't yet expose, open an issue.

## Support

If this project saved you some time, you're welcome to [buy me a coffee ☕](https://ko-fi.com/mrswer).

## License

MIT — see [LICENSE](LICENSE).
