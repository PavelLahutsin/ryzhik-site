import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV ?? "", process.cwd(), "");
const site = process.env.SITE || env.SITE || "https://ryzhik-site.pages.dev";

function siteBase(value) {
  const raw = (value || "/").trim();
  if (!raw || raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

// Default build is the Cloudflare Pages root (https://ryzhik-site.pages.dev/).
// GitHub Pages sets SITE and BASE_PATH in .github/workflows/deploy.yml.
const base = siteBase(process.env.BASE_PATH || env.BASE_PATH);

// Russian pages live at the site root (prefixDefaultLocale: false).
// English is reserved: add src/pages/en/ later. There is no EN content in this version.
export default defineConfig({
  site,
  base,
  output: "static",
  i18n: {
    defaultLocale: "ru",
    locales: ["ru", "en"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/404") && !page.includes("/privacy"),
    }),
  ],
  image: {
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com" }],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
