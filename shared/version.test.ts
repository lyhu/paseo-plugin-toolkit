import { expect, it } from "vitest";
import manifest from "../package.json";
import lockfile from "../package-lock.json";
import { TOOLKIT_VERSION } from "./version";

it("keeps the displayed version in sync with the manifest", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(TOOLKIT_VERSION).toBe(manifest.version);
  expect(lockfile.version).toBe(manifest.version);
  expect(lockfile.packages[""].version).toBe(manifest.version);
});
