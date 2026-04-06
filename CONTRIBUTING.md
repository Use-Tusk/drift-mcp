# Contributing

This guide covers local development workflows for maintainers and contributors.

## Local development

Install dependencies:

```bash
npm install
```

Useful commands:

```bash
npm run build
npm run typecheck
```

## Releasing

```bash
sh ./scripts/release.sh patch
```

Supported bump types are `patch` (default), `minor`, and `major`.

The script runs preflight checks, bumps `package.json` + `package-lock.json`, rebuilds the package so the embedded version matches, pushes the tag, and creates a GitHub release. That GitHub release triggers the npm publish workflow in `.github/workflows/publish.yml`.

If `gh` is unavailable, the script will still push the tag and tell you to create the GitHub release manually.

## Running the MCP locally

The MCP server is a stdio server. `stdout` is reserved for MCP JSON-RPC traffic, so avoid wrapping the command in other commands that print to `stdout`.

Environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `TUSK_API_KEY` | Yes | Tusk API key used for backend requests |
| `TUSK_DRIFT_API_URL` | No | Backend base URL such as `https://api.usetusk.ai` or `http://localhost:8000` |
| `TUSK_DRIFT_SERVICE_ID` | No | Default observable service ID |
| `TUSK_WORKSPACE_ROOTS` | No | Comma-separated roots to search for `.tusk/config.yaml` service definitions |

`TUSK_DRIFT_API_URL` should be the backend origin, not the hosted MCP endpoint. For example, use `http://localhost:8000`, not `http://localhost:8000/api/drift-mcp`.

## Cursor setup from a local checkout

### Recommended: source mode

Now that source mode works without a build step, this is the easiest setup while iterating:

```json
{
  "mcpServers": {
    "tusk-drift-local": {
      "command": "bash",
      "args": [
        "-lc",
        "cd /absolute/path/to/drift-mcp && exec npx tsx src/index.ts"
      ],
      "env": {
        "TUSK_API_KEY": "YOUR_TUSK_API_KEY",
        "TUSK_DRIFT_API_URL": "http://localhost:8000",
        "TUSK_WORKSPACE_ROOTS": "/absolute/path/to/your/workspaces"
      }
    }
  }
}
```

### Built mode

If you want to test the packaged output, build first in a normal terminal:

```bash
npm run build
```

Then point Cursor at the built CJS entry:

```json
{
  "mcpServers": {
    "tusk-drift-local": {
      "command": "node",
      "args": ["/absolute/path/to/drift-mcp/dist/index.cjs"],
      "env": {
        "TUSK_API_KEY": "YOUR_TUSK_API_KEY",
        "TUSK_DRIFT_API_URL": "http://localhost:8000",
        "TUSK_WORKSPACE_ROOTS": "/absolute/path/to/your/workspaces"
      }
    }
  }
}
```

## Common pitfalls

- Do not run `npm run build && node ...` directly inside the MCP command unless you redirect build output away from `stdout`.
- The published CLI/bin entry uses `dist/index.cjs`.
- If multiple services are discovered, set `observableServiceId` in the tool call or provide `TUSK_DRIFT_SERVICE_ID`.
- If no service is discovered, check `TUSK_WORKSPACE_ROOTS` or set `TUSK_DRIFT_SERVICE_ID` explicitly.

## Testing local backend + local MCP

Typical setup:

1. Start the backend locally.
2. Set `TUSK_DRIFT_API_URL=http://localhost:8000`.
3. Point Cursor or another MCP client at the local `drift-mcp` checkout.
4. Run a simple query like `list_distinct_values` for `packageName` before trying more complex filters.
