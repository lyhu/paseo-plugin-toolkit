/** Workspace overrides win over their display project, then the device default. */
export function sessionVisible(
  overrides: ReadonlyMap<string, boolean> | undefined,
  defaultVisible: boolean,
  id: string,
  projectId?: string,
): boolean {
  return (
    overrides?.get(id) ?? (projectId ? overrides?.get(projectId) : undefined) ?? defaultVisible
  );
}
