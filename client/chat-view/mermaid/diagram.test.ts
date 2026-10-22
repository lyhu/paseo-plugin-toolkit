import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import * as layout from "../../../shared/chat-view/mermaid/layout";
import { Drawing, parseDiagram } from "./diagram";

vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1, create: (styles: unknown) => styles },
  Text: "span",
  View: "div",
}));
afterEach(() => vi.restoreAllMocks());
it("falls back to source before drawing diagrams beyond the work budget", () => {
  expect(parseDiagram("x".repeat(100001)).kind).toBe("unsupported");
  expect(
    parseDiagram("flowchart TD\n" + Array.from({ length: 1001 }, (_, i) => `N${i}`).join("\n"))
      .kind,
  ).toBe("unsupported");
  expect(
    parseDiagram(
      "sequenceDiagram\n" + Array.from({ length: 101 }, (_, i) => `participant P${i}`).join("\n"),
    ).kind,
  ).toBe("unsupported");
});
it("reuses the prepared sequence layout when drawing", () => {
  const sequence = vi.spyOn(layout, "layoutSequence");
  const parsed = parseDiagram("sequenceDiagram\nAlice->>Bob: hello");
  expect(parsed.kind).toBe("sequence");
  if (parsed.kind === "unsupported") throw new Error("expected drawing");
  renderToStaticMarkup(
    createElement(Drawing, {
      parsed,
      theme: { colors: { foreground: "black", foregroundMuted: "gray" } } as never,
    }),
  );
  expect(sequence).toHaveBeenCalledOnce();
});
