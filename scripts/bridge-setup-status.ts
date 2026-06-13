import { getBridgeSetupStatus } from "../src/bridge-setup.js";

const checkBridge = process.argv.includes("--check-bridge");
const result = await getBridgeSetupStatus(checkBridge);

console.log(JSON.stringify(result, null, 2));
