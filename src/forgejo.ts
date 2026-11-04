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
    const text = await this.send(method, path, body, "application/json");
    return (text ? safeJson(text) : null) as T;
  }

  /**
   * Sends an authenticated API request and returns the raw response body.
   *
   * Shared by JSON and plain-text endpoints, so both get the same auth
   * header and throw ForgejoError on a non-2xx status.
   */
  private async send(
    method: string,
    path: string,
    body: unknown,
    accept: string,
  ): Promise<string> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `token ${this.token}`,
        "Content-Type": "application/json",
        Accept: accept,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();

    if (!res.ok) {
      const parsed = text ? safeJson(text) : null;
      throw new ForgejoError(
        `Forgejo ${method} ${path} failed: ${res.status} ${res.statusText}`,
        res.status,
        parsed ?? text,
      );
    }

    return text;
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

  getPullRequest(params: { owner: string; repo: string; index: number }) {
    const { owner, repo, index } = params;
    return this.request<PullRequest>(
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}`,
    );
  }

  getPullRequestDiff(params: { owner: string; repo: string; index: number }) {
    const { owner, repo, index } = params;
    return this.send(
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}.diff`,
      undefined,
      "text/plain",
    );
  }

  createIssueComment(params: {
    owner: string;
    repo: string;
    index: number;
    body: string;
  }) {
    const { owner, repo, index, body } = params;
    return this.request<IssueComment>(
      "POST",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${index}/comments`,
      { body },
    );
  }

  listIssueComments(params: { owner: string; repo: string; index: number }) {
    const { owner, repo, index } = params;
    return this.request<IssueComment[]>(
      "GET",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${index}/comments`,
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

export interface IssueComment {
  id: number;
  html_url: string;
  body: string;
  user: { login: string };
  created_at: string;
}
