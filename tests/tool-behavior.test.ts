import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const INTEGRATION_TIMEOUT_MS = 20_000;

async function withClient<T>(fn: (client: Client) => Promise<T>) {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/src/index.js"] });
  const client = new Client({ name: "tool-behavior-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function callStructured(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return result.structuredContent as Record<string, unknown>;
}

describe("MCP tool behavior", () => {
  it("reports the safe HyperNimbus/OpenClaw tool allowlist without enabling risky tools", async () => {
    await withClient(async (client) => {
      const structured = await callStructured(client, "ableton_mcp_get_safe_tool_allowlist", {});
      const safeToolAllowlist = structured.safeToolAllowlist as Record<string, unknown>;
      const tools = safeToolAllowlist.tools as string[];
      const policy = safeToolAllowlist.policy as Record<string, unknown>;

      expect(structured.ok).toBe(true);
      expect(safeToolAllowlist.profile).toBe("hypernimbus");
      expect(safeToolAllowlist.endpoint).toBe("http://127.0.0.1:17366/mcp");
      expect(tools).toEqual(expect.arrayContaining([
        "ableton_plan_concept_track",
        "ableton_render_concept_execution_manifest",
        "ableton_mcp_get_safe_tool_allowlist"
      ]));
      expect(tools).not.toContain("ableton_execute_concept_plan");
      expect(tools).not.toContain("ableton_stage_concept_samples");
      expect(tools).not.toContain("ableton_download_sample");
      expect(tools).not.toContain("ableton_click_coordinates");
      expect(safeToolAllowlist.csv).toContain("ableton_plan_concept_track");
      expect(policy.permissionOwner).toBe("Ableton MCP");
      expect(policy.writesEnabled).toBe(false);
      expect(policy.downloadsEnabled).toBe(false);
      expect(policy.uiControlEnabled).toBe(false);
    });
  }, INTEGRATION_TIMEOUT_MS);

  it("reports unsupported dry-run status for LiveAPI controls that cannot be proven reliable", async () => {
    await withClient(async (client) => {
      const instrument = await callStructured(client, "ableton_insert_instrument", {
        track_index: 0,
        device: "Wavetable",
        dry_run: true
      });
      const automation = await callStructured(client, "ableton_set_automation_point", {
        track_index: 0,
        device_index: 0,
        parameter_index: 1,
        time: 1,
        value: 0.5,
        dry_run: true
      });
      const quantize = await callStructured(client, "ableton_quantize_clip", {
        track_index: 0,
        clip_slot_index: 0,
        grid: "1/16",
        amount: 1,
        dry_run: true
      });

      for (const structured of [instrument, automation, quantize]) {
        expect(structured.ok).toBe(true);
        expect(structured.dry_run).toBe(true);
        expect(structured.unsupported).toBe(true);
        expect(structured.nextSteps).toEqual(expect.arrayContaining([
          expect.stringMatching(/browse|inspect|driver|bridge/i)
        ]));
      }
    });
  }, INTEGRATION_TIMEOUT_MS);
});
