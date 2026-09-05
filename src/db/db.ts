import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DB_PATH || "./quill.db";

export const db = new DatabaseSync(dbPath);

db.exec("PRAGMA foreign_keys = ON");

export function closeDatabase(): void {
  db.close();
}
