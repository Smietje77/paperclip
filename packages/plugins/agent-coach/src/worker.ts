import { definePlugin, runWorker, type PluginContext, type PluginEvent } from "@paperclipai/plugin-sdk";
import { registerAggregateJob } from "./aggregate-job.js";
import { PLUGIN_ID } from "./constants.js";
import { registerDataHandlers } from "./data-handlers.js";
import type { RubricEvaluator } from "./evaluator.js";
import { createRubricEvaluator } from "./evaluator-factory.js";
import type { AgentRunEventPayload } from "./event-payloads.js";
import { parseAgentRunEventPayload, toScoringStatus } from "./event-payloads.js";
import { persistRunScore } from "./persistence.js";
import { rubricInputFromPayload } from "./rubric.js";
import { scoreRun } from "./scoring.js";

const RUN_EVENT_TYPES = ["agent.run.finished", "agent.run.failed", "agent.run.cancelled"] as const;

async function handleRunEvent(
  ctx: PluginContext,
  evaluator: RubricEvaluator,
  event: PluginEvent,
): Promise<void> {
  const payload = parseAgentRunEventPayload(event.payload);
  if (!payload) {
    ctx.logger.warn("agent-coach: received malformed run event payload, skipping", {
      eventId: event.eventId,
      eventType: event.eventType,
    });
    return;
  }
  if (!payload.agentId || !payload.runId) {
    ctx.logger.warn("agent-coach: run event missing agentId or runId, skipping", {
      eventId: event.eventId,
      eventType: event.eventType,
    });
    return;
  }

  const enrichedPayload = payload as AgentRunEventPayload & {
    readonly agentId: string;
    readonly runId: string;
  };

  const result = scoreRun({
    status: toScoringStatus(payload.status),
    durationMs: payload.durationMs,
    processLossRetryCount: payload.processLossRetryCount,
    costCents: 0,
  });

  const rubricOutcome = await evaluator.evaluate(rubricInputFromPayload(enrichedPayload));
  const persistOptions =
    rubricOutcome.ok
      ? { rubric: rubricOutcome.result }
      : { rubric: null, rubricFailure: rubricOutcome.reason };

  try {
    await persistRunScore(ctx, enrichedPayload, result, persistOptions);
  } catch (error: unknown) {
    ctx.logger.error("agent-coach: failed to persist run score", {
      runId: payload.runId,
      agentId: payload.agentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  ctx.logger.info("agent-coach: scored run", {
    eventType: event.eventType,
    runId: payload.runId,
    agentId: payload.agentId,
    score: result.score,
    dimensions: result.dimensions,
    flags: result.flags,
    rubricScore: rubricOutcome.ok ? rubricOutcome.result.score : null,
    rubricFailure: rubricOutcome.ok ? null : rubricOutcome.reason,
  });
}

async function subscribeToRunEvents(ctx: PluginContext, evaluator: RubricEvaluator): Promise<void> {
  for (const eventType of RUN_EVENT_TYPES) {
    ctx.events.on(eventType, (event) => handleRunEvent(ctx, evaluator, event));
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} worker started`);
    const evaluator = await createRubricEvaluator(ctx);
    await subscribeToRunEvents(ctx, evaluator);
    registerDataHandlers(ctx);
    registerAggregateJob(ctx);
  },

  async onHealth() {
    return { status: "ok", message: "agent-coach worker ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
