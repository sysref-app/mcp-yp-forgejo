export interface ForgejoConfig {
  baseUrl: string;
  token: string;
}

export class ForgejoError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ForgejoError";
  }
}

export class ForgejoClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ForgejoConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `token ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    const parsed = text ? safeJson(text) : null;

    if (!res.ok) {
      throw new ForgejoError(
        `Forgejo ${method} ${path} failed: ${res.status} ${res.statusText}`,
        res.status,
        parsed ?? text,
      );
    }

    return parsed as T;
  }

  createPullRequest(params: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
    assignees?: string[];
    labels?: number[];
    milestone?: number;
    draft?: boolean;
  }) {
    const { owner, repo, ...payload } = params;
    return this.request<PullRequest>(
      "POST",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
      payload,
    );
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface PullRequest {
  id: number;
  number: number;
  url: string;
  html_url: string;
  title: string;
  state: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
}
