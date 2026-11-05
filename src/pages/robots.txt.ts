import type { APIRoute } from "astro";
import { withBase } from "../lib/base";

export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? new URL(withBase("/sitemap-index.xml"), site).href : "";
  const body = [`User-agent: *`, `Allow: /`, sitemap ? `Sitemap: ${sitemap}` : ""]
    .filter(Boolean)
    .join("\n");
  return new Response(`${body}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
