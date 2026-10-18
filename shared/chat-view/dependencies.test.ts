import { expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const runtimeRoot = new URL("../..", import.meta.url).pathname;

/**
 * 宿主用 `npm install --omit=dev` 安装插件，只装 `dependencies`。任何在源码里出现的
 * 非宿主模块都必须列在 `dependencies` 里，否则安装后编译会报
 * "Could not resolve type dependency"。宿主提供的模块见下表。
 */
const HOST_PROVIDED = [
  /^@getpaseo\/plugin(\/|$)/,
  /^react(-dom|-native)?(\/|$)/,
  /^zod(\/|$)/,
  /^@tanstack\/react-query(\/|$)/,
  /^node:/,
];

async function* sourceFiles(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) yield path;
  }
}

it("declares every non-host import as a runtime dependency", async () => {
  const manifest = JSON.parse(await readFile(join(runtimeRoot, "package.json"), "utf8"));
  const dependencies: Record<string, string> = manifest.dependencies ?? {};
  const missing = new Map<string, string>();

  const files = [join(runtimeRoot, "index.client.tsx"), join(runtimeRoot, "index.server.ts")];
  for (const name of ["client", "server", "shared"]) {
    for await (const file of sourceFiles(join(runtimeRoot, name))) files.push(file);
  }
  for (const file of files) {
    const source = await readFile(file, "utf8");
    // 只认行首的 import/export 与 require()，避免匹配注释里的引号文本。
    const pattern =
      /^(?:import|export)\s[^'"]*from\s*"([^"]+)"|^\s*import\s*"([^"]+)"|\brequire\(\s*"([^"]+)"\s*\)/gm;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1] ?? match[2] ?? match[3]!;
      if (specifier.startsWith(".") || HOST_PROVIDED.some((rule) => rule.test(specifier))) continue;
      const name = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0]!;
      if (!(name in dependencies)) missing.set(name, file.slice(runtimeRoot.length));
    }
  }

  expect([...missing]).toEqual([]);
});
