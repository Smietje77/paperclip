export type SecretProvider =
  | "local_encrypted"
  | "aws_secrets_manager"
  | "gcp_secret_manager"
  | "vault";

export type SecretVersionSelector = number | "latest";

export interface EnvPlainBinding {
  type: "plain";
  value: string;
}

export interface EnvSecretRefBinding {
  type: "secret_ref";
  secretId: string;
  /**
   * Which field of the secret to read. If omitted, the server resolves to
   * the secret's single field (or `"value"` if multiple fields exist).
   */
  field?: string;
  version?: SecretVersionSelector;
}

// Backward-compatible: legacy plaintext string values are still accepted.
export type EnvBinding = string | EnvPlainBinding | EnvSecretRefBinding;

export type AgentEnvConfig = Record<string, EnvBinding>;

export interface CompanySecret {
  id: string;
  companyId: string;
  name: string;
  provider: SecretProvider;
  externalRef: string | null;
  latestVersion: number;
  description: string | null;
  /**
   * Field names stored on the latest version. Values are never exposed on
   * list/get — only the field keys are safe to return to the client.
   */
  fieldNames: string[];
  createdByAgentId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretProviderDescriptor {
  id: SecretProvider;
  label: string;
  requiresExternalRef: boolean;
}
