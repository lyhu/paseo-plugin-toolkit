import { useState } from "react";
import { ScrollView } from "react-native";
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { sessionTitleSettings } from "../../shared/session-title/contracts";
import { Button, Field, Label, Surface } from "../quick-questions/ui";
import { tr, useLocale } from "../i18n";

export function SessionTitleSettings(props: PluginSurfaceProps) {
  useLocale();
  const settings = useSettings(sessionTitleSettings);
  return (
    <ScrollView>
      <Surface theme={props.theme} compact={props.layout.compact}>
        <Label strong>{tr("会话智能命名")}</Label>
        {settings.status !== "ready" ? (
          <>
            <Label error={settings.status !== "loading"}>
              {settings.status === "loading" ? tr("正在读取设置…") : tr(settings.error)}
            </Label>
            <Button
              onPress={() => {
                void settings.reload();
              }}
            >
              {tr("重试")}
            </Button>
            {settings.status === "invalid" ? (
              <Button
                onPress={() => {
                  void settings.reset();
                }}
              >
                {tr("重置设置")}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <SettingsSection title={tr("自动命名")}>
              <SettingsCard>
                <SettingsSwitch
                  label={tr("前几轮自动维护业务标题")}
                  hint={tr("仅对能够确认轮次的新会话生效；人工改名后停止覆盖。")}
                  value={settings.values.enabled}
                  disabled={settings.saving}
                  onValueChange={(enabled) => {
                    void settings.save({ ...settings.values, enabled }, settings.revision);
                  }}
                />
              </SettingsCard>
            </SettingsSection>
            <NumberSetting
              key={`rounds:${settings.revision}`}
              label={tr("自动判断轮数（1–20）")}
              value={settings.values.rounds}
              max={20}
              disabled={settings.saving}
              save={(rounds) => settings.save({ ...settings.values, rounds }, settings.revision)}
            />
            <NumberSetting
              key={`length:${settings.revision}`}
              label={tr("标题最多字符数（1–100）")}
              value={settings.values.maxLength}
              max={100}
              disabled={settings.saving}
              save={(maxLength) =>
                settings.save({ ...settings.values, maxLength }, settings.revision)
              }
            />
            {settings.saveError ? <Label error>{tr(settings.saveError)}</Label> : null}
          </>
        )}
        <Label muted>{tr("复用 Toolkit 模型：工作区覆盖优先，否则使用此 Host 默认模型。")}</Label>
        <Label muted>
          {tr("会话文本将发送至 Toolkit 配置的模型服务；不包含工具原始输出和思考过程。")}
        </Label>
        <Label>
          {tr(
            "使用 /session-title 后台命名，或点击「总结归档」立即归档、后台命名；右侧「智能命名」可查看记录。",
          )}
        </Label>
        <Label muted>
          {tr("如需收尾，先审阅此总结，再执行 /clear。当前 Paseo 不支持插件在 /clear 前拦截。")}
        </Label>
      </Surface>
    </ScrollView>
  );
}
function NumberSetting({
  label,
  value,
  max,
  disabled,
  save,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  save(value: number): Promise<boolean>;
}) {
  const [text, setText] = useState(String(value));
  const valid = /^\d+$/.test(text) && Number(text) >= 1 && Number(text) <= max;
  return (
    <>
      <Label>{label}</Label>
      <Field value={text} onChangeText={setText} placeholder={label} disabled={disabled} />
      {!valid ? <Label error>{tr("请输入范围内的正整数。")}</Label> : null}
      <Button
        disabled={disabled || !valid || Number(text) === value}
        onPress={() => {
          void save(Number(text));
        }}
      >
        {tr("保存")}
      </Button>
    </>
  );
}
