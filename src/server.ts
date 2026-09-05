import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "path";
import { consumeFlash } from "./utils/flash";
import { ensureCsrfToken } from "./middleware/csrf";
import { renderMarkdownSafe } from "./utils/markdown";

import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import postsRoutes from "./routes/posts.routes";
import accountRoutes from "./routes/account.routes";

export function createApp() {
  const app = express();

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use(
    session({
      name: "quill.sid",
      secret: process.env.SESSION_SECRET || "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    })
  );

  app.use(ensureCsrfToken);

  // Expose shared template helpers/data on every render.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.flash = consumeFlash(req);
    res.locals.currentUser = req.session.userId
      ? { id: req.session.userId, email: req.session.userEmail }
      : null;
    res.locals.renderMarkdown = renderMarkdownSafe;
    res.locals.path = req.path;
    next();
  });

  app.get("/", (req, res) => {
    res.redirect(req.session.userId ? "/dashboard" : "/login");
  });

  app.use(authRoutes);
  app.use(dashboardRoutes);
  app.use(postsRoutes);
  app.use(accountRoutes);

  // 404
  app.use((req: Request, res: Response) => {
    res.status(404).render("error", { title: "Page not found", message: "We couldn't find that page." });
  });

  // Central error handler — never leak internals.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("[dashboard error]", err?.message || err);
    res.status(500).render("error", {
      title: "Something went wrong",
      message: "Please try again in a moment.",
    });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Quill dashboard listening on http://localhost:${port}`);
  });
}
