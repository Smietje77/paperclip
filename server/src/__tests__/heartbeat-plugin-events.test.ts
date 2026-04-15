import { describe, expect, it } from "vitest";
import { PLUGIN_EVENT_TYPES } from "@paperclipai/shared";
import { mapRunStatusToPluginEvent } from "../services/heartbeat.ts";

describe("mapRunStatusToPluginEvent", () => {
  it("maps success to agent.run.finished", () => {
    expect(mapRunStatusToPluginEvent("success")).toBe("agent.run.finished");
  });

  it("maps failed to agent.run.failed", () => {
    expect(mapRunStatusToPluginEvent("failed")).toBe("agent.run.failed");
  });

  it("maps error to agent.run.failed", () => {
    expect(mapRunStatusToPluginEvent("error")).toBe("agent.run.failed");
  });

  it("maps cancelled to agent.run.cancelled", () => {
    expect(mapRunStatusToPluginEvent("cancelled")).toBe("agent.run.cancelled");
  });

  it("returns null for non-terminal statuses", () => {
    expect(mapRunStatusToPluginEvent("queued")).toBeNull();
    expect(mapRunStatusToPluginEvent("running")).toBeNull();
  });

  it("returns null for unknown statuses", () => {
    expect(mapRunStatusToPluginEvent("weird")).toBeNull();
    expect(mapRunStatusToPluginEvent("")).toBeNull();
  });

  it("only ever produces event types declared in PLUGIN_EVENT_TYPES", () => {
    const produced = ["success", "failed", "error", "cancelled"]
      .map(mapRunStatusToPluginEvent)
      .filter((value): value is string => value !== null);
    for (const eventType of produced) {
      expect(PLUGIN_EVENT_TYPES).toContain(eventType);
    }
  });
});
