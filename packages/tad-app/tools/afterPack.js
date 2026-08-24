const path = require("path");
const fs = require("fs");

// Local monorepo packages that may have nested symlinks to reltab.
// asar doesn't support symlinks, so electron-builder resolves them into
// duplicate copies, causing multiple reltab instances (provider not found).
// This hook removes nested node_modules before packaging.
const localPackages = [
  "reltab-fs",
  "aggtree",
  "reltab-duckdb",
  "reltab-bigquery",
  "reltab-sqlite",
  "reltab-aws-athena",
  "reltab-snowflake",
  "tadviewer",
  "tadweb-app",
  "tadweb-server",
];

async function beforePack(context) {
  const projectDir = context.packager.projectDir;
  const nodeModulesDir = path.join(projectDir, "node_modules");

  for (const pkg of localPackages) {
    const nestedNm = path.join(nodeModulesDir, pkg, "node_modules");
    if (fs.existsSync(nestedNm)) {
      console.log(`beforePack: removing ${pkg}/node_modules (nested reltab symlinks)`);
      fs.rmSync(nestedNm, { recursive: true, force: true });
    }
  }
}

exports.default = beforePack;
