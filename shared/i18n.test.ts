import { expect, it } from "vitest";
import { translate } from "./i18n";

it("translates labels in both directions after a language change", () => {
  expect(translate("en-US", "快捷提问")).toBe("Quick questions");
  expect(translate("zh-CN", "Quick questions")).toBe("快捷提问");
});

it("interpolates UI labels without translating user-supplied values", () => {
  expect(translate("en-US", "直接发送：{0}", { "0": "快捷提问" })).toBe("Send now: 快捷提问");
  expect(translate("en-US", "{0}第 {1} 条", { "0": "Edit", "1": 2 })).toBe("Edit question 2");
});

it("localizes rendered server progress and nested retry errors", () => {
  expect(translate("en-US", "正在使用 model.v1 总结第 2/3 批（12 条提问）")).toBe(
    "Using model.v1 to summarize batch 2/3 (12 questions)",
  );
  const message =
    "第 2/3 批格式校验失败：模型返回的内容不是有效 JSON，请重试总结。 正在自动重试 1/1";
  expect(translate("en-US", message)).toBe(
    "Batch 2/3 failed validation: The model returned invalid JSON. Retry the summary. Retrying 1/1",
  );
  expect(translate("en-US", "模型返回的内容不是有效 JSON，请重试总结。（已自动重试 1 次）")).toBe(
    "The model returned invalid JSON. Retry the summary. (retried once automatically)",
  );
});

it("keeps arbitrary text unchanged and restores translated progress to Chinese", () => {
  const text = "Workspace a.b [prod] / current server status";
  expect(translate("en-US", text)).toBe(text);
  expect(translate("zh-CN", "Read a.b [prod]: 12 user questions")).toBe(
    "已读取 a.b [prod]：12 条用户提问",
  );
});
