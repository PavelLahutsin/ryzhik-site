import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV ?? "", process.cwd(), "");
const site = process.env.SITE || env.SITE || "https://ryzhik-site.pages.dev";

// Temporary test host: Cloudflare Pages project "ryzhik-site".
// The site is served from the domain root, so base stays "/".
// Russian pages live at the site root (prefixDefaultLocale: false).
// English is reserved: add src/pages/en/ later. There is no EN content in this version.
export default defineConfig({
  site,
  base: "/",
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
