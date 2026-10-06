#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ForgejoClient, ForgejoError } from "./forgejo.js";

const CreatePullRequestInput = z.object({
  owner: z.string().min(1).describe("Repository owner (user or org)"),
  repo: z.string().min(1).describe("Repository name"),
  title: z.string().min(1).describe("Pull request title"),
  head: z
    .string()
    .min(1)
    .describe("Source branch (e.g. 'feature/x') or 'user:branch' for a fork"),
  base: z.string().min(1).describe("Target branch (e.g. 'main')"),
  body: z.string().optional().describe("Pull request description (markdown)"),
  draft: z.boolean().optional().describe("Open the PR as a draft"),
  assignees: z.array(z.string()).optional().describe("Usernames to assign"),
  labels: z.array(z.number().int()).optional().describe("Label IDs to apply"),
  milestone: z.number().int().optional().describe("Milestone ID"),
});

function loadConfig() {
  const baseUrl = process.env.FORGEJO_URL;
  const token = process.env.FORGEJO_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(
      "FORGEJO_URL and FORGEJO_TOKEN environment variables are required",
    );
  }
  return { baseUrl, token };
}

function formatError(err: unknown): string {
  if (err instanceof ForgejoError) {
    const body =
      typeof err.body === "string" ? err.body : JSON.stringify(err.body);
    return `${err.message}\n${body}`;
  }
  if (err instanceof z.ZodError) {
    return `Invalid arguments: ${err.issues
      .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
      .join("; ")}`;
  }
  return err instanceof Error ? err.message : String(err);
}

async function main() {
  const config = loadConfig();
  const client = new ForgejoClient(config);

  const server = new Server(
    { name: "forgejo-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "create_pull_request",
        description:
          "Create a pull request in a Forgejo repository. Returns the created PR including its number and html_url.",
        inputSchema: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            title: { type: "string", description: "Pull request title" },
            head: {
              type: "string",
              description:
                "Source branch (e.g. 'feature/x') or 'user:branch' for a fork",
            },
            base: { type: "string", description: "Target branch" },
            body: { type: "string", description: "PR description (markdown)" },
            draft: { type: "boolean", description: "Open as draft" },
            assignees: {
              type: "array",
              items: { type: "string" },
              description: "Usernames to assign",
            },
            labels: {
              type: "array",
              items: { type: "integer" },
              description: "Label IDs to apply",
            },
            milestone: { type: "integer", description: "Milestone ID" },
          },
          required: ["owner", "repo", "title", "head", "base"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      switch (req.params.name) {
        case "create_pull_request": {
          const args = CreatePullRequestInput.parse(req.params.arguments);
          const pr = await client.createPullRequest(args);
          return {
            content: [
              {
                type: "text",
                text: `Created PR #${pr.number}: ${pr.html_url}`,
              },
              { type: "text", text: JSON.stringify(pr, null, 2) },
            ],
          };
        }
        default:
          return {
            isError: true,
            content: [
              { type: "text", text: `Unknown tool: ${req.params.name}` },
            ],
          };
      }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: formatError(err) }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(formatError(err));
  process.exit(1);
});
