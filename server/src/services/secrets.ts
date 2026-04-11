import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  companySecrets,
  companySecretVersions,
  companyBrands,
  companyBrandImages,
} from "@paperclipai/db";
import type {
  AgentEnvConfig,
  CompanySecret,
  EnvBinding,
  SecretProvider,
} from "@paperclipai/shared";
import { envBindingSchema } from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { getSecretProvider, listSecretProviders } from "../secrets/provider-registry.js";
import { extractFieldNames } from "../secrets/types.js";

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SENSITIVE_ENV_KEY_RE =
  /(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie|connectionstring)/i;
const REDACTED_SENTINEL = "***REDACTED***";

type CanonicalEnvBinding =
  | { type: "plain"; value: string }
  | {
      type: "secret_ref";
      secretId: string;
      version: number | "latest";
      field: string | null;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isSensitiveEnvKey(key: string) {
  return SENSITIVE_ENV_KEY_RE.test(key);
}

function canonicalizeBinding(binding: EnvBinding): CanonicalEnvBinding {
  if (typeof binding === "string") {
    return { type: "plain", value: binding };
  }
  if (binding.type === "plain") {
    return { type: "plain", value: String(binding.value) };
  }
  return {
    type: "secret_ref",
    secretId: binding.secretId,
    version: binding.version ?? "latest",
    field: binding.field ?? null,
  };
}

function pickDefaultField(fields: Record<string, string>): string {
  const keys = Object.keys(fields);
  if (keys.length === 0) throw notFound("Secret has no fields");
  if (keys.length === 1) return keys[0]!;
  if ("value" in fields) return "value";
  throw unprocessable(
    `Secret has multiple fields [${keys.join(", ")}]; binding must specify which field`,
  );
}

export function secretService(db: Db) {
  async function getById(id: string) {
    return db
      .select()
      .from(companySecrets)
      .where(eq(companySecrets.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function getByName(companyId: string, name: string) {
    return db
      .select()
      .from(companySecrets)
      .where(and(eq(companySecrets.companyId, companyId), eq(companySecrets.name, name)))
      .then((rows) => rows[0] ?? null);
  }

  async function getSecretVersion(secretId: string, version: number) {
    return db
      .select()
      .from(companySecretVersions)
      .where(
        and(
          eq(companySecretVersions.secretId, secretId),
          eq(companySecretVersions.version, version),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  async function assertSecretInCompany(companyId: string, secretId: string) {
    const secret = await getById(secretId);
    if (!secret) throw notFound("Secret not found");
    if (secret.companyId !== companyId) throw unprocessable("Secret must belong to same company");
    return secret;
  }

  async function resolveSecretFields(
    companyId: string,
    secretId: string,
    version: number | "latest",
  ): Promise<Record<string, string>> {
    const secret = await assertSecretInCompany(companyId, secretId);
    const resolvedVersion = version === "latest" ? secret.latestVersion : version;
    const versionRow = await getSecretVersion(secret.id, resolvedVersion);
    if (!versionRow) throw notFound("Secret version not found");
    const provider = getSecretProvider(secret.provider as SecretProvider);
    return provider.resolveVersion({
      material: versionRow.material as Record<string, unknown>,
      externalRef: secret.externalRef,
    });
  }

  async function resolveSecretValue(
    companyId: string,
    secretId: string,
    version: number | "latest",
    field: string | null = null,
  ): Promise<string> {
    const fields = await resolveSecretFields(companyId, secretId, version);
    const effectiveField = field ?? pickDefaultField(fields);
    const value = fields[effectiveField];
    if (value === undefined) {
      throw notFound(`Secret field not found: ${effectiveField}`);
    }
    return value;
  }

  async function listWithFieldNames(companyId: string): Promise<CompanySecret[]> {
    const secretRows = await db
      .select()
      .from(companySecrets)
      .where(eq(companySecrets.companyId, companyId))
      .orderBy(desc(companySecrets.createdAt));

    if (secretRows.length === 0) return [];

    const versions = await db
      .select()
      .from(companySecretVersions)
      .where(
        inArray(
          companySecretVersions.secretId,
          secretRows.map((r) => r.id),
        ),
      );

    // Map secretId → latest version row (by highest version number).
    const latestBySecret = new Map<string, (typeof versions)[number]>();
    for (const v of versions) {
      const existing = latestBySecret.get(v.secretId);
      if (!existing || v.version > existing.version) {
        latestBySecret.set(v.secretId, v);
      }
    }

    return secretRows.map((row) => ({
      ...row,
      provider: row.provider as SecretProvider,
      fieldNames: extractFieldNames(latestBySecret.get(row.id)?.material),
    })) as CompanySecret[];
  }

  async function normalizeEnvConfig(
    companyId: string,
    envValue: unknown,
    opts?: { strictMode?: boolean },
  ): Promise<AgentEnvConfig> {
    const record = asRecord(envValue);
    if (!record) throw unprocessable("adapterConfig.env must be an object");

    const normalized: AgentEnvConfig = {};
    for (const [key, rawBinding] of Object.entries(record)) {
      if (!ENV_KEY_RE.test(key)) {
        throw unprocessable(`Invalid environment variable name: ${key}`);
      }

      const parsed = envBindingSchema.safeParse(rawBinding);
      if (!parsed.success) {
        throw unprocessable(`Invalid environment binding for key: ${key}`);
      }

      const binding = canonicalizeBinding(parsed.data as EnvBinding);
      if (binding.type === "plain") {
        if (opts?.strictMode && isSensitiveEnvKey(key) && binding.value.trim().length > 0) {
          throw unprocessable(
            `Strict secret mode requires secret references for sensitive key: ${key}`,
          );
        }
        if (binding.value === REDACTED_SENTINEL) {
          throw unprocessable(`Refusing to persist redacted placeholder for key: ${key}`);
        }
        normalized[key] = binding;
        continue;
      }

      await assertSecretInCompany(companyId, binding.secretId);
      normalized[key] = {
        type: "secret_ref",
        secretId: binding.secretId,
        version: binding.version,
        ...(binding.field ? { field: binding.field } : {}),
      };
    }
    return normalized;
  }

  async function normalizeAdapterConfigForPersistenceInternal(
    companyId: string,
    adapterConfig: Record<string, unknown>,
    opts?: { strictMode?: boolean },
  ) {
    const normalized = { ...adapterConfig };
    if (!Object.prototype.hasOwnProperty.call(adapterConfig, "env")) {
      return normalized;
    }
    normalized.env = await normalizeEnvConfig(companyId, adapterConfig.env, opts);
    return normalized;
  }

  return {
    listProviders: () => listSecretProviders(),

    list: (companyId: string) => listWithFieldNames(companyId),

    getById,
    getByName,
    resolveSecretValue,
    resolveSecretFields,

    create: async (
      companyId: string,
      input: {
        name: string;
        provider: SecretProvider;
        fields: Record<string, string>;
        description?: string | null;
        externalRef?: string | null;
      },
      actor?: { userId?: string | null; agentId?: string | null },
    ) => {
      const existing = await getByName(companyId, input.name);
      if (existing) throw conflict(`Secret already exists: ${input.name}`);

      const provider = getSecretProvider(input.provider);
      const prepared = await provider.createVersion({
        fields: input.fields,
        externalRef: input.externalRef ?? null,
      });

      return db.transaction(async (tx) => {
        const secret = await tx
          .insert(companySecrets)
          .values({
            companyId,
            name: input.name,
            provider: input.provider,
            externalRef: prepared.externalRef,
            latestVersion: 1,
            description: input.description ?? null,
            createdByAgentId: actor?.agentId ?? null,
            createdByUserId: actor?.userId ?? null,
          })
          .returning()
          .then((rows) => rows[0]);

        await tx.insert(companySecretVersions).values({
          secretId: secret.id,
          version: 1,
          material: prepared.material,
          valueSha256: prepared.fieldsHash,
          createdByAgentId: actor?.agentId ?? null,
          createdByUserId: actor?.userId ?? null,
        });

        return {
          ...secret,
          provider: secret.provider as SecretProvider,
          fieldNames: Object.keys(input.fields),
        } as CompanySecret;
      });
    },

    rotate: async (
      secretId: string,
      input: { fields: Record<string, string>; externalRef?: string | null },
      actor?: { userId?: string | null; agentId?: string | null },
    ) => {
      const secret = await getById(secretId);
      if (!secret) throw notFound("Secret not found");
      const provider = getSecretProvider(secret.provider as SecretProvider);
      const nextVersion = secret.latestVersion + 1;
      const prepared = await provider.createVersion({
        fields: input.fields,
        externalRef: input.externalRef ?? secret.externalRef ?? null,
      });

      return db.transaction(async (tx) => {
        await tx.insert(companySecretVersions).values({
          secretId: secret.id,
          version: nextVersion,
          material: prepared.material,
          valueSha256: prepared.fieldsHash,
          createdByAgentId: actor?.agentId ?? null,
          createdByUserId: actor?.userId ?? null,
        });

        const updated = await tx
          .update(companySecrets)
          .set({
            latestVersion: nextVersion,
            externalRef: prepared.externalRef,
            updatedAt: new Date(),
          })
          .where(eq(companySecrets.id, secret.id))
          .returning()
          .then((rows) => rows[0] ?? null);

        if (!updated) throw notFound("Secret not found");
        return {
          ...updated,
          provider: updated.provider as SecretProvider,
          fieldNames: Object.keys(input.fields),
        } as CompanySecret;
      });
    },

    update: async (
      secretId: string,
      patch: { name?: string; description?: string | null; externalRef?: string | null },
    ) => {
      const secret = await getById(secretId);
      if (!secret) throw notFound("Secret not found");

      if (patch.name && patch.name !== secret.name) {
        const duplicate = await getByName(secret.companyId, patch.name);
        if (duplicate && duplicate.id !== secret.id) {
          throw conflict(`Secret already exists: ${patch.name}`);
        }
      }

      const updated = await db
        .update(companySecrets)
        .set({
          name: patch.name ?? secret.name,
          description:
            patch.description === undefined ? secret.description : patch.description,
          externalRef:
            patch.externalRef === undefined ? secret.externalRef : patch.externalRef,
          updatedAt: new Date(),
        })
        .where(eq(companySecrets.id, secret.id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!updated) return null;

      // Populate fieldNames from the current latest version so the response
      // matches the CompanySecret shape returned by create/rotate/list.
      const versionRow = await getSecretVersion(updated.id, updated.latestVersion);
      return {
        ...updated,
        provider: updated.provider as SecretProvider,
        fieldNames: extractFieldNames(versionRow?.material),
      } as CompanySecret;
    },

    remove: async (secretId: string) => {
      const secret = await getById(secretId);
      if (!secret) return null;
      await db.delete(companySecrets).where(eq(companySecrets.id, secretId));
      return secret;
    },

    normalizeAdapterConfigForPersistence: async (
      companyId: string,
      adapterConfig: Record<string, unknown>,
      opts?: { strictMode?: boolean },
    ) => normalizeAdapterConfigForPersistenceInternal(companyId, adapterConfig, opts),

    normalizeHireApprovalPayloadForPersistence: async (
      companyId: string,
      payload: Record<string, unknown>,
      opts?: { strictMode?: boolean },
    ) => {
      const normalized = { ...payload };
      const adapterConfig = asRecord(payload.adapterConfig);
      if (adapterConfig) {
        normalized.adapterConfig = await normalizeAdapterConfigForPersistenceInternal(
          companyId,
          adapterConfig,
          opts,
        );
      }
      return normalized;
    },

    resolveEnvBindings: async (
      companyId: string,
      envValue: unknown,
    ): Promise<{ env: Record<string, string>; secretKeys: Set<string> }> => {
      const record = asRecord(envValue);
      const resolved: Record<string, string> = {};
      const secretKeys = new Set<string>();

      if (record) {
        for (const [key, rawBinding] of Object.entries(record)) {
          if (!ENV_KEY_RE.test(key)) {
            throw unprocessable(`Invalid environment variable name: ${key}`);
          }
          const parsed = envBindingSchema.safeParse(rawBinding);
          if (!parsed.success) {
            throw unprocessable(`Invalid environment binding for key: ${key}`);
          }
          const binding = canonicalizeBinding(parsed.data as EnvBinding);
          if (binding.type === "plain") {
            resolved[key] = binding.value;
          } else {
            resolved[key] = await resolveSecretValue(
              companyId,
              binding.secretId,
              binding.version,
              binding.field,
            );
            secretKeys.add(key);
          }
        }
      }

      const brandJson = await loadBrandContextJson(db, companyId);
      if (brandJson) resolved.PAPERCLIP_BRAND_JSON = brandJson;

      return { env: resolved, secretKeys };
    },

    resolveAdapterConfigForRuntime: async (
      companyId: string,
      adapterConfig: Record<string, unknown>,
    ): Promise<{ config: Record<string, unknown>; secretKeys: Set<string> }> => {
      const resolved = { ...adapterConfig };
      const secretKeys = new Set<string>();
      const env: Record<string, string> = {};

      if (Object.prototype.hasOwnProperty.call(adapterConfig, "env")) {
        const record = asRecord(adapterConfig.env);
        if (record) {
          for (const [key, rawBinding] of Object.entries(record)) {
            if (!ENV_KEY_RE.test(key)) {
              throw unprocessable(`Invalid environment variable name: ${key}`);
            }
            const parsed = envBindingSchema.safeParse(rawBinding);
            if (!parsed.success) {
              throw unprocessable(`Invalid environment binding for key: ${key}`);
            }
            const binding = canonicalizeBinding(parsed.data as EnvBinding);
            if (binding.type === "plain") {
              env[key] = binding.value;
            } else {
              env[key] = await resolveSecretValue(
                companyId,
                binding.secretId,
                binding.version,
                binding.field,
              );
              secretKeys.add(key);
            }
          }
        }
      }

      const brandJson = await loadBrandContextJson(db, companyId);
      if (brandJson) env.PAPERCLIP_BRAND_JSON = brandJson;

      resolved.env = env;
      return { config: resolved, secretKeys };
    },
  };
}

/**
 * Fetch the company brand profile as a compact JSON string, suitable for
 * injection into agent runtime env as `PAPERCLIP_BRAND_JSON`. Returns `null`
 * if no brand data exists yet, so the env var is only present when there's
 * actual content to surface.
 */
async function loadBrandContextJson(db: Db, companyId: string): Promise<string | null> {
  try {
    const [brandRow, imageRows] = await Promise.all([
      db
        .select()
        .from(companyBrands)
        .where(eq(companyBrands.companyId, companyId))
        .then((rows) => rows[0] ?? null),
      db
        .select()
        .from(companyBrandImages)
        .where(eq(companyBrandImages.companyId, companyId)),
    ]);

    if (!brandRow && imageRows.length === 0) return null;

    const payload: Record<string, unknown> = {};
    if (brandRow?.brandName) payload.brandName = brandRow.brandName;
    if (brandRow?.tagline) payload.tagline = brandRow.tagline;
    if (brandRow?.colors) payload.colors = brandRow.colors;
    if (brandRow?.typography) payload.typography = brandRow.typography;
    if (brandRow?.voiceTone) payload.voiceTone = brandRow.voiceTone;
    if (brandRow?.brandGuidelines) payload.brandGuidelines = brandRow.brandGuidelines;
    if (brandRow?.logoLightAssetId) {
      payload.logoLightUrl = `/api/assets/${brandRow.logoLightAssetId}/content`;
    }
    if (brandRow?.logoDarkAssetId) {
      payload.logoDarkUrl = `/api/assets/${brandRow.logoDarkAssetId}/content`;
    }
    if (brandRow?.iconAssetId) {
      payload.iconUrl = `/api/assets/${brandRow.iconAssetId}/content`;
    }
    if (imageRows.length > 0) {
      payload.images = imageRows.map((img) => ({
        url: `/api/assets/${img.assetId}/content`,
        caption: img.caption,
      }));
    }

    if (Object.keys(payload).length === 0) return null;
    return JSON.stringify(payload);
  } catch {
    // Brand injection is best-effort — never break agent execution if it fails.
    return null;
  }
}
