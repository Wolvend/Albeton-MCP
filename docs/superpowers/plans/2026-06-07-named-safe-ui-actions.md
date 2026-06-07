# Named Safe UI Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reviewed, named Ableton UI actions so user-chosen mouse control works more like a professional driver instead of raw coordinate control.

**Architecture:** Keep the existing MCP/UI-driver split: MCP exposes typed tools and consent/readiness status, while `scripts/ableton-ui-driver.ts` owns window discovery and foreground mouse/keyboard automation. Add a small allowlisted action registry in the UI driver, expose it through read-only MCP tools, and keep execution gated by `ABLETON_MCP_ENABLE_UI_CONTROL=1` with `dry_run=true` by default.

**Tech Stack:** TypeScript, Node.js, PowerShell Win32 interop, MCP TypeScript SDK, Vitest, ESLint.

---

## File Structure

- Modify `scripts/ableton-ui-driver.ts`: add a named action registry, action planning, safe execution dispatch, and structured dry-run results.
- Modify `src/tools.ts`: add typed MCP tools for listing/planning/running named UI actions and route named clicks through the reviewed registry.
- Modify `tests/ui-driver.test.ts`: unit coverage for action ids, dry-run sequence planning, and unsupported action rejection.
- Modify `tests/tools.test.ts`: catalog assertions for the new tools and schemas.
- Modify `scripts/safe-sweep.ts`: include the new read-only and dry-run tools.
- Modify `docs/ABLETON_UI_DRIVER.md`, `docs/TOOL_REFERENCE.md`, `docs/TOOL_CATALOG.md`, and `README.md`: document the user-choice UI lane and named action workflow.

---

### Task 1: Add UI Action Registry And Planning In Driver

**Files:**
- Modify: `scripts/ableton-ui-driver.ts`
- Test: `tests/ui-driver.test.ts`

- [ ] **Step 1: Write failing tests for safe action registry behavior**

Add these tests to `tests/ui-driver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getSafeUiActions, planSafeUiActionSequence } from "../scripts/ableton-ui-driver.js";

describe("safe Ableton UI actions", () => {
  it("lists reviewed named actions with stable ids", () => {
    const actions = getSafeUiActions();
    expect(actions.map((action) => action.id)).toEqual([
      "focus_window",
      "capture_screenshot",
      "capture_browser_region",
      "capture_detail_region"
    ]);
    expect(actions.every((action) => action.coordinateSpace === "ableton_window")).toBe(true);
  });

  it("plans only allowlisted named action sequences", () => {
    const plan = planSafeUiActionSequence(["focus_window", "capture_screenshot"]);
    expect(plan.ok).toBe(true);
    expect(plan.actions.map((action) => action.id)).toEqual(["focus_window", "capture_screenshot"]);
    expect(plan.dry_run).toBe(true);
  });

  it("rejects unknown named action ids before execution", () => {
    expect(() => planSafeUiActionSequence(["unsafe_action"])).toThrow(/Unknown safe UI action/);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```powershell
npm test -- tests/ui-driver.test.ts
```

Expected: FAIL because `getSafeUiActions` and `planSafeUiActionSequence` are not exported.

- [ ] **Step 3: Add the safe UI action registry**

In `scripts/ableton-ui-driver.ts`, add this near the top after constants:

```ts
type SafeUiActionId =
  | "focus_window"
  | "capture_screenshot"
  | "capture_browser_region"
  | "capture_detail_region";

