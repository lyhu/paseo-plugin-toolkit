import { Text, View } from "react-native";
import { PaseoListSection } from "../list";
import {
  PaseoFields,
  PaseoHero,
  PromptBlock,
  Section,
  StatusPill,
  asRecord,
  fieldArray,
  fieldString,
  stableItemKey,
} from "../shared";
import { OutputFields, ActionResult, FallbackPaseo } from "./parts";
import type { ActivityStyles } from "../../styles";
import type { ActivityPalette } from "../../../../../shared/chat-view/activity/palette";
import type { JsonRecord, PaseoRenderProps } from "./parts";

export function ScheduleTool({
  leaf,
  input,
  result,
  theme: _theme,
  palette,
  styles,
}: PaseoRenderProps) {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(result);
  const isMutation = [
    "delete_heartbeat",
    "pause_schedule",
    "resume_schedule",
    "delete_schedule",
  ].includes(leaf);
  if (isMutation) {
    return (
      <View style={styles.paseoStack}>
        <PaseoHero
          icon={leaf.startsWith("delete") ? "Trash2" : leaf === "pause_schedule" ? "Pause" : "Play"}
          title={fieldString(inputRecord, "id") ?? "Schedule"}
          color={palette.categoryColors.plan}
          styles={styles}
        />
        <ActionResult result={outputRecord} palette={palette} styles={styles} />
      </View>
    );
  }
  if (leaf === "list_schedules")
    return (
      <ScheduleList
        schedules={fieldArray(outputRecord, "schedules")}
        palette={palette}
        styles={styles}
      />
    );
  if (leaf === "schedule_logs")
    return (
      <ScheduleRuns runs={fieldArray(outputRecord, "runs")} palette={palette} styles={styles} />
    );
  if (leaf === "inspect_schedule" || leaf === "run_schedule_once")
    return (
      <View style={styles.paseoStack}>
        <ScheduleSummary schedule={outputRecord} palette={palette} styles={styles} />
        <ScheduleRuns runs={fieldArray(outputRecord, "runs")} palette={palette} styles={styles} />
      </View>
    );
  if (leaf === "create_schedule" || leaf === "create_heartbeat") {
    return (
      <View style={styles.paseoStack}>
        <PaseoHero
          icon={leaf === "create_heartbeat" ? "HeartPulse" : "CalendarClock"}
          title={
            fieldString(inputRecord, "name") ??
            (leaf === "create_heartbeat" ? "New heartbeat" : "New schedule")
          }
          subtitle={fieldString(inputRecord, "cron")}
          color={palette.categoryColors.plan}
          styles={styles}
        />
        <PromptBlock text={fieldString(inputRecord, "prompt")} styles={styles} />
        <Section title="Configuration" styles={styles}>
          <PaseoFields
            fields={[
              ["Cron", inputRecord?.cron],
              ["Timezone", inputRecord?.timezone],
              ["Provider", inputRecord?.provider],
              ["Working directory", inputRecord?.cwd],
              ["Isolation", inputRecord?.isolation],
              ["Maximum runs", inputRecord?.maxRuns],
              ["Expires in", inputRecord?.expiresIn],
            ]}
            palette={palette}
            styles={styles}
          />
        </Section>
        <ScheduleSummary schedule={outputRecord} palette={palette} styles={styles} />
      </View>
    );
  }
  if (leaf === "update_schedule")
    return (
      <View style={styles.paseoStack}>
        <PaseoFields
          fields={[
            ["Schedule", inputRecord?.id],
            ["Name", inputRecord?.name],
            ["Prompt", inputRecord?.prompt],
            ["Cron", inputRecord?.cron],
            ["Timezone", inputRecord?.timezone],
            ["Provider", inputRecord?.provider],
            ["Model", inputRecord?.model],
            ["Mode", inputRecord?.mode],
            ["Working directory", inputRecord?.cwd],
            ["Maximum runs", inputRecord?.maxRuns],
            ["Expires in", inputRecord?.expiresIn],
            ["Clear expiry", inputRecord?.clearExpires],
          ]}
          palette={palette}
          styles={styles}
        />
        <ScheduleSummary schedule={outputRecord} palette={palette} styles={styles} />
      </View>
    );
  return <FallbackPaseo input={input} result={result} palette={palette} styles={styles} />;
}

function ScheduleSummary({
  schedule,
  palette,
  styles,
}: {
  schedule: JsonRecord | null;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  if (!schedule) return <Text style={styles.empty}>No schedule returned.</Text>;
  const cadence = asRecord(schedule.cadence);
  const target = asRecord(schedule.target);
  const targetConfig = asRecord(target?.config);
  return (
    <View style={styles.paseoStack}>
      <OutputFields
        result={schedule}
        fields={[
          ["id", "ID"],
          ["name", "Name"],
          ["status", "Status"],
          ["nextRunAt", "Next run"],
          ["lastRunAt", "Last run"],
          ["expiresAt", "Expires"],
          ["maxRuns", "Maximum runs"],
        ]}
        palette={palette}
        styles={styles}
      />
      <PromptBlock text={fieldString(schedule, "prompt")} styles={styles} />
      <Section title="Cadence and target" styles={styles}>
        <PaseoFields
          fields={[
            ["Cadence", cadence],
            ["Target", target?.type],
            ["Agent", target?.agentId],
            ["Provider", targetConfig?.provider],
            ["Model", targetConfig?.model],
            ["Mode", targetConfig?.modeId],
            ["Working directory", targetConfig?.cwd],
            ["Isolation", targetConfig?.isolation],
          ]}
          palette={palette}
          styles={styles}
        />
      </Section>
      {fieldString(schedule, "status") ? (
        <StatusPill value={fieldString(schedule, "status")!} palette={palette} styles={styles} />
      ) : null}
    </View>
  );
}

function ScheduleList({
  schedules,
  palette,
  styles,
}: {
  schedules: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Schedules (${schedules.length})`}
      empty="No schedules returned."
      styles={styles}
      rows={schedules.map((schedule) => {
        const record = asRecord(schedule);
        const status = fieldString(record, "status");
        return {
          key: stableItemKey(schedule, "schedule"),
          title: fieldString(record, "name") ?? fieldString(record, "id") ?? "Schedule",
          badge: status ? <StatusPill value={status} palette={palette} styles={styles} /> : null,
          lines: [
            fieldString(asRecord(record?.cadence), "expression") ??
              fieldString(record, "nextRunAt"),
            fieldString(record, "prompt"),
          ],
        };
      })}
    />
  );
}

function ScheduleRuns({
  runs,
  palette,
  styles,
}: {
  runs: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Runs (${runs.length})`}
      empty="No schedule runs returned."
      styles={styles}
      rows={runs.map((run) => {
        const record = asRecord(run);
        const status = fieldString(record, "status");
        const error = fieldString(record, "error");
        return {
          key: stableItemKey(run, "run"),
          title: fieldString(record, "scheduledFor") ?? fieldString(record, "id") ?? "Run",
          badge: status ? <StatusPill value={status} palette={palette} styles={styles} /> : null,
          selectable: true,
          lines: [
            [fieldString(record, "agentId"), fieldString(record, "workspaceId")]
              .filter(Boolean)
              .join(" · "),
            fieldString(record, "output"),
            error ? { text: error, color: palette.statusColors.failed } : undefined,
          ],
        };
      })}
    />
  );
}
