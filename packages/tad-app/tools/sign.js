const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

async function afterPack(context) {
  const { appOutDir, packager } = context;

  if (packager.platform.name !== "mac") return;

  // Find the .app bundle
  const entries = fs.readdirSync(appOutDir);
  const appDir = entries.find((e) => e.endsWith(".app"));
  if (!appDir) {
    console.log("afterPack: no .app bundle found in", appOutDir);
    return;
  }

  const appPath = path.join(appOutDir, appDir);
  console.log(`afterPack: ad-hoc signing ${appPath}`);

  try {
    execSync(
      `codesign --force --deep --sign - "${appPath}"`,
      { stdio: "inherit" }
    );
    console.log("afterPack: ad-hoc signing complete");
  } catch (err) {
    console.error("afterPack: ad-hoc signing failed:", err.message);
  }
}

exports.default = afterPack;
