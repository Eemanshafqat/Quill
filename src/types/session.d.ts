import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userEmail?: string;
    csrfToken?: string;
    flash?: { type: "success" | "error"; message: string }[];
  }
}
