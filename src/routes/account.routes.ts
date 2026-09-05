import { Router } from "express";
import { backend } from "../services";
import { requireAuth } from "../middleware/auth";
import { verifyCsrfToken } from "../middleware/csrf";
import { setFlash } from "../utils/flash";

const router = Router();
router.use(requireAuth);

// ---- Analytics (display-only; Person 4 owns collection/aggregation) ----
router.get("/dashboard/analytics", async (req, res) => {
  const userId = req.session.userId!;
  const range = typeof req.query.range === "string" ? req.query.range : "7d";
  const summary = await backend.getAnalytics(userId, { range });
  res.render("dashboard/analytics", { summary, range });
});

// ---- Account ----
router.get("/dashboard/account", async (req, res) => {
  const userId = req.session.userId!;
  const user = await backend.getUserById(userId);
  const maskedKey = await backend.getMaskedApiKey(userId);
  res.render("dashboard/account", {
    user,
    maskedKey,
    newPlaintextKey: null,
  });
});

router.get("/dashboard/account/api-key/rotate", (req, res) => {
  res.render("dashboard/confirm", {
    heading: "Rotate API key?",
    body: "Any existing MCP connection using the current key will stop working.",
    confirmLabel: "Yes, Rotate",
    dangerous: true,
    action: "/dashboard/account/api-key/rotate",
    backHref: "/dashboard/account",
  });
});

router.post("/dashboard/account/api-key/rotate", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  try {
    const result = await backend.rotateApiKey(userId);
    const user = await backend.getUserById(userId);
    // Shown exactly once, never persisted server-side beyond this response,
    // never logged, never put in a URL.
    res.render("dashboard/account", {
      user,
      maskedKey: result.maskedKey,
      newPlaintextKey: result.plaintextKey,
    });
  } catch {
    setFlash(req, "error", "Something went wrong. Please try again.");
    res.redirect("/dashboard/account");
  }
});

router.get("/dashboard/account/api-key/revoke", (req, res) => {
  res.render("dashboard/confirm", {
    heading: "Revoke API key?",
    body: "Your MCP server connection will stop working until a new key is generated.",
    confirmLabel: "Yes, Revoke",
    dangerous: true,
    action: "/dashboard/account/api-key/revoke",
    backHref: "/dashboard/account",
  });
});

router.post("/dashboard/account/api-key/revoke", verifyCsrfToken, async (req, res) => {
  const userId = req.session.userId!;
  try {
    await backend.revokeApiKey(userId);
    setFlash(req, "success", "API key revoked successfully.");
  } catch {
    setFlash(req, "error", "Something went wrong. Please try again.");
  }
  res.redirect("/dashboard/account");
});

export default router;
