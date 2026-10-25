import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { skillInputSchema, type WorkbenchSkill } from "../../shared/workbench/ai";

const builtins = [
  {
    slug: "workbench-planning",
    name: "Workbench planning",
    description: "Turn a request into a reviewable creation plan.",
    content:
      "Read workbench context, clarify the target host and directory, then call prepare_creation. Only the user can confirm execution in Workbench. Never claim a resource exists before get_creation_result confirms completion.",
  },
  {
    slug: "workbench-memory",
    name: "Workbench memory",
    description: "Use personal context without silently rewriting it.",
    content:
      "Read personal memory through read_context when relevant. Suggest corrections to the user; do not overwrite personal memory without an explicit request.",
  },
  {
    slug: "workbench-review",
    name: "Workbench review",
    description: "Review the result of a Workbench creation request.",
    content:
      "Use get_creation_result to check the real operation status. Report partial completion and unknown outcomes accurately. Never retry an uncertain creation automatically.",
  },
];

function frontmatterText(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

export function createSkillStore(root: string) {
  const enabledRoot = join(root, ".agents", "skills");
  const disabledRoot = join(root, ".toolkit", "disabled-skills");
  function safe(path: string) {
    let current = path;
    while (current !== dirname(root)) {
      if (existsSync(current) && lstatSync(current).isSymbolicLink())
        throw new Error("技能目录不能是符号链接");
      if (current === root) break;
      current = dirname(current);
    }
  }
  function list(): WorkbenchSkill[] {
    return [
      [enabledRoot, true],
      [disabledRoot, false],
    ].flatMap(([base, enabled]) => {
      safe(String(base));
      if (!existsSync(String(base))) return [];
      return readdirSync(String(base)).flatMap((slug) => {
        if (!skillInputSchema.shape.slug.safeParse(slug).success) return [];
        const path = join(String(base), slug, "SKILL.md");
        safe(path);
        if (!existsSync(path)) return [];
        const source = readFileSync(path, "utf8");
        const match = /^---\nname: (.+)\ndescription: (.+)\n---\n([\s\S]*)$/.exec(source);
        const parsed = skillInputSchema.safeParse({
          slug,
          name: match ? frontmatterText(match[1]) : slug,
          description: match ? frontmatterText(match[2]) : "本地技能",
          content: match ? match[3].trim() : source,
        });
        return parsed.success
          ? [
              {
                ...parsed.data,
                enabled: Boolean(enabled),
                builtin: builtins.some((item) => item.slug === slug),
                path,
                loadStatus: "new-session-required" as const,
              },
            ]
          : [];
      });
    });
  }
  function save(input: unknown) {
    const skill = skillInputSchema.parse(input);
    const current = list().find((item) => item.slug === skill.slug);
    const path = current?.path ?? join(enabledRoot, skill.slug, "SKILL.md");
    safe(path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.content}\n`,
      { mode: 0o600 },
    );
  }
  return {
    list,
    save,
    initialize() {
      for (const skill of builtins)
        if (!list().some((item) => item.slug === skill.slug)) save(skill);
    },
    toggle(slug: string, enabled: boolean) {
      const skill = list().find((item) => item.slug === slug);
      if (!skill) throw new Error("找不到技能");
      if (skill.enabled === enabled) return;
      const destination = join(enabled ? enabledRoot : disabledRoot, slug);
      safe(destination);
      if (existsSync(destination)) throw new Error("目标技能目录已存在");
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      renameSync(dirname(skill.path), destination);
    },
  };
}
