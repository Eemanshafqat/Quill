import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";

export function auditLog(
  userId: string,
  action: string,
  success: boolean,
  tool?: string,
  details?: string
): void {
  db.prepare(`
    INSERT INTO audit_logs
      (id, user_id, action, tool, success, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId,
    action,
    tool ?? null,
    success ? 1 : 0,
    details ?? null
  );
}
