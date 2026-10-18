import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EnvironmentProfile, ProjectKind } from "../../../shared/chat-view/enhance";
import { readManifestFacts, readPackageManifest, type ManifestFacts } from "./manifest";

/**
 * Read-only evidence collection. Every value answers "what did I actually read"; the project kind
 * is derived from those reads, never guessed. Any failure degrades to `unknown` rather than
 * aborting the enhancement.
 */
const GIT_TIMEOUT_MS = 1500;
const REFERENCES = ["README.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md"];
const REFERENCE_EXCERPT = 1200;
const MONOREPO_MARKERS = ["pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json"];
const SOURCE_DIRECTORIES = ["src", "app", "packages", "lib"];
const TEST_DIRECTORIES = new Set(["__tests__", "test", "tests", "spec"]);

export function collectEnvironmentProfile(root: string): EnvironmentProfile {
  const profile: EnvironmentProfile = {
    root,
    projectKind: "unknown",
    languages: [],
    packageManagers: [],
    frameworks: [],
    commands: {},
    conventions: [],
    constraints: [],
    hotspots: [],
    references: [],
  };
  try {
    const facts = readManifestFacts(root);
    profile.languages = facts.languages;
    profile.packageManagers = facts.packageManagers;
    profile.frameworks = facts.frameworks;
    profile.commands = facts.commands;
    profile.conventions = facts.conventions;
    profile.constraints = facts.constraints;
    profile.projectKind = detectKind(root, facts);
    profile.hotspots = collectHotspots(root);
    profile.references = readReferences(root);
    if (safeEntries(root).some((entry) => entry.isDirectory() && TEST_DIRECTORIES.has(entry.name)))
      profile.conventions.push("\u6d4b\u8bd5\u4e0e\u6e90\u7801\u540c\u76ee\u5f55\u5e76\u7f6e");
  } catch {
    // Keep whatever was read; a partial profile still beats no profile.
  }
  return profile;
}

function detectKind(root: string, facts: ManifestFacts): ProjectKind {
  if (MONOREPO_MARKERS.some((marker) => existsSync(join(root, marker)))) return "monorepo";
  const manifest = readPackageManifest(root);
  if (!manifest)
    return safeEntries(root).filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .length >= 3
      ? "docs"
      : "unknown";
  if (manifest.workspaces) return "monorepo";
  if (facts.hasFrontend) return "frontend";
  if (facts.hasBackend) return "backend";
  if (manifest.bin) return "cli";
  if (manifest.scripts?.start && !manifest.scripts?.build) return "cli";
  if (manifest.exports || manifest.types || manifest.module) return "library";
  return "unknown";
}

function collectHotspots(root: string): EnvironmentProfile["hotspots"] {
  const changed = readChangedFiles(root);
  if (changed.length)
    return changed.map((path) => ({ path, reason: "\u5de5\u4f5c\u533a\u5df2\u6539\u52a8" }));
  return safeEntries(root)
    .filter((entry) => entry.isDirectory() && SOURCE_DIRECTORIES.includes(entry.name))
    .slice(0, 3)
    .map((entry) => ({ path: entry.name, reason: "\u4e3b\u8981\u6e90\u7801\u76ee\u5f55" }));
}

/** Git is consulted only for a worktree view; any failure leaves the profile without hotspots. */
function readChangedFiles(root: string): string[] {
  if (!existsSync(join(root, ".git"))) return [];
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter((line) => line.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function readReferences(root: string): EnvironmentProfile["references"] {
  const references: EnvironmentProfile["references"] = [];
  for (const name of REFERENCES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    try {
      const excerpt = readFileSync(path, "utf8").trim().slice(0, REFERENCE_EXCERPT);
      if (excerpt) references.push({ path: name, excerpt });
    } catch {
      // Skip an unreadable document rather than failing the whole probe.
    }
  }
  return references;
}

function safeEntries(root: string) {
  try {
    return readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
}
