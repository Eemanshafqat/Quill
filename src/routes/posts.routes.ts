import { Router } from "express";
import { backend, NotFoundError, ForbiddenError, ValidationError, PostStatus } from "../services";
import { requireAuth } from "../middleware/auth";
import { verifyCsrfToken } from "../middleware/csrf";
import { setFlash } from "../utils/flash";
import { parseTags, validatePost, validateSchedule } from "../utils/validation";

const router = Router();
router.use(requireAuth);

function paramId(req: any): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

const VALID_STATUSES: PostStatus[] = ["draft", "published", "scheduled"];

function notFound(res: any) {
  return res.status(404).render("error", {
    title: "Post not found",
    message: "That post doesn't exist or you don't have access to it.",
  });
}

// ---- List ----
router.get("/dashboard/posts", async (req, res) => {
  const userId = req.session.userId!;
  const filter = typeof req.query.status === "string" ? req.query.status : "all";
  const status = VALID_STATUSES.includes(filter as PostStatus) ? (filter as PostStatus) : undefined;
  const posts = await backend.listPosts(userId, status);
  res.render("dashboard/posts", { posts, activeFilter: status || "all" });
});

// ---- Create ----
router.get("/dashboard/posts/new", (req, res) => {
  res.render("dashboard/post-new", {
    errors: {},
    values: { title: "", content: "", tags: "" },
  });
});

router.post("/dashboard/posts", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  const { title = "", content = "", tags = "" } = req.body;
  const errors = validatePost(title, content);
  if (Object.keys(errors).length > 0) {
    return res.status(400).render("dashboard/post-new", { errors, values: { title, content, tags } });
  }
  try {
    const post = await backend.createPost(userId, { title, content, tags: parseTags(tags) });
    setFlash(req, "success", "Post created successfully.");
    res.redirect(`/dashboard/posts/${post.id}/edit`);
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).render("dashboard/post-new", {
        errors: { [e.field || "general"]: e.message },
        values: { title, content, tags },
      });
    }
    res.status(500).render("error", { title: "Something went wrong", message: "Please try again." });
  }
});

// ---- Edit / Update ----
router.get("/dashboard/posts/:id/edit", async (req, res) => {
  const userId = req.session.userId!;
  const post = await backend.getPost(userId, paramId(req));
  if (!post) return notFound(res);
  res.render("dashboard/post-edit", {
    post,
    errors: {},
    seoErrors: {},
    values: { title: post.title, content: post.content, tags: post.tags.join(", ") },
    seoValues: {
      metaTitle: post.metaTitle || "",
      metaDescription: post.metaDescription || "",
      slug: post.slug || "",
    },
  });
});

router.post("/dashboard/posts/:id", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  const { title = "", content = "", tags = "" } = req.body;
  const existing = await backend.getPost(userId, paramId(req));
  if (!existing) return notFound(res);

  const errors = validatePost(title, content);
  if (Object.keys(errors).length > 0) {
    return res.status(400).render("dashboard/post-edit", {
      post: existing,
      errors,
      seoErrors: {},
      values: { title, content, tags },
      seoValues: {
        metaTitle: existing.metaTitle || "",
        metaDescription: existing.metaDescription || "",
        slug: existing.slug || "",
      },
    });
  }

  try {
    await backend.updatePost(userId, paramId(req), { title, content, tags: parseTags(tags) });
    setFlash(req, "success", "Post updated successfully.");
    res.redirect(`/dashboard/posts/${paramId(req)}/edit`);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return notFound(res);
    res.status(500).render("error", { title: "Something went wrong", message: "Please try again." });
  }
});

// ---- Delete ----
router.get("/dashboard/posts/:id/delete", async (req, res) => {
  const userId = req.session.userId!;
  const post = await backend.getPost(userId, paramId(req));
  if (!post) return notFound(res);
  res.render("dashboard/confirm", {
    heading: "Delete this post?",
    body: "This action cannot be undone.",
    confirmLabel: "Delete",
    dangerous: true,
    action: `/dashboard/posts/${post.id}/delete`,
    backHref: `/dashboard/posts/${post.id}/edit`,
  });
});

