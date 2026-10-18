import { compactText } from "./text";
import { asRecord, fieldString, toolLeaf, toolOutputText, toolOutputValue } from "./tool-output";

export type GithubToolKind =
  | "actions-get"
  | "actions-list"
  | "actions-run"
  | "file"
  | "job-logs"
  | "pull-request"
  | "search-code"
  | "search-repositories";

const GITHUB_TOOL_LABELS: Readonly<Record<GithubToolKind, string>> = {
  "actions-get": "GitHub Actions Details",
  "actions-list": "GitHub Actions List",
  "actions-run": "GitHub Actions Run",
  file: "GitHub File",
  "job-logs": "GitHub Job Logs",
  "pull-request": "GitHub Pull Request",
  "search-code": "GitHub Code Search",
  "search-repositories": "GitHub Repository Search",
};

const GITHUB_TOOL_ICONS: Readonly<Record<GithubToolKind, string>> = {
  "actions-get": "Workflow",
  "actions-list": "ListChecks",
  "actions-run": "PlayCircle",
  file: "FileCode2",
  "job-logs": "ScrollText",
  "pull-request": "GitPullRequest",
  "search-code": "Code2",
  "search-repositories": "BookMarked",
};

export function githubToolKind(name: string): GithubToolKind | null {
  const normalized = name.trim().toLowerCase();
  const leaf = toolLeaf(normalized);
  if (leaf === "github_actions_get" || leaf === "actions_get") return "actions-get";
  if (leaf === "github_actions_list" || leaf === "actions_list") return "actions-list";
  if (leaf === "github_actions_run_trigger" || leaf === "actions_run_trigger") {
    return "actions-run";
  }
  if (leaf === "github_get_file_contents" || leaf === "get_file_contents") return "file";
  if (leaf === "github_get_job_logs" || leaf === "get_job_logs") return "job-logs";
  if (leaf === "github_pull_request_read" || leaf === "pull_request_read") {
    return "pull-request";
  }
  if (leaf === "github_search_code" || leaf === "search_code") return "search-code";
  if (leaf === "github_search_repositories" || leaf === "search_repositories") {
    return "search-repositories";
  }
  return null;
}

export function githubToolLabel(kind: GithubToolKind): string {
  return GITHUB_TOOL_LABELS[kind];
}

export function githubToolIcon(kind: GithubToolKind): string {
  return GITHUB_TOOL_ICONS[kind];
}

export function githubToolSummary(kind: GithubToolKind, input: unknown): string | undefined {
  const record = asRecord(input);
  switch (kind) {
    case "search-repositories":
    case "search-code":
      return compactText(fieldString(record, "query") ?? "");
    case "file":
      return fieldString(record, "path");
    case "pull-request": {
      const owner = fieldString(record, "owner");
      const repo = fieldString(record, "repo");
      const pullNumber = record?.pullNumber;
      if (owner && repo && (typeof pullNumber === "number" || typeof pullNumber === "string")) {
        return `${owner}/${repo}#${pullNumber}`;
      }
      return owner && repo ? `${owner}/${repo}` : undefined;
    }
    case "actions-get":
    case "actions-list":
    case "actions-run":
    case "job-logs":
      return (
        fieldString(record, "workflowId", "workflow_id", "workflow", "resource_id") ??
        fieldString(record, "runId", "run_id") ??
        fieldString(record, "jobId", "job_id")
      );
  }
}

export const githubOutputText = toolOutputText;
export const githubOutputValue = toolOutputValue;
