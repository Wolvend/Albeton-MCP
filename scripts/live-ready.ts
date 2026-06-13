#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { openBridgeDevice } from "../src/bridge-activation.js";
import { getBridgeSetupStatus } from "../src/bridge-setup.js";
import { LOCAL_PATHS, PLATFORM } from "../src/config.js";

type LiveReadyOptions = {
  launchLive: boolean;
  openBridge: boolean;
  yes: boolean;
  waitSeconds: number;
};

function readOptions(argv: string[]): LiveReadyOptions {
  const waitIndex = argv.indexOf("--wait-seconds");
  const waitSeconds = waitIndex >= 0 && argv[waitIndex + 1]
    ? Number(argv[waitIndex + 1])
    : 45;
  return {
    launchLive: argv.includes("--launch-live"),
    openBridge: argv.includes("--open-bridge-device"),
    yes: argv.includes("--yes"),
    waitSeconds: Number.isFinite(waitSeconds) ? Math.max(0, Math.min(300, waitSeconds)) : 45
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executableExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForLiveProcess(waitSeconds: number) {
  const startedAt = Date.now();
  let latest = await getBridgeSetupStatus(false);
  while (!latest.live.running && Date.now() - startedAt < waitSeconds * 1000) {
    await sleep(2000);
    latest = await getBridgeSetupStatus(false);
  }
  return latest;
}

async function waitForBridge(waitSeconds: number) {
  const startedAt = Date.now();
  let latest = await getBridgeSetupStatus(true);
  while (latest.bridge.reachable !== true && Date.now() - startedAt < waitSeconds * 1000) {
    await sleep(2000);
    latest = await getBridgeSetupStatus(true);
  }
  return latest;
}

async function launchLiveIfRequested(options: LiveReadyOptions, initial: Awaited<ReturnType<typeof getBridgeSetupStatus>>) {
  if (!options.launchLive) {
    return {
      requested: false,
      attempted: false,
      skippedReason: "Use --launch-live --yes or .\\launch.ps1 live-ready -StartLive to start Ableton Live from this workflow."
    };
  }
  if (!options.yes) {
    return {
      requested: true,
      attempted: false,
      skippedReason: "--launch-live requires --yes so scripts cannot open Ableton by accident."
    };
  }
  if (initial.live.running) {
    return {
      requested: true,
      attempted: false,
      skippedReason: "Ableton Live is already running."
    };
  }
  if (!LOCAL_PATHS.liveExecutable || !(await executableExists(LOCAL_PATHS.liveExecutable))) {
    return {
      requested: true,
      attempted: false,
      skippedReason: "Ableton Live executable was not found.",
      executable: LOCAL_PATHS.liveExecutable || null
    };
  }

  const child = spawn(LOCAL_PATHS.liveExecutable, [], {
    detached: true,
    stdio: "ignore",
    env: {
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH
    }
  });
  child.unref();
  await waitForLiveProcess(options.waitSeconds);

  return {
    requested: true,
    attempted: true,
    executable: LOCAL_PATHS.liveExecutable,
    processId: child.pid ?? null,
    waitSeconds: options.waitSeconds
  };
}

async function openBridgeIfRequested(options: LiveReadyOptions, latest: Awaited<ReturnType<typeof getBridgeSetupStatus>>) {
  if (!options.openBridge) {
    return {
      requested: false,
      attempted: false,
      skippedReason: "Use --open-bridge-device --yes or .\\launch.ps1 live-ready -OpenBridge to ask Ableton to load the bridge preset."
    };
  }
  if (!options.yes) {
    return {
      requested: true,
      attempted: false,
      skippedReason: "--open-bridge-device requires --yes so scripts cannot alter the current Live set by accident."
    };
  }
  if (!latest.live.running) {
    return {
      requested: true,
      attempted: false,
      skippedReason: "Ableton Live is not running. Use -StartLive with -OpenBridge or start Ableton first."
    };
  }
  if (latest.bridge.reachable === true) {
    return {
      requested: true,
      attempted: false,
      skippedReason: "Bridge listener is already reachable."
    };
  }

  const opened = await openBridgeDevice({ dryRun: false });
  await waitForBridge(options.waitSeconds);
  return {
    requested: true,
    attempted: opened.ok,
    ...opened,
    waitSeconds: options.waitSeconds
  };
}

export async function buildLiveReadyReport(options: LiveReadyOptions) {
  const initial = await getBridgeSetupStatus(true);
  const launch = await launchLiveIfRequested(options, initial);
  const afterLaunch = await getBridgeSetupStatus(true);
  const bridgeOpen = await openBridgeIfRequested(options, afterLaunch);
  const final = await getBridgeSetupStatus(true);
  return {
    ok: final.status === "ready",
    status: final.status,
    readyForLiveSmoke: final.readyForLiveSmoke,
    platform: PLATFORM,
    executable: LOCAL_PATHS.liveExecutable || null,
    launch,
    bridgeOpen,
    bridgeDevice: final.bridgeDevice,
    bridgeListener: {
      host: "127.0.0.1",
      port: 17364,
      remoteExposure: false
    },
    safeNextCommands: final.status === "ready"
      ? [".\\launch.ps1 live-smoke -SkipSetup"]
      : [
        ".\\launch.ps1 bridge-status -SkipSetup",
        ".\\launch.ps1 live-smoke -SkipSetup"
      ],
    initial: {
      status: initial.status,
      liveRunning: initial.live.running,
      bridgeReachable: initial.bridge.reachable,
      installReady: initial.install.ready
    },
    final: {
      status: final.status,
      liveRunning: final.live.running,
      bridgeReachable: final.bridge.reachable,
      installReady: final.install.ready
    },
    sideEffects: {
      startsAbletonOnlyWhenExplicitlyRequested: true,
      writesAbletonSet: false,
      downloads: false,
      uiMouseControl: false,
      remoteHttpExposure: false
    },
    nextSteps: final.nextSteps
  };
}

const options = readOptions(process.argv.slice(2));
const report = await buildLiveReadyReport(options);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
