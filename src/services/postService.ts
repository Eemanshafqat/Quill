import { randomUUID } from "node:crypto";
import { db } from "../db/db.js";
import { auditLog } from "./auditService.js";
import { checkWriteRateLimit } from "../middleware/rateLimit.js";

export type PostStatus = "draft" | "published" | "scheduled";

export interface CreatePostInput {
  title: string;
  slug: string;
  content_md: string;
  meta_title?: string;
  meta_description?: string;
  scheduled_at?: string;
}

function writeAllowed(userId: string, action: string): void {
  if (!checkWriteRateLimit(userId)) {
    auditLog(userId, action, false, "post", "Rate limit exceeded");
    throw new Error("Write rate limit exceeded");
  }
}

export function createPost(
  userId: string,
  input: CreatePostInput
) {
  writeAllowed(userId, "create_post");

  const id = randomUUID();
  const status: PostStatus = input.scheduled_at ? "scheduled" : "draft";

  db.prepare(`
    INSERT INTO posts
      (id, user_id, title, slug, content_md, status,
       meta_title, meta_description, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    input.title,
    input.slug,
    input.content_md,
    status,
    input.meta_title ?? null,
    input.meta_description ?? null,
    input.scheduled_at ?? null
  );

  auditLog(userId, "create_post", true, "post", id);
  return getPost(userId, id);
}

export function getPost(userId: string, postId: string) {
  return db.prepare(`
    SELECT *
    FROM posts
    WHERE id = ? AND user_id = ?
  `).get(postId, userId);
}

export function listPosts(userId: string) {
  return db.prepare(`
    SELECT *
    FROM posts
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId);
}

export function updatePost(
  userId: string,
  postId: string,
  input: Partial<CreatePostInput>
) {
  writeAllowed(userId, "update_post");

  const current = getPost(userId, postId) as Record<string, unknown> | undefined;
  if (!current) throw new Error("Post not found");

  const title = input.title ?? String(current.title);
  const slug = input.slug ?? String(current.slug);
  const content = input.content_md ?? String(current.content_md);

  db.prepare(`
    UPDATE posts
    SET title = :title,
        slug = :slug,
        content_md = :content,
        meta_title = :meta_title,
        meta_description = :meta_description,
        scheduled_at = :scheduled_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = :post_id AND user_id = :user_id
  `).run({
    title,
    slug,
    content,
    meta_title: (input.meta_title ?? current.meta_title ?? null) as string | null,
    meta_description: (input.meta_description ?? current.meta_description ?? null) as string | null,
    scheduled_at: (input.scheduled_at ?? current.scheduled_at ?? null) as string | null,
    post_id: postId,
    user_id: userId
  });

  auditLog(userId, "update_post", true, "post", postId);
  return getPost(userId, postId);
}

export function publishPost(userId: string, postId: string) {
  writeAllowed(userId, "publish_post");

  const result = db.prepare(`
    UPDATE posts
    SET status = 'published',
        published_at = CURRENT_TIMESTAMP,
        scheduled_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(postId, userId);

  if (result.changes === 0) throw new Error("Post not found");

  auditLog(userId, "publish_post", true, "post", postId);
  return getPost(userId, postId);
}

export function schedulePost(
  userId: string,
  postId: string,
  scheduledAt: string
) {
  writeAllowed(userId, "schedule_post");

  const result = db.prepare(`
    UPDATE posts
    SET status = 'scheduled',
        scheduled_at = ?,
        published_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(scheduledAt, postId, userId);

  if (result.changes === 0) throw new Error("Post not found");

  auditLog(userId, "schedule_post", true, "post", postId);
  return getPost(userId, postId);
}

export function deletePost(userId: string, postId: string): void {
  writeAllowed(userId, "delete_post");

  const result = db.prepare(`
    DELETE FROM posts
    WHERE id = ? AND user_id = ?
  `).run(postId, userId);

  if (result.changes === 0) throw new Error("Post not found");

  auditLog(userId, "delete_post", true, "post", postId);
}
