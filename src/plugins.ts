import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FLAGS, LOCAL_PATHS } from "./config.js";
import { AbletonMcpError, requireFlag } from "./errors.js";
import { fetchAllowedPluginUrl, assertAllowedPluginUrl, readResponseBufferBounded } from "./network.js";
import { redactPath, resolveSafePath } from "./security.js";

const pluginCatalog = [
  {
    id: "ableton-official-packs",
    name: "Ableton Official Packs",
    source: "Ableton",
    kind: "ableton_pack",
    homepage: "https://www.ableton.com/packs/",
    license: "varies",
    download: null,
    installPolicy: "Manual install through Ableton or Pack installer after license review."
  },
  {
    id: "max-for-live-devices",
    name: "Max for Live Devices",
    source: "Ableton / Cycling '74 ecosystem",
    kind: "max_for_live",
    homepage: "https://www.ableton.com/packs/#?item_type=max_for_live",
    license: "varies",
    download: null,
    installPolicy: "Stage only. Load reviewed .amxd/.amxd package manually or through a future signed workflow."
  },
  {
    id: "cycling74-package-manager",
    name: "Cycling '74 Package Manager Packages",
    source: "Cycling '74",
    kind: "max_package",
    homepage: "https://cycling74.com/packages",
    license: "varies",
    download: null,
    installPolicy: "Use Max Package Manager where possible. MCP downloads are staging-only."
  }
] as const;

const executableExtensions = new Set([".exe", ".msi", ".dmg", ".pkg", ".app", ".bat", ".cmd", ".ps1", ".sh"]);
const MAX_PLUGIN_PACKAGE_BYTES = 512 * 1024 * 1024;

function safePackageName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new AbletonMcpError("Invalid package destination name.", "INVALID_PACKAGE_NAME");
  }
  return cleaned;
}

function classifyPackage(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return {
    extension,
    executableLike: executableExtensions.has(extension),
    installAllowedByMcp: false,
    policy: executableExtensions.has(extension)
      ? "Executable installers are staging-only and must be reviewed and installed manually outside MCP."
      : "Plugin packages are staging-only. MCP does not install into system VST/AU folders."
  };
}

export function searchPluginCatalog(query = "") {
  const needle = query.trim().toLowerCase();
  const results = pluginCatalog.filter((item) => {
    if (!needle) return true;
    return [item.id, item.name, item.source, item.kind, item.homepage].some((value) => value.toLowerCase().includes(needle));
  });
  return {
    source: "curated_plugin_catalog",
    count: results.length,
    results
  };
}

export function planPluginDownload(args: { url?: string; destinationName?: string; catalogId?: string }) {
  const catalogItem = args.catalogId ? pluginCatalog.find((item) => item.id === args.catalogId) : null;
  const destinationName = safePackageName(args.destinationName ?? path.basename(new URL(args.url ?? "https://example.invalid/package.zip").pathname));
  const classification = classifyPackage(destinationName);
  return {
    ok: true,
    catalogItem: catalogItem ?? null,
    url: args.url ? assertAllowedPluginUrl(args.url) : null,
    destinationName,
    targetDir: redactPath(LOCAL_PATHS.pluginStaging),
    classification,
    downloadRequires: "ABLETON_MCP_ENABLE_DOWNLOADS=1",
    installPolicy: "MCP can stage plugin packages only. It never installs VST/AU/CLAP/AAX files or runs installers."
  };
}

export async function downloadPluginPackage(url: string, destinationName: string, metadata: Record<string, unknown>) {
  requireFlag(FLAGS.downloads, "ABLETON_MCP_ENABLE_DOWNLOADS", "Plugin/package download");
  const safeName = safePackageName(destinationName);
  const classification = classifyPackage(safeName);
  await fs.mkdir(LOCAL_PATHS.pluginStaging, { recursive: true });
  const target = path.join(LOCAL_PATHS.pluginStaging, safeName);
  await resolveSafePath(target, { mustExist: false, forWrite: true });
  const response = await fetchAllowedPluginUrl(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new AbletonMcpError(`Plugin/package download failed with HTTP ${response.status}.`, "PLUGIN_DOWNLOAD_ERROR");
  const bytes = await readResponseBufferBounded(response, MAX_PLUGIN_PACKAGE_BYTES, "Plugin/package download");
  await fs.writeFile(target, bytes, { flag: "wx" });
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(`${target}.metadata.json`, JSON.stringify({
    ...metadata,
    url,
    stagedAt: new Date().toISOString(),
    checksum,
    classification
  }, null, 2), { flag: "wx" });
  return {
    stagedPath: redactPath(target),
    metadataPath: redactPath(`${target}.metadata.json`),
    checksum,
    bytes: bytes.length,
    classification
  };
}

export function pluginInstallInstructions(stagedPath: string) {
  const classification = classifyPackage(path.basename(stagedPath));
  return {
    stagedPath: redactPath(stagedPath),
    classification,
    steps: [
      "Verify the source, license, checksum, and publisher outside MCP.",
      "Scan installer/package files with your normal endpoint security tooling.",
      "Install manually using Ableton, Max Package Manager, or the vendor installer.",
      "Restart Ableton or rescan plugins if required.",
      "Use Ableton MCP read-only environment and library tools to verify visibility after installation."
    ],
    blockedByMcp: true
  };
}
