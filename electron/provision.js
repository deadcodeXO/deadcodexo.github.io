import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROVISION_VERSION = "1.0.0";
const PROVISION_STATE_PATH = path.join(".dcx", "provision-state.json");
const PAYLOAD_ROOT = path.join(__dirname, "payload");

const PAYLOAD_ENTRIES = [
  {
    source: path.join("src", "pages", "editor.astro"),
    target: path.join("src", "pages", "editor.astro"),
  },
  {
    source: path.join("src", "pages", "admin.astro"),
    target: path.join("src", "pages", "admin.astro"),
  },
  {
    source: path.join("public", "admin", "config.yml"),
    target: path.join("public", "admin", "config.yml"),
  },
  {
    source: path.join("public", "admin", "custom.css"),
    target: path.join("public", "admin", "custom.css"),
  },
  {
    source: path.join("scripts", "remove-dev-routes.cjs"),
    target: path.join("scripts", "remove-dev-routes.cjs"),
  },
];

const FALLBACK_PAYLOAD_CONTENTS = new Map([
  [
    "scripts/remove-dev-routes.cjs",
    `const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(process.cwd(), "dist");
const devOnlyRoutes = ["editor", "edit", "admin"];

for (const route of devOnlyRoutes) {
  const routePath = path.join(distDir, route);
  if (fs.existsSync(routePath)) {
    fs.rmSync(routePath, { recursive: true, force: true });
    console.log(\`[remove-dev-routes] removed \${routePath}\`);
  }
}

const sitemapPath = path.join(distDir, "sitemap-0.xml");
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, "utf8");
  const cleaned = xml.replace(
    /<url><loc>[^<]*\\/(?:editor|edit|admin)\\/?<\\/loc><\\/url>/g,
    ""
  );

  if (cleaned !== xml) {
    fs.writeFileSync(sitemapPath, cleaned, "utf8");
    console.log("[remove-dev-routes] removed dev routes from sitemap-0.xml");
  }
}
`,
  ],
]);

function normalizeRelativePath(relativePath) {
  return relativePath.replaceAll("\\", "/");
}

function getFallbackPayloadContents(sourceRelativePath, targetRelativePath) {
  return (
    FALLBACK_PAYLOAD_CONTENTS.get(normalizeRelativePath(sourceRelativePath)) ??
    FALLBACK_PAYLOAD_CONTENTS.get(normalizeRelativePath(targetRelativePath)) ??
    null
  );
}

function ensureParentDirectory(filePath) {
  const parent = path.dirname(filePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function copyPayloadFileIfMissing({ workspaceRoot, sourceRelativePath, targetRelativePath, log }) {
  const sourcePath = path.join(PAYLOAD_ROOT, sourceRelativePath);
  const targetPath = path.join(workspaceRoot, targetRelativePath);
  const fallbackContents = getFallbackPayloadContents(
    sourceRelativePath,
    targetRelativePath
  );

  if (!existsSync(sourcePath)) {
    if (fallbackContents && !existsSync(targetPath)) {
      ensureParentDirectory(targetPath);
      writeFileSync(targetPath, fallbackContents, "utf8");
      log(
        `Provisioned missing file from embedded fallback: ${targetRelativePath}`
      );
      return { action: "created", targetRelativePath };
    }

    if (existsSync(targetPath)) {
      log(
        `Payload missing "${sourceRelativePath}", but target already exists. Skipping ${targetRelativePath}.`
      );
      return { action: "skipped", targetRelativePath };
    }

    throw new Error(
      `Provisioning payload is missing "${sourceRelativePath}", and target "${targetRelativePath}" does not exist.`
    );
  }

  if (existsSync(targetPath)) {
    return { action: "skipped", targetRelativePath };
  }

  ensureParentDirectory(targetPath);
  const contents = readFileSync(sourcePath);
  writeFileSync(targetPath, contents);
  log(`Provisioned missing file: ${targetRelativePath}`);
  return { action: "created", targetRelativePath };
}

function writeProvisionState({ workspaceRoot, summary, log }) {
  const statePath = path.join(workspaceRoot, PROVISION_STATE_PATH);
  ensureParentDirectory(statePath);

  const state = {
    version: PROVISION_VERSION,
    updatedAt: new Date().toISOString(),
    managedFiles: PAYLOAD_ENTRIES.map(entry => entry.target.replaceAll("\\", "/")),
    created: summary.created,
    skipped: summary.skipped,
  };

  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  log(`Provision state updated: ${PROVISION_STATE_PATH}`);
}

export function provisionWorkspaceFromPayload({ workspaceRoot, log = () => {} }) {
  if (!existsSync(PAYLOAD_ROOT)) {
    let created = 0;
    let skipped = 0;
    const missingTargets = [];

    for (const entry of PAYLOAD_ENTRIES) {
      const targetPath = path.join(workspaceRoot, entry.target);
      if (existsSync(targetPath)) {
        skipped += 1;
        continue;
      }

      const fallbackContents = getFallbackPayloadContents(entry.source, entry.target);
      if (!fallbackContents) {
        missingTargets.push(entry.target);
        continue;
      }

      ensureParentDirectory(targetPath);
      writeFileSync(targetPath, fallbackContents, "utf8");
      created += 1;
      log(`Provisioned missing file from embedded fallback: ${entry.target}`);
    }

    if (missingTargets.length) {
      throw new Error(
        `Provision payload root not found at "${PAYLOAD_ROOT}", and required files are missing: ${missingTargets.join(", ")}`
      );
    }

    const summary = { created, skipped };
    writeProvisionState({ workspaceRoot, summary, log });
    log(`Provision payload root missing, but fallback provisioning succeeded.`);
    log(`Provisioning summary: created=${String(created)} skipped=${String(skipped)}`);
    return summary;
  }

  let created = 0;
  let skipped = 0;

  for (const entry of PAYLOAD_ENTRIES) {
    const result = copyPayloadFileIfMissing({
      workspaceRoot,
      sourceRelativePath: entry.source,
      targetRelativePath: entry.target,
      log,
    });

    if (result.action === "created") {
      created += 1;
    } else {
      skipped += 1;
    }
  }

  const missingTargets = PAYLOAD_ENTRIES.map(entry => entry.target).filter(
    relativePath => !existsSync(path.join(workspaceRoot, relativePath))
  );

  if (missingTargets.length) {
    throw new Error(
      `Provisioning did not complete; required files are still missing: ${missingTargets.join(", ")}`
    );
  }

  const summary = { created, skipped };
  writeProvisionState({ workspaceRoot, summary, log });
  log(`Provisioning summary: created=${String(created)} skipped=${String(skipped)}`);
  return summary;
}
