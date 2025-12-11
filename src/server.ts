import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CreateMcpServerOptions } from "./provider.js";
import type {
  TraceSpan,
  SchemaResult,
  QuerySpansInput,
  GetSchemaInput,
  ListDistinctValuesInput,
  AggregateSpansInput,
  GetTraceInput,
  GetSpansByIdsInput,
} from "./types.js";
import {
  querySpansInputSchema,
  getSchemaInputSchema,
  listDistinctValuesInputSchema,
  aggregateSpansInputSchema,
  getTraceInputSchema,
  getSpansByIdsInputSchema,
} from "./types.js";
import type { QuerySpansResult } from "./provider.js";

declare const __PACKAGE_VERSION__: string;
declare const __PACKAGE_NAME__: string;
export const PACKAGE_VERSION = __PACKAGE_VERSION__;
export const PACKAGE_NAME = __PACKAGE_NAME__;

// ============================================
// Response Formatters
// ============================================

function formatQuerySpansResult(result: QuerySpansResult, includeInputOutput: boolean): string {
  const summary = [
    `Found ${result.total} spans (showing ${result.spans.length})`,
    result.hasMore ? `More results available (offset: ${result.spans.length})` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const spansText = result.spans
    .map((span, i) => {
      const lines = [
        `[${i + 1}] ${span.name}`,
        `    ID: ${span.id}`,
        `    Trace: ${span.traceId}`,
        `    Package: ${span.packageName}`,
        `    Duration: ${span.duration?.toFixed(2) ?? "N/A"}ms`,
        `    Status: ${span.status?.code === 0 ? "OK" : span.status?.code === 1 ? "UNSET" : "ERROR"}`,
        `    Timestamp: ${span.timestamp}`,
      ];

      if (span.inputValue && includeInputOutput) {
        lines.push(
          `    Input: ${JSON.stringify(span.inputValue, null, 2).split("\n").join("\n    ")}`
        );
      }
      if (span.outputValue && includeInputOutput) {
        lines.push(
          `    Output: ${JSON.stringify(span.outputValue, null, 2).split("\n").join("\n    ")}`
        );
      }

      return lines.join("\n");
    })
    .join("\n\n");

  return `${summary}\n\n${spansText}`;
}

function formatSchemaResult(result: SchemaResult): string {
  const sections: string[] = [];

  if (result.description) {
    sections.push(`## Description\n${result.description}`);
  }

  if (result.commonJsonbFields) {
    sections.push(`## Common Queryable Fields

**inputValue fields:** ${result.commonJsonbFields.inputValue.join(", ") || "(none)"}

**outputValue fields:** ${result.commonJsonbFields.outputValue.join(", ") || "(none)"}`);
  }

  if (result.inputSchema) {
    sections.push(
      `## Input Schema\n\`\`\`json\n${JSON.stringify(result.inputSchema, null, 2)}\n\`\`\``
    );
  }

  if (result.outputSchema) {
    sections.push(
      `## Output Schema\n\`\`\`json\n${JSON.stringify(result.outputSchema, null, 2)}\n\`\`\``
    );
  }

  if (result.exampleSpanRecording) {
    sections.push(
      `## Example Span\n\`\`\`json\n${JSON.stringify(result.exampleSpanRecording, null, 2)}\n\`\`\``
    );
  }

  return sections.join("\n\n") || "No schema information available.";
}

function formatTraceTree(span: TraceSpan, indent: number = 0, includePayloads: boolean): string {
  const prefix = "  ".repeat(indent);
  const statusIcon = span.status?.code === 0 ? "✓" : span.status?.code === 2 ? "✗" : "○";

  let result = `${prefix}${statusIcon} ${span.name} (${span.duration?.toFixed(2) ?? "N/A"}ms) [${span.packageName}]\n`;
  result += `${prefix}   ID: ${span.spanId}\n`;

  if (includePayloads && span.inputValue) {
    const inputStr = JSON.stringify(span.inputValue, null, 2).split("\n").join(`\n${prefix}   `);
    result += `${prefix}   Input: ${inputStr}\n`;
  }

  if (includePayloads && span.outputValue) {
    const outputStr = JSON.stringify(span.outputValue, null, 2).split("\n").join(`\n${prefix}   `);
    result += `${prefix}   Output: ${outputStr}\n`;
  }

  if (span.children && span.children.length > 0) {
    for (const child of span.children) {
      result += formatTraceTree(child, indent + 1, includePayloads);
    }
  }

  return result;
}

// ============================================
// Default Instructions
// ============================================

export const DEFAULT_INSTRUCTIONS = `Search and analyze API traffic span recordings from Tusk Drift.

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

// ============================================
// MCP Server Factory
// ============================================

/**
 * Create an MCP server with Tusk Drift tools.
 * 
 * @param options Configuration options including the data provider
 * @returns Configured McpServer instance
 */
export function createMcpServer(options: CreateMcpServerOptions): McpServer {
  const {
    provider,
    accessControl,
    instructions = DEFAULT_INSTRUCTIONS,
    name = "tusk-drift",
    version = PACKAGE_VERSION,
  } = options;

  const server = new McpServer(
    { name, version },
    {
      capabilities: { tools: {} },
      instructions,
    }
  );

  // Helper for access control
  async function checkAccess(observableServiceId: string): Promise<boolean> {
    if (!accessControl) return true;
    return accessControl.canAccessService(observableServiceId);
  }

  // ============================================
  // Tool: query_spans
  // ============================================
  server.registerTool(
    "query_spans",
    {
      description: `Search and filter API traffic span recordings.

Use this tool to:
- Find specific API calls by endpoint name, HTTP method, or status code
- Search for errors or slow requests
- Get recent traffic for a specific endpoint
- Debug specific API calls

Examples:
- Find failed requests: where.name = { contains: "/api/users" }, jsonbFilters = [{ column: "outputValue", jsonPath: "$.statusCode", gte: 400, castAs: "int" }]
- Find slow requests: where.duration = { gt: 1000 }
- Recent traffic for endpoint: where.name = { eq: "/api/orders" }, limit = 10, orderBy = [{ field: "timestamp", direction: "DESC" }]`,
      inputSchema: querySpansInputSchema.shape,
    },
    async (args) => {
      const input = args as QuerySpansInput;

      if (input.observableServiceId && !(await checkAccess(input.observableServiceId))) {
        return {
          content: [{ type: "text" as const, text: "Error: Access denied to observable service" }],
          isError: true,
        };
      }

      try {
        const result = await provider.querySpans(input);
        return {
          content: [
            {
              type: "text" as const,
              text: formatQuerySpansResult(result, input.includeInputOutput ?? false),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error executing query_spans: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // Tool: get_schema
  // ============================================
  server.registerTool(
    "get_schema",
    {
      description: `Get schema and structure information for span recordings on Tusk Drift.

Use this tool to:
- Understand what fields are available for a specific instrumentation type
- See example payloads for HTTP requests, database queries, etc.
- Learn what to filter on before querying spans

Common package names:
- http: Incoming HTTP requests (has statusCode, method, url, headers)
- fetch: Outgoing HTTP calls
- pg: PostgreSQL queries (has db.statement, db.name)
- grpc: gRPC calls
- express: Express.js middleware spans`,
      inputSchema: getSchemaInputSchema.shape,
    },
    async (args) => {
      const input = args as GetSchemaInput;

      if (input.observableServiceId && !(await checkAccess(input.observableServiceId))) {
        return {
          content: [{ type: "text" as const, text: "Error: Access denied to observable service" }],
          isError: true,
        };
      }

      try {
        const result = await provider.getSchema(input);
        return {
          content: [{ type: "text" as const, text: formatSchemaResult(result) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error executing get_schema: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // Tool: list_distinct_values
  // ============================================
  server.registerTool(
    "list_distinct_values",
    {
      description: `List unique values for a field, ordered by frequency.

Use this tool to:
- Discover available endpoints (field: "name")
- See all instrumentation packages in use (field: "packageName")
- Find unique environments (field: "environment")
- Explore JSONB values like status codes (field: "outputValue.statusCode")

This helps you understand what values exist before building specific queries.`,
      inputSchema: listDistinctValuesInputSchema.shape,
    },
    async (args) => {
      const input = args as ListDistinctValuesInput;

      if (input.observableServiceId && !(await checkAccess(input.observableServiceId))) {
        return {
          content: [{ type: "text" as const, text: "Error: Access denied to observable service" }],
          isError: true,
        };
      }

      try {
        const result = await provider.listDistinctValues(input);
        const header = `Distinct values for "${result.field}" (${result.values.length} unique values):\n`;
        const valuesList = result.values
          .map((v, i) => {
            const valueStr = typeof v.value === "string" ? v.value : JSON.stringify(v.value);
            return `${i + 1}. ${valueStr} (${v.count} occurrences)`;
          })
          .join("\n");

        return {
          content: [{ type: "text" as const, text: header + valuesList }],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error executing list_distinct_values: ${error}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // Tool: aggregate_spans
  // ============================================
  server.registerTool(
    "aggregate_spans",
    {
      description: `Calculate aggregated metrics and statistics across spans.

Use this tool to:
- Get latency percentiles for endpoints (p50, p95, p99)
- Calculate error rates by endpoint
- Get request counts over time
- Compare performance across environments

Examples:
- Endpoint latency: groupBy = ["name"], metrics = ["count", "avgDuration", "p95Duration"]
- Error rates: groupBy = ["name"], metrics = ["count", "errorCount", "errorRate"]
- Hourly trends: timeBucket = "hour", metrics = ["count", "errorRate"]`,
      inputSchema: aggregateSpansInputSchema.shape,
    },
    async (args) => {
      const input = args as AggregateSpansInput;

      if (input.observableServiceId && !(await checkAccess(input.observableServiceId))) {
        return {
          content: [{ type: "text" as const, text: "Error: Access denied to observable service" }],
          isError: true,
        };
      }

      try {
        const result = await provider.aggregateSpans(input);
        const header = `Aggregation Results (${result.results.length} rows):\n`;

        const rows = result.results
          .map((row, i) => {
            const groupStr = Object.entries(row.groupValues || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(", ");

            const metrics: string[] = [];
            if (row.count !== undefined) metrics.push(`count: ${row.count}`);
            if (row.errorCount !== undefined) metrics.push(`errors: ${row.errorCount}`);
            if (row.errorRate !== undefined)
              metrics.push(`error rate: ${(row.errorRate * 100).toFixed(2)}%`);
            if (row.avgDuration !== undefined) metrics.push(`avg: ${row.avgDuration.toFixed(2)}ms`);
            if (row.minDuration !== undefined) metrics.push(`min: ${row.minDuration.toFixed(2)}ms`);
            if (row.maxDuration !== undefined) metrics.push(`max: ${row.maxDuration.toFixed(2)}ms`);
            if (row.p50Duration !== undefined) metrics.push(`p50: ${row.p50Duration.toFixed(2)}ms`);
            if (row.p95Duration !== undefined) metrics.push(`p95: ${row.p95Duration.toFixed(2)}ms`);
            if (row.p99Duration !== undefined) metrics.push(`p99: ${row.p99Duration.toFixed(2)}ms`);

            const timeBucketStr = row.timeBucket ? ` [${row.timeBucket}]` : "";

            return `${i + 1}. ${groupStr || "(all)"}${timeBucketStr}\n   ${metrics.join(" | ")}`;
          })
          .join("\n\n");

        return {
          content: [{ type: "text" as const, text: header + rows }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error executing aggregate_spans: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // Tool: get_trace
  // ============================================
  server.registerTool(
    "get_trace",
    {
      description: `Get all spans in a distributed trace as a hierarchical tree.

Use this tool to:
- Debug a specific request end-to-end
- See the full call chain from HTTP request to database queries
- Understand timing and dependencies between spans
- Identify bottlenecks in a request

First use query_spans to find spans, then use the traceId to get the full trace.`,
      inputSchema: getTraceInputSchema.shape,
    },
    async (args) => {
      const input = args as GetTraceInput;

      if (input.observableServiceId && !(await checkAccess(input.observableServiceId))) {
        return {
          content: [{ type: "text" as const, text: "Error: Access denied to observable service" }],
          isError: true,
        };
      }

      try {
        const result = await provider.getTrace(input);

        if (!result.traceTree) {
          return {
            content: [{ type: "text" as const, text: `No trace found for ID: ${input.traceId}` }],
          };
        }

        const header = `Trace: ${input.traceId}\nSpan Count: ${result.spanCount}\n\nTrace Tree:\n`;
        const tree = formatTraceTree(result.traceTree, 0, input.includePayloads ?? false);

        return {
          content: [{ type: "text" as const, text: header + tree }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error executing get_trace: ${error}` }],
          isError: true,
        };
      }
    }
  );

  // ============================================
  // Tool: get_spans_by_ids
  // ============================================
  server.registerTool(
    "get_spans_by_ids",
    {
      description: `Fetch specific span recordings by their IDs.

Use this tool when you have span IDs from a previous query and need the full details including payloads.

This is useful for:
- Getting full details for spans found via query_spans
- Examining specific requests in detail
- Comparing multiple specific spans`,
      inputSchema: getSpansByIdsInputSchema.shape,
    },
    async (args) => {
      const input = args as GetSpansByIdsInput;

      if (input.observableServiceId && !(await checkAccess(input.observableServiceId))) {
        return {
          content: [{ type: "text" as const, text: "Error: Access denied to observable service" }],
          isError: true,
        };
      }

      try {
        const result = await provider.getSpansByIds(input);

        if (result.spans.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No spans found for the provided IDs." }],
          };
        }

        const spansText = result.spans
          .map((span, i) => {
            const lines = [
              `## Span ${i + 1}: ${span.name}`,
              `- **ID:** ${span.id}`,
              `- **Trace ID:** ${span.traceId}`,
              `- **Span ID:** ${span.spanId}`,
              `- **Package:** ${span.packageName}`,
              `- **Duration:** ${span.duration?.toFixed(2) ?? "N/A"}ms`,
              `- **Status:** ${span.status?.code === 0 ? "OK" : span.status?.code === 1 ? "UNSET" : "ERROR"}`,
              `- **Timestamp:** ${span.timestamp}`,
              `- **Root Span:** ${span.isRootSpan ? "Yes" : "No"}`,
            ];

            if (span.inputValue) {
              lines.push(
                `\n**Input:**\n\`\`\`json\n${JSON.stringify(span.inputValue, null, 2)}\n\`\`\``
              );
            }

            if (span.outputValue) {
              lines.push(
                `\n**Output:**\n\`\`\`json\n${JSON.stringify(span.outputValue, null, 2)}\n\`\`\``
              );
            }

            return lines.join("\n");
          })
          .join("\n\n---\n\n");

        return {
          content: [
            { type: "text" as const, text: `Found ${result.spans.length} spans:\n\n${spansText}` },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error executing get_spans_by_ids: ${error}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
