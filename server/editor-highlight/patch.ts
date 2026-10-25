import { Script } from "node:vm";
import { payload } from "./payload.generated";

export const patchStart = "/* toolkit-editor-highlight:v1:start */";
export const patchEnd = "/* toolkit-editor-highlight:v1:end */";

// Match the old lookup's complete body, including variable relationships, rather
// than guessing offsets or module IDs that change on every Paseo build.
const lookupPattern =
  /function (?<lookup>[$\w]+)\((?<argument>[$\w]+)\)\{const (?<extension>[$\w]+)=\k<argument>\.split\(["']\.["']\)\.pop\(\)\?\.toLowerCase\(\);return \k<extension>\?(?<table>[$\w]+)\[\k<extension>\]\?\?null:null\}/g;

export function patchBundle(source: string): string {
  if (source.includes(patchStart) && source.includes(patchEnd)) return source;
  if (source.includes("toolkit-editor-highlight:"))
    throw new Error("检测到其他版本或不完整的高亮补丁，请先恢复备份。");
  const matches = [...source.matchAll(lookupPattern)];
  if (matches.length !== 1) throw new Error("此 Paseo 前端结构不兼容，未修改任何文件。");
  const match = matches[0];
  const { lookup, argument, extension, table } = match.groups!;
  const moduleStart = source.lastIndexOf("__d(", match.index);
  const module = source.slice(moduleStart, match.index);
  const exportsLookup = new RegExp(`\\.getLanguageForFile=${lookup.replaceAll("$", "\\$")}[,;]`);
  const codeMirror = /swift:([$\w]+)\.StreamLanguage\.define\(/.exec(module)?.[1];
  if (!exportsLookup.test(module) || !codeMirror || !module.includes(`Object.keys(${table})`))
    throw new Error("无法确认 Paseo 的高亮注册表，未修改任何文件。");
  const replacement = `${patchStart}
var __toolkitEditorHighlight=(function(){${payload}
return ToolkitEditorHighlight.createLanguages(${codeMirror}.StreamLanguage)})();
Object.assign(${table},__toolkitEditorHighlight.languages);
function ${lookup}(${argument}){
var extra=__toolkitEditorHighlight.lookup(${argument});if(extra)return extra;
const ${extension}=${argument}.replace(/^.*[\\\\/]/,"").split(".").pop()?.toLowerCase();
return ${extension}?${table}[${extension}]??null:null}
${patchEnd}`;
  const result =
    source.slice(0, match.index) + replacement + source.slice(match.index! + match[0].length);
  new Script(result, { filename: "paseo-highlight-patched.js" });
  return result;
}
