import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV ?? "", process.cwd(), "");
const site = process.env.SITE || env.SITE || "https://pavellahutsin.github.io";

// Published on GitHub Pages: https://pavellahutsin.github.io/ryzhik-site/
// Russian pages live at the site root (prefixDefaultLocale: false).
// English is reserved: add src/pages/en/ later. There is no EN content in this version.
export default defineConfig({
  site,
  base: "/ryzhik-site",
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
