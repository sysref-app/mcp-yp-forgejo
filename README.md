# forgejo-mcp

Model Context Protocol server for [Forgejo](https://forgejo.org/) (also works with Gitea).

## Tools

- `create_pull_request` — open a PR against a repository.
- `create_pr_comment` — add a comment to a PR's conversation thread.
- `get_pull_request` — fetch a PR's metadata (title, description, author, state, branches).
- `list_pr_comments` — list the comments in a PR's conversation thread.
- `get_pr_diff` — fetch a PR's changes as a unified diff.

## Configuration

Set these environment variables before launching the server:

| Variable | Description |
| --- | --- |
| `FORGEJO_URL` | Base URL of the Forgejo instance (e.g. `https://codeberg.org`) |
| `FORGEJO_TOKEN` | Personal access token with `write:repository` scope |

## Install & build

```sh
bun install
bun run build
```

## Run

```sh
FORGEJO_URL=https://codeberg.org FORGEJO_TOKEN=xxx bun run dev
```

## Cursor team marketplace

This repo is importable as a Cursor team marketplace (Dashboard → Plugins & MCPs → Add Marketplace → Import from Repo). Use the **GitHub** remote:

`https://github.com/sysref-app/mcp-yp-forgejo`

After import, install **Forgejo MCP** and set `FORGEJO_URL` / `FORGEJO_TOKEN` under Plugins → Configure.

Manifests:

- `.cursor-plugin/marketplace.json` — marketplace registry
- `.cursor-plugin/plugin.json` — plugin metadata + config variables
- `mcp.json` — launches the server via `npx github:sysref-app/mcp-yp-forgejo`

## MCP client config (manual)

```json
{
  "mcpServers": {
    "forgejo": {
      "command": "npx",
      "args": ["-y", "github:sysref-app/mcp-yp-forgejo"],
      "env": {
        "FORGEJO_URL": "https://code.vilor.com",
        "FORGEJO_TOKEN": "xxx"
      }
    }
  }
}
```

Or a local build:

```json
{
  "mcpServers": {
    "forgejo": {
      "command": "node",
      "args": ["/absolute/path/to/forgejo-mcp/dist/index.js"],
      "env": {
        "FORGEJO_URL": "https://code.vilor.com",
        "FORGEJO_TOKEN": "xxx"
      }
    }
  }
}
```

