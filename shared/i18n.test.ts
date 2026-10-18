import { expect, it } from "vitest";
import { translate } from "./i18n";
import { LocalizedError, localized, renderMessage } from "./chat-view/i18n";

it("translates labels in both directions after a language change", () => {
  expect(translate("en-US", "快捷提问")).toBe("Quick questions");
  expect(translate("zh-CN", "Quick questions")).toBe("快捷提问");
});

it("interpolates UI labels without translating user-supplied values", () => {
  expect(translate("en-US", "直接发送：{0}", { "0": "快捷提问" })).toBe("Send now: 快捷提问");
  expect(translate("en-US", "{0}第 {1} 条", { "0": "Edit", "1": 2 })).toBe("Edit question 2");
});

it("renders typed server messages in the active locale", () => {
  expect(
    renderMessage(
      "en-US",
      localized("quickQuestions.activity.summarizing", {
        model: "model.v1",
        current: 2,
        total: 3,
        count: 12,
      }),
    ),
  ).toBe("Using model.v1 to summarize batch 2/3 (12 questions)");
  expect(
    translate("en-US", new LocalizedError("quickQuestions.error.formatInvalidJson").message),
  ).toBe("The model returned invalid JSON. Retry the summary.");
  const retried = new LocalizedError(
    "quickQuestions.error.formatInvalidJson",
    undefined,
    "quickQuestions.error.retriedOnce",
  );
  expect(translate("en-US", retried.message)).toBe(
    "The model returned invalid JSON. Retry the summary. (retried once automatically)",
  );
});

it("keeps arbitrary text unchanged and restores exact translations to Chinese", () => {
  const text = "Workspace a.b [prod] / current server status";
  expect(translate("en-US", text)).toBe(text);
  expect(translate("zh-CN", "Read {0}: {1} user questions")).toBe("已读取 {0}：{1} 条用户提问");
});
