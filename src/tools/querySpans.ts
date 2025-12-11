import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import { querySpansInputSchema, type QuerySpansInput } from "../types.js";

export const querySpansTool: Tool = {
  name: "query_spans",
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
  inputSchema: {
    type: "object",
    properties: {
      observableServiceId: {
        type: "string",
        description: "Service ID to query. Required if multiple services are available.",
      },
      where: {
        type: "object",
        description: "Filter conditions for spans",
        properties: {
          name: {
            type: "object",
            description: "Filter by span/endpoint name",
            properties: {
              eq: { type: "string" },
              contains: { type: "string" },
              startsWith: { type: "string" },
              in: { type: "array", items: { type: "string" } },
            },
          },
          packageName: {
            type: "object",
            description: "Filter by instrumentation package (http, pg, fetch, grpc, etc.)",
            properties: {
              eq: { type: "string" },
              in: { type: "array", items: { type: "string" } },
            },
          },
          instrumentationName: {
            type: "object",
            description: "Filter by instrumentation name",
            properties: { eq: { type: "string" } },
          },
          duration: {
            type: "object",
            description: "Filter by duration in milliseconds",
            properties: {
              gt: { type: "number" },
              gte: { type: "number" },
              lt: { type: "number" },
              lte: { type: "number" },
            },
          },
          traceId: {
            type: "object",
            description: "Filter by trace ID",
            properties: { eq: { type: "string" } },
          },
          isRootSpan: {
            type: "object",
            description: "Filter by root span status",
            properties: { eq: { type: "boolean" } },
          },
          AND: {
            type: "array",
            description: "Combine conditions with AND",
          },
          OR: {
            type: "array",
            description: "Combine conditions with OR",
          },
        },
      },
      jsonbFilters: {
        type: "array",
        description: "Filters for JSONB columns (inputValue, outputValue, metadata)",
        items: {
          type: "object",
          properties: {
            column: {
              type: "string",
              enum: ["inputValue", "outputValue", "metadata", "status"],
              description: "JSONB column to filter",
            },
            jsonPath: {
              type: "string",
              description: "JSONPath expression starting with $ (e.g., $.statusCode, $.body.userId)",
            },
            eq: { description: "Equals value" },
            neq: { description: "Not equals value" },
            gt: { type: "number", description: "Greater than" },
            gte: { type: "number", description: "Greater than or equal" },
            lt: { type: "number", description: "Less than" },
            lte: { type: "number", description: "Less than or equal" },
            contains: { type: "string", description: "String contains" },
            castAs: {
              type: "string",
              enum: ["text", "int", "float", "boolean"],
              description: "Cast JSONB value to type for comparison",
            },
            decodeBase64: {
              type: "boolean",
              description: "Decode base64 string before applying filter",
            },
            thenPath: {
              type: "string",
              description: "Additional JSONPath to apply after base64 decoding",
            },
          },
          required: ["column", "jsonPath"],
        },
      },
      orderBy: {
        type: "array",
        description: "Order results",
        items: {
          type: "object",
          properties: {
            field: { type: "string", enum: ["timestamp", "duration", "name"] },
            direction: { type: "string", enum: ["ASC", "DESC"] },
          },
          required: ["field", "direction"],
        },
      },
      limit: {
        type: "number",
        description: "Maximum results to return (1-100, default 20)",
        default: 20,
      },
      offset: {
        type: "number",
        description: "Pagination offset",
        default: 0,
      },
      includeInputOutput: {
        type: "boolean",
        description: "Include full inputValue/outputValue in results (can be verbose)",
        default: false,
      },
      maxPayloadLength: {
        type: "number",
        description: "Truncate payload strings to this length",
        default: 500,
      },
    },
  },
};

export async function handleQuerySpans(
  client: TuskDriftApiClient,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = querySpansInputSchema.parse(args) as QuerySpansInput;
  const result = await client.querySpans(input);

  const summary = [
    `Found ${result.total} spans (showing ${result.spans.length})`,
    result.hasMore ? `More results available (offset: ${(input.offset || 0) + result.spans.length})` : "",
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
        `    Duration: ${span.duration.toFixed(2)}ms`,
        `    Status: ${span.status.code === 0 ? "OK" : span.status.code === 1 ? "UNSET" : "ERROR"}`,
        `    Timestamp: ${span.timestamp}`,
      ];

      if (span.inputValue && input.includeInputOutput) {
        lines.push(`    Input: ${JSON.stringify(span.inputValue, null, 2).split("\n").join("\n    ")}`);
      }
      if (span.outputValue && input.includeInputOutput) {
        lines.push(`    Output: ${JSON.stringify(span.outputValue, null, 2).split("\n").join("\n    ")}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: `${summary}\n\n${spansText}`,
      },
    ],
  };
}

