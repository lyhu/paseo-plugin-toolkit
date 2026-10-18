import { expect, it, vi } from "vitest";
import {
  buildEnhanceMessages,
  decideEnhancement,
  derivePolicy,
  ENHANCE_SYSTEM_PROMPT,
  MAX_ENHANCED_CHARS,
  normalizeRaw,
  parseEnhanceOutput,
  runEnhancement,
  type EnhanceProvider,
  type EnvironmentProfile,
} from "./index";

function profile(overrides: Partial<EnvironmentProfile> = {}): EnvironmentProfile {
  return {
    root: "/repo",
    projectKind: "frontend",
    languages: ["typescript"],
    packageManagers: ["pnpm"],
    frameworks: ["react"],
    commands: { build: "pnpm build", test: "pnpm test" },
    conventions: ["测试与源码同目录"],
    constraints: ["Node >= 20"],
    hotspots: [{ path: "shared/enhance", reason: "本次改动最相关" }],
    references: [{ path: "README.md", excerpt: "插件通过公开 SDK 接入" }],
    ...overrides,
  };
}

const completion = (body: string): EnhanceProvider => ({ complete: vi.fn(async () => body) });

const wrapped = (enhanced: string, delta = "补齐了验收标准", open = "无") =>
  `<enhanced_prompt>${enhanced}</enhanced_prompt>` +
  `<delta_summary>${delta}</delta_summary>` +
  `<open_questions>${open}</open_questions>`;

it("normalizes cosmetic noise while keeping markdown hard breaks", () => {
  expect(normalizeRaw("　修复​ 登录\r\n\r\n\r\n结束")).toBe("修复 登录\n\n结束");
  expect(normalizeRaw("  a  \n  b  ")).toBe("a  \n  b");
});

it("asks for expansion on a vague one-liner and keeps an already structured prompt", () => {
  const vague = decideEnhancement("加个缓存");
  expect(vague.enhance).toBe(true);
  expect(vague.missing).toContain("acceptance");
  const structured = decideEnhancement(
    "在 shared/enhance/policy.ts 实现 monorepo 目标包映射，必须保持现有导出签名不变，验收运行 pnpm test",
  );
  expect(structured.enhance).toBe(false);
  expect(structured.present).toContain("acceptance");
  expect(decideEnhancement("ok").enhance).toBe(false);
});

it("derives environment focus and never invents a command the probe did not find", () => {
  const frontend = derivePolicy(profile());
  expect(frontend.focus.join()).toContain("交互状态");
  expect(frontend.acceptance).toContain("`pnpm test`");
  expect(frontend.constraints.join()).toContain("不引入新的 UI 依赖");
  const library = derivePolicy(profile({ projectKind: "library" }));
  expect(library.constraints.join()).toContain("不得破坏已导出的公开签名");
  const bare = derivePolicy(profile({ projectKind: "unknown", commands: {} }));
  expect(bare.focus).toEqual([]);
  expect(bare.acceptance).toContain("人工核对");
  expect(bare.acceptance).not.toContain("`");
});

it("keeps the system prompt byte-identical across differing environments", () => {
  const first = buildEnhanceMessages({
    raw: "a",
    missing: [],
    profile: profile(),
    policy: derivePolicy(profile()),
  });
  const second = buildEnhanceMessages({
    raw: "b",
    missing: ["验收标准"],
    profile: profile({ projectKind: "backend", root: "/other" }),
    policy: derivePolicy(profile({ projectKind: "backend" })),
  });
  expect(first[0]).toEqual({ role: "system", content: ENHANCE_SYSTEM_PROMPT });
  expect(second[0]).toEqual(first[0]);
  expect(first[1]!.content).toContain("kind: frontend");
  expect(second[1]!.content).toContain("kind: backend");
  expect(second[1]!.content).toContain("验收标准");
});

