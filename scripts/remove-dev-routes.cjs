const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(process.cwd(), "dist");
const devOnlyRoutes = ["editor", "edit", "admin"];

for (const route of devOnlyRoutes) {
  const routePath = path.join(distDir, route);
  if (fs.existsSync(routePath)) {
    fs.rmSync(routePath, { recursive: true, force: true });
    console.log(`[remove-dev-routes] removed ${routePath}`);
  }
}
