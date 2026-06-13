#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { getBridgeSetupStatus } from "../src/bridge-setup.js";
import { LOCAL_PATHS, PLATFORM } from "../src/config.js";

type LiveReadyOptions = {
  launchLive: boolean;
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

export async function buildLiveReadyReport(options: LiveReadyOptions) {
  const initial = await getBridgeSetupStatus(true);
  const launch = await launchLiveIfRequested(options, initial);
  const final = await getBridgeSetupStatus(true);
  return {
    ok: final.status === "ready",
    status: final.status,
    readyForLiveSmoke: final.readyForLiveSmoke,
    platform: PLATFORM,
    executable: LOCAL_PATHS.liveExecutable || null,
    launch,
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
