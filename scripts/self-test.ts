import { registeredToolNames } from "../src/tools.js";

if (registeredToolNames.length < 80) {
  throw new Error(`Expected at least 80 tools, got ${registeredToolNames.length}`);
}

console.log(JSON.stringify({ ok: true, toolCount: registeredToolNames.length }, null, 2));
