// @ts-check
import { readFileSync, readdirSync } from "node:fs";
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import rehypeExternalLinks from "rehype-external-links";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeFigure from "rehype-figure";
import mermaid from "astro-mermaid";

// Content dates are dd-MM-yyyy.
const parseDayMonthYear = (value) => {
  const [day, month, year] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const lastmodByPath = (() => {
  const map = new Map();

  const projects = JSON.parse(readFileSync(new URL("./src/project-config.json", import.meta.url), "utf8"));
  for (const project of projects) {
    map.set(`/project/${project.id}/`, parseDayMonthYear(project.data.date));
  }

  const blogDir = new URL("./src/content/blog/", import.meta.url);
  for (const file of readdirSync(blogDir)) {
    if (!file.endsWith(".md")) continue;
    const match = readFileSync(new URL(file, blogDir), "utf8").match(/^date:\s*"?(.{2}-.{2}-.{4})"?/m);
    if (match) map.set(`/blog/${file.replace(/\.md$/, "")}/`, parseDayMonthYear(match[1]));
  }

  return map;
})();

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },

  integrations: [
    mermaid({
      theme: "neutral",
      autoTheme: true,
    }),
    react(),
    sitemap({
      filter: (page) => !["/resume", "/404", "/404.html"].includes(new URL(page).pathname.replace(/\/$/, "")),
      serialize: (item) => {
        const lastmod = lastmodByPath.get(new URL(item.url).pathname);
        // Google ignores a lastmod that post-dates the present.
        return lastmod && lastmod.getTime() <= Date.now() ? { ...item, lastmod } : item;
      },
    }),
  ],

  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      wrap: true,
    },
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeExternalLinks, { target: "_blank", rel: ["nofollow", "noopener", "noreferrer"] }], rehypeKatex, rehypeFigure],
  },

  vite: {
    plugins: [tailwindcss()],
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },

  site: "https://pages.yanouk.dev",
});
