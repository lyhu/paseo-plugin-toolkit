import { useQuery } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { readWorkspace } from "../../shared/quick-questions/contracts";

export function workspaceKey(hostId: string, workspaceId: string) {
  return ["toolkit", "quick-questions", hostId, workspaceId];
}
export function useQuestions(hostId: string, workspaceId: string) {
  const read = useRpc(readWorkspace);
  return useQuery({
    queryKey: workspaceKey(hostId, workspaceId),
    queryFn: () => read({ workspaceId }),
    refetchInterval: 5000,
  });
}
