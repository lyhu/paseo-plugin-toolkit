import { expect, it } from "vitest";
import { projectsInGroup, reorderIds } from "./groups";
import type { WorkbenchPreferences, WorkbenchProject } from "./types";
const projects: WorkbenchProject[] = ["a", "b", "c"].map((id) => ({
  id,
  name: id,
  instances: [{ serverId: "host", projectId: id, path: `/${id}` }],
  workspaceCount: 1,
}));
const preferences: WorkbenchPreferences = {
  layout: "A",
  tabs: [],
  favorites: ["c", "a"],
  focusTasks: [],
};
it("uses one membership and ordering rule for manual, favorite and Host groups", () => {
  expect(
    projectsInGroup(projects, preferences, { id: "fav", name: "Fav", kind: "favorites" }).map(
      (p) => p.id,
    ),
  ).toEqual(["c", "a"]);
  expect(
    projectsInGroup(projects, preferences, {
      id: "manual",
      name: "M",
      kind: "manual",
      projectIds: ["b", "a"],
      projectOrder: ["missing", "a", "b"],
    }).map((p) => p.id),
  ).toEqual(["a", "b"]);
  expect(
    projectsInGroup(projects, preferences, {
      id: "host",
      name: "H",
      kind: "host",
      hostId: "host",
      projectOrder: ["c", "b"],
    }).map((p) => p.id),
  ).toEqual(["c", "b", "a"]);
  expect(reorderIds(["a", "b", "c"], "c", "a", false)).toEqual(["c", "a", "b"]);
  expect(reorderIds(["a", "b"], "a", "all", false)).toEqual(["a", "b"]);
});
