const fs = require("node:fs");
const path = require("node:path");

// Keep the workspace deterministic on Windows and Unix: pnpm is the supported installer.
for (const name of ["package-lock.json", "yarn.lock"]) {
  try { fs.rmSync(path.resolve(process.cwd(), name), { force: true }); }
  catch (error) { console.error(`Unable to remove ${name}:`, error); process.exit(1); }
}
const agent = process.env.npm_config_user_agent || "";
if (!agent.startsWith("pnpm/")) {
  console.error("Use pnpm install at the workspace root (Corepack is recommended). npm/yarn workspaces are not supported here.");
  process.exit(1);
}
