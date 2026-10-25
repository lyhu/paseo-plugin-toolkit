import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHighlightService } from "./service";
import { fixtureBundle } from "./fixtures/renderer";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function setup(source = fixtureBundle) {
  const directory = mkdtempSync(join(tmpdir(), "toolkit-highlight-"));
  directories.push(directory);
  const appPath = join(directory, "Paseo.app");
  const contents = join(appPath, "Contents");
  const appDist = join(contents, "Resources/app-dist");
  const relative = "_expo/static/js/web/index-abc123.js";
  const bundle = join(appDist, relative);
  mkdirSync(dirname(bundle), { recursive: true });
  writeFileSync(bundle, source);
  writeFileSync(
    join(contents, "Info.plist"),
    "<plist><dict><key>CFBundleShortVersionString</key><string>0.13.0</string></dict></plist>",
  );
  writeFileSync(join(appDist, "index.html"), `<script src="/${relative}" defer></script>`);
  const options = { appPath, platform: "darwin", stateDirectory: join(directory, "backups") };
  return { options, bundle, contents, service: createHighlightService(options) };
}

describe("editor highlight patch lifecycle", () => {
  it("backs up, patches, skips repeat application, and restores exact original bytes", () => {
    const { service, bundle } = setup();
    expect(service.read().status).toBe("ready");
    const result = service.apply();
    expect(result.status).toBe("applied");
    expect(readFileSync(result.backupPath!, "utf8")).toBe(fixtureBundle);
    const patched = readFileSync(bundle, "utf8");
    expect(service.apply().status).toBe("applied");
    expect(readFileSync(bundle, "utf8")).toBe(patched);
    expect(service.restore().status).toBe("restored");
    expect(readFileSync(bundle, "utf8")).toBe(fixtureBundle);
  });

  it("detects an upgrade and reapplies from the new original on plugin reload", () => {
    const { service, bundle, options } = setup();
    const oldBackup = service.apply().backupPath;
    const upgraded = fixtureBundle + "\n// new release";
    writeFileSync(bundle, upgraded);
    const reloaded = createHighlightService(options);
    const result = reloaded.apply();
    expect(result.status).toBe("applied");
    expect(result.backupPath).not.toBe(oldBackup);
    expect(readFileSync(result.backupPath!, "utf8")).toBe(upgraded);
    expect(reloaded.restore().status).toBe("restored");
    expect(readFileSync(bundle, "utf8")).toBe(upgraded);
  });

  it("leaves incompatible renderers unchanged and exposes the error", () => {
    const { service, bundle } = setup("console.log('different build')");
    expect(service.apply().status).toBe("error");
    expect(service.read().error).toContain("不兼容");
    expect(readFileSync(bundle, "utf8")).toBe("console.log('different build')");
  });

  it("refuses to restore an older backup over an upgraded unpatched renderer", () => {
    const { service, bundle } = setup();
    service.apply();
    writeFileSync(bundle, fixtureBundle + "\n// upgraded");
    expect(service.restore().status).toBe("error");
    expect(readFileSync(bundle, "utf8")).toBe(fixtureBundle + "\n// upgraded");
  });

  it("refuses a corrupted backup", () => {
    const { service, bundle } = setup();
    const result = service.apply();
    const patched = readFileSync(bundle, "utf8");
    writeFileSync(result.backupPath!, "broken");
    expect(service.restore().status).toBe("error");
    expect(service.read().error).toContain("校验失败");
    expect(readFileSync(bundle, "utf8")).toBe(patched);
  });

  it("does not treat edited patch markers as a verified installation", () => {
    const { service, bundle } = setup();
    service.apply();
    const changed = readFileSync(bundle, "utf8") + "\n// other change";
    writeFileSync(bundle, changed);
    expect(service.apply().status).toBe("error");
    expect(readFileSync(bundle, "utf8")).toBe(changed);
  });

  it("skips non-macOS hosts and missing applications", () => {
    const { options } = setup();
    expect(createHighlightService({ ...options, platform: "linux" }).apply().status).toBe(
      "unsupported",
    );
    expect(
      createHighlightService({ ...options, appPath: join(options.appPath, "missing") }).apply()
        .status,
    ).toBe("missing");
  });

  it("rejects unverified application versions", () => {
    const { service, contents, bundle } = setup();
    writeFileSync(
      join(contents, "Info.plist"),
      "<key>CFBundleShortVersionString</key><string>0.14.0</string>",
    );
    expect(service.apply().error).toContain("版本尚未验证");
    expect(readFileSync(bundle, "utf8")).toBe(fixtureBundle);
  });
});
