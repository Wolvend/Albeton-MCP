export type SafeUiActionId =
  | "focus_window"
  | "capture_screenshot"
  | "capture_browser_region"
  | "capture_detail_region";

export type SafeUiAction = {
  id: SafeUiActionId;
  label: string;
  description: string;
  coordinateSpace: "ableton_window";
  kind: "focus" | "screenshot" | "region_capture";
  payload?: Record<string, unknown>;
};

const SAFE_UI_ACTIONS: SafeUiAction[] = [
  {
    id: "focus_window",
    label: "Focus Ableton Window",
    description: "Bring the active Ableton Live window to the foreground.",
    coordinateSpace: "ableton_window",
    kind: "focus"
  },
  {
    id: "capture_screenshot",
    label: "Capture Ableton Window",
    description: "Capture the full Ableton window into diagnostics/screenshots.",
    coordinateSpace: "ableton_window",
    kind: "screenshot"
  },
  {
    id: "capture_browser_region",
    label: "Capture Browser Region",
    description: "Capture the left browser area using conservative Ableton-window-relative bounds.",
    coordinateSpace: "ableton_window",
    kind: "region_capture",
    payload: { x: 0, y: 0, width: 360, height: 720 }
  },
  {
    id: "capture_detail_region",
    label: "Capture Detail Region",
    description: "Capture the lower detail panel using conservative Ableton-window-relative bounds.",
    coordinateSpace: "ableton_window",
    kind: "region_capture",
    payload: { x: 0, y: 520, width: 1280, height: 300 }
  }
];

function cloneAction(action: SafeUiAction) {
  return { ...action, payload: action.payload ? { ...action.payload } : undefined };
}

export function getSafeUiActions() {
  return SAFE_UI_ACTIONS.map(cloneAction);
}

export function findSafeUiAction(id: string) {
  const action = SAFE_UI_ACTIONS.find((candidate) => candidate.id === id);
  return action ? cloneAction(action) : null;
}

export function planSafeUiActionSequence(ids: string[]) {
  const actions = ids.map((id) => {
    const action = findSafeUiAction(id);
    if (!action) throw new Error(`Unknown safe UI action: ${id}`);
    return action;
  });
  return {
    ok: true,
    dry_run: true,
    coordinateSpace: "ableton_window",
    serialized: true,
    actions
  };
}
