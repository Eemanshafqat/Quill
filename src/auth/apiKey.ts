import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "../db/db.js";

export interface AuthenticatedUser {
  userId: string;
  apiKeyId: string;
}

export function generateApiKey(): string {
  return `qk_${randomBytes(32).toString("hex")}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function createApiKey(userId: string): {
  apiKeyId: string;
  apiKey: string;
} {
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  const apiKeyId = randomUUID();

  db.prepare(`
    INSERT INTO api_keys (id, user_id, key_hash)
    VALUES (?, ?, ?)
  `).run(apiKeyId, userId, keyHash);

  return {
    apiKeyId,
    apiKey,
  };
}

export function authenticateApiKey(
  apiKey: string
): AuthenticatedUser | null {
  const keyHash = hashApiKey(apiKey);

  const row = db.prepare(`
    SELECT id, user_id
    FROM api_keys
    WHERE key_hash = ?
      AND revoked_at IS NULL
  `).get(keyHash) as
    | { id: string; user_id: string }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    apiKeyId: row.id,
  };
}

export function revokeApiKey(apiKeyId: string): void {
  db.prepare(`
    UPDATE api_keys
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(apiKeyId);
}
