import { z } from "zod";
import { envBindingSchema } from "./secret.js";

export const mcpTransportSchema = z.enum(["stdio", "http", "sse"]);

const mcpHeaderRecordSchema = z.record(envBindingSchema);
const mcpEnvRecordSchema = z.record(envBindingSchema);
const mcpArgsSchema = z.array(z.string());

const mcpServerBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  transport: mcpTransportSchema,
  command: z.string().optional().nullable(),
  args: mcpArgsSchema.optional().nullable(),
  url: z.string().url().optional().nullable(),
  headers: mcpHeaderRecordSchema.optional().nullable(),
  env: mcpEnvRecordSchema.optional().nullable(),
  enabled: z.boolean().optional(),
});

export const createMcpServerSchema = mcpServerBaseSchema.superRefine((data, ctx) => {
  if (data.transport === "stdio") {
    if (!data.command || data.command.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stdio transport requires 'command'",
        path: ["command"],
      });
    }
  } else if (data.transport === "http" || data.transport === "sse") {
    if (!data.url || data.url.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.transport} transport requires 'url'`,
        path: ["url"],
      });
    }
  }
});

export type CreateMcpServer = z.infer<typeof createMcpServerSchema>;

export const updateMcpServerSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  transport: mcpTransportSchema.optional(),
  command: z.string().optional().nullable(),
  args: mcpArgsSchema.optional().nullable(),
  url: z.string().url().optional().nullable(),
  headers: mcpHeaderRecordSchema.optional().nullable(),
  env: mcpEnvRecordSchema.optional().nullable(),
  enabled: z.boolean().optional(),
});

export type UpdateMcpServer = z.infer<typeof updateMcpServerSchema>;