it("parses a well-formed completion into an applied result", () => {
  const result = parseEnhanceOutput(
    wrapped("增强后的正文", "补了范围", "- 是否兼容旧版"),
    "原文",
    [],
    "zh-CN",
  );
  expect(result).toMatchObject({ applied: true, degraded: false, enhanced: "增强后的正文" });
  expect(result.openQuestions).toEqual(["是否兼容旧版"]);
  expect(parseEnhanceOutput(wrapped("x"), "x", [], "zh-CN")).toMatchObject({
    applied: false,
    degraded: false,
  });
});

it("degrades instead of throwing when the model misbehaves", () => {
  expect(parseEnhanceOutput("没有标签的输出", "原文", ["验收标准"], "zh-CN")).toMatchObject({
    enhanced: "原文",
    applied: false,
    degraded: true,
    openQuestions: ["验收标准"],
  });
  expect(parseEnhanceOutput(wrapped("x", "x", "无"), "x", [], "zh-CN").openQuestions).toEqual([]);
});

it("caps the body at one flat ceiling regardless of input length", () => {
  // The cap must not track the input: a 4-character prompt is the case that most needs expanding,
  // and scaling the ceiling with the input is what used to return a 12-character stub.
  expect(parseEnhanceOutput(wrapped("长".repeat(900)), "原文", [], "zh-CN").enhanced.length).toBe(
    MAX_ENHANCED_CHARS,
  );
  // A body within the ceiling is delivered whole and carries no truncation notice.
  const whole = parseEnhanceOutput(wrapped("长".repeat(120)), "原文", [], "zh-CN");
  expect(whole.enhanced.length).toBe(120);
  expect(whole.truncated).toBe(false);
});

it("flags a shortened body so the client can say so", () => {
  const result = parseEnhanceOutput(wrapped("长".repeat(900), "补了范围"), "原文", [], "zh-CN");
  expect(result.truncated).toBe(true);
  // The notice is client-side wording in the reader's language, so the summary stays the model's.
  expect(result.deltaSummary).toBe("补了范围");
});

it("leaves a prompt longer than the ceiling alone rather than returning less than was written", () => {
  const long = "长".repeat(MAX_ENHANCED_CHARS + 40);
  const decision = decideEnhancement(long);
  expect(decision.enhance).toBe(false);
  expect(decision.skip).toBe("tooLong");
});

it("runs the pipeline and swallows provider failures into a degraded result", async () => {
  const provider = completion(wrapped("完整提示词：目标、范围、约束、验收"));
  const applied = await runEnhancement({ raw: "加个缓存", profile: profile(), provider });
  expect(applied.applied).toBe(true);
  expect(provider.complete).toHaveBeenCalledOnce();

  const failing: EnhanceProvider = {
    complete: vi.fn(async () => {
      throw new Error("连接超时");
    }),
  };
  const degraded = await runEnhancement({ raw: "加个缓存", profile: profile(), provider: failing });
  expect(degraded).toMatchObject({ enhanced: "加个缓存", applied: false, degraded: true });
  expect(degraded.degradedReason).toContain("连接超时");
  expect(degraded.openQuestions.length).toBeGreaterThan(0);
});

it("words its reasons in the caller's language", async () => {
  const provider = completion(wrapped("不应被调用"));
  const skipped = await runEnhancement({
    raw: "ok",
    profile: profile(),
    provider,
    locale: "en-US",
  });
  expect(skipped.degradedReason).toBe("The prompt is too short to expand");
  const failing: EnhanceProvider = {
    complete: vi.fn(async () => {
      throw new Error("boom");
    }),
  };
  const degraded = await runEnhancement({
    raw: "加个缓存",
    profile: profile(),
    provider: failing,
    locale: "en-US",
  });
  expect(degraded.degradedReason).toBe("Model call failed: boom");
});

it("skips the model entirely when the raw input is already executable", async () => {
  const provider = completion(wrapped("不应被调用"));
  const result = await runEnhancement({
    raw: "在 shared/enhance/policy.ts 实现 monorepo 目标包映射，必须保持现有导出签名不变，验收运行 pnpm test",
    profile: profile(),
    provider,
  });
  expect(result.applied).toBe(false);
  expect(provider.complete).not.toHaveBeenCalled();
});
