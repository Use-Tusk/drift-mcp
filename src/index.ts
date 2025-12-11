#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TuskDriftApiClient } from "./apiClient.js";
import { tools, toolHandlers } from "./tools/index.js";
import { ServiceDiscoveryContext } from "./serviceDiscovery.js";
import type { TuskDriftConfig } from "./types.js";
import {
  querySpansInputSchema,
  getSchemaInputSchema,
  listDistinctValuesInputSchema,
  aggregateSpansInputSchema,
  getTraceInputSchema,
  getSpansByIdsInputSchema,
} from "./types.js";

// Map tool names to their Zod schemas for proper validation
const toolInputSchemas: Record<string, unknown> = {
  query_spans: querySpansInputSchema,
  get_schema: getSchemaInputSchema,
  list_distinct_values: listDistinctValuesInputSchema,
  aggregate_spans: aggregateSpansInputSchema,
  get_trace: getTraceInputSchema,
  get_spans_by_ids: getSpansByIdsInputSchema,
};

const DEFAULT_API_URL = "https://api.usetusk.ai";

/**
 * Get the configuration from the environment variables.
 * `observableServiceId` is optional and can be discovered from workspace.
 *
 * @throws If required environment variables are not set.
 */
function getConfig(): TuskDriftConfig {
  const apiBaseUrl = process.env.TUSK_DRIFT_API_URL || DEFAULT_API_URL;
  const apiToken = process.env.TUSK_API_KEY;
  const observableServiceId = process.env.TUSK_DRIFT_SERVICE_ID;

  if (!apiToken) {
    throw new Error("TUSK_API_KEY environment variable is required");
  }

  return {
    apiBaseUrl,
    apiToken,
    observableServiceId,
  };
}

/**
 * Generate instructions that include discovered services.
 */
function generateInstructions(serviceContext: ServiceDiscoveryContext): string {
  const baseInstructions = `Search and analyze API traffic span recordings from Tusk Drift.

This MCP server helps you query, analyze, and debug API traffic including:
- HTTP requests/responses, database queries, gRPC calls, and more
- Latency metrics and error rates
- Distributed traces across services

Workflow tips:
- Start with list_distinct_values to discover available endpoints
- Use query_spans to find specific API calls
- Use get_trace to debug a request's full call chain

Root cause analysis workflow:
If the user is investigating performance issues or errors, you can consider the following workflow:
1. Use query_spans or aggregate_spans to identify the problematic endpoint/span
2. Use get_trace to see the full call chain and identify which child span is the bottleneck
3. Look at the span's metadata (inputValue/outputValue) to understand the request context
4. Navigate to the relevant source code using the span name (usually maps to route handlers or functions)
5. Analyze the code path to understand the root cause (if you have access to the service's source code)
`;

  const servicesDescription = serviceContext.getServicesDescription();

  return `${baseInstructions}\n\n${servicesDescription}`;
}

async function main() {
  const config = getConfig();
  const client = new TuskDriftApiClient(config);

  // Initialize service discovery with env var as default
  const serviceContext = new ServiceDiscoveryContext(config.observableServiceId);

  // Try to discover services from workspace roots
  // These can be passed via TUSK_WORKSPACE_ROOTS env var (comma-separated)
  // or we'll try current directory
  const workspaceRoots = process.env.TUSK_WORKSPACE_ROOTS
    ? process.env.TUSK_WORKSPACE_ROOTS.split(",").map((r) => r.trim())
    : [process.cwd()];

  serviceContext.discoverFromRoots(workspaceRoots);

  client.setServiceContext(serviceContext);

  // Ensure we have at least one service available
  if (!serviceContext.hasServices()) {
    console.error(
      "Warning: No Tusk services found. Set TUSK_DRIFT_SERVICE_ID or ensure .tusk/config.yaml exists in workspace."
    );
  }

  const server = new McpServer(
    {
      name: "tusk-drift-mcp",
      version: "0.1.0",
    },
    {
      instructions: generateInstructions(serviceContext),
    }
  );

  // Resource for service discovery
  server.registerResource(
    "services",
    "tusk://services",
    {
      mimeType: "application/json",
      description: "List of available Tusk Drift services that can be queried",
    },
    async () => {
      const services = serviceContext.getServices();
      return {
        contents: [
          {
            uri: "tusk://services",
            text: JSON.stringify(
              {
                services: services.map((s) => ({
                  id: s.id,
                  name: s.name,
                  rootPath: s.rootPath,
                })),
                defaultServiceId: config.observableServiceId,
              },
              null,
              2
            ),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // Register each tool with its handler
  for (const tool of tools) {
    const handler = toolHandlers[tool.name];
    if (!handler) {
      console.error(`Warning: No handler found for tool ${tool.name}`);
      continue;
    }

    const zodSchema = toolInputSchemas[tool.name];
    if (!zodSchema) {
      console.error(`Warning: No Zod schema found for tool ${tool.name}`);
      continue;
    }

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: zodSchema as any,
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await handler(client, args);
          return result;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error executing ${tool.name}: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP comms)
  console.error("Tusk Drift MCP server started");
  console.error(`API URL: ${config.apiBaseUrl}`);
  console.error(serviceContext.getServicesDescription());
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