type SafeUiAction = {
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

export function getSafeUiActions() {
  return SAFE_UI_ACTIONS.map((action) => ({ ...action, payload: action.payload ? { ...action.payload } : undefined }));
}

export function planSafeUiActionSequence(ids: string[]) {
  const actions = ids.map((id) => {
    const action = SAFE_UI_ACTIONS.find((candidate) => candidate.id === id);
    if (!action) throw new Error(`Unknown safe UI action: ${id}`);
    return action;
  });
  return {
    ok: true,
    dry_run: true,
    coordinateSpace: "ableton_window",
    serialized: true,
    actions: actions.map((action) => ({ ...action, payload: action.payload ? { ...action.payload } : undefined }))
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- tests/ui-driver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/ableton-ui-driver.ts tests/ui-driver.test.ts
git commit -m "Add safe Ableton UI action registry"
```

---

### Task 2: Execute Named Safe UI Actions In The Driver

**Files:**
- Modify: `scripts/ableton-ui-driver.ts`
- Test: `tests/ui-driver.test.ts`

- [ ] **Step 1: Write failing tests for dispatch shape**

Append this test to `tests/ui-driver.test.ts`:

```ts
import { dispatchSafeUiActionForTest } from "../scripts/ableton-ui-driver.js";

describe("safe Ableton UI action dispatch", () => {
  it("returns dry-run dispatch without touching the desktop", async () => {
    const result = await dispatchSafeUiActionForTest("capture_screenshot", { dry_run: true });
    expect(result).toMatchObject({
      ok: true,
      dry_run: true,
      action: "capture_screenshot"
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/ui-driver.test.ts
```

Expected: FAIL because `dispatchSafeUiActionForTest` is not exported.

- [ ] **Step 3: Implement safe action dispatch**

In `scripts/ableton-ui-driver.ts`, add this helper near `dispatch`:

```ts
async function runSafeUiAction(id: string, payload: Record<string, unknown>) {
  const action = SAFE_UI_ACTIONS.find((candidate) => candidate.id === id);
  if (!action) {
    return {
      unsupported: true,
      action: id,
      reason: "Named UI action is not in the reviewed allowlist."
    };
  }

  if (payload.dry_run !== false) {
    return {
      ok: true,
      dry_run: true,
      action: action.id,
      planned: action
    };
  }

  if (action.kind === "focus") return focusWindow();
  if (action.kind === "screenshot") return captureAbletonScreenshot({}, false);
  if (action.kind === "region_capture") return captureAbletonScreenshot(action.payload ?? {}, true);

  return {
    unsupported: true,
    action: action.id,
    reason: "Safe UI action kind is not implemented."
  };
}

export async function dispatchSafeUiActionForTest(id: string, payload: Record<string, unknown>) {
  return runSafeUiAction(id, payload);
}
```

Then replace the current `click_named_safe_action` block inside `dispatch` with:

```ts
  if (action === "list_safe_ui_actions") return { actions: getSafeUiActions() };
  if (action === "plan_ui_action_sequence") return planSafeUiActionSequence(Array.isArray(payload.actions) ? payload.actions.map(String) : []);
  if (action === "click_named_safe_action") return runSafeUiAction(String(payload.action ?? ""), payload);
  if (action === "run_ui_action_sequence") {
    const planned = planSafeUiActionSequence(Array.isArray(payload.actions) ? payload.actions.map(String) : []);
    if (payload.dry_run !== false) return planned;
    const results = [];
    for (const plannedAction of planned.actions) {
      results.push(await runSafeUiAction(plannedAction.id, { dry_run: false }));
    }
    return { ok: true, actions: planned.actions, results };
  }
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test -- tests/ui-driver.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/ableton-ui-driver.ts tests/ui-driver.test.ts
git commit -m "Implement named safe UI action dispatch"
```

---

### Task 3: Add MCP Tools For Named UI Actions

**Files:**
- Modify: `src/tools.ts`
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Write failing tool catalog assertions**

Add these assertions to the first test in `tests/tools.test.ts`:

```ts
    expect(registeredToolNames).toContain("ableton_list_safe_ui_actions");
    expect(registeredToolNames).toContain("ableton_plan_ui_action_sequence");
    expect(registeredToolNames).toContain("ableton_run_ui_action_sequence");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/tools.test.ts
```

Expected: FAIL because the tools do not exist.

- [ ] **Step 3: Add typed schemas and tools**

In `src/tools.ts`, add these schemas near the other constants:

```ts
const SafeUiActionId = z.enum([
  "focus_window",
  "capture_screenshot",
  "capture_browser_region",
  "capture_detail_region"
]);
const SafeUiActionSequence = {
  actions: z.array(SafeUiActionId).min(1).max(12),
  ...DryRun
};
```

Inside `toolDefs.push(...)`, add:

```ts
  { name: "ableton_list_safe_ui_actions", description: "List reviewed Ableton UI actions that may be run only when UI control is user-enabled.", inputSchema: Empty, annotations: ro, handler: async () => {
    if (!FLAGS.uiControl) return { ok: true, uiControl: uiControlConsentProfile("List safe UI actions"), actions: [], note: "Start the UI driver to query the live driver allowlist." };
    return { ok: true, uiDriver: await uiDriverAction("list_safe_ui_actions") as Record<string, unknown> };
  } },
  { name: "ableton_plan_ui_action_sequence", description: "Plan a reviewed Ableton UI action sequence without moving the mouse.", inputSchema: SafeUiActionSequence, annotations: ro, handler: async (args) => {
    if (!FLAGS.uiControl) return { ok: true, dry_run: true, uiControl: uiControlConsentProfile("Plan UI action sequence"), actions: args.actions, nextStep: "Start the UI driver when foreground control is intentional." };
    return { ok: true, uiDriver: await uiDriverAction("plan_ui_action_sequence", args) as Record<string, unknown> };
  } },
  { name: "ableton_run_ui_action_sequence", description: "Run a reviewed Ableton UI action sequence through the gated UI driver.", inputSchema: SafeUiActionSequence, annotations: rw, handler: async (args) => uiWrite("run_ui_action_sequence", args) },
```

Update existing `ableton_click_named_safe_action` schema to:

```ts
  { name: "ableton_click_named_safe_action", description: "Run one reviewed named Ableton UI action when UI control is enabled.", inputSchema: { action: SafeUiActionId, ...DryRun }, annotations: rw, handler: async (args) => uiWrite("click_named_safe_action", args) },
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test -- tests/tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/tools.ts tests/tools.test.ts
git commit -m "Add MCP tools for safe UI action sequences"
```

---

### Task 4: Expand Safe Sweep And Verification

**Files:**
- Modify: `scripts/safe-sweep.ts`
- Test: `npm run sweep:safe`

- [ ] **Step 1: Add safe sweep calls**

Add these calls after `ableton_plan_ui_control_session` in `scripts/safe-sweep.ts`:

```ts
  { name: "ableton_list_safe_ui_actions", arguments: {} },
  { name: "ableton_plan_ui_action_sequence", arguments: { actions: ["focus_window", "capture_screenshot"], dry_run: true } },
  { name: "ableton_run_ui_action_sequence", arguments: { actions: ["focus_window", "capture_screenshot"], dry_run: true }, expected: "any" },
```

- [ ] **Step 2: Build and run safe sweep**

Run:

```powershell
npm run build
npm run sweep:safe
```

Expected: PASS with `unexpectedFailures: 0`.

- [ ] **Step 3: Run MCP verifier**

Run:

```powershell
npm run verify:mcp
```

Expected: PASS. Tool count should increase by 3 from the pre-task count.

- [ ] **Step 4: Commit**

```powershell
git add scripts/safe-sweep.ts
git commit -m "Cover safe UI action tools in sweep"
```

---

### Task 5: Documentation Polish

**Files:**
- Modify: `README.md`
- Modify: `docs/ABLETON_UI_DRIVER.md`
- Modify: `docs/TOOL_REFERENCE.md`
- Modify: `docs/TOOL_CATALOG.md`

- [ ] **Step 1: Update README control model**

In `README.md`, under the Control Model section, add:

```markdown
Named UI actions are preferred over raw coordinates. Use `ableton_list_safe_ui_actions` and `ableton_plan_ui_action_sequence` before any foreground click/type workflow. Raw coordinate clicks remain available only for explicit user-chosen fallback sessions.
```

- [ ] **Step 2: Update UI driver docs**

In `docs/ABLETON_UI_DRIVER.md`, add this section after Supported MCP Tools:

```markdown
## Named Safe Actions

Use named actions first:

- `focus_window`
- `capture_screenshot`
- `capture_browser_region`
- `capture_detail_region`

These actions are reviewed, Ableton-window scoped, serialized, and dry-run friendly. Raw coordinate clicks remain a fallback for cases where the named action map does not cover the workflow.
```

- [ ] **Step 3: Update catalog/reference counts**

Run:

```powershell
npm run verify:mcp
```

Use the reported `toolCount` to update:

```markdown
docs/TOOL_REFERENCE.md
docs/TOOL_CATALOG.md
README.md
```

- [ ] **Step 4: Commit**

```powershell
git add README.md docs/ABLETON_UI_DRIVER.md docs/TOOL_REFERENCE.md docs/TOOL_CATALOG.md
git commit -m "Document named safe UI actions"
```

---

### Task 6: Full Verification And Release Check

**Files:**
- Modify: `docs/FINAL_VERIFICATION.md`

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run build
npm test
npm run lint
npm run doctor
npm run release:check
npm run sweep:safe
npm run verify:mcp
npm audit --audit-level=moderate
wsl.exe bash -lc 'cd /mnt/c/Users/LIZ/Desktop/MCP/ableton-mcp && ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh verify'
```

Expected:

```text
All commands pass.
npm audit reports 0 moderate-or-higher vulnerabilities.
WSL verifier reports the same tool count as Windows.
```

- [ ] **Step 2: Run read-only UI driver smoke if driver is available**

Run:

```powershell
$env:ABLETON_MCP_ENABLE_UI_CONTROL="1"
npm run build
```

Then run this smoke:

```powershell
@'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/src/index.js'],
  env: { ...process.env, ABLETON_MCP_ENABLE_UI_CONTROL: '1', ABLETON_MCP_ENABLE_WRITE: '0', ABLETON_MCP_ENABLE_DOWNLOADS: '0' }
});
const client = new Client({ name: 'safe-ui-actions-smoke', version: '1.0.0' });
await client.connect(transport);
const listed = await client.callTool({ name: 'ableton_list_safe_ui_actions', arguments: {} });
const planned = await client.callTool({ name: 'ableton_plan_ui_action_sequence', arguments: { actions: ['focus_window', 'capture_screenshot'], dry_run: true } });
console.log(JSON.stringify({ listedError: Boolean(listed.isError), plannedError: Boolean(planned.isError) }, null, 2));
await client.close();
'@ | node -
```

Expected:

```json
{
  "listedError": false,
  "plannedError": false
}
```

- [ ] **Step 3: Update final verification report**

Append this to `docs/FINAL_VERIFICATION.md`:

```markdown
```powershell
# Named safe UI action verifier
```

Result: succeeded. The MCP listed reviewed named UI actions and planned a dry-run UI action sequence without moving the mouse. UI execution remains gated by `ABLETON_MCP_ENABLE_UI_CONTROL=1`.
```

- [ ] **Step 4: Commit**

```powershell
git add docs/FINAL_VERIFICATION.md
git commit -m "Record named UI action verification"
```

- [ ] **Step 5: Push**

```powershell
git push origin main
```

Expected: push succeeds without force.

---

## Self-Review

- Spec coverage: The plan implements named safe UI actions, planning, gated execution, safe sweep coverage, docs, and release verification.
- Placeholder scan: No placeholder steps remain; every code-changing task includes exact code.
- Type consistency: Action ids are consistent across driver registry, MCP schemas, tests, and docs.
