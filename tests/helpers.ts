export function extractCsrf(html: string): string {
  const match = html.match(/name="_csrf" value="([a-f0-9]+)"/);
  if (!match) throw new Error("CSRF token not found in HTML:\n" + html.slice(0, 500));
  return match[1];
}
