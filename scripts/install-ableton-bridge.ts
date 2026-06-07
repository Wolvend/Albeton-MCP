import { installBridgeFiles } from "../src/bridge-install.js";

const dryRun = !process.argv.includes("--yes");
const result = await installBridgeFiles({ dryRun });

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
