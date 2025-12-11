import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import { getSpansByIdsInputSchema, type GetSpansByIdsInput } from "../types.js";

export const getSpansByIdsTool: Tool = {
  name: "get_spans_by_ids",
  description: `Fetch specific span recordings by their IDs.

Use this tool when you have span IDs from a previous query and need the full details including payloads.

This is useful for:
- Getting full details for spans found via query_spans
- Examining specific requests in detail
- Comparing multiple specific spans`,
  inputSchema: {
    type: "object",
    properties: {
      observableServiceId: {
        type: "string",
        description: "Service ID to query. Required if multiple services are available.",
      },
      ids: {
        type: "array",
        items: { type: "string" },
        description: "Span recording IDs to fetch (max 20)",
      },
      includePayloads: {
        type: "boolean",
        description: "Include full inputValue/outputValue",
        default: true,
      },
      maxPayloadLength: {
        type: "number",
        description: "Truncate payload strings to this length",
        default: 500,
      },
    },
    required: ["ids"],
  },
};

export async function handleGetSpansByIds(
  client: TuskDriftApiClient,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = getSpansByIdsInputSchema.parse(args) as GetSpansByIdsInput;
  const result = await client.getSpansByIds(input);

  if (result.spans.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No spans found for the provided IDs.`,
        },
      ],
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
        `- **Duration:** ${span.duration.toFixed(2)}ms`,
        `- **Status:** ${span.status.code === 0 ? "OK" : span.status.code === 1 ? "UNSET" : "ERROR"}`,
        `- **Timestamp:** ${span.timestamp}`,
        `- **Root Span:** ${span.isRootSpan ? "Yes" : "No"}`,
      ];

      if (span.inputValue) {
        lines.push(`\n**Input:**\n\`\`\`json\n${JSON.stringify(span.inputValue, null, 2)}\n\`\`\``);
      }

      if (span.outputValue) {
        lines.push(`\n**Output:**\n\`\`\`json\n${JSON.stringify(span.outputValue, null, 2)}\n\`\`\``);
      }

      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  return {
    content: [
      {
        type: "text",
        text: `Found ${result.spans.length} spans:\n\n${spansText}`,
      },
    ],
  };
}

