import { defineConfig, envField, fontProviders } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import { SITE } from "./src/config";

const isCompanionLaunch = process.env.DCX_COMPANION === "1";
const isDevToolbarEnabled = SITE.devToolbar.enabled && !isCompanionLaunch;

// https://astro.build/config
export default defineConfig({
  site: SITE.website,
  devToolbar: {
    enabled: isDevToolbarEnabled,
  },
  integrations: [
    mdx({
      extendMarkdownConfig: true,
    }),
    sitemap({
      filter: page => {
        const normalized = page.endsWith("/") ? page.slice(0, -1) : page;

        if (
          normalized.endsWith("/admin") ||
          normalized.endsWith("/editor") ||
          normalized.endsWith("/edit")
        ) {
          return false;
        }

        if (!SITE.showArchives && normalized.endsWith("/archives")) {
          return false;
        }

        return true;
      },
    }),
  ],
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
    shikiConfig: {
      // For more themes, visit https://shiki.style/themes
      themes: { light: "min-light", dark: "github-dark-default" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@resvg/resvg-js"],
    },
  },
  image: {
    responsiveStyles: true,
    layout: "constrained",
  },
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },

  fonts: [
    {
      name: "Wotfard",
      cssVariable: "--font-wotfard",
      fallbacks: ["sans-serif"],
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/wotfard.woff2"],
          },
        ],
      },
    },
    {
      name: "Sriracha",
      cssVariable: "--font-sriracha",
      fallbacks: ["cursive"],
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/sriracha.woff2"],
          },
        ],
      },
    },
    {
  name: "Fira Code",
  cssVariable: "--font-firacode",
  fallbacks: ["monospace"],
  provider: fontProviders.local(),
  options: {
    variants: [
      {
        src: ["./src/assets/fonts/firacode.woff2"],
      },
    ],
  },
},
    {
      name: "Cascadia Code",
      cssVariable: "--font-cascadia-code",
      fallbacks: ["monospace"],
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/cascadia-code.woff2"],
          },
        ],
      },
    },
  ],
});
