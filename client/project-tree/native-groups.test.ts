import { expect, it } from "vitest";
import { nativeGroupsWithin, nativeProjectGroups } from "./native-groups";
it("does not expose a native group action that would also affect projects outside the custom group", () => {
  const groups = nativeProjectGroups([
    { serverId: "pro", projectId: "p", name: "Project", key: "opaque", root: "/a" },
    { serverId: "mini", projectId: "m", name: "Project", key: "opaque", root: "/b" },
  ]);
  expect(nativeGroupsWithin(groups, [{ serverId: "mini", projectId: "m" }])).toEqual([]);
  expect(
    nativeGroupsWithin(groups, [
      { serverId: "mini", projectId: "m" },
      { serverId: "pro", projectId: "p" },
    ])[0]?.viewKey,
  ).toBe("opaque");
});
it("allocates the same collision-safe placement key for an opaque JSON-shaped equivalence key", () => {
  const groups = nativeProjectGroups([
    { serverId: "pro", projectId: "p", name: "Local", root: "/a" },
    { serverId: "mini", projectId: "m", name: "Remote", key: '["pro","p"]', root: "/b" },
  ]);
  expect(groups).toEqual([]);
});
