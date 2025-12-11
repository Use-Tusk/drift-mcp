/**
 * HTTP transport support for the Tusk Drift MCP server.
 * This module provides utilities for running the MCP server over HTTP.
 */

import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Session manager for stateful MCP connections.
 * Stores active transports by session ID.
 */
export class McpSessionManager {
  private transports = new Map<string, StreamableHTTPServerTransport>();

  /**
   * Get an existing transport by session ID.
   */
  get(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.transports.get(sessionId);
  }

  /**
   * Store a transport with its session ID.
   */
  set(sessionId: string, transport: StreamableHTTPServerTransport): void {
    this.transports.set(sessionId, transport);
  }

  /**
   * Remove a transport by session ID.
   */
  delete(sessionId: string): boolean {
    return this.transports.delete(sessionId);
  }

  /**
   * Check if a session exists.
   */
  has(sessionId: string): boolean {
    return this.transports.has(sessionId);
  }

  /**
   * Get all active session IDs.
   */
  getSessionIds(): string[] {
    return Array.from(this.transports.keys());
  }

  /**
   * Clear all sessions.
   */
  clear(): void {
    this.transports.clear();
  }
}

/**
 * Options for creating an HTTP handler.
 */
export interface HttpHandlerOptions {
  /**
   * Factory function to create a new MCP server for each session.
   * This allows per-session customization (e.g., different auth contexts).
   */
  createServer: () => McpServer | Promise<McpServer>;

  /**
   * Session manager for stateful connections.
   * If not provided, a new one will be created.
   */
  sessionManager?: McpSessionManager;

  /**
   * Optional callback when a new session is created.
   */
  onSessionCreated?: (sessionId: string) => void;

  /**
   * Optional callback when a session is closed.
   */
  onSessionClosed?: (sessionId: string) => void;

  /**
   * Optional error handler.
   */
  onError?: (error: unknown) => void;
}

/**
 * Create HTTP request handlers for the MCP server.
 * Returns handlers for POST, GET, and DELETE methods.
 */
export function createHttpHandlers(options: HttpHandlerOptions) {
  const {
    createServer,
    sessionManager = new McpSessionManager(),
    onSessionCreated,
    onSessionClosed,
    onError,
  } = options;

  /**
   * Handle POST requests (main MCP messages).
   */
  async function handlePost(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessionManager.has(sessionId)) {
      // Reuse existing transport for stateful session
      transport = sessionManager.get(sessionId)!;
    } else {
      // Create new transport for this request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessionManager.set(newSessionId, transport);
          onSessionCreated?.(newSessionId);
        },
      });

      // Create and connect server
      const server = await createServer();

      // Clean up on close
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          sessionManager.delete(sid);
          onSessionClosed?.(sid);
        }
      };

      await server.connect(transport);
    }

    // Handle the request
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      onError?.(error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }

  /**
   * Handle GET requests (SSE streaming).
   */
  async function handleGet(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !sessionManager.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = sessionManager.get(sessionId)!;

    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      onError?.(error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }

  /**
   * Handle DELETE requests (session termination).
   */
  async function handleDelete(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: "Missing session ID" });
      return;
    }

    if (sessionManager.has(sessionId)) {
      const transport = sessionManager.get(sessionId)!;
      await transport.close();
      sessionManager.delete(sessionId);
      onSessionClosed?.(sessionId);
    }

    res.status(204).send();
  }

  return {
    handlePost,
    handleGet,
    handleDelete,
    sessionManager,
  };
}

// Re-export for convenience
export { StreamableHTTPServerTransport };
