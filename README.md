# forgejo-mcp

Model Context Protocol server for [Forgejo](https://forgejo.org/) (also works with Gitea).

## Tools

- `create_pull_request` — open a PR against a repository. Optional `media` uploads images and embeds them as markdown links in the description.
- `update_pull_request` — update a PR's title, description, and/or state. Omit a field to leave it unchanged; pass `""` for body to clear. Optional `media` works like create.
- `create_pr_comment` — add a comment to a PR's conversation thread. Optional `media` uploads images and embeds them as markdown links in the comment.
- `get_pull_request` — fetch a PR's metadata (title, description, author, state, branches).
- `list_pr_comments` — list the comments in a PR's conversation thread.
- `get_pr_diff` — fetch a PR's changes as a unified diff.

### Media uploads

Pass a `media` array on `create_pull_request`, `update_pull_request`, or `create_pr_comment`. Each item needs a `name` (e.g. `screenshot.png`) plus either a local `path` or `content_base64`. Supported types: png, jpeg, gif, webp (max 25 MiB each, up to 10 files).

Flow: create/update the PR/comment → upload each file via Forgejo's attachment API → edit the body to append `![name](browser_download_url)`.

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

