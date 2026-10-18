import { t, type TranslationKey } from "../i18n";
import { MAX_ENHANCED_CHARS } from "./contract";
import { normalizeRaw } from "./normalize";

/** The four elements an executable prompt needs; the product definition of "enhanced". */
export const ENHANCE_DIMENSIONS = ["goal", "scope", "constraints", "acceptance"] as const;
export type EnhanceDimension = (typeof ENHANCE_DIMENSIONS)[number];

/** Where each dimension's name lives in the dictionary, so a reason can be worded in any language. */
export const DIMENSION_KEYS: Record<EnhanceDimension, TranslationKey> = {
  goal: "enhance.dimension.goal",
  scope: "enhance.dimension.scope",
  constraints: "enhance.dimension.constraints",
  acceptance: "enhance.dimension.acceptance",
};

/**
 * The dimension names the model is given. The system prompt is Chinese, so these stay Chinese
 * whatever language the interface is in; only the reasons the reader sees are translated.
 */
export const DIMENSION_LABELS: Record<EnhanceDimension, string> = {
  goal: t("zh-CN", DIMENSION_KEYS.goal),
  scope: t("zh-CN", DIMENSION_KEYS.scope),
  constraints: t("zh-CN", DIMENSION_KEYS.constraints),
  acceptance: t("zh-CN", DIMENSION_KEYS.acceptance),
};

/** Which check stopped the rewrite; the wording is chosen where the language is known. */
export type EnhanceSkipReason = "tooShort" | "alreadyStructured" | "missingDimensions" | "tooLong";

export interface EnhanceDecision {
  enhance: boolean;
  present: EnhanceDimension[];
  missing: EnhanceDimension[];
  /** Set whenever `enhance` is false. */
  skip?: EnhanceSkipReason;
}

const ACTION_VERBS =
  /实现|开发|重构|修复|优化|新增|添加|删除|移除|支持|接入|迁移|编写|生成|构建|部署|测试|梳理|整理|清理|排查|设计|封装|升级|拆分|合并/;
const ENGLISH_ACTION_VERBS =
  /\b(implement|fix|refactor|add|remove|support|migrate|write|build|create|update|handle|extract|rename|document|test)\b/i;
const SCOPE_HINT =
  /范围|边界|不要|仅|只改|不涉及|排除|src\/|client\/|shared\/|server\/|\.ts\b|\.tsx\b|\.js\b|\.py\b|\.go\b|\.rs\b|模块|目录|文件/;
const ENGLISH_SCOPE_HINT =
  /\b(scope|without|only|exclude|don't|do not)\b|\.\w{1,4}\b|\b(module|directory|file)\b/i;
const CONSTRAINT_HINT =
  /约束|兼容|性能|不能|必须|禁止|保持|不要改|版本|依赖|并发|超时|安全|隐私|向后兼容|不破坏|沿用|遵循/;
const ENGLISH_CONSTRAINT_HINT =
  /\b(must|must not|without breaking|backward|compatible|performance|constraint|keep|preserve|follow)\b/i;
const ACCEPTANCE_HINT =
  /验收|测试|怎么算完成|完成标准|成功标准|期望|预期|验证|通过|用例|断言|benchmark/;
const ENGLISH_ACCEPTANCE_HINT =
  /\b(acceptance|test|verify|expected|success criteria|definition of done|assert)\b/i;

/**
 * Deterministic pre-check. A vague one-liner needs expansion; an already structured prompt must
 * come back untouched rather than paraphrased into different words.
 */
export function decideEnhancement(raw: string): EnhanceDecision {
  const text = normalizeRaw(raw);
  const present = new Set<EnhanceDimension>();
  if (ACTION_VERBS.test(text) || ENGLISH_ACTION_VERBS.test(text)) present.add("goal");
  if (SCOPE_HINT.test(text) || ENGLISH_SCOPE_HINT.test(text)) present.add("scope");
  if (CONSTRAINT_HINT.test(text) || ENGLISH_CONSTRAINT_HINT.test(text)) present.add("constraints");
  if (ACCEPTANCE_HINT.test(text) || ENGLISH_ACCEPTANCE_HINT.test(text)) present.add("acceptance");
  const missing = ENHANCE_DIMENSIONS.filter((dimension) => !present.has(dimension));
  // Four CJK characters already carry a full request ("加个缓存"), so the floor stays low.
  if (text.length < 4)
    return {
      enhance: false,
      present: [...present],
      missing,
      skip: "tooShort",
    };
  if (present.has("goal") && missing.length <= 1)
    return {
      enhance: false,
      present: [...present],
      missing,
      skip: missing.length ? "missingDimensions" : "alreadyStructured",
    };
  // The rewrite is capped well below this, so enhancing a prompt this long could only return
  // something shorter than what the user already wrote. That is a deletion, not an enhancement.
  if (text.length > MAX_ENHANCED_CHARS)
    return {
      enhance: false,
      present: [...present],
      missing,
      skip: "tooLong",
    };
  return {
    enhance: true,
    present: [...present],
    missing,
  };
}
