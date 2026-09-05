import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Minimal CSRF protection: a per-session token is generated, exposed to
 * templates as `csrfToken`, and required to match on every state-changing
 * (POST) request. This avoids adding a heavier dependency while still
 * covering the PRD's requirement that destructive actions can't be
 * triggered by a bare GET or a cross-site form post.
 */
export function ensureCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function verifyCsrfToken(req: Request, res: Response, next: NextFunction) {
  const submitted = req.body?._csrf;
  if (!submitted || submitted !== req.session.csrfToken) {
    return res.status(403).render("error", {
      title: "Request could not be verified",
      message: "Your session may have expired. Please go back and try again.",
      currentUser: res.locals.currentUser,
    });
  }
  next();
}
