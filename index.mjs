#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(__dirname, "openapi.json"), "utf-8"));

// Build endpoint index from OpenAPI spec
const endpoints = [];
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    endpoints.push({
      method: method.toUpperCase(),
      path,
      tag: op.tags?.[0] || "Other",
      summary: op.summary || "",
      description: op.description || "",
      parameters: op.parameters || [],
      requestBody: op.requestBody || null,
      security: op.security || null,
    });
  }
}

const server = new McpServer({
  name: "siperb-api",
  version: "1.0.0",
});

// --- Resource: full OpenAPI spec ---
server.resource("openapi-spec", "siperb://api/openapi.json", { mimeType: "application/json", description: "Full Siperb API OpenAPI 3.0 specification" }, () => ({
  contents: [{ uri: "siperb://api/openapi.json", mimeType: "application/json", text: JSON.stringify(spec, null, 2) }],
}));

// --- Tool: list_endpoints ---
server.tool(
  "list_endpoints",
  "List available Siperb API endpoints. Optionally filter by tag (e.g. 'Devices', 'Connections', 'Profile'). Returns method, path, summary, and tag for each endpoint.",
  { filter: z.string().optional().describe("Search term to filter endpoints by tag, path, or summary, e.g. 'Devices', 'PAT', 'Telegram'") },
  async ({ filter }) => {
    let filtered = endpoints;
    if (filter) {
      const t = filter.toLowerCase();
      filtered = endpoints.filter(e =>
        e.tag.toLowerCase().includes(t) ||
        e.path.toLowerCase().includes(t) ||
        e.summary.toLowerCase().includes(t)
      );
    }
    const lines = filtered.map(e => `${e.method.padEnd(7)} ${e.path}\n  Tag: ${e.tag}\n  ${e.summary}`);
    return {
      content: [{ type: "text", text: `${filtered.length} endpoints:\n\n${lines.join("\n\n")}` }],
    };
  }
);

// --- Tool: get_endpoint_details ---
server.tool(
  "get_endpoint_details",
  "Get full documentation for a specific Siperb API endpoint — description, parameters, request body schema, and authentication requirements.",
  {
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).describe("HTTP method"),
    path: z.string().describe("API path, e.g. '/Users/{uID}/Devices'"),
  },
  async ({ method, path }) => {
    const ep = endpoints.find(e => e.method === method && e.path === path);
    if (!ep) {
      return { content: [{ type: "text", text: `No endpoint found for ${method} ${path}. Use list_endpoints to see available endpoints.` }] };
    }

    const parts = [`# ${ep.method} ${ep.path}`, `**Tag:** ${ep.tag}`, `**Summary:** ${ep.summary}`, "", ep.description];

    if (ep.parameters.length > 0) {
      parts.push("", "## Parameters");
      for (const p of ep.parameters) {
        const param = p.$ref ? resolveRef(p.$ref) : p;
        if (param) {
          parts.push(`- **${param.name}** (${param.in}${param.required ? ", required" : ""}): ${param.description || ""} — type: ${param.schema?.type || "string"}`);
        }
      }
    }

    if (ep.requestBody) {
      parts.push("", "## Request Body");
      const schema = ep.requestBody.content?.["application/json"]?.schema;
      if (schema) {
        parts.push("```json", JSON.stringify(schema.example || schema.properties || schema, null, 2), "```");
      }
    }

    if (ep.security) {
      parts.push("", "## Authentication");
      const schemes = ep.security.flatMap(s => Object.keys(s));
      parts.push(schemes.includes("bearerPAT") ? "Uses `Authorization: Bearer <personalAccessToken>` header" : "Uses `X-Api-Key: <sessionToken>` header (default)");
    }

    return { content: [{ type: "text", text: parts.join("\n") }] };
  }
);

// --- Tool: call_api ---
server.tool(
  "call_api",
  "Make a live call to the Siperb API. Requires a session token (from POST /Login) for most endpoints, or a PAT for the /Login endpoint itself. Path parameters like {uID} must be substituted before calling.",
  {
    method: z.enum(["GET", "POST", "PUT", "DELETE"]).describe("HTTP method"),
    path: z.string().describe("Full path with parameters substituted, e.g. '/Users/abc123/Devices'"),
    token: z.string().describe("Session token (X-Api-Key) or PAT (for /Login only)"),
    body: z.string().optional().describe("JSON request body string for POST/PUT requests"),
  },
  async ({ method, path, token, body }) => {
    const url = `https://api.siperb.com${path}`;
    const isLogin = path === "/Login";

    const headers = {};
    if (isLogin) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["X-Api-Key"] = token;
    }

    const fetchOpts = { method, headers };
    if (body && (method === "POST" || method === "PUT")) {
      headers["Content-Type"] = "application/json";
      fetchOpts.body = body;
    }

    try {
      const res = await fetch(url, fetchOpts);
      const text = await res.text();
      let responseText;
      try {
        responseText = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        responseText = text;
      }
      return {
        content: [{ type: "text", text: `HTTP ${res.status} ${res.statusText}\n\n${responseText}` }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Request failed: ${err.message}` }], isError: true };
    }
  }
);

function resolveRef(ref) {
  const parts = ref.replace("#/", "").split("/");
  let obj = spec;
  for (const p of parts) {
    obj = obj?.[p];
  }
  return obj;
}

const transport = new StdioServerTransport();
await server.connect(transport);
