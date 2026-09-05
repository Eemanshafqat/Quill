import { Request, Response, NextFunction } from "express";
import { backend } from "../services";

/**
 * Requires an authenticated session. The user id NEVER comes from the
 * request body/query/params — only from the server-side session — so a
 * client cannot impersonate another user by editing form data.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    return res.redirect("/login");
  }
  const user = await backend.getUserById(userId);
  if (!user) {
    // Session refers to a user that no longer exists.
    req.session.destroy(() => res.redirect("/login"));
    return;
  }
  res.locals.currentUser = user;
  next();
}

/** Redirects already-authenticated users away from signup/login. */
export function redirectIfAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }
  next();
}
