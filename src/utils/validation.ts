const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

export function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 30)
    .slice(0, 10);
}

export interface FieldErrors {
  [field: string]: string;
}

export function validateSignup(email: string, password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email?.trim()) errors.email = "Email is required.";
  else if (!isValidEmail(email)) errors.email = "Please enter a valid email address.";
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

export function validateLogin(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email?.trim()) errors.email = "Email is required.";
  if (!password) errors.password = "Password is required.";
  return errors;
}

export function validatePost(title: string, content: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!title?.trim()) errors.title = "Title is required.";
  else if (title.length > 200) errors.title = "Title must be 200 characters or fewer.";
  if (!content?.trim()) errors.content = "Content is required.";
  else if (content.length > 200_000) errors.content = "Content is too large.";
  return errors;
}

export function validateSchedule(date: string, time: string): { error?: string; iso?: string } {
  if (!date || !time) return { error: "Please choose both a date and a time." };
  const iso = `${date}T${time}:00`;
  const when = new Date(iso);
  if (isNaN(when.getTime())) return { error: "Please enter a valid date and time." };
  if (when.getTime() <= Date.now()) return { error: "Scheduled time must be in the future." };
  return { iso: when.toISOString() };
}
