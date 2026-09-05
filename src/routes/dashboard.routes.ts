import { Router } from "express";
import { backend } from "../services";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/dashboard", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const [counts, posts] = await Promise.all([
    backend.getPostCounts(userId),
    backend.listPosts(userId),
  ]);
  res.render("dashboard/index", {
    counts,
    recentPosts: posts.slice(0, 5),
  });
});

export default router;
