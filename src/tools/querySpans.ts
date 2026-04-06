import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import { parseQuerySpansInput } from "../types.js";
import {
  sortDirectionCodec,
  spanSortFieldCodec,
} from "@use-tusk/drift-schemas/query/span_query_helpers";

export const querySpansTool: Tool = {
  name: "query_spans",
  description: `Search and filter API traffic span recordings.

Use this tool to:
- Find specific API calls by endpoint name, HTTP method, or status code
- Search for errors or slow requests
- Get recent traffic for a specific endpoint
- Debug specific API calls

Examples:
- Find failed requests: where = { fields: { "outputValue.statusCode": { gte: 400, access: { castAs: "int" } } } }
- Find slow requests: where = { fields: { duration: { gt: 1000 } } }
- Recent traffic for endpoint: where = { fields: { name: { eq: "/api/orders" } } }, limit = 10, orderBy = [{ field: "timestamp", direction: "DESC" }]`,
  inputSchema: {
    type: "object",
    properties: {
      observableServiceId: {
        type: "string",
        description: "Service ID to query. Required if multiple services are available.",
      },
      where: {
        type: "object",
        description:
          "Recursive filter clause. Use where.fields for field predicates and where.and/or/not for boolean composition.",
      },
      orderBy: {
        type: "array",
        description: "Order results",
        items: {
          type: "object",
          properties: {
            field: {
              type: "string",
              enum: [...spanSortFieldCodec.names],
            },
            direction: { type: "string", enum: [...sortDirectionCodec.names] },
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
      includePayloads: {
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
  const input = parseQuerySpansInput(args);
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

      if (span.inputValue && input.includePayloads) {
        lines.push(`    Input: ${JSON.stringify(span.inputValue, null, 2).split("\n").join("\n    ")}`);
      }
      if (span.outputValue && input.includePayloads) {
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

