import { expect, it } from "vitest";
import { projectsInGroup, reorderIds, toggleFavoriteGroup } from "./groups";
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

it("adds a favorite to the end and removes it without touching other preferences", () => {
  const tabs = [
    { id: "favorites", name: "Favorites", kind: "favorites" as const },
    { id: "ops", name: "Ops", kind: "manual" as const, projectIds: ["a"] },
  ];
  expect(toggleFavoriteGroup({ ...preferences, tabs }, "b", false, "Favorites")).toEqual({
    favorites: ["c", "a", "b"],
    tabs,
  });
  expect(toggleFavoriteGroup({ ...preferences, tabs }, "c", true, "Favorites")).toEqual({
    favorites: ["a"],
    tabs,
  });
});

it("recreates a deleted favorites group first with a unique ID", () => {
  const tabs = [{ id: "favorites", name: "Unrelated", kind: "manual" as const }];
  const added = toggleFavoriteGroup({ ...preferences, tabs }, "b", false, "Favorites");
  expect(added.tabs[0]).toEqual({
    id: "favorites-2",
    name: "Favorites",
    kind: "favorites",
  });
  expect(added.favorites).toEqual(["c", "a", "b"]);
  expect(toggleFavoriteGroup({ ...preferences, tabs: [] }, "b", false, "Favorites").tabs).toEqual([
    { id: "favorites", name: "Favorites", kind: "favorites" },
  ]);
});
