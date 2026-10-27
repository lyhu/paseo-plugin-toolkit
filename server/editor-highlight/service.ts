import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { HighlightState } from "../../shared/editor-highlight/contracts";
import { paseoHome } from "../models/storage";
import { writePrivateJsonFile } from "../storage/revisioned-json";
import { patchBundle, patchStart, patchEnd } from "./patch";

const backupSchema = z.object({
  bundle: z.string(),
  originalHash: z.string().regex(/^[a-f0-9]{64}$/),
  patchedHash: z.string().regex(/^[a-f0-9]{64}$/),
});
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function replaceFile(filename: string, expected: string, next: string) {
  const temporary = `${filename}.toolkit-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, next, { flag: "wx", mode: statSync(filename).mode & 0o777 });
    if (readFileSync(filename, "utf8") !== expected)
      throw new Error("Paseo 文件已变化，已取消修改，请重新检测。");
    renameSync(temporary, filename);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function createHighlightService({
  appPath = "/Applications/Paseo.app",
  platform = process.platform,
  stateDirectory = join(paseoHome(), "toolkit", "editor-highlight"),
}: {
  appPath?: string;
  platform?: string;
  stateDirectory?: string;
} = {}) {
  let lastError: string | null = null;
  function base(status: HighlightState["status"]): HighlightState {
    return {
      status,
      appPath,
      version: null,
      checkedAt: new Date().toISOString(),
      backupPath: null,
      error: null,
    };
  }
  function inspect() {
    const state = base("ready");
    if (platform !== "darwin")
      return { state: { ...state, status: "unsupported" as const }, bundle: null };
    if (!existsSync(appPath))
      return { state: { ...state, status: "missing" as const }, bundle: null };
    const contents = join(appPath, "Contents");
    const plist = readFileSync(join(contents, "Info.plist"), "utf8");
    state.version =
      /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null;
    if (!state.version?.startsWith("0.13."))
      throw new Error("此 Paseo 版本尚未验证，未修改任何文件。");
    const directory = join(contents, "Resources", "app-dist");
    const html = readFileSync(join(directory, "index.html"), "utf8");
    const scripts = [
      ...html.matchAll(
        /<script\b[^>]*\bsrc=["']\/?(_expo\/static\/js\/web\/index-[a-f0-9]+\.js)["']/g,
      ),
    ];
    if (scripts.length !== 1) throw new Error("无法确认 Paseo 的前端入口，未修改任何文件。");
    const filename = join(directory, scripts[0][1]);
    if (
      !lstatSync(filename).isFile() ||
      !realpathSync(filename).startsWith(realpathSync(appPath) + sep)
    )
      throw new Error("Paseo 前端入口不是安装包内的普通文件，未修改任何文件。");
    const source = readFileSync(filename, "utf8");
    const digest = hash(source);
    const recordPath = join(stateDirectory, `${digest}.json`);
    if (source.includes(patchStart) && source.includes(patchEnd)) {
      state.status = "applied";
      if (!existsSync(recordPath))
        throw new Error("当前高亮补丁无法匹配备份，请先恢复原始安装包。");
      const record = backupSchema.parse(JSON.parse(readFileSync(recordPath, "utf8")));
      if (record.bundle !== filename || record.patchedHash !== digest)
        throw new Error("安装包与高亮备份不匹配，已取消恢复。");
      state.backupPath = join(stateDirectory, `${record.originalHash}.js`);
    }
    return { state, bundle: { filename, source, digest, recordPath } };
  }
  function failure(error: unknown): HighlightState {
    lastError = error instanceof Error ? error.message : String(error);
    return { ...base("error"), error: lastError };
  }
  function read(): HighlightState {
    try {
      const { state } = inspect();
      return lastError ? { ...state, status: "error", error: lastError } : state;
    } catch (error) {
      return failure(error);
    }
  }
  function apply(): HighlightState {
    try {
      lastError = null;
      const { state, bundle } = inspect();
      if (!bundle || state.status === "applied") return state;
      const next = patchBundle(bundle.source);
      const patchedHash = hash(next);
      mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
      const backupPath = join(stateDirectory, `${bundle.digest}.js`);
      if (!existsSync(backupPath))
        writeFileSync(backupPath, bundle.source, { mode: 0o600, flag: "wx" });
      if (hash(readFileSync(backupPath, "utf8")) !== bundle.digest)
        throw new Error("高亮备份校验失败，未修改任何文件。");
      writePrivateJsonFile(join(stateDirectory, `${patchedHash}.json`), {
        bundle: bundle.filename,
        originalHash: bundle.digest,
        patchedHash,
      });
      replaceFile(bundle.filename, bundle.source, next);
      return { ...state, status: "applied", backupPath };
    } catch (error) {
      return failure(error);
    }
  }
  function restore(): HighlightState {
    try {
      lastError = null;
      const { state, bundle } = inspect();
      if (!bundle || state.status !== "applied")
        throw new Error("当前安装包没有可恢复的高亮补丁。");
      const record = backupSchema.parse(JSON.parse(readFileSync(bundle.recordPath, "utf8")));
      if (record.bundle !== bundle.filename || record.patchedHash !== bundle.digest)
        throw new Error("安装包与高亮备份不匹配，已取消恢复。");
      const backupPath = join(stateDirectory, `${record.originalHash}.js`);
      const original = readFileSync(backupPath, "utf8");
      if (hash(original) !== record.originalHash) throw new Error("高亮备份校验失败，已取消恢复。");
      replaceFile(bundle.filename, bundle.source, original);
      return { ...state, status: "restored", backupPath: null };
    } catch (error) {
      return failure(error);
    }
  }
  return { read, apply, restore };
}