router.post("/dashboard/posts/:id/delete", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  try {
    await backend.deletePost(userId, paramId(req));
    setFlash(req, "success", "Post deleted successfully.");
    res.redirect("/dashboard/posts");
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return notFound(res);
    res.status(500).render("error", { title: "Something went wrong", message: "Please try again." });
  }
});

// ---- Publish now (confirmation step, then action) ----
router.get("/dashboard/posts/:id/publish", async (req, res) => {
  const userId = req.session.userId!;
  const post = await backend.getPost(userId, paramId(req));
  if (!post) return notFound(res);
  res.render("dashboard/confirm", {
    heading: "Publish this post now?",
    body: "This will make the post publicly visible.",
    confirmLabel: "Yes, Publish",
    dangerous: false,
    action: `/dashboard/posts/${post.id}/publish`,
    backHref: `/dashboard/posts/${post.id}/edit`,
  });
});

router.post("/dashboard/posts/:id/publish", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  try {
    await backend.publishPost(userId, paramId(req));
    setFlash(req, "success", "Post published successfully.");
    res.redirect(`/dashboard/posts/${paramId(req)}/edit`);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return notFound(res);
    res.status(500).render("error", { title: "Something went wrong", message: "Please try again." });
  }
});

// ---- Schedule ----
router.get("/dashboard/posts/:id/schedule", async (req, res) => {
  const userId = req.session.userId!;
  const post = await backend.getPost(userId, paramId(req));
  if (!post) return notFound(res);
  res.render("dashboard/schedule", { post, error: null, values: { date: "", time: "" } });
});

router.post("/dashboard/posts/:id/schedule", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  const post = await backend.getPost(userId, paramId(req));
  if (!post) return notFound(res);

  const { date = "", time = "" } = req.body;
  const { error, iso } = validateSchedule(date, time);
  if (error) {
    return res.status(400).render("dashboard/schedule", { post, error, values: { date, time } });
  }
  try {
    await backend.schedulePost(userId, paramId(req), iso!);
    setFlash(req, "success", "Post scheduled successfully.");
    res.redirect(`/dashboard/posts/${paramId(req)}/edit`);
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).render("dashboard/schedule", { post, error: e.message, values: { date, time } });
    }
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return notFound(res);
    res.status(500).render("error", { title: "Something went wrong", message: "Please try again." });
  }
});

// ---- Unpublish ----
router.get("/dashboard/posts/:id/unpublish", async (req, res) => {
  const userId = req.session.userId!;
  const post = await backend.getPost(userId, paramId(req));
  if (!post) return notFound(res);
  res.render("dashboard/confirm", {
    heading: "Unpublish this post?",
    body: "The post will return to draft status.",
    confirmLabel: "Yes, Unpublish",
    dangerous: false,
    action: `/dashboard/posts/${post.id}/unpublish`,
    backHref: `/dashboard/posts/${post.id}/edit`,
  });
});

router.post("/dashboard/posts/:id/unpublish", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  try {
    await backend.unpublishPost(userId, paramId(req));
    setFlash(req, "success", "Post unpublished successfully.");
    res.redirect(`/dashboard/posts/${paramId(req)}/edit`);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return notFound(res);
    res.status(500).render("error", { title: "Something went wrong", message: "Please try again." });
  }
});

// ---- SEO ----
router.post("/dashboard/posts/:id/seo", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  const post = await backend.getPost(userId, paramId(req));
  if (!post) return notFound(res);

  const { metaTitle = "", metaDescription = "", slug = "" } = req.body;
  try {
    await backend.manageSeo(userId, paramId(req), {
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      slug: slug ? slug.trim().toLowerCase() : null,
    });
    setFlash(req, "success", "SEO settings updated.");
    res.redirect(`/dashboard/posts/${paramId(req)}/edit`);
  } catch (e) {
    if (e instanceof ValidationError) {
      const refreshed = await backend.getPost(userId, paramId(req));
      return res.status(400).render("dashboard/post-edit", {
        post: refreshed,
        errors: {},
        seoErrors: { [e.field || "general"]: e.message },
        values: { title: refreshed!.title, content: refreshed!.content, tags: refreshed!.tags.join(", ") },
        seoValues: { metaTitle, metaDescription, slug },
      });
    }
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return notFound(res);
    res.status(500).render("error", { title: "Something went wrong", message: "Please try again." });
  }
});

export default router;
