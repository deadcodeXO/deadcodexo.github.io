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

function ensureParentDirectory(filePath) {
  const parent = path.dirname(filePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function copyPayloadFileIfMissing({ workspaceRoot, sourceRelativePath, targetRelativePath, log }) {
  const sourcePath = path.join(PAYLOAD_ROOT, sourceRelativePath);
  const targetPath = path.join(workspaceRoot, targetRelativePath);

  if (!existsSync(sourcePath)) {
    throw new Error(`Provisioning payload is missing "${sourceRelativePath}".`);
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
    throw new Error(`Provision payload root not found at "${PAYLOAD_ROOT}".`);
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

