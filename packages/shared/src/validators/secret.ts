import { z } from "zod";
import { SECRET_PROVIDERS } from "../constants.js";

const FIELD_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const secretFieldsSchema = z
  .record(z.string().regex(FIELD_NAME_RE, "Field name must start with a letter and contain only letters, digits and underscores"), z.string().min(1))
  .refine((v) => Object.keys(v).length >= 1, "At least one field is required");

export const envBindingPlainSchema = z.object({
  type: z.literal("plain"),
  value: z.string(),
});

export const envBindingSecretRefSchema = z.object({
  type: z.literal("secret_ref"),
  secretId: z.string().uuid(),
  field: z.string().regex(FIELD_NAME_RE).optional(),
  version: z.union([z.literal("latest"), z.number().int().positive()]).optional(),
});

// Backward-compatible union that accepts legacy inline values.
export const envBindingSchema = z.union([
  z.string(),
  envBindingPlainSchema,
  envBindingSecretRefSchema,
]);

export const envConfigSchema = z.record(envBindingSchema);

/**
 * Create a secret. Accepts either a multi-field `fields` map or a single
 * legacy `value` (which is converted server-side to `{ value: <legacy> }`).
 */
export const createSecretSchema = z
  .object({
    name: z.string().min(1),
    provider: z.enum(SECRET_PROVIDERS).optional(),
    fields: secretFieldsSchema.optional(),
    value: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    externalRef: z.string().optional().nullable(),
  })
  .refine((data) => data.fields || data.value, {
    message: "Either 'fields' or 'value' must be provided",
    path: ["fields"],
  });

export type CreateSecret = z.infer<typeof createSecretSchema>;

/**
 * Rotate a secret. Replaces all fields with a new version. Accepts legacy
 * single `value` for backward compatibility.
 */
export const rotateSecretSchema = z
  .object({
    fields: secretFieldsSchema.optional(),
    value: z.string().min(1).optional(),
    externalRef: z.string().optional().nullable(),
  })
  .refine((data) => data.fields || data.value, {
    message: "Either 'fields' or 'value' must be provided",
    path: ["fields"],
  });

export type RotateSecret = z.infer<typeof rotateSecretSchema>;

export const updateSecretSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  externalRef: z.string().optional().nullable(),
});

export type UpdateSecret = z.infer<typeof updateSecretSchema>;
