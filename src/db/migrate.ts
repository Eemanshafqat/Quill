import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dbPath = process.env.DB_PATH || "./quill.db";

const db = new DatabaseSync(dbPath);

db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`);

const migrationsDir = join(process.cwd(), "src/db/migrations");

const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

for (const file of migrations) {
    const match = file.match(/^(\d+)_/);

    if (!match) {
        throw new Error(`Invalid migration filename: ${file}`);
    }

    const version = Number(match[1]);

    const applied = db
        .prepare("SELECT version FROM schema_migrations WHERE version = ?")
        .get(version);

    if (applied) {
        continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");

    db.exec("BEGIN");

    try {
        db.exec(sql);

        db.prepare(
            "INSERT INTO schema_migrations (version, name) VALUES (?, ?)"
        ).run(version, file);

        db.exec("COMMIT");

        console.log(`Applied migration: ${file}`);
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}

db.close();

console.log("Database migrations complete.");
