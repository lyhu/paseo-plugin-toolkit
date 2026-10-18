import { Text, View } from "react-native";
import { PaseoListSection } from "../list";
import { ChildAgentTimeline } from "../child-agent";
import {
  PaseoCodeBlock,
  PaseoFields,
  PaseoHero,
  PromptBlock,
  Section,
  StatusPill,
  asRecord,
  fieldArray,
  fieldString,
  humanizeKey,
  stableItemKey,
} from "../shared";
import { extractPaseoChildAgentId } from "../../../../../shared/chat-view/activity/child-agent";
import { OutputFields, ActionResult, ModeList, FallbackPaseo } from "./parts";
import type { ActivityStyles } from "../../styles";
import type { ActivityPalette } from "../../../../../shared/chat-view/activity/palette";
import type { JsonRecord, PaseoRenderProps } from "./parts";

function AgentSnapshot({
  snapshot,
  palette,
  styles,
}: {
  snapshot: JsonRecord | null;
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  if (!snapshot) return <Text style={styles.empty}>No agent snapshot returned.</Text>;
  const capabilities = asRecord(snapshot.capabilities);
  const modes = fieldArray(snapshot, "availableModes");
  const permissions = fieldArray(snapshot, "pendingPermissions");
  return (
    <View style={styles.paseoStack}>
      <PaseoFields
        fields={[
          ["Agent", snapshot.id],
          ["Title", snapshot.title],
          ["Provider", snapshot.provider],
          ["Model", snapshot.model],
          ["Status", snapshot.status],
          ["Working directory", snapshot.cwd],
          ["Workspace", snapshot.workspaceId],
          ["Mode", snapshot.currentModeId],
          ["Thinking", snapshot.effectiveThinkingOptionId ?? snapshot.thinkingOptionId],
          ["Attention", snapshot.attentionReason],
          ["Last error", snapshot.lastError],
        ]}
        palette={palette}
        styles={styles}
      />
      {typeof snapshot.status === "string" ? (
        <StatusPill value={snapshot.status} palette={palette} styles={styles} />
      ) : null}
      {capabilities ? (
        <Section title="Capabilities" styles={styles}>
          <View style={styles.paseoChips}>
            {Object.entries(capabilities)
              .filter(([, value]) => value === true)
              .map(([key]) => (
                <View key={key} style={styles.paseoChip}>
                  <Text style={styles.paseoChipText}>{humanizeKey(key)}</Text>
                </View>
              ))}
          </View>
        </Section>
      ) : null}
      {modes.length > 0 ? <ModeList modes={modes} palette={palette} styles={styles} /> : null}
      {permissions.length > 0 ? (
        <Section title={`Pending permissions (${permissions.length})`} styles={styles}>
          <PermissionList permissions={permissions} palette={palette} styles={styles} />
        </Section>
      ) : null}
    </View>
  );
}

function PermissionList({
  permissions,
  palette,
  styles,
}: {
  permissions: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      empty="No pending permissions."
      styles={styles}
      rows={permissions.map((permission) => {
        const record = asRecord(permission);
        const actions = fieldArray(record, "actions");
        const kind = fieldString(record, "kind");
        return {
          key: stableItemKey(permission, "permission"),
          title:
            fieldString(record, "title") ?? fieldString(record, "name") ?? "Permission request",
          badge: kind ? <StatusPill value={kind} palette={palette} styles={styles} /> : null,
          selectable: true,
          lines: [
            fieldString(record, "description"),
            actions.length > 0
              ? `Actions: ${actions
                  .map((action) => fieldString(asRecord(action), "label") ?? "Action")
                  .join(" · ")}`
              : undefined,
          ],
        };
      })}
    />
  );
}

export function AgentTool({ leaf, input, result, theme, palette, styles }: PaseoRenderProps) {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(result);
  switch (leaf) {
    case "create_agent": {
      const childAgentId = extractPaseoChildAgentId(outputRecord);
      const provider = fieldString(inputRecord, "provider");
      const settings = asRecord(inputRecord?.settings);
      const thinkingOptionId = fieldString(settings, "thinkingOptionId");
      const subtitle = [
        provider,
        thinkingOptionId ? `Thinking option ${thinkingOptionId}` : undefined,
        inputRecord?.background === true ? "Background" : undefined,
        inputRecord?.notifyOnFinish === true ? "Notify on finish" : undefined,
      ]
        .filter(Boolean)
        .join(" · ");
      const status = fieldString(outputRecord, "status");
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="Bot"
            title={fieldString(inputRecord, "title") ?? "New agent"}
            subtitle={subtitle}
            status={status}
            palette={palette}
            color={palette.categoryColors.agent}
            styles={styles}
          />
          <PromptBlock
            text={fieldString(inputRecord, "initialPrompt")}
            label=""
            compact
            styles={styles}
          />
          {childAgentId ? (
            <ChildAgentTimeline agentId={childAgentId} palette={palette} styles={styles} />
          ) : null}
        </View>
      );
    }
    case "send_agent_prompt":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="Send"
            title={fieldString(inputRecord, "agentId") ?? "Agent"}
            subtitle={fieldString(inputRecord, "sessionMode")}
            color={palette.categoryColors.agent}
            styles={styles}
          />
          <PromptBlock text={fieldString(inputRecord, "prompt")} styles={styles} />
          <Section title="Delivery" styles={styles}>
            <PaseoFields
              fields={[
                ["Background", inputRecord?.background],
                ["Notify on finish", inputRecord?.notifyOnFinish],
              ]}
              palette={palette}
              styles={styles}
            />
          </Section>
          <OutputFields
            result={outputRecord}
            fields={[
              ["status", "Status"],
              ["lastMessage", "Last message"],
              ["guidance", "Guidance"],
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
          {outputRecord?.permission ? (
            <Section title="Permission" styles={styles}>
              <PermissionList
                permissions={[outputRecord.permission]}
                palette={palette}
                styles={styles}
              />
            </Section>
          ) : null}
        </View>
      );
    case "get_agent_status":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="Activity"
            title={fieldString(inputRecord, "agentId") ?? "Agent status"}
            color={palette.categoryColors.agent}
            styles={styles}
          />
          <AgentSnapshot
            snapshot={asRecord(outputRecord?.snapshot) ?? outputRecord}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "list_agents":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Working directory", inputRecord?.cwd],
              ["Statuses", inputRecord?.statuses],
              ["Since (hours)", inputRecord?.sinceHours],
              ["Limit", inputRecord?.limit],
              ["Include archived", inputRecord?.includeArchived],
            ]}
            palette={palette}
            styles={styles}
          />
          <AgentList
            agents={fieldArray(outputRecord, "agents")}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "get_agent_activity":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Agent", inputRecord?.agentId],
              ["Limit", inputRecord?.limit],
              ["Mode", outputRecord?.currentModeId],
              ["Updates", outputRecord?.updateCount],
            ]}
            palette={palette}
            styles={styles}
          />
          {fieldString(outputRecord, "content") ? (
            <PaseoCodeBlock
              code={fieldString(outputRecord, "content")!}
              language="markdown"
              label="Activity"
              theme={theme}
              styles={styles}
            />
          ) : null}
        </View>
      );
    case "set_agent_mode":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon="SlidersHorizontal"
            title={fieldString(inputRecord, "modeId") ?? "Set mode"}
            subtitle={fieldString(inputRecord, "agentId")}
            color={palette.categoryColors.agent}
            styles={styles}
          />
          <ActionResult
            result={outputRecord}
            fields={[["newMode", "New mode"]]}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "update_agent":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Agent", inputRecord?.agentId],
              ["Name", inputRecord?.name],
              ["Labels", inputRecord?.labels],
              ["Settings", inputRecord?.settings],
            ]}
            palette={palette}
            styles={styles}
          />
          <ActionResult result={outputRecord} palette={palette} styles={styles} />
        </View>
      );
    case "cancel_agent":
    case "archive_agent":
    case "kill_agent":
      return (
        <View style={styles.paseoStack}>
          <PaseoHero
            icon={
              leaf === "cancel_agent" ? "CircleStop" : leaf === "kill_agent" ? "CircleX" : "Archive"
            }
            title={fieldString(inputRecord, "agentId") ?? "Agent"}
            color={palette.categoryColors.agent}
            styles={styles}
          />
          <ActionResult result={outputRecord} palette={palette} styles={styles} />
        </View>
      );
    case "list_pending_permissions":
      return (
        <View style={styles.paseoStack}>
          <PermissionList
            permissions={fieldArray(outputRecord, "permissions")}
            palette={palette}
            styles={styles}
          />
        </View>
      );
    case "respond_to_permission":
      return (
        <View style={styles.paseoStack}>
          <PaseoFields
            fields={[
              ["Agent", inputRecord?.agentId],
              ["Request", inputRecord?.requestId],
              ["Response", inputRecord?.response],
            ]}
            palette={palette}
            styles={styles}
          />
          <ActionResult result={outputRecord} palette={palette} styles={styles} />
        </View>
      );
    default:
      return <FallbackPaseo input={input} result={result} palette={palette} styles={styles} />;
  }
}

function AgentList({
  agents,
  palette,
  styles,
}: {
  agents: unknown[];
  palette: ActivityPalette;
  styles: ActivityStyles;
}) {
  return (
    <PaseoListSection
      title={`Agents (${agents.length})`}
      empty="No agents returned."
      styles={styles}
      rows={agents.map((agent) => {
        const record = asRecord(agent);
        const status = fieldString(record, "status");
        return {
          key: stableItemKey(agent, "agent"),
          title:
            fieldString(record, "title") ??
            fieldString(record, "shortId") ??
            fieldString(record, "id") ??
            "Agent",
          badge: status ? <StatusPill value={status} palette={palette} styles={styles} /> : null,
          lines: [
            [fieldString(record, "provider"), fieldString(record, "model")]
              .filter(Boolean)
              .join(" · "),
            fieldString(record, "cwd") ?? fieldString(record, "id"),
          ],
        };
      })}
    />
  );
}
