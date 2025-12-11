import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import { getSchemaInputSchema, type GetSchemaInput } from "../types.js";

export const getSchemaTool: Tool = {
  name: "get_schema",
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
  inputSchema: {
    type: "object",
    properties: {
      observableServiceId: {
        type: "string",
        description: "Service ID to query. Required if multiple services are available.",
      },
      packageName: {
        type: "string",
        description: "Package name to get schema for (e.g., 'http', 'pg', 'fetch')",
      },
      instrumentationName: {
        type: "string",
        description: "Specific instrumentation name",
      },
      name: {
        type: "string",
        description: "Span name to get schema for (e.g., '/api/users')",
      },
      showExample: {
        type: "boolean",
        description: "Include an example span with real data",
        default: true,
      },
      maxPayloadLength: {
        type: "number",
        description: "Truncate example payload strings to this length",
        default: 500,
      },
    },
  },
};

export async function handleGetSchema(
  client: TuskDriftApiClient,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = getSchemaInputSchema.parse(args) as GetSchemaInput;
  const result = await client.getSchema(input);

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
    sections.push(`## Input Schema\n\`\`\`json\n${JSON.stringify(result.inputSchema, null, 2)}\n\`\`\``);
  }

  if (result.outputSchema) {
    sections.push(`## Output Schema\n\`\`\`json\n${JSON.stringify(result.outputSchema, null, 2)}\n\`\`\``);
  }

  if (result.exampleSpanRecording) {
    sections.push(`## Example Span\n\`\`\`json\n${JSON.stringify(result.exampleSpanRecording, null, 2)}\n\`\`\``);
  }

  return {
    content: [
      {
        type: "text",
        text: sections.join("\n\n") || "No schema information available.",
      },
    ],
  };
}

