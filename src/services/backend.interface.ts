/**
 * =============================================================================
 * INTEGRATION CONTRACT — Person 1 (Core Backend & Data Layer)
 * =============================================================================
 *
 * This file defines the SHARED BUSINESS LOGIC INTERFACE that the dashboard
 * (Person 3) expects from Person 1's backend. It is the single seam between
 * the dashboard and the database.
 *
 * OWNERSHIP:
 *   - Person 1 owns the real implementation of this interface (SQLite schema,
 *     migrations, password hashing, API-key hashing, user isolation,
 *     rate limiting, audit logging).
 *   - Person 2's MCP server is expected to call the SAME interface, so that
 *     MCP tools and the dashboard can never diverge in behavior.
 *   - Person 3 (this codebase) ONLY calls these functions. It never runs its
 *     own SQL and never re-implements auth/hashing/business rules.
 *
 * WHAT TO DO WHEN PERSON 1's REAL IMPLEMENTATION IS READY:
 *   1. Implement `BackendService` in a new file, e.g. `backend.sqlite.ts`,
 *      backed by the real database/repository layer.
 *   2. Swap the single line in `src/services/index.ts` that currently
 *      instantiates `PlaceholderBackendService` to instantiate the real one.
 *   3. Nothing in routes/views needs to change, since they only depend on
 *      the `BackendService` type below.
 *
 * The `PlaceholderBackendService` (backend.placeholder.ts) is a minimal,
 * clearly-labeled in-memory/SQLite stand-in that exists ONLY so the dashboard
 * is runnable and testable in isolation. It is NOT a production data layer
 * and must not be mistaken for Person 1's work.
 * =============================================================================
 */

export type PostStatus = "draft" | "published" | "scheduled";

export interface User {
  id: string;
  email: string;
}

export interface Post {
  id: string;
  userId: string;
  title: string;
  content: string; // Markdown source
  tags: string[];
  status: PostStatus;
  metaTitle: string | null;
  metaDescription: string | null;
  slug: string | null;
  publishAt: string | null; // ISO datetime, used when status === "scheduled"
  publishedAt: string | null; // ISO datetime, set when status === "published"
  createdAt: string;
  updatedAt: string;
}

export interface PostInput {
  title: string;
  content: string;
  tags?: string[];
}

export interface SeoInput {
  metaTitle?: string | null;
  metaDescription?: string | null;
  slug?: string | null;
}

export interface PostCounts {
  drafts: number;
  published: number;
  scheduled: number;
}

export interface AnalyticsRange {
  /** e.g. "7d" | "30d" | "90d" */
  range: string;
}

export interface AnalyticsDataPoint {
  date: string; // ISO date
  views: number;
}

export interface TopPost {
  postId: string;
  title: string;
  views: number;
}

export interface Referrer {
  source: string;
  count: number;
}

export interface AnalyticsSummary {
  totalViews: number;
  viewsOverTime: AnalyticsDataPoint[];
  topPosts: TopPost[];
  referrers: Referrer[];
}

export interface ApiKeyRotationResult {
  /** Plaintext key — MUST be shown to the user exactly once, never persisted client-side, never logged. */
  plaintextKey: string;
  maskedKey: string; // e.g. "qk_live_••••••••ab12"
  rotatedAt: string;
}

export class AuthError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

/**
 * The full contract the dashboard depends on. Person 2's MCP tools are
 * expected to call an equivalent (likely identical) interface so that
 * dashboard and MCP behavior cannot diverge, per the PRD.
 */
export interface BackendService {
  // ---- Auth (human, email+password) ----
  signUp(email: string, password: string): Promise<User>;
  verifyCredentials(email: string, password: string): Promise<User | null>;
  getUserById(userId: string): Promise<User | null>;

  // ---- Posts ----
  listPosts(userId: string, status?: PostStatus): Promise<Post[]>;
  getPost(userId: string, postId: string): Promise<Post | null>;
  createPost(userId: string, data: PostInput): Promise<Post>;
  updatePost(userId: string, postId: string, data: PostInput): Promise<Post>;
  deletePost(userId: string, postId: string): Promise<void>;
  getPostCounts(userId: string): Promise<PostCounts>;

  // ---- Publishing ----
  publishPost(userId: string, postId: string): Promise<Post>;
  schedulePost(userId: string, postId: string, publishAt: string): Promise<Post>;
  unpublishPost(userId: string, postId: string): Promise<Post>;

  // ---- SEO ----
  manageSeo(userId: string, postId: string, data: SeoInput): Promise<Post>;

  // ---- Analytics (read-only from the dashboard's perspective; Person 4 owns collection) ----
  getAnalytics(userId: string, opts: AnalyticsRange): Promise<AnalyticsSummary>;

  // ---- API keys (used for MCP auth, managed from the dashboard) ----
  getMaskedApiKey(userId: string): Promise<string | null>;
  rotateApiKey(userId: string): Promise<ApiKeyRotationResult>;
  revokeApiKey(userId: string): Promise<void>;
}
