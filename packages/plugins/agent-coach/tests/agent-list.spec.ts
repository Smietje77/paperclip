import { describe, expect, it, beforeEach } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Agent } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import { DATA_KEYS, registerDataHandlers, type AgentListEntry } from "../src/data-handlers.js";

function agent(partial: Partial<Agent> & { id: string; name: string; companyId: string }): Agent {
  return {
    urlKey: partial.id,
    role: "specialist",
    title: null,
    icon: null,
    status: "idle",
    reportsTo: null,
    capabilities: null,
    adapterType: "claude-local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    ...partial,
  } as Agent;
}

describe("agentListHandler", () => {
  let harness: TestHarness;
  const companyId = "company-1";

  beforeEach(() => {
    harness = createTestHarness({ manifest });
    registerDataHandlers(harness.ctx);
  });

  it("returns a sorted, projected list", async () => {
    harness.seed({
      agents: [
        agent({ id: "b", name: "Barry", companyId, role: "researcher" }),
        agent({ id: "a", name: "Anna", companyId, role: "writer" }),
        agent({ id: "c", name: "Carla", companyId, role: "specialist" }),
      ],
    });

    const result = (await harness.getData(DATA_KEYS.agentList, {
      companyId,
    })) as AgentListEntry[];

    expect(result.map((entry) => entry.name)).toEqual(["Anna", "Barry", "Carla"]);
    expect(result[0]).toMatchObject({ id: "a", role: "writer", status: "idle" });
  });

  it("returns an empty list when no agents belong to the company", async () => {
    const result = (await harness.getData(DATA_KEYS.agentList, {
      companyId: "different-company",
    })) as AgentListEntry[];
    expect(result).toEqual([]);
  });

  it("throws when companyId is missing", async () => {
    await expect(harness.getData(DATA_KEYS.agentList, {})).rejects.toThrow(/companyId/);
  });
});
