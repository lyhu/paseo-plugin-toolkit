import { expect, it } from "vitest";
import manifest from "../package.json";
import { TOOLKIT_VERSION } from "./version";

it("keeps the displayed version in sync with the manifest", () => {
  expect(TOOLKIT_VERSION).toBe(manifest.version);
});
