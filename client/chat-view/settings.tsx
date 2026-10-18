import { useEffect, useMemo } from "react";
import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import {
  resolveLocale,
  t,
  type LocalePreference,
  type TranslationKey,
} from "../../shared/chat-view/i18n";
import { useLocale } from "./locale";
import {
  activitySettings,
  paletteModeSchema,
  displayModeSchema,
  languageModeSchema,
  type ChatViewSettings,
} from "../../shared/chat-view/settings";

type ReadySettings = Extract<SettingsState<typeof activitySettings.schema>, { status: "ready" }>;

/** Option values belong to the settings schema; only their labels are translated. */
const displayModeChoices: readonly {
  value: ChatViewSettings["displayMode"];
  labelKey: TranslationKey;
}[] = [
  { value: "folded", labelKey: "settings.displayModeFolded" },
  { value: "detailed", labelKey: "settings.displayModeDetailed" },
];

const displayModeDescriptions: Record<ChatViewSettings["displayMode"], TranslationKey> = {
  folded: "settings.displayModeFoldedDesc",
  detailed: "settings.displayModeDetailedDesc",
};

const paletteChoices: readonly { value: ChatViewSettings["palette"]; labelKey: TranslationKey }[] =
  [
    { value: "vivid", labelKey: "settings.paletteVivid" },
    { value: "soft", labelKey: "settings.paletteSoft" },
    { value: "high_contrast", labelKey: "settings.paletteHighContrast" },
  ];

const paletteDescriptions: Record<ChatViewSettings["palette"], TranslationKey> = {
  vivid: "settings.paletteVividDesc",
  soft: "settings.paletteSoftDesc",
  high_contrast: "settings.paletteHighContrastDesc",
};

const languageChoices: readonly { value: LocalePreference; labelKey: TranslationKey }[] = [
  { value: "auto", labelKey: "settings.langAuto" },
  { value: "zh-CN", labelKey: "settings.langZh" },
  { value: "en-US", labelKey: "settings.langEn" },
];

