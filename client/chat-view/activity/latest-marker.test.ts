import { describe, expect, it } from "vitest";
import { createLatestMarker } from "./latest-marker";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("latest activity marker", () => {
  it("keeps the newest timestamp per agent and ignores older writes", () => {
    const marker = createLatestMarker();
    marker.mark("agent-1", 200);
    marker.mark("agent-1", 100);
    marker.mark("agent-2", 50);

    expect(marker.snapshot("agent-1")).toBe(200);
    expect(marker.snapshot("agent-2")).toBe(50);
    expect(marker.snapshot("unknown")).toBe(0);
  });

  it("wakes subscribers once for every burst of markers", async () => {
    const marker = createLatestMarker();
    let notifications = 0;
    const unsubscribe = marker.subscribe(() => {
      notifications += 1;
    });

    marker.mark("agent-1", 1);
    marker.mark("agent-1", 2);
    marker.mark("agent-1", 3);
    expect(notifications).toBe(0);
    await flush();
    expect(notifications).toBe(1);

    marker.mark("agent-1", 1);
    await flush();
    expect(notifications).toBe(1);

    unsubscribe();
    marker.mark("agent-1", 4);
    await flush();
    expect(notifications).toBe(1);
  });
});
