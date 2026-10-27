import type { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { standardSQL } from "@codemirror/legacy-modes/mode/sql";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";

// The factory receives the installed app's CodeMirror instance. Bundling a second copy
// would create incompatible language facets in its editor.
export function createLanguages(streamLanguage: typeof StreamLanguage) {
  const shellLanguage = streamLanguage.define(shell);
  const languages = {
    env: shellLanguage,
    sh: shellLanguage,
    bash: shellLanguage,
    zsh: shellLanguage,
    ini: streamLanguage.define(properties),
    toml: streamLanguage.define(toml),
    sql: streamLanguage.define(standardSQL),
    dockerfile: streamLanguage.define(dockerFile),
    gitignore: streamLanguage.define({
      name: "gitignore",
      token(stream) {
        if (stream.sol() && stream.peek() === "#") {
          stream.skipToEnd();
          return "comment";
        }
        if (stream.sol() && stream.eat("!")) return "operator";
        if (stream.match(/^\\./)) return "escape";
        if (stream.match(/^[*?]+/)) return "operator";
        if (stream.match(/^\[(?:\\.|[^\]\\])+\]/)) return "regexp";
        if (stream.eat("/")) return "punctuation";
        stream.next();
        stream.eatWhile(/[^\\*?[/]/);
        return "string";
      },
      languageData: { commentTokens: { line: "#" } },
    }),
  };
  const shellFilenames = new Set([
    ".bashrc",
    ".bash_profile",
    ".bash_login",
    ".bash_logout",
    ".profile",
    ".zshrc",
    ".zshenv",
    ".zprofile",
    ".zlogin",
    ".zlogout",
  ]);
  return {
    languages,
    lookup(filename: string) {
      const basename = filename.replace(/^.*[\\/]/, "").toLowerCase();
      if (basename === ".gitignore") return languages.gitignore;
      if (basename === ".env" || basename.startsWith(".env.")) return shellLanguage;
      if (shellFilenames.has(basename)) return shellLanguage;
      if (basename === "dockerfile" || basename.startsWith("dockerfile."))
        return languages.dockerfile;
      return null;
    },
  };
}
