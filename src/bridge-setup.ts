import { getBridgeRuntimeState, pingBridge } from "./bridge.js";
import { getBridgeInstallStatus } from "./bridge-install.js";
import { environmentSnapshot } from "./environment.js";
import { AbletonMcpError } from "./errors.js";

function briefProcess(proc: Record<string, unknown>) {
  return {
    processName: String(proc.ProcessName ?? proc.processName ?? ""),
    id: Number(proc.Id ?? proc.id ?? 0) || null
  };
}

export async function getBridgeSetupStatus(checkBridge = false) {
  const [install, environment] = await Promise.all([
    getBridgeInstallStatus(),
    environmentSnapshot()
  ]);
  const bridge: Record<string, unknown> = {
    checked: false,
    reachable: null,
    runtime: getBridgeRuntimeState()
  };

  if (checkBridge) {
    bridge.checked = true;
    try {
      bridge.ping = await pingBridge();
      bridge.reachable = true;
    } catch (error) {
      bridge.reachable = false;
      bridge.code = error instanceof AbletonMcpError ? error.code : "BRIDGE_CHECK_FAILED";
      bridge.error = error instanceof Error ? error.message : String(error);
      bridge.nextSteps = error instanceof AbletonMcpError
        ? error.nextSteps
        : ["Open Ableton Live.", "Load the Max for Live bridge device.", "Retry ableton_bridge_ping."];
    }
  }

  const liveRunning = Boolean(environment.liveRunning);
  const status = !install.ready
    ? "bridge_files_need_install"
    : !liveRunning
      ? "ableton_not_running"
      : bridge.reachable === true
        ? "ready"
        : checkBridge
          ? "bridge_device_not_loaded"
          : "installed_pending_bridge_check";

  return {
    ok: true,
    status,
    readyForLiveSmoke: install.ready && liveRunning && bridge.reachable === true,
    install,
    live: {
      running: liveRunning,
      processes: environment.abletonProcesses.map(briefProcess)
    },
    bridge,
    nextSteps: status === "ready"
      ? ["Run .\\launch.ps1 live-smoke -SkipSetup before enabling real write gates."]
      : status === "bridge_files_need_install"
        ? install.nextSteps
        : status === "ableton_not_running"
          ? ["Open Ableton Live.", "Load the Ableton MCP Bridge Max for Live device.", "Run ableton_bridge_setup_status with check_bridge=true."]
          : ["Load Ableton MCP Bridge from User Library > Presets > MIDI Effects > Max MIDI Effect.", "Confirm Max Console says the bridge is listening on 127.0.0.1:17364.", "Run .\\launch.ps1 live-smoke -SkipSetup."]
  };
}
