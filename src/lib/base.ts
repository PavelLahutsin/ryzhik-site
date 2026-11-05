/**
 * Prefix a site-root path with Astro's `base` (`import.meta.env.BASE_URL`).
 * Absolute http(s) URLs and protocol-relative URLs are left unchanged.
 */
export function withBase(path: string): string {
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return path;
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  if (path.startsWith("/")) return `${prefix}${path}`;
  if (path.startsWith("#")) return `${prefix}/${path}`;
  return `${prefix}/${path}`;
}
