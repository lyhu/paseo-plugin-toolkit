import { View } from "react-native";
import { PaseoListSection } from "../list";
import {
  PaseoFields,
  PaseoHero,
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

function WorkspaceSummary({
  result,
  palette,
  styles,
}: {
  result: JsonRecord | null;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <OutputFields
      result={result}
      fields={[
        ["workspaceId", "Workspace"],
        ["projectId", "Project"],
        ["cwd", "Working directory"],
        ["isolation", "Isolation"],
        ["kind", "Kind"],
        ["title", "Title"],
      ]}
      palette={palette}
      styles={styles}
    />
  );
}

export function WorkspaceTool({ leaf, input, result, palette, styles }: PaseoRenderProps) {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(result);
  switch (leaf) {
    case "create_workspace":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="FolderPlus"
            title={fieldString(inputRecord, "title") ?? "New workspace"}
            subtitle={fieldString(inputRecord, "isolation")}
            color={palette.categoryColors.file}
            styles={styles}
          />
          <Section title="Configuration" styles={styles}>
            <PaseoFields
              fields={[
                ["Isolation", inputRecord?.isolation],
                ["Path", inputRecord?.path],
                ["Project", inputRecord?.projectId],
                ["Mode", inputRecord?.mode],
                ["Worktree", inputRecord?.worktreeSlug],
                ["Branch", inputRecord?.branchName ?? inputRecord?.branch],
                ["Base branch", inputRecord?.baseBranch],
                ["Change request", inputRecord?.prNumber],
                ["Forge", inputRecord?.forge],
              ]}
              palette={palette}
              styles={styles}
            />
          </Section>
          <WorkspaceSummary result={outputRecord} palette={palette} styles={styles} />
        </View>
      );
    case "list_workspaces":
      return (
        <WorkspaceList
          workspaces={fieldArray(outputRecord, "workspaces")}
          palette={palette}
          styles={styles}
        />
      );
    case "archive_workspace":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="Archive"
            title={fieldString(inputRecord, "workspaceId") ?? "Workspace"}
            color={palette.categoryColors.file}
            styles={styles}
          />
          <ActionResult
            result={outputRecord}
            fields={[
              ["workspaceId", "Workspace"],
              ["archivedAgentIds", "Archived agents"],
              ["removedDirectory", "Removed directory"],
            ]}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "rename_workspace":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Workspace", inputRecord?.workspaceId],
              ["New title", inputRecord?.title],
            ]}
            palette={palette}
            styles={styles}
          />
          <ActionResult
            result={outputRecord}
            fields={[
              ["workspaceId", "Workspace"],
              ["title", "Title"],
            ]}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    default:
      return <FallbackPaseo input={input} result={result} palette={palette} styles={styles} />;
  }
}

function WorkspaceList({
  workspaces,
  palette,
  styles,
}: {
  workspaces: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Workspaces (${workspaces.length})`}
      empty="No workspaces returned."
      styles={styles}
      rows={workspaces.map((workspace) => {
        const record = asRecord(workspace);
        const isolation = fieldString(record, "isolation");
        return {
          key: stableItemKey(workspace, "workspace"),
          title: fieldString(record, "title") ?? fieldString(record, "workspaceId") ?? "Workspace",
          badge: isolation ? (
            <StatusPill value={isolation} palette={palette} styles={styles} />
          ) : null,
          lines: [fieldString(record, "cwd"), fieldString(record, "workspaceId")],
        };
      })}
    />
  );
}
