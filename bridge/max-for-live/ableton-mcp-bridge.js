autowatch = 1;

function bang() {
  post("Ableton MCP bridge placeholder loaded. Implement LiveAPI handlers for ping/full_snapshot/snapshot_diff.\n");
}

function ping() {
  outlet(0, JSON.stringify({ ok: true, heartbeat: new Date().toISOString() }));
}
