import type { PaseoApi, PaseoAgent } from "@getpaseo/client";
import { z } from "zod";
import type { TitleStore } from "./storage";
import type { createTitleService } from "./service";
import { prepareProviderHistory } from "./provider-history";
import { localAgentCommand } from "./rename";

export function createSessionDeletion(options: {
  store: TitleStore;
  titles: Pick<ReturnType<typeof createTitleService>, "block" | "forget">;
  clearSearch(agentId: string): void;
  prepare?: typeof prepareProviderHistory;
  command?: typeof localAgentCommand;
}) {
  const active = new Set<string>();
  return async (
    paseo: PaseoApi,
    input: { agentId: string; workspaceId: string; previousTitle: string | null },
  ) => {
    const id = input.agentId;
    if (active.has(id)) throw new Error("会话正在删除，请稍后重试。");
    active.add(id);
    let history: Awaited<ReturnType<typeof prepareProviderHistory>> | undefined;
    try {
      const ref = paseo.agents.ref(id);
      const check = (agent?: PaseoAgent) => {
        if (
          !agent ||
          agent.workspaceId !== input.workspaceId ||
          agent.title !== input.previousTitle
        )
          throw new Error("会话标题或工作区已变化，请刷新后重试。");
        if (agent.activeTurn || (!agent.archivedAt && agent.status !== "idle"))
          throw new Error("请等待会话执行完成后再永久删除。");
        return agent;
      };
      const agent = check((await ref.refresh())?.agent);
      const nativeId = agent.persistence?.nativeHandle ?? agent.persistence?.sessionId;
      let cursor: string | undefined;
      do {
        const page = await paseo.agents.list({
          filter: { includeArchived: true, includeInternal: true },
          page: { limit: 100, cursor },
        });
        for (const { agent: other } of page.entries) {
          if (other.id === id) continue;
          if (
            nativeId &&
            nativeId === (other.persistence?.nativeHandle ?? other.persistence?.sessionId)
          )
            throw new Error("原始历史被其他会话共用，尚未删除会话。");
          if (
            !agent.archivedAt &&
            !other.archivedAt &&
            other.labels?.["paseo.parent-agent-id"] === id
          )
            throw new Error("请先处理此会话的子会话，再永久删除。");
        }
        const next = page.pageInfo.nextCursor ?? undefined;
        if (next && next === cursor) throw new Error("会话目录分页异常，尚未删除会话。");
        cursor = next;
      } while (cursor);
      const receipt = options.store.read(id).deletedProvider;
      if (receipt && (receipt.provider !== agent.provider || receipt.id !== nativeId))
        throw new Error("原始会话标识已变化，已停止删除。");
      if (!receipt) {
        if (!agent.persistence) {
          const page = await ref.timeline.refetch({ direction: "tail", limit: 100 });
          if (
            agent.lastUserMessageAt ||
            page.error ||
            page.gap ||
            page.hasOlder ||
            page.entries.some(
              ({ item }) => item.type === "user_message" || item.type === "assistant_message",
            )
          )
            throw new Error("缺少 Provider 原始会话标识，尚未删除会话。");
        } else {
          const { config } = await paseo.config.get();
          history = await (options.prepare ?? prepareProviderHistory)(agent, config.providers);
        }
      }
      await options.titles.block(id);
      const current = check((await ref.refresh())?.agent);
      if ((current.persistence?.nativeHandle ?? current.persistence?.sessionId) !== nativeId)
        throw new Error("原始会话标识已变化，已停止删除。");
      // Closing the idle runtime first prevents it from rewriting a deleted transcript.
      if (!current.archivedAt) await ref.archive();
      check((await ref.refresh())?.agent);
      if (history) {
        await history.remove();
        options.store.update(id, (state) => ({
          ...state,
          deletedProvider: { id: history!.id, provider: agent.provider },
        }));
      }
      options.clearSearch(id);
      const result = z
        .object({ deletedCount: z.literal(1), agentIds: z.array(z.string()) })
        .parse(
          await (options.command ?? localAgentCommand)(
            ["delete", id],
            new AbortController().signal,
          ),
        );
      if (result.agentIds.length !== 1 || result.agentIds[0] !== id || (await ref.refresh()))
        throw new Error("Paseo 会话删除未完成，请重试永久删除。");
      options.titles.forget(id);
      return { deleted: true };
    } catch (error) {
      if (
        error instanceof Error &&
        /^(?:[\u3400-\u9fff]|(?:Codex|Claude|Provider) [\u3400-\u9fff])/u.test(error.message)
      )
        throw error;
      throw new Error("永久删除未完成，请重试；尚未完成的清理不会显示为成功。");
    } finally {
      history?.close();
      active.delete(id);
    }
  };
}
