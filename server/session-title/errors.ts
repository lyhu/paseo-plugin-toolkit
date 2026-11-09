import type { ProviderFailureKind } from "../../shared/models/failure";

/** 命名失败的可聚合原因；Provider 原因由传输层错误类型派生。 */
export type TitleFailureReason =
  | `provider.${ProviderFailureKind}`
  | "session.deleting"
  | "session.unavailable"
  | "session.busy"
  | "session.titleChanged"
  | "session.contentChanged"
  | "session.changed"
  | "session.stopped"
  | "session.processing"
  | "title.applied"
  | "archive.changed"
  | "archive.unverified"
  | "archive.failed"
  | "history.read"
  | "history.incomplete"
  | "history.empty"
  | "model.invalidJson"
  | "model.invalidTitle"
  | "input.invalidTitle"
  | "config.model"
  | "config.settings"
  | "paseo.writeFailed"
  | "paseo.commandFailed"
  | "storage.write"
  | "job.interrupted"
  | "canceled"
  | "unknown";

/** 失败发生在哪个命名阶段。 */
export type TitleFailureStage =
  | "automatic"
  | "start"
  | "archive"
  | "reading"
  | "summarizing"
  | "applying"
  | "storage"
  | "startup"
  | "recover";

/** 用户可见文案的唯一来源，避免服务、分类表与测试各自维护一份。 */
export const TITLE_MESSAGES = {
  deleting: "会话正在删除，请在会话列表重试永久删除。",
  unavailable: "会话不可用，请刷新后重试。",
  busy: "请等待当前会话执行完成后再总结。",
  titleChanged: "会话标题已变化，请重新生成预览。",
  contentChanged: "会话内容已变化，请重新生成预览。",
  changed: "会话总结已变化，请刷新后重试。",
  stopped: "会话总结服务已停止。",
  processing: "总结正在处理，请稍后重试。",
  applied: "此推荐标题已应用，无需重复操作。",
  archivedChanged: "归档会话已变化，后台任务已停止，请重新命名。",
  archiveUnverified: "归档结果需要核对，请确认会话状态后重试。",
  archiveFailed: "会话归档未完成，请检查连接后重试。",
  historyRead: "会话历史读取失败，请在智能命名中重试。",
  historyIncomplete: "会话历史不完整，请刷新后重试；未执行改名。",
  historyPageStuck: "会话历史分页未前进，请刷新后重试。",
  historyEmpty: "会话没有可总结的文本。",
  invalidJson: "模型返回的总结格式无效，请重试。",
  truncated: "模型输出达到 token 上限，标题生成被截断，请重试。",
  invalidTitle: "推荐标题超过长度限制或格式无效，原标题已保留。",
  invalidInputTitle: "标题不能为空、换行或超过 200 字符。",
  missingModel: "请先配置 Toolkit 共用 AI 模型。",
  settingsUnavailable: "会话命名设置不可用，请刷新后重试。",
  writeFailed: "会话标题写回失败，请检查此 Host 的 Paseo CLI 与 daemon 连接。",
  commandFailed: "会话操作失败，请检查此 Host 的 Paseo CLI 与 daemon 连接。",
  storageFailed: "会话总结保存失败，请重试。",
  interrupted: "命名任务因插件重载中断，可重新命名。",
  canceled: "已取消会话总结。",
  titleOrWorkspaceChanged: "会话标题或工作区已变化，请刷新后重试。",
  modelFailed: "模型请求失败，请检查 Toolkit 模型配置后重试。",
} as const;

/** 已知原因的命名错误；日志分类直接读取 reason，不再依赖中文文案匹配。 */
export class TitleFailureError extends Error {
  readonly reason: TitleFailureReason;

  constructor(reason: TitleFailureReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TitleFailureError";
    this.reason = reason;
  }
}

/** 生成的标题不合法；保留被拒值与限制，便于后续长度分析。 */
export class InvalidTitleError extends TitleFailureError {
  readonly title: string;
  readonly limit: number;

  constructor(title: string, limit: number) {
    super("model.invalidTitle", TITLE_MESSAGES.invalidTitle);
    this.name = "InvalidTitleError";
    this.title = title;
    this.limit = limit;
  }
}
