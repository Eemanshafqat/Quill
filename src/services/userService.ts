import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";

export async function createUser(
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Invalid email");
  }

  const passwordHash = await hashPassword(password);
  const id = randomUUID();

  db.prepare(`
    INSERT INTO users (id, email, password_hash)
    VALUES (?, ?, ?)
  `).run(id, normalizedEmail, passwordHash);

  return { id, email: normalizedEmail };
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<{ id: string; email: string } | null> {
  const row = db.prepare(`
    SELECT id, email, password_hash
    FROM users
    WHERE email = ?
  `).get(email.trim().toLowerCase()) as
    | { id: string; email: string; password_hash: string }
    | undefined;

  if (!row) return null;

  const valid = await verifyPassword(password, row.password_hash);

  return valid ? { id: row.id, email: row.email } : null;
}
