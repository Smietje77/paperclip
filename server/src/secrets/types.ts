import type { SecretProvider, SecretProviderDescriptor } from "@paperclipai/shared";

export interface StoredSecretVersionMaterial {
  [key: string]: unknown;
}

export interface SecretProviderModule {
  id: SecretProvider;
  descriptor: SecretProviderDescriptor;
  /**
   * Encrypt a set of named fields. The returned material stores each field
   * under `fields[name]` so the names remain cleartext (for listing) while
   * values are encrypted individually.
   */
  createVersion(input: {
    fields: Record<string, string>;
    externalRef: string | null;
  }): Promise<{
    material: StoredSecretVersionMaterial;
    fieldsHash: string;
    externalRef: string | null;
  }>;
  /**
   * Decrypt all fields of a stored version. Returns a map keyed by field
   * name so the caller can pick a specific field by name. Legacy single-
   * value materials are transparently returned as `{ value: <legacy> }`.
   */
  resolveVersion(input: {
    material: StoredSecretVersionMaterial;
    externalRef: string | null;
  }): Promise<Record<string, string>>;
}

/**
 * Inspect a stored material blob and extract the cleartext field names.
 * Used by the list endpoint so the UI can show which fields exist without
 * decrypting any values. Legacy single-value materials report a single
 * field named `"value"`.
 */
export function extractFieldNames(material: unknown): string[] {
  if (!material || typeof material !== "object") return ["value"];
  const m = material as Record<string, unknown>;
  if (m.fields && typeof m.fields === "object" && !Array.isArray(m.fields)) {
    return Object.keys(m.fields as Record<string, unknown>);
  }
  return ["value"];
}
