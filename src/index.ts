#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TuskDriftApiClient } from "./apiClient.js";
import { ServiceDiscoveryContext } from "./serviceDiscovery.js";
import { createMcpServer, DEFAULT_INSTRUCTIONS, PACKAGE_NAME, PACKAGE_VERSION } from "./server.js";
import type { TuskDriftConfig } from "./types.js";

// Re-export for library usage
export { createMcpServer, DEFAULT_INSTRUCTIONS, PACKAGE_NAME, PACKAGE_VERSION } from "./server.js";
export { TuskDriftApiClient } from "./apiClient.js";
export { ServiceDiscoveryContext } from "./serviceDiscovery.js";
export type {
  DriftDataProvider,
  DriftAccessControl,
  CreateMcpServerOptions,
  QuerySpansResult,
  ListDistinctValuesResult,
  AggregateSpansResult,
  GetTraceResult,
  GetSpansByIdsResult,
} from "./provider.js";
export type {
  TuskDriftConfig,
  SpanRecording,
  TraceSpan,
  SchemaResult,
  DistinctValue,
  AggregationRow,
  QuerySpansInput,
  GetSchemaInput,
  ListDistinctValuesInput,
  AggregateSpansInput,
  GetTraceInput,
  GetSpansByIdsInput,
} from "./types.js";

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
  const servicesDescription = serviceContext.getServicesDescription();
  return `${DEFAULT_INSTRUCTIONS}\n\n${servicesDescription}`;
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

  if (!serviceContext.hasServices()) {
    console.error(
      "Warning: No Tusk services found. Set TUSK_DRIFT_SERVICE_ID or ensure .tusk/config.yaml exists in workspace."
    );
  }

  const server = createMcpServer({
    provider: client,
    instructions: generateInstructions(serviceContext),
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
  });

  // Register resource for service discovery
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

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP comms)
  console.error("Tusk Drift MCP server started");
  console.error(`API URL: ${config.apiBaseUrl}`);
  console.error(serviceContext.getServicesDescription());
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
