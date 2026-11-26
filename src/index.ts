#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ForgejoClient,
  ForgejoError,
  type Attachment,
} from "./forgejo.js";
import {
  MediaListInput,
  appendMediaMarkdown,
  mediaInputSchema,
  resolveMediaItems,
  type ResolvedMedia,
} from "./media.js";

const CreatePrCommentInput = z.object({
  owner: z.string().min(1).describe("Repository owner (user or org)"),
  repo: z.string().min(1).describe("Repository name"),
  pr_number: z
    .number()
    .int()
    .positive()
    .describe("Pull request number (same as the issue index)"),
  body: z.string().min(1).describe("Comment body (markdown)"),
  media: MediaListInput,
});

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
  media: MediaListInput,
});

/** Update an existing PR. Omit a field to leave it unchanged. */
const UpdatePullRequestInput = z
  .object({
    owner: z.string().min(1).describe("Repository owner (user or org)"),
    repo: z.string().min(1).describe("Repository name"),
    pr_number: z
      .number()
      .int()
      .positive()
      .describe("Pull request number (same as the issue index)"),
    title: z.string().min(1).optional().describe("New title. Omit to leave unchanged."),
    body: z
      .string()
      .optional()
      .describe(
        'New description (markdown). Omit to leave unchanged. Pass "" to clear. With media and no body, media is appended to the current description.',
      ),
    state: z
      .enum(["open", "closed"])
      .optional()
      .describe("open or closed. Omit to leave unchanged."),
    media: MediaListInput,
  })
  .superRefine((args, ctx) => {
    if (
      args.title === undefined &&
      args.body === undefined &&
      args.state === undefined &&
      !args.media?.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one of title, body, state, or media",
      });
    }
  });

/** Arguments that identify a pull request, shared by the read-only PR tools. */
const PullRequestRefInput = z.object({
  owner: z.string().min(1).describe("Repository owner (user or org)"),
  repo: z.string().min(1).describe("Repository name"),
  pr_number: z
    .number()
    .int()
    .positive()
    .describe("Pull request number (same as the issue index)"),
});

/** JSON Schema twin of PullRequestRefInput, advertised in the tools list. */
const pullRequestRefSchema: Tool["inputSchema"] = {
  type: "object",
  properties: {
    owner: { type: "string", description: "Repository owner" },
    repo: { type: "string", description: "Repository name" },
    pr_number: { type: "integer", description: "Pull request number" },
  },
  required: ["owner", "repo", "pr_number"],
};

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

