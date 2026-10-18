import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type CommandName = "build" | "test" | "lint" | "typecheck";
export type Commands = Partial<Record<CommandName, string>>;

export interface PackageManifest {
  workspaces?: unknown;
  bin?: unknown;
  module?: string;
  types?: string;
  exports?: unknown;
  engines?: Record<string, string>;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ManifestFacts {
  languages: string[];
  packageManagers: string[];
  commands: Commands;
  frameworks: string[];
  hasFrontend: boolean;
  hasBackend: boolean;
  conventions: string[];
  constraints: string[];
}

interface ManifestSpec {
  file: string;
  language: string;
  packageManager: string;
  /** Commands the toolchain guarantees, so they count as evidence rather than invention. */
  internal: Commands;
}

const MANIFESTS: ManifestSpec[] = [
  { file: "package.json", language: "typescript", packageManager: "npm", internal: {} },
  { file: "pyproject.toml", language: "python", packageManager: "uv", internal: {} },
  { file: "requirements.txt", language: "python", packageManager: "pip", internal: {} },
  {
    file: "Cargo.toml",
    language: "rust",
    packageManager: "cargo",
    internal: { build: "cargo build", test: "cargo test" },
  },
  {
    file: "go.mod",
    language: "go",
    packageManager: "go",
    internal: { build: "go build ./...", test: "go test ./..." },
  },
  { file: "pom.xml", language: "java", packageManager: "maven", internal: { test: "mvn -q test" } },
  {
    file: "build.gradle",
    language: "java",
    packageManager: "gradle",
    internal: { test: "./gradlew test" },
  },
  { file: "Gemfile", language: "ruby", packageManager: "bundler", internal: {} },
  { file: "composer.json", language: "php", packageManager: "composer", internal: {} },
];

export const FRONTEND_PACKAGES = new Set([
  "react",
  "next",
  "vue",
  "nuxt",
  "svelte",
  "@angular/core",
  "solid-js",
  "astro",
  "@remix-run/react",
]);
export const BACKEND_PACKAGES = new Set([
  "express",
  "fastify",
  "koa",
  "@nestjs/core",
  "hono",
  "graphql",
  "@apollo/server",
]);

const TOOLING = new Map([
  ["eslint", "ESLint"],
  ["prettier", "Prettier"],
  ["@biomejs/biome", "Biome"],
  ["typescript", "TypeScript"],
  ["vitest", "Vitest"],
  ["jest", "Jest"],
  ["playwright", "Playwright"],
  ["vite", "Vite"],
]);

export function readPackageManifest(root: string): PackageManifest | undefined {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageManifest;
  } catch {
    return undefined;
  }
}

/** Languages, runners, toolchain-guaranteed commands and declared tooling, all read from disk. */
export function readManifestFacts(root: string): ManifestFacts {
  const facts: ManifestFacts = {
    languages: [],
    packageManagers: [],
    commands: {},
    frameworks: [],
    hasFrontend: false,
    hasBackend: false,
    conventions: [],
    constraints: [],
  };
  for (const spec of MANIFESTS) {
    if (!existsSync(join(root, spec.file))) continue;
    pushUnique(facts.languages, spec.language);
    pushUnique(facts.packageManagers, spec.packageManager);
    for (const name of Object.keys(spec.internal) as CommandName[])
      if (!facts.commands[name]) facts.commands[name] = spec.internal[name];
  }
  const tsconfig = join(root, "tsconfig.json");
  if (existsSync(tsconfig))
    try {
      if (/"strict"\s*:\s*true/.test(readFileSync(tsconfig, "utf8")))
        facts.constraints.push("TypeScript 开启了 strict");
    } catch {
      // A malformed tsconfig is not a constraint worth reporting.
    }
  const manifest = readPackageManifest(root);
  if (!manifest) return facts;
  const runner = detectRunner(root, manifest);
  pushUnique(facts.packageManagers, runner);
  const scripts = manifest.scripts ?? {};
  const declared: [CommandName, string | undefined][] = [
    ["build", scripts.build],
    ["test", scripts.test],
    ["lint", scripts.lint],
    ["typecheck", scripts.typecheck ?? scripts["type-check"] ?? scripts.tsc],
  ];
  for (const [name, script] of declared)
    if (script && !facts.commands[name]) facts.commands[name] = qualify(runner, script);
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (FRONTEND_PACKAGES.has(name)) facts.hasFrontend = true;
    else if (BACKEND_PACKAGES.has(name)) facts.hasBackend = true;
    else continue;
    pushUnique(facts.frameworks, name);
  }
  const tools = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter((name) => TOOLING.has(name))
    .map((name) => TOOLING.get(name));
  if (tools.length) facts.conventions.push(`工具链：${tools.join("、")}`);
  if (manifest.engines?.node) facts.constraints.push(`Node 版本约束：${manifest.engines.node}`);
  if (manifest.packageManager) facts.constraints.push(`包管理器锁定为 ${manifest.packageManager}`);
  return facts;
}

function detectRunner(root: string, manifest: PackageManifest): string {
  const declared = manifest.packageManager?.split("@")[0];
  if (declared) return declared;
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb"))) return "bun";
  return "npm";
}

function qualify(runner: string, script: string): string {
  return runner === "npm" ? `npm run ${script}` : `${runner} ${script}`;
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}
