import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Attachment } from "./forgejo.js";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const MediaItemInput = z
  .object({
    name: z
      .string()
      .min(1)
      .describe("Filename including extension, e.g. screenshot.png"),
    path: z
      .string()
      .optional()
      .describe("Absolute path to a local image file"),
    content_base64: z
      .string()
      .optional()
      .describe("Base64-encoded file contents (alternative to path)"),
  })
  .superRefine((item, ctx) => {
    if (!item.path && !item.content_base64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide path or content_base64",
      });
    }
  });

export type MediaItemInput = z.infer<typeof MediaItemInput>;

export const MediaListInput = z
  .array(MediaItemInput)
  .max(10)
  .optional()
  .describe(
    "Images to upload and embed as markdown links (png/jpeg/gif/webp)",
  );

export interface ResolvedMedia {
  name: string;
  data: Uint8Array;
  contentType: string;
}

export async function resolveMediaItems(
  items: MediaItemInput[],
): Promise<ResolvedMedia[]> {
  const seen = new Set<string>();
  const resolved: ResolvedMedia[] = [];

  for (const item of items) {
    const name = path.basename(item.name);
    const ext = path.extname(name).toLowerCase();
    const contentType = IMAGE_MIME[ext];
    if (!contentType) {
      throw new Error(
        `Unsupported media type for "${name}". Use png, jpeg, gif, or webp.`,
      );
    }
    if (seen.has(name.toLowerCase())) {
      throw new Error(`Duplicate media name "${name}"`);
    }
    seen.add(name.toLowerCase());

    let data: Uint8Array;
    if (item.path) {
      data = new Uint8Array(await readFile(item.path));
    } else {
      data = Uint8Array.from(Buffer.from(item.content_base64!, "base64"));
    }
    if (data.byteLength === 0) {
      throw new Error(`Media "${name}" is empty`);
    }
    // 25 MiB — matches common Forgejo/Gitea attachment limits
    if (data.byteLength > 25 * 1024 * 1024) {
      throw new Error(`Media "${name}" exceeds 25 MiB`);
    }

    resolved.push({ name, data, contentType });
  }

  return resolved;
}

/** Append markdown image links for uploaded attachments. */
export function appendMediaMarkdown(
  body: string | undefined,
  attachments: Attachment[],
): string {
  const base = (body ?? "").trimEnd();
  const links = attachments
    .map((a) => `![${a.name}](${a.browser_download_url})`)
    .join("\n");
  if (!links) return base;
  if (!base) return links;
  return `${base}\n\n${links}`;
}

/** JSON Schema fragment for the media tool argument. */
export const mediaInputSchema = {
  type: "array" as const,
  description:
    "Images to upload and embed as markdown image links (png/jpeg/gif/webp). Provide path or content_base64 per item.",
  items: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Filename including extension, e.g. screenshot.png",
      },
      path: {
        type: "string",
        description: "Absolute path to a local image file",
      },
      content_base64: {
        type: "string",
        description: "Base64-encoded file contents (alternative to path)",
      },
    },
    required: ["name"],
  },
};
