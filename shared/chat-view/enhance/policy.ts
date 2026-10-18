import type { EnvironmentProfile, ProjectKind } from "./contract";

export interface EnhancePolicy {
  /** Environment-specific dimensions appended to the four required ones. */
  focus: string[];
  /** Acceptance guidance limited to commands the probe actually found. */
  acceptance: string;
  /** Environment-specific hard constraints passed through verbatim. */
  constraints: string[];
}

const KIND_FOCUS: Record<ProjectKind, readonly string[]> = {
  frontend: ["交互状态（空/加载/错误/边界）", "响应式断点", "可访问性", "视觉一致性"],
  backend: ["输入校验与错误码", "幂等性", "数据迁移与向后兼容", "并发与超时"],
  cli: ["命令与参数接口", "退出码", "--help 文案", "破坏性变更的确认提示"],
  library: ["公开 API 稳定性与导出面", "副作用边界", "可运行示例"],
  monorepo: ["明确目标包与路径", "跨包改动的影响面", "构建顺序与依赖约束"],
  docs: ["目标读者与阅读路径", "章节结构与锚点", "示例可执行性"],
  unknown: [],
};

const KIND_CONSTRAINTS: Record<ProjectKind, readonly string[]> = {
  frontend: ["沿用现有组件库与样式体系，不引入新的 UI 依赖"],
  backend: ["接口变更需保持向后兼容，或同时给出迁移方案"],
  cli: ["不得静默改变既有退出码与参数解析"],
  library: ["不得破坏已导出的公开签名"],
  monorepo: ["变更需限定到具体包，避免影响其他包的构建产物"],
  docs: [],
  unknown: [],
};

const COMMAND_ORDER = ["build", "typecheck", "lint", "test"] as const;

/** Read-only projection of the profile; the model receives evidence, not conclusions. */
export function derivePolicy(profile: EnvironmentProfile): EnhancePolicy {
  const focus = [...KIND_FOCUS[profile.projectKind]];
  const constraints = [...KIND_CONSTRAINTS[profile.projectKind], ...profile.constraints];
  const found = COMMAND_ORDER.filter((name) => profile.commands[name]).map(
    (name) => `${name}: \`${profile.commands[name]}\``,
  );
  return {
    focus,
    acceptance: found.length
      ? `验收只能引用这些已存在的命令：${found.join("、")}`
      : "仓库未发现标准验证命令，验收标准改写为可人工核对的现象",
    constraints,
  };
}
