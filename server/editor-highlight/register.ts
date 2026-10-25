import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  applyHighlight,
  readHighlight,
  restoreHighlight,
  editorHighlightSettings,
} from "../../shared/editor-highlight/contracts";
import { createHighlightService } from "./service";

export function registerEditorHighlight(server: PluginServerContext) {
  const settings = server.registerSettings(editorHighlightSettings);
  const service = createHighlightService();
  const startup = settings
    .read()
    .then((state) => {
      if (state.status !== "ready") throw new Error("编辑器高亮设置不可用。");
      if (state.values.automatic) service.apply();
    })
    .catch((error: unknown) => {
      console.error("[Toolkit] Editor highlight startup failed", error);
    });
  server.handle(readHighlight, async () => {
    await startup;
    return service.read();
  });
  server.handle(applyHighlight, async () => {
    await startup;
    return service.apply();
  });
  server.handle(restoreHighlight, async () => {
    await startup;
    return service.restore();
  });
  return () => startup;
}
