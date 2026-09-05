/**
 * =============================================================================
 * PLACEHOLDER IMPLEMENTATION — NOT PERSON 1's WORK
 * =============================================================================
 * This is a minimal stand-in for `BackendService` (see backend.interface.ts)
 * so the dashboard can run and be tested before Person 1's real data layer
 * lands. It intentionally lives in its own file, clearly named "placeholder",
 * so it is obvious it should be REPLACED, not extended.
 *
 * It uses better-sqlite3 directly, with a very small schema, bcryptjs for
 * password hashing, and a simple random token for API keys. None of this
 * should be treated as the project's real schema, migration system, or
 * security review — that is explicitly Person 1's ownership per the PRD.
 * =============================================================================
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import path from "path";
import {
  BackendService,
  User,
  Post,
  PostInput,
  SeoInput,
  PostStatus,
  PostCounts,
  AnalyticsRange,
  AnalyticsSummary,
  ApiKeyRotationResult,
  AuthError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "./backend.interface";

function id() {
  return crypto.randomBytes(12).toString("hex");
}

function maskKey(plaintext: string) {
  return `qk_live_${"•".repeat(8)}${plaintext.slice(-4)}`;
}

export class PlaceholderBackendService implements BackendService {
  private db: Database.Database;

  constructor(dbPath = path.join(process.cwd(), "data", "placeholder.db")) {
    require("fs").mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        api_key_hash TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft',
        meta_title TEXT,
        meta_description TEXT,
        slug TEXT,
        publish_at TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS post_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        viewed_at TEXT NOT NULL,
        referrer TEXT
      );
    `);
  }

  private rowToUser(row: any): User {
    return { id: row.id, email: row.email };
  }

  private rowToPost(row: any): Post {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      tags: JSON.parse(row.tags || "[]"),
      status: row.status,
      metaTitle: row.meta_title,
      metaDescription: row.meta_description,
      slug: row.slug,
      publishAt: row.publish_at,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async signUp(email: string, password: string): Promise<User> {
    const existing = this.db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) throw new ValidationError("An account with this email already exists.", "email");
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = id();
    this.db
      .prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(userId, email, passwordHash, new Date().toISOString());
    // Person 1 owns real API key creation/hashing; this mirrors that contract minimally.
    await this.rotateApiKey(userId);
    return { id: userId, email };
  }

  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!row) return null;
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return null;
    return this.rowToUser(row);
  }

  async getUserById(userId: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    return row ? this.rowToUser(row) : null;
  }

  private assertOwnership(userId: string, row: any): void {
    if (!row) throw new NotFoundError("Post not found.");
    if (row.user_id !== userId) throw new ForbiddenError("Post not found.");
  }

  async listPosts(userId: string, status?: PostStatus): Promise<Post[]> {
    const rows = status
      ? this.db
          .prepare("SELECT * FROM posts WHERE user_id = ? AND status = ? ORDER BY updated_at DESC")
          .all(userId, status)
      : this.db.prepare("SELECT * FROM posts WHERE user_id = ? ORDER BY updated_at DESC").all(userId);
    return (rows as any[]).map((r) => this.rowToPost(r));
  }

  async getPost(userId: string, postId: string): Promise<Post | null> {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
    if (!row) return null;
    if (row.user_id !== userId) return null; // enforce isolation: never leak existence
    return this.rowToPost(row);
  }

  async createPost(userId: string, data: PostInput): Promise<Post> {
    if (!data.title?.trim()) throw new ValidationError("Title is required.", "title");
    if (!data.content?.trim()) throw new ValidationError("Content is required.", "content");
    const now = new Date().toISOString();
    const postId = id();
    this.db
      .prepare(
        `INSERT INTO posts (id, user_id, title, content, tags, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
      )
      .run(postId, userId, data.title.trim(), data.content, JSON.stringify(data.tags || []), now, now);
    return (await this.getPost(userId, postId))!;
  }

  async updatePost(userId: string, postId: string, data: PostInput): Promise<Post> {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
    this.assertOwnership(userId, row);
    if (!data.title?.trim()) throw new ValidationError("Title is required.", "title");
    if (!data.content?.trim()) throw new ValidationError("Content is required.", "content");
    this.db
      .prepare("UPDATE posts SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?")
      .run(data.title.trim(), data.content, JSON.stringify(data.tags || []), new Date().toISOString(), postId);
    return (await this.getPost(userId, postId))!;
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
    this.assertOwnership(userId, row);
    this.db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
  }

  async getPostCounts(userId: string): Promise<PostCounts> {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) as c FROM posts WHERE user_id = ? GROUP BY status")
      .all(userId) as any[];
    const counts: PostCounts = { drafts: 0, published: 0, scheduled: 0 };
    for (const r of rows) {
      if (r.status === "draft") counts.drafts = r.c;
      if (r.status === "published") counts.published = r.c;
      if (r.status === "scheduled") counts.scheduled = r.c;
    }
    return counts;
  }

  async publishPost(userId: string, postId: string): Promise<Post> {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
    this.assertOwnership(userId, row);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE posts SET status = 'published', published_at = ?, publish_at = NULL, updated_at = ? WHERE id = ?")
      .run(now, now, postId);
    return (await this.getPost(userId, postId))!;
  }

  async schedulePost(userId: string, postId: string, publishAt: string): Promise<Post> {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
    this.assertOwnership(userId, row);
    const when = new Date(publishAt);
    if (isNaN(when.getTime())) throw new ValidationError("Please enter a valid date and time.", "publishAt");
    if (when.getTime() <= Date.now()) throw new ValidationError("Scheduled time must be in the future.", "publishAt");
    this.db
      .prepare("UPDATE posts SET status = 'scheduled', publish_at = ?, published_at = NULL, updated_at = ? WHERE id = ?")
      .run(when.toISOString(), new Date().toISOString(), postId);
    return (await this.getPost(userId, postId))!;
  }

  async unpublishPost(userId: string, postId: string): Promise<Post> {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
    this.assertOwnership(userId, row);
    this.db
      .prepare("UPDATE posts SET status = 'draft', published_at = NULL, publish_at = NULL, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), postId);
    return (await this.getPost(userId, postId))!;
  }

  async manageSeo(userId: string, postId: string, data: SeoInput): Promise<Post> {
    const row = this.db.prepare("SELECT * FROM posts WHERE id = ?").get(postId) as any;
    this.assertOwnership(userId, row);
    if (data.slug) {
      if (!/^[a-z0-9-]+$/.test(data.slug)) {
        throw new ValidationError("Slug can only contain lowercase letters, numbers, and hyphens.", "slug");
      }
      if (data.slug.length > 120) throw new ValidationError("Slug is too long.", "slug");
      const conflict = this.db
        .prepare("SELECT id FROM posts WHERE slug = ? AND user_id = ? AND id != ?")
        .get(data.slug, userId, postId);
      if (conflict) throw new ValidationError("This slug is already used by another post.", "slug");
    }
    if (data.metaTitle && data.metaTitle.length > 70) {
      throw new ValidationError("Meta title should be 70 characters or fewer.", "metaTitle");
    }
    if (data.metaDescription && data.metaDescription.length > 160) {
      throw new ValidationError("Meta description should be 160 characters or fewer.", "metaDescription");
    }
    this.db
      .prepare("UPDATE posts SET meta_title = ?, meta_description = ?, slug = ?, updated_at = ? WHERE id = ?")
      .run(data.metaTitle || null, data.metaDescription || null, data.slug || null, new Date().toISOString(), postId);
    return (await this.getPost(userId, postId))!;
  }

  async getAnalytics(userId: string, opts: AnalyticsRange): Promise<AnalyticsSummary> {
    // NOTE: real view collection/aggregation is Person 4's responsibility.
    // This placeholder returns deterministic zeroed/empty data so the
    // dashboard page renders correctly against an empty dataset.
    const days = opts.range === "30d" ? 30 : opts.range === "90d" ? 90 : 7;
    const viewsOverTime = Array.from({ length: days }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return { date: d.toISOString().slice(0, 10), views: 0 };
    });
    return {
      totalViews: 0,
      viewsOverTime,
      topPosts: [],
      referrers: [],
    };
  }

  async getMaskedApiKey(userId: string): Promise<string | null> {
    const row = this.db.prepare("SELECT api_key_hash FROM users WHERE id = ?").get(userId) as any;
    if (!row || !row.api_key_hash) return null;
    // We only ever store a hash; we keep a masked display value alongside it.
    const masked = this.db.prepare("SELECT masked_key FROM api_key_display WHERE user_id = ?").get(userId) as any;
    return masked ? masked.masked_key : "qk_live_••••••••••••";
  }

  async rotateApiKey(userId: string): Promise<ApiKeyRotationResult> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_key_display (
        user_id TEXT PRIMARY KEY,
        masked_key TEXT NOT NULL
      );
    `);
    const plaintext = `qk_live_${crypto.randomBytes(24).toString("hex")}`;
    const hash = await bcrypt.hash(plaintext, 10);
    const masked = maskKey(plaintext);
    const now = new Date().toISOString();
    this.db.prepare("UPDATE users SET api_key_hash = ? WHERE id = ?").run(hash, userId);
    this.db
      .prepare(
        "INSERT INTO api_key_display (user_id, masked_key) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET masked_key = excluded.masked_key"
      )
      .run(userId, masked);
    return { plaintextKey: plaintext, maskedKey: masked, rotatedAt: now };
  }

  async revokeApiKey(userId: string): Promise<void> {
    this.db.prepare("UPDATE users SET api_key_hash = NULL WHERE id = ?").run(userId);
    this.db.prepare("DELETE FROM api_key_display WHERE user_id = ?").run(userId);
  }
}