async function uploadAll(
  items: ResolvedMedia[],
  upload: (item: ResolvedMedia) => Promise<Attachment>,
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  for (const item of items) {
    attachments.push(await upload(item));
  }
  return attachments;
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
          "Create a pull request in a Forgejo repository. Optional media uploads are attached to the PR and embedded as markdown image links in the description. Returns the created PR including its number and html_url.",
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
            media: mediaInputSchema,
          },
          required: ["owner", "repo", "title", "head", "base"],
        },
      },
      {
        name: "create_pr_comment",
        description:
          "Add a comment to a pull request's conversation thread. Optional media uploads are attached to the comment and embedded as markdown image links. Uses the issue-comment endpoint since Forgejo PRs are issues.",
        inputSchema: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            pr_number: {
              type: "integer",
              description: "Pull request number",
            },
            body: { type: "string", description: "Comment body (markdown)" },
            media: mediaInputSchema,
          },
          required: ["owner", "repo", "pr_number", "body"],
        },
      },
      {
        name: "update_pull_request",
        description:
          "Update a pull request's title, description, or state. Omit a field to leave it unchanged; pass an empty body to clear the description. Optional media uploads are attached to the PR and embedded as markdown image links (appended to the new body, or to the current description if body is omitted).",
        inputSchema: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            pr_number: {
              type: "integer",
              description: "Pull request number",
            },
            title: {
              type: "string",
              description: "New title. Omit to leave unchanged.",
            },
            body: {
              type: "string",
              description:
                'New description (markdown). Omit to leave unchanged. Pass "" to clear.',
            },
            state: {
              type: "string",
              enum: ["open", "closed"],
              description: "open or closed. Omit to leave unchanged.",
            },
            media: mediaInputSchema,
          },
          required: ["owner", "repo", "pr_number"],
        },
      },
      {
        name: "get_pull_request",
        description:
          "Get a pull request's metadata: title, description, author, state, head and base branches, and mergeability.",
        inputSchema: pullRequestRefSchema,
      },
      {
        name: "list_pr_comments",
        description:
          "List the comments in a pull request's conversation thread. Inline review comments on code lines are not included.",
        inputSchema: pullRequestRefSchema,
      },
      {
        name: "get_pr_diff",
        description:
          "Get a pull request's changes as a unified diff. Large PRs can return a long diff.",
        inputSchema: pullRequestRefSchema,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      switch (req.params.name) {
        case "create_pull_request": {
          const args = CreatePullRequestInput.parse(req.params.arguments);
          const { media, ...prArgs } = args;
          let pr = await client.createPullRequest(prArgs);

          if (media?.length) {
            const items = await resolveMediaItems(media);
            const attachments = await uploadAll(items, (item) =>
              client.uploadIssueAttachment({
                owner: args.owner,
                repo: args.repo,
                index: pr.number,
                name: item.name,
                data: item.data,
                contentType: item.contentType,
              }),
            );
            const body = appendMediaMarkdown(args.body, attachments);
            pr = await client.editPullRequest({
              owner: args.owner,
              repo: args.repo,
              index: pr.number,
              body,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Created PR #${pr.number} with ${attachments.length} media attachment(s): ${pr.html_url}`,
                },
                { type: "text", text: JSON.stringify({ pr, attachments }, null, 2) },
              ],
            };
          }

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
        case "create_pr_comment": {
          const { owner, repo, pr_number, body, media } =
            CreatePrCommentInput.parse(req.params.arguments);
          let comment = await client.createIssueComment({
            owner,
            repo,
            index: pr_number,
            body,
          });

          if (media?.length) {
            const items = await resolveMediaItems(media);
            const attachments = await uploadAll(items, (item) =>
              client.uploadCommentAttachment({
                owner,
                repo,
                commentId: comment.id,
                name: item.name,
                data: item.data,
                contentType: item.contentType,
              }),
            );
            const updatedBody = appendMediaMarkdown(body, attachments);
            comment = await client.editIssueComment({
              owner,
              repo,
              commentId: comment.id,
              body: updatedBody,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Posted comment on PR #${pr_number} with ${attachments.length} media attachment(s): ${comment.html_url}`,
                },
                {
                  type: "text",
                  text: JSON.stringify({ comment, attachments }, null, 2),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Posted comment on PR #${pr_number}: ${comment.html_url}`,
              },
              { type: "text", text: JSON.stringify(comment, null, 2) },
            ],
          };
        }
        case "update_pull_request": {
          const args = UpdatePullRequestInput.parse(req.params.arguments);
          const { owner, repo, pr_number, title, state, media } = args;
          let body = args.body;

          let attachments: Attachment[] | undefined;
          if (media?.length) {
            if (body === undefined) {
              const current = await client.getPullRequest({
                owner,
                repo,
                index: pr_number,
              });
              body = current.body ?? "";
            }
            const items = await resolveMediaItems(media);
            attachments = await uploadAll(items, (item) =>
              client.uploadIssueAttachment({
                owner,
                repo,
                index: pr_number,
                name: item.name,
                data: item.data,
                contentType: item.contentType,
              }),
            );
            body = appendMediaMarkdown(body, attachments);
          }

          const pr = await client.editPullRequest({
            owner,
            repo,
            index: pr_number,
            ...(title !== undefined ? { title } : {}),
            ...(body !== undefined ? { body } : {}),
            ...(state !== undefined ? { state } : {}),
          });

          const mediaNote = attachments?.length
            ? ` with ${attachments.length} media attachment(s)`
            : "";
          return {
            content: [
              {
                type: "text",
                text: `Updated PR #${pr.number}${mediaNote}: ${pr.html_url}`,
              },
              {
                type: "text",
                text: JSON.stringify(
                  attachments ? { pr, attachments } : pr,
                  null,
                  2,
                ),
              },
            ],
          };
        }
        case "get_pull_request": {
          const { owner, repo, pr_number } = PullRequestRefInput.parse(
            req.params.arguments,
          );
          const pr = await client.getPullRequest({
            owner,
            repo,
            index: pr_number,
          });
          return {
            content: [
              {
                type: "text",
                text: `PR #${pr.number} (${pr.state}): ${pr.title}`,
              },
              { type: "text", text: JSON.stringify(pr, null, 2) },
            ],
          };
        }
        case "list_pr_comments": {
          const { owner, repo, pr_number } = PullRequestRefInput.parse(
            req.params.arguments,
          );
          const comments = await client.listIssueComments({
            owner,
            repo,
            index: pr_number,
          });
          return {
            content: [
              {
                type: "text",
                text: `${comments.length} comment(s) on PR #${pr_number}`,
              },
              { type: "text", text: JSON.stringify(comments, null, 2) },
            ],
          };
        }
        case "get_pr_diff": {
          const { owner, repo, pr_number } = PullRequestRefInput.parse(
            req.params.arguments,
          );
          const diff = await client.getPullRequestDiff({
            owner,
            repo,
            index: pr_number,
          });
          return {
            content: [
              { type: "text", text: diff || `PR #${pr_number} has no changes` },
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
