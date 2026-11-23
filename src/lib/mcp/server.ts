import type { McpCaller } from "@/lib/mcp/auth";
import { TOOLS } from "@/lib/mcp/tools";

/**
 * A stateless MCP server over streamable HTTP: one JSON-RPC message in, one
 * JSON response out, no sessions and no server-initiated messages. That is all
 * a tools-only server needs, and it suits a serverless deployment.
 */
const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type Id = string | number | null;

export type McpReply = { status: number; body?: unknown };

function failure(id: Id, code: number, message: string, status = 200): McpReply {
  return { status, body: { jsonrpc: "2.0", id, error: { code, message } } };
}

function success(id: Id, result: unknown): McpReply {
  return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleMessage(raw: string, caller: McpCaller): Promise<McpReply> {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return failure(null, PARSE_ERROR, "Parse error", 400);
  }

  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return failure(null, INVALID_REQUEST, "Invalid request", 400);
  }

  // A message with no id is a notification: acknowledged, never answered.
  if (!("id" in message)) return { status: 202 };

  const id = message.id as Id;
  const params = isRecord(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize": {
      const requested = params.protocolVersion;
      return success(id, {
        protocolVersion:
          typeof requested === "string" && SUPPORTED_VERSIONS.includes(requested)
            ? requested
            : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "poke-tracker", version: "0.1.0" },
      });
    }
    case "ping":
      return success(id, {});
    case "tools/list":
      return success(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case "tools/call": {
      const tool = TOOLS.find((candidate) => candidate.name === params.name);
      if (!tool) return failure(id, INVALID_PARAMS, `Unknown tool: ${String(params.name)}`);

      try {
        const result = await tool.run(caller);
        return success(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (error) {
        console.error(`MCP tool ${tool.name} failed`, error);
        return success(id, {
          isError: true,
          content: [{ type: "text", text: `${tool.name} failed` }],
        });
      }
    }
    default:
      return failure(id, METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}
