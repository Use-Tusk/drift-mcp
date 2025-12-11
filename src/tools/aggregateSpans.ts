import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import { aggregateSpansInputSchema, type AggregateSpansInput } from "../types.js";

export const aggregateSpansTool: Tool = {
  name: "aggregate_spans",
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
  inputSchema: {
    type: "object",
    properties: {
      observableServiceId: {
        type: "string",
        description: "Service ID to query. Required if multiple services are available.",
      },
      where: {
        type: "object",
        description: "Filter conditions (same as query_spans)",
      },
      groupBy: {
        type: "array",
        description: "Fields to group by",
        items: {
          type: "string",
          enum: ["name", "packageName", "instrumentationName", "environment", "statusCode"],
        },
      },
      metrics: {
        type: "array",
        description: "Metrics to calculate",
        items: {
          type: "string",
          enum: [
            "count",
            "errorCount",
            "errorRate",
            "avgDuration",
            "minDuration",
            "maxDuration",
            "p50Duration",
            "p95Duration",
            "p99Duration",
          ],
        },
      },
      timeBucket: {
        type: "string",
        description: "Time bucket for time-series data",
        enum: ["hour", "day", "week"],
      },
      orderBy: {
        type: "object",
        description: "Order results by a metric",
        properties: {
          metric: { type: "string" },
          direction: { type: "string", enum: ["ASC", "DESC"] },
        },
      },
      limit: {
        type: "number",
        description: "Maximum results to return",
        default: 20,
      },
    },
    required: ["metrics"],
  },
};

export async function handleAggregateSpans(
  client: TuskDriftApiClient,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = aggregateSpansInputSchema.parse(args) as AggregateSpansInput;
  const result = await client.aggregateSpans(input);

  const header = `Aggregation Results (${result.results.length} rows):\n`;

  const rows = result.results
    .map((row, i) => {
      const groupStr = Object.entries(row.groupValues)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");

      const metrics: string[] = [];
      if (row.count !== undefined) metrics.push(`count: ${row.count}`);
      if (row.errorCount !== undefined) metrics.push(`errors: ${row.errorCount}`);
      if (row.errorRate !== undefined) metrics.push(`error rate: ${(row.errorRate * 100).toFixed(2)}%`);
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
    content: [
      {
        type: "text",
        text: header + rows,
      },
    ],
  };
}

