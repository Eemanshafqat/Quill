import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Renders Markdown to HTML for preview purposes and strips any dangerous
 * markup, so user-authored Markdown (which may contain raw HTML) can never
 * be used for stored XSS when displayed in the dashboard (e.g. a live
 * preview). The MCP/public-site rendering pipeline (Person 4) may apply its
 * own sanitization independently; this is the dashboard's own safety net.
 */
export function renderMarkdownSafe(markdown: string): string {
  const rawHtml = marked.parse(markdown || "", { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title"],
      a: ["href", "name", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}
