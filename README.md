# Tusk Drift MCP

An MCP server for querying API traffic data captured by [Tusk Drift](https://docs.usetusk.ai/api-tests/overview). This enables AI assistants to search, analyze, and debug your application's API traffic, including HTTP requests, database queries, and distributed traces.

New to Tusk Drift? Check out [our docs](https://docs.usetusk.ai/api-tests/overview) and [sign up for an account](https://app.usetusk.ai/app).

## Installation

```bash
npm install -g @use-tusk/drift-mcp
```

## Setup

### Claude Desktop / Cursor MCP settings

Add to your `claude_desktop_config.json`:

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

### Configuration (env vars)

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

## Development

```bash
npm install
npm run dev      # Development with hot reload
npm run build    # Production build
```

## License

[MIT](./LICENSE)
