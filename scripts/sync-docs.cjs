#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");
const docsDir = path.join(repoRoot, "docs");
const repoCnamePath = path.join(repoRoot, "CNAME");
const cnamePath = path.join(docsDir, "CNAME");
const nojekyllPath = path.join(docsDir, ".nojekyll");

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

if (!fs.existsSync(distDir)) {
  process.stderr.write("dist/ not found. Run `npm run build` first.\n");
  process.exit(1);
}

const savedCname = fs.existsSync(cnamePath) ? fs.readFileSync(cnamePath, "utf8") : null;
const rootCname = fs.existsSync(repoCnamePath) ? fs.readFileSync(repoCnamePath, "utf8") : null;

log("Syncing dist/ -> docs/ ...");
fs.rmSync(docsDir, { recursive: true, force: true });
fs.mkdirSync(docsDir, { recursive: true });
fs.cpSync(distDir, docsDir, { recursive: true });

const cnameToWrite = savedCname ?? rootCname;
if (cnameToWrite !== null) {
  fs.writeFileSync(cnamePath, cnameToWrite, "utf8");
  log("Restored docs/CNAME");
}

fs.writeFileSync(nojekyllPath, "");
log("Ensured docs/.nojekyll");
log("Done.");