function ReadyControls({
  settings,
  theme,
  onOpenModels,
}: {
  onOpenModels(): void;
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const descriptionStyle = useMemo(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }),
    [theme.colors.foregroundMuted],
  );
  const errorStyle = useMemo(
    () => ({ color: theme.colors.statusDanger, fontSize: 13, lineHeight: 18 }),
    [theme.colors.statusDanger],
  );
  const changeDisplayMode = (value: string) => {
    const parsed = displayModeSchema.safeParse(value);
    if (!parsed.success) return;
    void settings.save({ ...settings.values, displayMode: parsed.data }, settings.revision);
  };
  const changePalette = (value: string) => {
    const parsed = paletteModeSchema.safeParse(value);
    if (!parsed.success) return;
    void settings.save({ ...settings.values, palette: parsed.data }, settings.revision);
  };
  const locale = resolveLocale(settings.values.language);
  function labels<Value extends string>(
    choices: readonly { value: Value; labelKey: TranslationKey }[],
  ) {
    return choices.map((choice) => ({ value: choice.value, label: t(locale, choice.labelKey) }));
  }
  return (
    <>
      <SettingsSection title={t(locale, "settings.sectionFeatures")}>
        <SettingsCard>
          <SettingsSwitch
            label={t(locale, "settings.quickQuestionsLabel")}
            hint={t(locale, "settings.quickQuestionsHint")}
            value={settings.values.quickQuestionsEnabled}
            disabled={settings.saving}
            onValueChange={(quickQuestionsEnabled) => {
              void settings.save({ ...settings.values, quickQuestionsEnabled }, settings.revision);
            }}
          />
          <SettingsSwitch
            label={t(locale, "settings.mermaidLabel")}
            hint={t(locale, "settings.mermaidHint")}
            value={settings.values.mermaidEnabled}
            disabled={settings.saving}
            onValueChange={(mermaidEnabled) => {
              void settings.save({ ...settings.values, mermaidEnabled }, settings.revision);
            }}
          />
          <SettingsSwitch
            label={t(locale, "settings.compactActivityLabel")}
            hint={t(locale, "settings.compactActivityHint")}
            value={settings.values.compactActivityEnabled}
            disabled={settings.saving}
            onValueChange={(compactActivityEnabled) => {
              void settings.save({ ...settings.values, compactActivityEnabled }, settings.revision);
            }}
          />
          <SettingsSwitch
            label={t(locale, "settings.stickyLabel")}
            hint={t(locale, "settings.stickyHint")}
            value={settings.values.stickyEnabled}
            disabled={settings.saving}
            onValueChange={(stickyEnabled) => {
              void settings.save({ ...settings.values, stickyEnabled }, settings.revision);
            }}
          />
          <SettingsSwitch
            label={t(locale, "settings.readonlyLabel")}
            hint={t(locale, "settings.readonlyHint")}
            value={settings.values.readonlyMessagesEnabled}
            disabled={settings.saving}
            onValueChange={(readonlyMessagesEnabled) => {
              void settings.save(
                { ...settings.values, readonlyMessagesEnabled },
                settings.revision,
              );
            }}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t(locale, "settings.sectionCompact")}>
        <SettingsCard>
          <SettingsSelect
            label={t(locale, "settings.displayModeLabel")}
            hint={t(locale, displayModeDescriptions[settings.values.displayMode])}
            value={settings.values.displayMode}
            options={labels(displayModeChoices)}
            disabled={settings.saving || !settings.values.compactActivityEnabled}
            onValueChange={changeDisplayMode}
          />
          <SettingsSelect
            label={t(locale, "settings.paletteLabel")}
            hint={t(locale, paletteDescriptions[settings.values.palette])}
            value={settings.values.palette}
            options={labels(paletteChoices)}
            disabled={settings.saving || !settings.values.compactActivityEnabled}
            onValueChange={changePalette}
          />
        </SettingsCard>
        <SettingsRow label={t(locale, "settings.behaviorLabel")}>
          <Text style={descriptionStyle}>{t(locale, "settings.behaviorDesc")}</Text>
        </SettingsRow>
        {settings.saveError ? (
          <Text accessibilityRole="alert" style={errorStyle}>
            {settings.saveError}
          </Text>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t(locale, "settings.sectionLanguage")}>
        <SettingsCard>
          <SettingsSelect
            label={t(locale, "settings.languageLabel")}
            hint={t(locale, "settings.languageHint")}
            value={settings.values.language}
            options={labels(languageChoices)}
            disabled={settings.saving}
            onValueChange={(value) => {
              const parsed = languageModeSchema.safeParse(value);
              if (!parsed.success) return;
              void settings.save({ ...settings.values, language: parsed.data }, settings.revision);
            }}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t(locale, "settings.sectionEnhance")}>
        <SettingsCard>
          <SettingsSwitch
            label={t(locale, "settings.enhanceEnableLabel")}
            hint={t(locale, "settings.enhanceEnableHint")}
            value={settings.values.enhanceEnabled}
            disabled={settings.saving}
            onValueChange={(enhanceEnabled) => {
              void settings.save({ ...settings.values, enhanceEnabled }, settings.revision);
            }}
          />
        </SettingsCard>
        <SettingsAction
          label={t(locale, "settings.sharedModels")}
          hint={t(locale, "settings.sharedModelsHint")}
          actionLabel={t(locale, "settings.sharedModels")}
          onPress={onOpenModels}
        />
        <SettingsRow label={t(locale, "settings.enhanceNoteLabel")}>
          <Text style={descriptionStyle}>{t(locale, "settings.enhanceNoteDesc")}</Text>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

export function ActivitySettings({
  theme,
  onSettingsChange,
  onOpenModels,
}: PluginSurfaceProps & {
  onSettingsChange: (values: ChatViewSettings) => void;
  onOpenModels(): void;
}) {
  const settings = useSettings(activitySettings);
  const values = settings.status === "ready" ? settings.values : undefined;
  useEffect(() => {
    if (values) onSettingsChange(values);
  }, [values, onSettingsChange]);
  const textStyle = useMemo(() => ({ color: theme.colors.foreground }), [theme.colors.foreground]);
  // The shells render before settings are known, so they follow the running language.
  const locale = useLocale();
  if (settings.status === "loading")
    return <Text style={textStyle}>{t(locale, "settings.loading")}</Text>;
  if (settings.status === "error") {
    return (
      <SettingsSection title={t(locale, "settings.title")}>
        <Text style={textStyle}>{settings.error}</Text>
        <SettingsAction
          label={t(locale, "settings.title")}
          actionLabel={t(locale, "settings.reload")}
          onPress={settings.reload}
        />
      </SettingsSection>
    );
  }
  if (settings.status === "invalid") {
    return (
      <SettingsSection title={t(locale, "settings.title")}>
        <Text style={textStyle}>{settings.error}</Text>
        <SettingsAction
          label={t(locale, "settings.storedSettings")}
          actionLabel={t(locale, "settings.reset")}
          onPress={settings.reset}
        />
        <SettingsAction
          label={t(locale, "settings.storedSettings")}
          actionLabel={t(locale, "settings.reload")}
          onPress={settings.reload}
        />
      </SettingsSection>
    );
  }
  return <ReadyControls settings={settings} theme={theme} onOpenModels={onOpenModels} />;
}
