// Prints the paste-ready Webflow <script> tag pinned to the current commit.
//
//   npm run tag              → tag for HEAD
//   npm run tag -- <ref>     → tag for a specific commit/branch/tag
//
// Copy the output into Webflow → Project Settings → Custom Code → Head, then
// publish. That's the whole release: no jsDelivr purge, nothing to edit in code.

import { execSync } from "node:child_process";

const OWNER = "spurwing-main";
const PROJECT = "exec-life";

const ref = process.argv[2] || execSync("git rev-parse HEAD").toString().trim();
const dirty = execSync("git status --porcelain").toString().trim();

const tag = `<script src="https://cdn.jsdelivr.net/gh/${OWNER}/${PROJECT}@${ref}/loader.js"></script>`;

console.log("\n" + tag + "\n");
if (dirty) {
  console.log("⚠️  Working tree has uncommitted changes — commit & push before this SHA is live on jsDelivr.\n");
} else {
  console.log("✓ Clean tree. Make sure this commit is pushed to GitHub, then publish Webflow.\n");
}
