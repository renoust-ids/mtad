/**
 * updater.ts
 *
 * Soft check-for-updates: asks the GitHub API about the latest published
 * release and, if a newer version exists, offers to open the release page.
 * It does NOT download or install anything.
 */
import { dialog, shell, BrowserWindow, MenuItem } from "electron";
import pkgInfo from "../package.json";

const REPO_OWNER = "renoust-ids";
const REPO_NAME = "mtad";
const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;
const LATEST_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

let updater: MenuItem | null = null;

// Compare two dotted version strings, e.g. "0.0.10" > "0.0.9". Non-numeric
// segments are ignored.
const versionGreater = (a: string, b: string): boolean => {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
};

const reenable = () => {
  if (updater) {
    updater.enabled = true;
    updater = null;
  }
};

const openReleasePage = () => {
  shell.openExternal(RELEASES_URL);
};

export async function checkForUpdates(
  menuItem: MenuItem,
  _focusedWindow: BrowserWindow | undefined
): Promise<void> {
  updater = menuItem;
  updater.enabled = false;

  let latestTag: string | null = null;
  try {
    const res = await fetch(LATEST_API_URL, {
      headers: { "User-Agent": `${REPO_NAME}-updater`, Accept: "application/vnd.github+json" },
    });
    // A 404 means no published "latest" release yet — treat as up-to-date.
    if (res.ok) {
      const data: any = await res.json();
      latestTag = data?.tag_name ?? null;
    } else {
      console.warn(`updater: GitHub API returned ${res.status}`);
    }
  } catch (e) {
    console.warn("updater: failed to reach GitHub API", e);
    dialog.showMessageBox({
      type: "warning",
      title: "Check for Updates",
      message: "Couldn't check for updates right now.",
      detail: "Please check your internet connection and try again later.",
      buttons: ["OK"],
      noLink: true,
    });
    reenable();
    return;
  }

  const current = pkgInfo.version;
  if (latestTag !== null && versionGreater(latestTag, current)) {
    const buttonIndex = dialog.showMessageBoxSync({
      type: "info",
      title: "Update Available",
      message: `A new version of ${REPO_NAME} is available.`,
      detail: `You are running v${current}. The latest release is ${latestTag}.`,
      buttons: ["Go to Release Page", "Not Now"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (buttonIndex === 0) {
      openReleasePage();
    }
  } else {
    dialog.showMessageBoxSync({
      type: "info",
      title: "Check for Updates",
      message: `You are up to date.`,
      detail: `You are running the latest version (v${current}).`,
      buttons: ["OK"],
      noLink: true,
    });
  }
  reenable();
}
