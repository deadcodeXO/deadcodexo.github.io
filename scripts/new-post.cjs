#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "src", "data", "blog");
const DOCS_DIR = path.join(ROOT, "docs");
const DIST_DIR = path.join(ROOT, "dist");
const CONFIG_PATH = path.join(ROOT, "src", "config.ts");
const HELP_FLAGS = new Set(["-h", "--help"]);

function color(text, c) {
  return `${c}${text}${ANSI.reset}`;
}

function printBanner() {
  const top = "╔══════════════════════════════════════════════════════╗";
  const mid = "║                NEW POST CREATOR TUI                 ║";
  const bot = "╚══════════════════════════════════════════════════════╝";
  console.log(color(top, ANSI.cyan));
  console.log(color(mid, ANSI.cyan));
  console.log(color(bot, ANSI.cyan));
  console.log(
    color("Creates a post + optional GitHub Pages docs sync", ANSI.dim)
  );
  console.log("");
}

function parseConfigDefaults() {
  const defaults = {
    author: "DEADCODEXO",
    timezone: "America/Halifax",
    website: "",
  };

  if (!fs.existsSync(CONFIG_PATH)) return defaults;

  const cfg = fs.readFileSync(CONFIG_PATH, "utf8");
  const author = cfg.match(/author:\s*"([^"]+)"/);
  const timezone = cfg.match(/timezone:\s*"([^"]+)"/);
  const website = cfg.match(/website:\s*"([^"]+)"/);

  if (author) defaults.author = author[1];
  if (timezone) defaults.timezone = timezone[1];
  if (website) defaults.website = website[1];
  return defaults;
}

function slugify(input) {
  return input
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function escapeQuotes(input) {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseTags(raw) {
  const tags = raw
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : ["others"];
}

function renderTags(tags) {
  return tags.map(t => `"${escapeQuotes(t)}"`).join(", ");
}

function fileExists(slug) {
  return fs.existsSync(path.join(BLOG_DIR, `${slug}.md`));
}

function nextAvailableSlug(baseSlug) {
  let i = 2;
  let candidate = `${baseSlug}-${i}`;
  while (fileExists(candidate)) {
    i += 1;
    candidate = `${baseSlug}-${i}`;
  }
  return candidate;
}

function ensureDirs() {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }
}

function writePostFile({ slug, title, description, author, tags, draft, body }) {
  const filePath = path.join(BLOG_DIR, `${slug}.md`);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const content = `---
title: "${escapeQuotes(title)}"
description: "${escapeQuotes(description)}"
pubDatetime: ${now}
author: "${escapeQuotes(author)}"
tags: [${renderTags(tags)}]
draft: ${draft}
---

${body.trim() || "Write your post here."}
`;

  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function runCommand(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return result.status ?? 1;
}

function mirrorDistToDocsAndPreserveSiteFiles() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error("dist/ not found. Build likely failed.");
  }

  const cnamePath = path.join(DOCS_DIR, "CNAME");
  const noJekyllPath = path.join(DOCS_DIR, ".nojekyll");
  const existingCname = fs.existsSync(cnamePath)
    ? fs.readFileSync(cnamePath, "utf8").trim()
    : null;

  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }

  if (process.platform === "win32") {
    const code = spawnSync("robocopy", ["dist", "docs", "/MIR"], {
      stdio: "inherit",
      shell: true,
    }).status;

    const exitCode = code ?? 16;
    if (exitCode > 7) {
      throw new Error(`robocopy failed with exit code ${exitCode}`);
    }
  } else {
    fs.cpSync(DIST_DIR, DOCS_DIR, { recursive: true, force: true });
  }

  if (existingCname && existingCname.length > 0) {
    fs.writeFileSync(cnamePath, `${existingCname}\n`, "utf8");
  }
  fs.writeFileSync(noJekyllPath, "", "utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.some(a => HELP_FLAGS.has(a))) {
    console.log("Usage: npm run new:post");
    console.log("Interactive TUI for creating a blog post.");
    console.log("Includes optional build + dist->docs sync for GitHub Pages.");
    return;
  }

  const defaults = parseConfigDefaults();
  ensureDirs();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = question =>
    new Promise(resolve => rl.question(question, ans => resolve(ans.trim())));

  const askDefault = async (label, defaultValue) => {
    const hint = defaultValue ? color(` [${defaultValue}]`, ANSI.dim) : "";
    const val = await ask(`${color(label, ANSI.bold)}${hint}: `);
    return val || defaultValue || "";
  };

  const askYesNo = async (label, defaultYes = true) => {
    const def = defaultYes ? "Y/n" : "y/N";
    const val = (await ask(`${color(label, ANSI.bold)} ${color(`(${def})`, ANSI.dim)}: `)).toLowerCase();
    if (!val) return defaultYes;
    return val === "y" || val === "yes";
  };

  try {
    printBanner();

    let title = "";
    while (!title) {
      title = await askDefault("Post title", "");
      if (!title) console.log(color("Title is required.", ANSI.yellow));
    }

    let slug = await askDefault("Slug", slugify(title));
    while (!slug) slug = slugify(title);
    slug = slugify(slug);

    if (fileExists(slug)) {
      const auto = await askYesNo(
        `Slug "${slug}" already exists. Auto-generate next available slug?`,
        true
      );
      if (!auto) {
        throw new Error("Cancelled to avoid overwriting existing post.");
      }
      slug = nextAvailableSlug(slug);
      console.log(color(`Using slug: ${slug}`, ANSI.yellow));
    }

    let description = "";
    while (!description) {
      description = await askDefault("Description", "");
      if (!description) console.log(color("Description is required.", ANSI.yellow));
    }

    const tagsRaw = await askDefault("Tags (comma-separated)", "others");
    const tags = parseTags(tagsRaw);
    const draft = await askYesNo("Mark as draft?", false);
    const author = await askDefault("Author", defaults.author);

    console.log("");
    console.log(color("Body editor", ANSI.magenta));
    console.log(color("Enter post body. Type ::end on its own line to finish.", ANSI.dim));

    const bodyLines = [];
    while (true) {
      const line = await ask("");
      if (line === "::end") break;
      bodyLines.push(line);
    }
    const body = bodyLines.join("\n");

    const filePath = writePostFile({
      slug,
      title,
      description,
      author,
      tags,
      draft,
      body,
    });

    console.log("");
    console.log(color("Post created successfully:", ANSI.green));
    console.log(color(filePath, ANSI.cyan));

    const syncDocs = await askYesNo(
      "Run build and sync dist -> docs for GitHub Pages now?",
      true
    );

    if (syncDocs) {
      console.log("");
      console.log(color("Running build...", ANSI.cyan));
      const buildCode = runCommand("npm", ["run", "build"]);
      if (buildCode !== 0) {
        throw new Error("Build failed. docs sync aborted.");
      }

      console.log(color("Syncing dist -> docs (with CNAME/.nojekyll preservation)...", ANSI.cyan));
      mirrorDistToDocsAndPreserveSiteFiles();
      console.log(color("Docs sync complete.", ANSI.green));
    } else {
      console.log(color("Skipped docs sync.", ANSI.yellow));
    }

    console.log("");
    console.log(color("Next commands:", ANSI.bold));
    console.log("  git add src/data/blog docs package.json scripts/new-post.cjs");
    console.log(`  git commit -m "Add post: ${slug}"`);
    console.log("  git push");
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error("");
  console.error(color(`Error: ${err.message}`, ANSI.red));
  process.exit(1);
});
