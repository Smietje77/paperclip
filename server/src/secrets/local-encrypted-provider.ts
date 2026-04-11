import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";
import type { SecretProviderModule, StoredSecretVersionMaterial } from "./types.js";
import { badRequest } from "../errors.js";

interface LocalEncryptedBlob {
  scheme: "local_encrypted_v1";
  iv: string;
  tag: string;
  ciphertext: string;
}

interface LocalEncryptedMultiFieldMaterial extends StoredSecretVersionMaterial {
  scheme: "local_encrypted_fields_v1";
  fields: Record<string, LocalEncryptedBlob>;
}

// Legacy single-value format used before multi-field support landed.
interface LocalEncryptedLegacyMaterial extends StoredSecretVersionMaterial, LocalEncryptedBlob {}

function resolveMasterKeyFilePath() {
  const fromEnv = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  if (fromEnv && fromEnv.trim().length > 0) return path.resolve(fromEnv.trim());
  return path.resolve(process.cwd(), "data/secrets/master.key");
}

function decodeMasterKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // ignored
  }

  if (Buffer.byteLength(trimmed, "utf8") === 32) {
    return Buffer.from(trimmed, "utf8");
  }
  return null;
}

function loadOrCreateMasterKey(): Buffer {
  const envKeyRaw = process.env.PAPERCLIP_SECRETS_MASTER_KEY;
  if (envKeyRaw && envKeyRaw.trim().length > 0) {
    const fromEnv = decodeMasterKey(envKeyRaw);
    if (!fromEnv) {
      throw badRequest(
        "Invalid PAPERCLIP_SECRETS_MASTER_KEY (expected 32-byte base64, 64-char hex, or raw 32-char string)",
      );
    }
    return fromEnv;
  }

  const keyPath = resolveMasterKeyFilePath();
  if (existsSync(keyPath)) {
    const raw = readFileSync(keyPath, "utf8");
    const decoded = decodeMasterKey(raw);
    if (!decoded) {
      throw badRequest(`Invalid secrets master key at ${keyPath}`);
    }
    return decoded;
  }

  const dir = path.dirname(keyPath);
  mkdirSync(dir, { recursive: true });
  const generated = randomBytes(32);
  writeFileSync(keyPath, generated.toString("base64"), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // best effort
  }
  return generated;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalFieldsHash(fields: Record<string, string>): string {
  const keys = Object.keys(fields).sort();
  const canonical = JSON.stringify(keys.map((k) => [k, fields[k]]));
  return sha256Hex(canonical);
}

function encryptValue(masterKey: Buffer, value: string): LocalEncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    scheme: "local_encrypted_v1",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptValue(masterKey: Buffer, blob: LocalEncryptedBlob): string {
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const ciphertext = Buffer.from(blob.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

function isBlob(value: unknown): value is LocalEncryptedBlob {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { scheme?: unknown }).scheme === "local_encrypted_v1" &&
    typeof (value as { iv?: unknown }).iv === "string" &&
    typeof (value as { tag?: unknown }).tag === "string" &&
    typeof (value as { ciphertext?: unknown }).ciphertext === "string"
  );
}

function asBlob(value: unknown): LocalEncryptedBlob {
  if (isBlob(value)) return value;
  throw badRequest("Invalid local_encrypted secret material");
}

export const localEncryptedProvider: SecretProviderModule = {
  id: "local_encrypted",
  descriptor: {
    id: "local_encrypted",
    label: "Local encrypted (default)",
    requiresExternalRef: false,
  },
  async createVersion(input) {
    const masterKey = loadOrCreateMasterKey();
    const encryptedFields: Record<string, LocalEncryptedBlob> = {};
    for (const [name, value] of Object.entries(input.fields)) {
      encryptedFields[name] = encryptValue(masterKey, value);
    }
    const material: LocalEncryptedMultiFieldMaterial = {
      scheme: "local_encrypted_fields_v1",
      fields: encryptedFields,
    };
    return {
      material,
      fieldsHash: canonicalFieldsHash(input.fields),
      externalRef: null,
    };
  },
  async resolveVersion(input) {
    const masterKey = loadOrCreateMasterKey();
    const material = input.material as Record<string, unknown>;

    // New multi-field format.
    if (
      material &&
      material.scheme === "local_encrypted_fields_v1" &&
      material.fields &&
      typeof material.fields === "object" &&
      !Array.isArray(material.fields)
    ) {
      const result: Record<string, string> = {};
      for (const [name, blob] of Object.entries(material.fields as Record<string, unknown>)) {
        result[name] = decryptValue(masterKey, asBlob(blob));
      }
      return result;
    }

    // Legacy single-value format: expose as a single `value` field so callers
    // written against the new interface still work.
    if (isBlob(material)) {
      return { value: decryptValue(masterKey, material as LocalEncryptedLegacyMaterial) };
    }

    throw badRequest("Invalid local_encrypted secret material");
  },
};
