import { View } from "react-native";
import { PaseoListSection } from "../list";
import {
  PaseoFields,
  PaseoHero,
  StatusPill,
  asRecord,
  fieldArray,
  fieldBoolean,
  fieldString,
  scalarText,
  stableItemKey,
} from "../shared";
import { ModeList, FallbackPaseo } from "./parts";
import type { ActivityStyles } from "../../styles";
import type { ActivityPalette } from "../../../../../shared/chat-view/activity/palette";
import type { PaseoRenderProps } from "./parts";

export function ProviderTool({ leaf, input, result, palette, styles }: PaseoRenderProps) {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(result);
  if (leaf === "list_providers")
    return (
      <ProviderList
        providers={fieldArray(outputRecord, "providers")}
        palette={palette}
        styles={styles}
      />
    );
  if (leaf === "list_models")
    return (
      <View style={styles.paseoStack}>
        <PaseoHero
          icon="Cpu"
          title={
            fieldString(outputRecord, "provider") ??
            fieldString(inputRecord, "provider") ??
            "Models"
          }
          color={palette.categoryColors.agent}
          styles={styles}
        />
        <ModelList models={fieldArray(outputRecord, "models")} palette={palette} styles={styles} />
      </View>
    );
  if (leaf === "list_profiles")
    return (
      <ProfileList
        profiles={fieldArray(outputRecord, "profiles")}
        palette={palette}
        styles={styles}
      />
    );
  if (leaf === "inspect_provider")
    return (
      <View style={styles.paseoStack}>
        <PaseoHero
          icon="ScanSearch"
          title={
            fieldString(outputRecord, "label") ??
            fieldString(outputRecord, "provider") ??
            fieldString(inputRecord, "provider") ??
            "Provider"
          }
          subtitle={fieldString(outputRecord, "description")}
          color={palette.categoryColors.agent}
          styles={styles}
        />
        <PaseoFields
          fields={[
            ["Provider", outputRecord?.provider ?? inputRecord?.provider],
            ["Status", outputRecord?.status],
            ["Enabled", outputRecord?.enabled],
            ["Selected model", outputRecord?.selectedModel],
          ]}
          palette={palette}
          styles={styles}
        />
        {fieldString(outputRecord, "status") ? (
          <StatusPill
            value={fieldString(outputRecord, "status")!}
            palette={palette}
            styles={styles}
          />
        ) : null}
        <ModeList modes={fieldArray(outputRecord, "modes")} palette={palette} styles={styles} />
        <FeatureList
          features={fieldArray(outputRecord, "features")}
          palette={palette}
          styles={styles}
        />
      </View>
    );
  return <FallbackPaseo input={input} result={result} palette={palette} styles={styles} />;
}

function ProviderList({
  providers,
  palette,
  styles,
}: {
  providers: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Providers (${providers.length})`}
      empty="No providers returned."
      styles={styles}
      rows={providers.map((provider) => {
        const record = asRecord(provider);
        const status = fieldString(record, "status");
        return {
          key: stableItemKey(provider, "provider"),
          title: fieldString(record, "label") ?? fieldString(record, "id") ?? "Provider",
          badge: status ? <StatusPill value={status} palette={palette} styles={styles} /> : null,
          lines: [fieldString(record, "description"), fieldString(record, "id")],
        };
      })}
    />
  );
}

function ModelList({
  models,
  palette,
  styles,
}: {
  models: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Models (${models.length})`}
      empty="No models returned."
      styles={styles}
      rows={models.map((model) => {
        const record = asRecord(model);
        return {
          key: stableItemKey(model, "model"),
          title: fieldString(record, "label") ?? fieldString(record, "id") ?? "Model",
          badge: fieldBoolean(record, "isDefault") ? (
            <StatusPill value="Default" palette={palette} styles={styles} />
          ) : null,
          lines: [fieldString(record, "id"), fieldString(record, "description")],
        };
      })}
    />
  );
}

function ProfileList({
  profiles,
  palette,
  styles,
}: {
  profiles: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Profiles (${profiles.length})`}
      empty="No profiles returned."
      styles={styles}
      rows={profiles.map((profile) => {
        const record = asRecord(profile);
        return {
          key: stableItemKey(profile, "profile"),
          title: fieldString(record, "name") ?? fieldString(record, "id") ?? "Profile",
          body: (
            <PaseoFields
              fields={[
                ["Provider", record?.provider],
                ["Model", record?.model],
                ["Mode", record?.modeId],
                ["Thinking", record?.thinkingOptionId],
              ]}
              palette={palette}
              styles={styles}
            />
          ),
          selectable: true,
          lines: [fieldString(record, "notes")],
        };
      })}
    />
  );
}

function FeatureList({
  features,
  palette,
  styles,
}: {
  features: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Features (${features.length})`}
      styles={styles}
      rows={features.map((feature) => {
        const record = asRecord(feature);
        return {
          key: stableItemKey(feature, "feature"),
          title: fieldString(record, "label") ?? fieldString(record, "id") ?? "Feature",
          badge:
            record?.value === undefined ? null : (
              <StatusPill value={scalarText(record.value)} palette={palette} styles={styles} />
            ),
          lines: [fieldString(record, "description")],
        };
      })}
    />
  );
}
