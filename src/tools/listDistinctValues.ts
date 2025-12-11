import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import { listDistinctValuesInputSchema, type ListDistinctValuesInput } from "../types.js";

export const listDistinctValuesTool: Tool = {
  name: "list_distinct_values",
  description: `List unique values for a field, ordered by frequency.

Use this tool to:
- Discover available endpoints (field: "name")
- See all instrumentation packages in use (field: "packageName")
- Find unique environments (field: "environment")
- Explore JSONB values like status codes (field: "outputValue.statusCode")

This helps you understand what values exist before building specific queries.`,
  inputSchema: {
    type: "object",
    properties: {
      observableServiceId: {
        type: "string",
        description: "Service ID to query. Required if multiple services are available.",
      },
      field: {
        type: "string",
        description:
          "Field to get distinct values for. Can be a column name or JSONB path (e.g., 'name', 'packageName', 'outputValue.statusCode')",
      },
      where: {
        type: "object",
        description: "Optional filter to scope the distinct values",
      },
      jsonbFilters: {
        type: "array",
        description: "Optional JSONB filters to scope the distinct values",
      },
      limit: {
        type: "number",
        description: "Maximum distinct values to return (default 50)",
        default: 50,
      },
    },
    required: ["field"],
  },
};

export async function handleListDistinctValues(
  client: TuskDriftApiClient,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = listDistinctValuesInputSchema.parse(args) as ListDistinctValuesInput;
  const result = await client.listDistinctValues(input);

  const header = `Distinct values for "${result.field}" (${result.values.length} unique values):\n`;

  const valuesList = result.values
    .map((v, i) => {
      const valueStr = typeof v.value === "string" ? v.value : JSON.stringify(v.value);
      return `${i + 1}. ${valueStr} (${v.count} occurrences)`;
    })
    .join("\n");

  return {
    content: [
      {
        type: "text",
        text: header + valuesList,
      },
    ],
  };
}

