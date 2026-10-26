import type { WorkbenchPreferences, WorkbenchProject, WorkbenchTab } from "./types";

export function projectsInGroup(
  projects: WorkbenchProject[],
  preferences: WorkbenchPreferences,
  group?: WorkbenchTab,
) {
  const entries = projects.filter(
    (p) =>
      !p.system &&
      (!group ||
        (group.kind === "favorites"
          ? preferences.favorites.includes(p.id)
          : group.kind === "host"
            ? p.instances.some((i) => i.serverId === group.hostId)
            : group.projectIds?.includes(p.id))),
  );
  const order =
    group?.projectOrder ??
    (group?.kind === "manual"
      ? group.projectIds
      : group?.kind === "favorites"
        ? preferences.favorites
        : undefined) ??
    [];
  const ranks = new Map(order.map((id, index) => [id, index]));
  return entries.sort(
    (a, b) => (ranks.get(a.id) ?? order.length) - (ranks.get(b.id) ?? order.length),
  );
}
export function reorderIds(ids: string[], source: string, target: string, after: boolean) {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  const next = ids.filter((id) => id !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next;
}

/**
 * Adds a project to the favorites group or removes it. A deleted favorites group is recreated
 * first so a successful action is always visible in the sidebar.
 */
export function toggleFavoriteGroup(
  preferences: WorkbenchPreferences,
  projectId: string,
  favorited: boolean,
  groupName = "常用项目",
): Pick<WorkbenchPreferences, "favorites" | "tabs"> {
  const favorites = favorited
    ? preferences.favorites.filter((id) => id !== projectId)
    : [...preferences.favorites, projectId];
  let tabs = preferences.tabs;
  if (!favorited && !tabs.some((tab) => tab.kind === "favorites")) {
    let id = "favorites";
    for (let suffix = 2; tabs.some((tab) => tab.id === id); suffix++) id = `favorites-${suffix}`;
    tabs = [{ id, name: groupName, kind: "favorites" }, ...tabs];
  }
  return { favorites, tabs };
}
