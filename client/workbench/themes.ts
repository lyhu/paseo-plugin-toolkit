import type { PluginThemeContribution } from "@getpaseo/plugin";

export const workbenchThemes: PluginThemeContribution[] = [
  {
    id: "workbench-graphite",
    name: "工作台 · 石墨白",
    appearance: "light",
    colors: {
      background: "#f4f6fa",
      foreground: "#202a3a",
      raised: "#ffffff",
      control: "#eaeefd",
      border: "#dfe5ef",
      accent: "#5366d8",
      mutedForeground: "#67748a",
      ring: "#5366d8",
    },
  },
  {
    id: "workbench-midnight",
    name: "工作台 · 深空蓝",
    appearance: "dark",
    colors: {
      background: "#101622",
      foreground: "#e2e9f5",
      raised: "#1a2333",
      control: "#2b3856",
      border: "#344158",
      accent: "#9aacff",
      mutedForeground: "#a0afc5",
      ring: "#9aacff",
    },
  },
  {
    id: "workbench-forest",
    name: "工作台 · 松石绿",
    appearance: "light",
    colors: {
      background: "#f3f7f3",
      foreground: "#213d33",
      raised: "#ffffff",
      control: "#dfefe7",
      border: "#d7e3db",
      accent: "#287b67",
      mutedForeground: "#657e72",
      ring: "#287b67",
    },
  },
  {
    id: "workbench-sand",
    name: "工作台 · 暖砂金",
    appearance: "light",
    colors: {
      background: "#fbf8f2",
      foreground: "#44392c",
      raised: "#fffdf9",
      control: "#f0e5d3",
      border: "#e5dccc",
      accent: "#93682f",
      mutedForeground: "#817360",
      ring: "#93682f",
    },
  },
];
