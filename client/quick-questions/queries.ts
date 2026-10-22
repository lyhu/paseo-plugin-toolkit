import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import {
  readWorkspaceChanges,
  readSummaryChanges,
  workspaceVersion,
  summaryVersion,
  isWorking,
  type Workspace,
  type Job,
} from "../../shared/quick-questions/contracts";

export function workspaceKey(hostId: string, workspaceId: string) {
  return ["toolkit", "quick-questions", hostId, workspaceId];
}
export function summaryKey(hostId: string, workspaceId: string) {
  return ["toolkit", "summary", hostId, workspaceId];
}
export function summaryInterval(job: Job | null | undefined, expanded: boolean) {
  return isWorking(job) ? (expanded ? 1000 : 5000) : 30000;
}
export function useQuestions(hostId: string, workspaceId: string) {
  const read = useRpc(readWorkspaceChanges);
  const cache = useQueryClient();
  const key = workspaceKey(hostId, workspaceId);
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const previous = cache.getQueryData<Workspace>(key);
      const next = await read({
        workspaceId,
        known: previous ? workspaceVersion(previous) : undefined,
      });
      const current = cache.getQueryData<Workspace>(key);
      return current && current !== previous ? current : (next ?? previous!);
    },
    staleTime: 10000,
    gcTime: 60000,
    refetchInterval: 30000,
  });
}
export function useSummary(hostId: string, workspaceId: string, expanded: boolean) {
  const read = useRpc(readSummaryChanges);
  const cache = useQueryClient();
  const key = summaryKey(hostId, workspaceId);
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const previous = cache.getQueryData<Job | null>(key);
      const next = await read({
        workspaceId,
        known: previous === undefined ? undefined : summaryVersion(previous),
      });
      const current = cache.getQueryData<Job | null>(key);
      if (current !== undefined && current !== previous) return current;
      return next.unchanged ? previous! : next.job;
    },
    gcTime: 60000,
    refetchInterval: (query) => summaryInterval(query.state.data, expanded),
  });
}
