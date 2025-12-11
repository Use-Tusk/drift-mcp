import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import type { TraceSpan } from "../types.js";
import { getTraceInputSchema, type GetTraceInput } from "../types.js";

export const getTraceTool: Tool = {
  name: "get_trace",
  description: `Get all spans in a distributed trace as a hierarchical tree.

Use this tool to:
- Debug a specific request end-to-end
- See the full call chain from HTTP request to database queries
- Understand timing and dependencies between spans
- Identify bottlenecks in a request

First use query_spans to find spans, then use the traceId to get the full trace.`,
  inputSchema: {
    type: "object",
    properties: {
      observableServiceId: {
        type: "string",
        description: "Service ID to query. Required if multiple services are available.",
      },
      traceId: {
        type: "string",
        description: "The trace ID to fetch",
      },
      includePayloads: {
        type: "boolean",
        description: "Include inputValue/outputValue (can be verbose)",
        default: false,
      },
      maxPayloadLength: {
        type: "number",
        description: "Truncate payload strings to this length",
        default: 500,
      },
    },
    required: ["traceId"],
  },
};

function formatTraceTree(span: TraceSpan, indent: number = 0, includePayloads: boolean): string {
  const prefix = "  ".repeat(indent);
  const statusIcon = span.status.code === 0 ? "✓" : span.status.code === 2 ? "✗" : "○";

  let result = `${prefix}${statusIcon} ${span.name} (${span.duration.toFixed(2)}ms) [${span.packageName}]\n`;
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

export async function handleGetTrace(
  client: TuskDriftApiClient,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = getTraceInputSchema.parse(args) as GetTraceInput;
  const result = await client.getTrace(input);

  if (!result.traceTree) {
    return {
      content: [
        {
          type: "text",
          text: `No trace found for ID: ${input.traceId}`,
        },
      ],
    };
  }

  const header = `Trace: ${input.traceId}\nSpan Count: ${result.spanCount}\n\nTrace Tree:\n`;
  const tree = formatTraceTree(result.traceTree, 0, input.includePayloads ?? false);

  return {
    content: [
      {
        type: "text",
        text: header + tree,
      },
    ],
  };
}

