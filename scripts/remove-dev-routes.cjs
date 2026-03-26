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

const sitemapPath = path.join(distDir, "sitemap-0.xml");
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, "utf8");
  const cleaned = xml.replace(
    /<url><loc>[^<]*\/(?:editor|edit|admin)\/?<\/loc><\/url>/g,
    ""
  );

  if (cleaned !== xml) {
    fs.writeFileSync(sitemapPath, cleaned, "utf8");
    console.log("[remove-dev-routes] removed dev routes from sitemap-0.xml");
  }
}
