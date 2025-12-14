# Tusk Drift MCP

[![npm version](https://badge.fury.io/js/@use-tusk%2Fdrift-mcp.svg)](https://www.npmjs.com/package/@use-tusk/drift-mcp)

An MCP server for querying API traffic data captured by [Tusk Drift](https://docs.usetusk.ai/api-tests/overview). This enables AI assistants to search, analyze, and debug your application's API traffic, including HTTP requests, database queries, and distributed traces.

New to Tusk Drift? Check out [our docs](https://docs.usetusk.ai/api-tests/overview) and [sign up for an account](https://app.usetusk.ai/app).

## Setup

### Option 1: Remote MCP Server (Recommended)

Connect directly to the hosted Tusk Drift MCP server. This is the easiest setup and doesn't require running anything locally.

**For Cursor:**

Add to your Cursor MCP settings (`~/.cursor/mcp.json` or workspace `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "tusk-drift": {
      "url": "https://api.usetusk.ai/api/drift-mcp",
      "headers": {
        "x-api-key": "YOUR_TUSK_API_KEY"
      }
    }
  }
}
```

**For Claude Desktop:**

```json
{
  "mcpServers": {
    "tusk-drift": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.usetusk.ai/api/drift-mcp"],
      "env": {
        "MCP_HEADERS": "{\"x-api-key\": \"YOUR_TUSK_API_KEY\"}"
      }
    }
  }
}
```

### Option 2: Local Installation (via NPX)

Run the MCP server locally. This is useful if you need offline access or custom configuration.

```bash
npm install -g @use-tusk/drift-mcp
```

**For Claude Desktop / Cursor:**

Add to your `claude_desktop_config.json` or Cursor MCP settings:

```json
{
  "mcpServers": {
    "tusk-drift": {
      "command": "npx",
      "args": ["-y", "@use-tusk/drift-mcp"],
      "env": {
        "TUSK_API_KEY": "your-api-token"
      }
    }
  }
}
```

### Configuration (env vars for local installation)

| Variable | Required | Description |
|----------|----------|-------------|
| `TUSK_API_KEY` | Yes | Your API token |
| `TUSK_DRIFT_API_URL` | No | Tusk API URL (defaults to `https://api.usetusk.ai`) |
| `TUSK_DRIFT_SERVICE_ID` | No | Service ID (auto-discovered from `.tusk/config.yaml` if not set) |

## Available Tools

| Tool | Description |
|------|-------------|
| `query_spans` | Search API traffic with flexible filters |
| `get_schema` | Get structure/schema of captured traffic |
| `list_distinct_values` | Discover available endpoints and field values |
| `aggregate_spans` | Calculate latency percentiles, error rates, counts |
| `get_trace` | View distributed traces as hierarchical trees |
| `get_spans_by_ids` | Fetch specific spans with full payloads |

## Support

Need help? Open an issue or contact us at <support@usetusk.ai>.

## License

[MIT](./LICENSE)
