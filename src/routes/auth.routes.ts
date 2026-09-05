import { Router } from "express";
import { backend, ValidationError } from "../services";
import { validateSignup, validateLogin } from "../utils/validation";
import { setFlash } from "../utils/flash";
import { redirectIfAuthenticated } from "../middleware/auth";
import { verifyCsrfToken } from "../middleware/csrf";

const router = Router();

router.get("/signup", redirectIfAuthenticated, (req, res) => {
  res.render("auth/signup", { errors: {}, values: { email: "" } });
});

router.post("/signup", redirectIfAuthenticated, verifyCsrfToken, async (req, res) => {
  const { email = "", password = "", confirmPassword = "" } = req.body;
  const errors = validateSignup(email, password, confirmPassword);

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("auth/signup", { errors, values: { email } });
  }

  try {
    const user = await backend.signUp(email.trim().toLowerCase(), password);
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).render("auth/signup", {
          errors: { general: "Something went wrong. Please try again." },
          values: { email },
        });
      }
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      setFlash(req, "success", "Welcome to Quill! Your account has been created.");
      res.redirect("/dashboard");
    });
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).render("auth/signup", {
        errors: { [e.field || "general"]: e.message },
        values: { email },
      });
    }
    res.status(500).render("auth/signup", {
      errors: { general: "Something went wrong. Please try again." },
      values: { email },
    });
  }
});

router.get("/login", redirectIfAuthenticated, (req, res) => {
  res.render("auth/login", { error: null, values: { email: "" } });
});

router.post("/login", redirectIfAuthenticated, verifyCsrfToken, async (req, res) => {
  const { email = "", password = "" } = req.body;
  const errors = validateLogin(email, password);
  if (Object.keys(errors).length > 0) {
    return res.status(400).render("auth/login", {
      error: "Invalid email or password.",
      values: { email },
    });
  }

  try {
    const user = await backend.verifyCredentials(email.trim().toLowerCase(), password);
    if (!user) {
      // Deliberately generic: never reveal whether the email exists.
      return res.status(401).render("auth/login", {
        error: "Invalid email or password.",
        values: { email },
      });
    }
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).render("auth/login", {
          error: "Something went wrong. Please try again.",
          values: { email },
        });
      }
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      res.redirect("/dashboard");
    });
  } catch {
    res.status(500).render("auth/login", {
      error: "Something went wrong. Please try again.",
      values: { email },
    });
  }
});

router.post("/logout", verifyCsrfToken, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
