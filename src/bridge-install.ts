import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_PATHS } from "./config.js";
import { redactPath } from "./security.js";

const bridgeFiles = [
  "Ableton MCP Bridge.amxd",
  "ableton-mcp-http.js",
  "ableton-mcp-liveapi.js",
  "ableton-mcp-status.js",
  "package.json"
] as const;

export type BridgeInstallOptions = {
  dryRun?: boolean;
  targetDir?: string;
};

export function bridgeSourceDir() {
  return path.join(LOCAL_PATHS.projectRoot, "bridge", "max-for-live");
}

export function defaultBridgePresetDir() {
  return path.join(LOCAL_PATHS.userLibrary, "Presets", "MIDI Effects", "Max MIDI Effect");
}

async function fileDigest(filePath: string) {
  try {
    const [stat, data] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)]);
    return {
      exists: true,
      size: stat.size,
      sha256: createHash("sha256").update(data).digest("hex")
    };
  } catch {
    return {
      exists: false,
      size: 0,
      sha256: null
    };
  }
}

export async function getBridgeInstallPlan(options: BridgeInstallOptions = {}) {
  const sourceDir = bridgeSourceDir();
  const targetDir = path.resolve(options.targetDir ?? defaultBridgePresetDir());
  const files = bridgeFiles.map((fileName) => ({
    fileName,
    source: path.join(sourceDir, fileName),
    target: path.join(targetDir, fileName)
  }));
  const sourceChecks = await Promise.all(files.map(async (file) => {
    try {
      const stat = await fs.stat(file.source);
      return { ...file, exists: true, size: stat.size };
    } catch {
      return { ...file, exists: false, size: 0 };
    }
  }));
  return {
    sourceDir,
    targetDir,
    redactedTargetDir: redactPath(targetDir),
    files: sourceChecks,
    missingSources: sourceChecks.filter((file) => !file.exists).map((file) => file.fileName),
    dryRun: options.dryRun !== false
  };
}

export async function getBridgeInstallStatus(options: BridgeInstallOptions = {}) {
  const plan = await getBridgeInstallPlan({ ...options, dryRun: true });
  const files = await Promise.all(plan.files.map(async (file) => {
    const [source, target] = await Promise.all([fileDigest(file.source), fileDigest(file.target)]);
    return {
      fileName: file.fileName,
      source: {
        path: redactPath(file.source),
        ...source
      },
      target: {
        path: redactPath(file.target),
        ...target
      },
      sourceMatchesTarget: source.exists && target.exists && source.sha256 === target.sha256
    };
  }));
  const missingSources = files.filter((file) => !file.source.exists).map((file) => file.fileName);
  const missingTargets = files.filter((file) => !file.target.exists).map((file) => file.fileName);
  const mismatchedTargets = files
    .filter((file) => file.source.exists && file.target.exists && !file.sourceMatchesTarget)
    .map((file) => file.fileName);
  const ready = missingSources.length === 0 && missingTargets.length === 0 && mismatchedTargets.length === 0;
  return {
    ok: true,
    ready,
    status: ready
      ? "installed_current"
      : missingSources.length > 0
        ? "missing_source_files"
        : missingTargets.length > 0
          ? "not_installed"
          : "installed_stale",
    sourceDir: redactPath(plan.sourceDir),
    targetDir: plan.redactedTargetDir,
    files,
    missingSources,
    missingTargets,
    mismatchedTargets,
    nextSteps: ready
      ? [
        "Open Ableton Live.",
        "Load Ableton MCP Bridge from User Library > Presets > MIDI Effects > Max MIDI Effect.",
        "Run ableton_bridge_setup_status with check_bridge=true or run live-smoke."
      ]
      : [
        "Run npm run build.",
        "Run npm run bridge:install or .\\launch.ps1 install.",
        "Recheck ableton_bridge_setup_status."
      ]
  };
}

export async function installBridgeFiles(options: BridgeInstallOptions = {}) {
  const dryRun = options.dryRun !== false;
  const plan = await getBridgeInstallPlan({ ...options, dryRun });
  if (plan.missingSources.length) {
    return {
      ok: false,
      dryRun,
      plan,
      error: `Missing bridge source files: ${plan.missingSources.join(", ")}`
    };
  }
  if (dryRun) {
    return {
      ok: true,
      dryRun,
      plan,
      nextStep: "Run with dry_run=false or npm run bridge:install to copy bridge files into the Ableton User Library preset folder."
    };
  }

  await fs.mkdir(plan.targetDir, { recursive: true });
  const copied = [];
  for (const file of plan.files) {
    await fs.copyFile(file.source, file.target);
    const stat = await fs.stat(file.target);
    copied.push({
      fileName: file.fileName,
      target: file.target,
      redactedTarget: redactPath(file.target),
      size: stat.size
    });
  }
  return {
    ok: true,
    dryRun,
    targetDir: plan.targetDir,
    redactedTargetDir: plan.redactedTargetDir,
    copied,
    nextSteps: [
      "Open Ableton Live.",
      "Load the saved Ableton MCP Bridge.amxd preset or add a Max MIDI Effect and load ableton-mcp-bridge.maxpat.",
      "Confirm Max Console reports: Ableton MCP HTTP bridge listening on 127.0.0.1:17364.",
      "Run ableton_bridge_ping."
    ]
  };
}
