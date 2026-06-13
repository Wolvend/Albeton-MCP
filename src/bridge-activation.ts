import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultBridgePresetDir } from "./bridge-install.js";
import { LOCAL_PATHS, PLATFORM } from "./config.js";
import { redactPath } from "./security.js";

export type BridgeDeviceOpenOptions = {
  dryRun?: boolean;
};

export function defaultBridgeDevicePath() {
  return path.join(defaultBridgePresetDir(), "Ableton MCP Bridge.amxd");
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function spawnDetached(command: string, args: string[]) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    env: {
      SystemRoot: process.env.SystemRoot,
      PATH: process.env.PATH,
      USERPROFILE: process.env.USERPROFILE
    }
  });
  child.unref();
  return child.pid ?? null;
}

export async function openBridgeDevice(options: BridgeDeviceOpenOptions = {}) {
  const dryRun = options.dryRun !== false;
  const devicePath = defaultBridgeDevicePath();
  const installed = await exists(devicePath);
  const base = {
    ok: installed,
    dry_run: dryRun,
    devicePath: redactPath(devicePath),
    installed,
    expectedListener: {
      host: "127.0.0.1",
      port: 17364,
      remoteExposure: false
    },
    possibleSetChange: true,
    note: "Opening the .amxd can cause Ableton to add or focus the bridge device in the current set. It launches through the configured Ableton executable when available, does not move the mouse, and does not enable MCP write tools."
  };

  if (!installed) {
    return {
      ...base,
      code: "BRIDGE_DEVICE_NOT_INSTALLED",
      nextSteps: ["Run npm run bridge:install.", "Re-run live-ready after the bridge preset is installed."]
    };
  }
  if (dryRun) {
    return {
      ...base,
      nextSteps: [
        "Run .\\launch.ps1 live-ready -OpenBridge -SkipSetup on Windows, or ./launch.sh live-ready --open-bridge --skip-setup.",
        "After Ableton loads the device, run .\\launch.ps1 live-smoke -SkipSetup."
      ]
    };
  }

  let pid: number | null = null;
  if ((PLATFORM.isWindows || PLATFORM.isMac) && LOCAL_PATHS.liveExecutable) {
    pid = spawnDetached(LOCAL_PATHS.liveExecutable, [devicePath]);
  } else if (PLATFORM.isWsl) {
    const windowsPath = devicePath.replace(/^\/mnt\/([a-z])\//i, (_match, drive: string) => `${drive.toUpperCase()}:\\`).replaceAll("/", "\\");
    const windowsLive = LOCAL_PATHS.liveExecutable.replace(/^\/mnt\/([a-z])\//i, (_match, drive: string) => `${drive.toUpperCase()}:\\`).replaceAll("/", "\\");
    pid = spawnDetached("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Start-Process -FilePath $args[0] -ArgumentList $args[1]", windowsLive, windowsPath]);
  } else {
    return {
      ...base,
      ok: false,
      code: "UNSUPPORTED_PLATFORM",
      nextSteps: ["Open the bridge device from Ableton on a Windows or macOS host."]
    };
  }

  return {
    ...base,
    opened: true,
    processId: pid,
    nextSteps: [
      "If Ableton prompts, allow it to load the Max for Live device into the current set.",
      "Confirm Max Console says the bridge is listening on 127.0.0.1:17364.",
      "Run .\\launch.ps1 live-smoke -SkipSetup."
    ]
  };
}
