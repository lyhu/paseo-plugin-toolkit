export type SettingsTabId =
  | "overview"
  | "chat"
  | "workbench"
  | "models"
  | "smart"
  | "system";

export type SettingsScope = "host" | "device" | "workspace" | "macos";

export interface SettingsTabMeta {
  id: SettingsTabId;
  labelKey: string;
  iconName: string;
  descriptionKey: string;
}
