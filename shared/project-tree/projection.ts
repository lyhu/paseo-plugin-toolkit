import type { Tree, TreeNode } from "./model";

export interface VisibleTreeRow {
  node: TreeNode;
  depth: number;
  parentId: string | null;
  hidden: boolean;
  /** A flattened project still owns workspace rows, but has no rendered container. */
  showContainer: boolean;
}

/** Pure display projection; never modifies ancestry or physical resource ownership. */
export function visibleTreeRows(
  tree: Tree,
  options: { showHidden?: boolean; collapsed?: ReadonlySet<string> } = {},
): VisibleTreeRow[] {
  const children = new Map<string | null, TreeNode[]>();
  for (const node of tree.nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const rows: VisibleTreeRow[] = [];
  const stack = [...(children.get(null) ?? [])].reverse().map((node) => ({
    node,
    depth: 0,
    parentId: null as string | null,
    hidden: false,
  }));
  const seen = new Set<string>();
  while (stack.length) {
    const entry = stack.pop()!;
    if (seen.has(entry.node.id)) continue;
    seen.add(entry.node.id);
    const hidden = entry.hidden || !!entry.node.hidden;
    if (hidden && !options.showHidden) continue;
    const showContainer = options.showHidden || !entry.node.flattened;
    if (showContainer || entry.node.kind === "project")
      rows.push({ ...entry, hidden, showContainer: !!showContainer });
    if (showContainer && options.collapsed?.has(entry.node.id)) continue;
    const nested = children.get(entry.node.id) ?? [];
    for (let i = nested.length - 1; i >= 0; i--)
      stack.push({
        node: nested[i]!,
        depth: entry.depth + (showContainer ? 1 : 0),
        parentId: showContainer ? entry.node.id : entry.parentId,
        hidden,
      });
  }
  return rows;
}
