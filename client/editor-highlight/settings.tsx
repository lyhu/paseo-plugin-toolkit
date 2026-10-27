import { ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import {
  applyHighlight,
  readHighlight,
  restoreHighlight,
  editorHighlightSettings,
} from "../../shared/editor-highlight/contracts";
import { Button, Label, Row, Surface } from "../quick-questions/ui";
import { tr, useLocale } from "../i18n";

const statusLabels = {
  unsupported: "当前 Host 不是 macOS，无法修改本机 Paseo 应用。",
  missing: "当前 Host 未找到 /Applications/Paseo.app。",
  ready: "检测到 Paseo，可应用编辑器高亮。",
  applied: "高亮补丁已应用。请重新加载 Paseo 界面后打开文件。",
  restored: "已恢复原始前端文件。请重新加载 Paseo 界面。",
  error: "高亮补丁操作失败，详情如下。",
};

export function EditorHighlightSettings(props: PluginSurfaceProps) {
  useLocale();
  const settings = useSettings(editorHighlightSettings);
  const read = useRpc(readHighlight);
  const apply = useRpc(applyHighlight);
  const restore = useRpc(restoreHighlight);
  const cache = useQueryClient();
  const queryKey = ["toolkit", "editor-highlight", props.host.id];
  const query = useQuery({ queryKey, queryFn: () => read({}) });
  const mutation = useMutation({
    mutationFn: (action: "apply" | "restore") => (action === "apply" ? apply({}) : restore({})),
    onSuccess: (state) => cache.setQueryData(queryKey, state),
  });
  const state = query.data;
  const unavailable = state?.status === "unsupported" || state?.status === "missing";
  const busy = mutation.isPending || query.isFetching;
  return (
    <ScrollView>
      <Surface theme={props.theme} compact={props.layout.compact}>
        <Label strong>{tr("编辑器高亮")}</Label>
        <Label>
          {tr("补充 .env、INI、TOML、Shell、SQL、Dockerfile 和 .gitignore 的语法高亮。")}
        </Label>
        <Label muted>
          {tr("作用于当前 Host 的 /Applications/Paseo.app；远程 Host 无法修改你电脑上的应用。")}
        </Label>
        <Label muted>
          {tr(
            "此功能会修改应用签名覆盖的前端资源，使原签名校验失败；不重新签名，也不重启 daemon。",
          )}
        </Label>
        {settings.status === "ready" ? (
          <SettingsSection title={tr("自动修补")}>
            <SettingsCard>
              <SettingsSwitch
                label={tr("加载 Toolkit 时自动检测并应用")}
                hint={tr("升级 Paseo 后重新加载 Toolkit，可重新应用；不兼容的版本会停止修改。")}
                value={settings.values.automatic}
                disabled={settings.saving}
                onValueChange={(automatic) => {
                  void settings.save({ automatic }, settings.revision);
                }}
              />
            </SettingsCard>
          </SettingsSection>
        ) : (
          <Label error={settings.status !== "loading"}>
            {tr(settings.status === "loading" ? "正在读取设置…" : settings.error)}
          </Label>
        )}
        {settings.status !== "ready" && settings.status !== "loading" ? (
          <Button
            onPress={() => {
              void settings.reload();
            }}
          >
            {tr("重试")}
          </Button>
        ) : null}
        {settings.status === "ready" && settings.saveError ? (
          <Label error>{tr(settings.saveError)}</Label>
        ) : null}
        {query.isPending ? <Label>{tr("正在检测高亮补丁…")}</Label> : null}
        {query.isError ? <Label error>{tr(query.error.message)}</Label> : null}
        {state ? (
          <>
            <Label error={state.status === "error"}>{tr(statusLabels[state.status])}</Label>
            {state.version ? (
              <Label muted>{tr("Paseo 版本：{0}", { "0": state.version })}</Label>
            ) : null}
            <Label muted>{tr("检测时间：{0}", { "0": state.checkedAt })}</Label>
            {state.error ? <Label error>{tr(state.error)}</Label> : null}
            {state.backupPath ? (
              <Label muted>{tr("备份：{0}", { "0": state.backupPath })}</Label>
            ) : null}
          </>
        ) : null}
        {mutation.isError ? <Label error>{tr(mutation.error.message)}</Label> : null}
        <Row>
          <Button
            disabled={busy}
            onPress={() => {
              mutation.reset();
              void query.refetch();
            }}
          >
            {tr("重新检测")}
          </Button>
          <Button
            primary
            disabled={busy || !state || unavailable}
            onPress={() => mutation.mutate("apply")}
          >
            {tr(
              mutation.isPending && mutation.variables === "apply"
                ? "正在应用高亮…"
                : "立即应用高亮",
            )}
          </Button>
          <Button disabled={busy || !state?.backupPath} onPress={() => mutation.mutate("restore")}>
            {tr(
              mutation.isPending && mutation.variables === "restore"
                ? "正在恢复备份…"
                : "恢复高亮备份",
            )}
          </Button>
        </Row>
        <Label muted>
          {tr("恢复后如需保留原始文件，请先关闭自动修补；仅恢复与当前文件完全匹配的备份。")}
        </Label>
        <Label muted>
          {tr(
            "应用补丁后需要重新加载整个 Paseo 界面，仅关闭再打开文件标签不会生效。请先保存未保存的文件。",
          )}
        </Label>
      </Surface>
    </ScrollView>
  );
}
