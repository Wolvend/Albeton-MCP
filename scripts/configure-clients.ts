import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
function detectProjectRoot() {
  const parent = path.basename(path.dirname(scriptDir)).toLowerCase();
  if (parent === "dist") return path.resolve(scriptDir, "..", "..");
  return path.resolve(scriptDir, "..");
}

const PROJECT_ROOT = detectProjectRoot();
const DEFAULT_TAILSCALE_HOST = process.env.ABLETON_MCP_TAILSCALE_HOST ?? "100.84.223.22";
const DEFAULT_HTTP_PORT = process.env.ABLETON_MCP_HTTP_PORT ?? "17366";

type Options = {
  outDir: string;
  tailscaleHost: string;
  httpPort: string;
  withToken: boolean;
};

function argValue(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function isInsideProject(candidate: string) {
  const relative = path.relative(PROJECT_ROOT, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateHost(value: string) {
  if (!/^[a-zA-Z0-9.-]+$/.test(value) || value.includes("..")) {
    throw new Error("Invalid --tailscale-host. Use a Tailscale IP or DNS name only.");
  }
  return value;
}

function validatePort(value: string) {
  if (!/^\d+$/.test(value)) throw new Error("Invalid --http-port. Use a numeric TCP port.");
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid --http-port. Use a port from 1 to 65535.");
  return String(port);
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const outDir = argValue(args, "--out") ?? path.join(PROJECT_ROOT, "config", "generated");
  const resolvedOutDir = path.resolve(PROJECT_ROOT, outDir);
  if (!isInsideProject(resolvedOutDir)) {
    throw new Error("--out must stay inside the Ableton MCP project directory.");
  }
  const tailscaleHost = validateHost(argValue(args, "--tailscale-host") ?? DEFAULT_TAILSCALE_HOST);
  const httpPort = validatePort(argValue(args, "--http-port") ?? DEFAULT_HTTP_PORT);
  return {
    outDir: resolvedOutDir,
    tailscaleHost,
    httpPort,
    withToken: args.includes("--with-token")
  };
}

function slashPath(value: string) {
  return value.replaceAll("\\", "/");
}

function stdioConfig(command: string, args: string[], tailscaleHost: string) {
  return {
    mcpServers: {
      "ableton-mcp": {
        command,
        args,
        env: {
          ABLETON_MCP_ENABLE_WRITE: "0",
          ABLETON_MCP_ENABLE_UI_CONTROL: "0",
          ABLETON_MCP_ENABLE_DOWNLOADS: "0",
          ABLETON_MCP_TAILSCALE_HOST: tailscaleHost
        }
      }
    }
  };
}

function remoteConfig(url: string, token: string) {
  return {
    name: "ableton-mcp-remote",
    transport: {
      type: "streamable-http",
      url,
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  };
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function writeText(filePath: string, value: string) {
  await fs.writeFile(filePath, value, { mode: 0o600 });
}

async function main() {
  const options = parseOptions();
  await fs.mkdir(options.outDir, { recursive: true });

  const token = options.withToken ? crypto.randomBytes(24).toString("base64url") : "replace-with-ABLETON_MCP_HTTP_TOKEN";
  const launchCmd = path.join(PROJECT_ROOT, "launch.cmd");
  const wslProject = `/mnt/c/${slashPath(PROJECT_ROOT).replace(/^C:\//i, "")}`;
  const remoteUrl = `http://${options.tailscaleHost}:${options.httpPort}/mcp`;

  const files = {
    codex: path.join(options.outDir, "codex.json"),
    claude: path.join(options.outDir, "claude-desktop.json"),
    cursor: path.join(options.outDir, "cursor.json"),
    wsl: path.join(options.outDir, "wsl-stdio.json"),
    localHttp: path.join(options.outDir, "local-http.json"),
    remoteHttp: path.join(options.outDir, "remote-http.json"),
    remoteEnv: path.join(options.outDir, "remote-http.env"),
    summary: path.join(options.outDir, "INSTALL_SUMMARY.md")
  };

  await writeJson(files.codex, stdioConfig(slashPath(launchCmd), ["stdio", "-SkipSetup"], options.tailscaleHost));
  await writeJson(files.claude, stdioConfig(slashPath(launchCmd), ["stdio", "-SkipSetup"], options.tailscaleHost));
  await writeJson(files.cursor, stdioConfig(slashPath(launchCmd), ["stdio", "-SkipSetup"], options.tailscaleHost));
  await writeJson(files.wsl, stdioConfig("bash", ["-lc", `cd ${wslProject} && ABLETON_MCP_USE_BASH_NODE=1 ABLETON_MCP_SKIP_SETUP=1 ./launch.sh stdio`], options.tailscaleHost));
  await writeJson(files.localHttp, remoteConfig(`http://127.0.0.1:${options.httpPort}/mcp`, token));
  await writeJson(files.remoteHttp, remoteConfig(remoteUrl, token));
  await writeText(files.remoteEnv, [
    "ABLETON_MCP_HTTP_ALLOW_REMOTE=1",
    "ABLETON_MCP_HTTP_HOST=0.0.0.0",
    `ABLETON_MCP_HTTP_PORT=${options.httpPort}`,
    `ABLETON_MCP_TAILSCALE_HOST=${options.tailscaleHost}`,
    `ABLETON_MCP_HTTP_TOKEN=${token}`,
    "ABLETON_MCP_ENABLE_WRITE=0",
    "ABLETON_MCP_ENABLE_UI_CONTROL=0",
    "ABLETON_MCP_ENABLE_DOWNLOADS=0",
    ""
  ].join(os.EOL));

  await writeText(files.summary, [
    "# Ableton MCP Generated Setup",
    "",
    `Project: ${PROJECT_ROOT}`,
    `Tailscale URL: ${remoteUrl}`,
    `Token: ${options.withToken ? "generated and stored in remote-http.env" : "placeholder only; rerun with --with-token for remote HTTP"}`,
    "",
    "## Local stdio clients",
    "",
    "- Codex: config/generated/codex.json",
    "- Claude Desktop: config/generated/claude-desktop.json",
    "- Cursor: config/generated/cursor.json",
    "- WSL stdio: config/generated/wsl-stdio.json",
    "",
    "## HTTP clients",
    "",
    "- Local HTTP: config/generated/local-http.json",
    "- Tailscale/private remote HTTP: config/generated/remote-http.json",
    "- Remote server env: config/generated/remote-http.env",
    "",
    "## Commands",
    "",
    "```powershell",
    ".\\launch.ps1 stdio",
    ".\\launch.ps1 docker",
    ".\\launch.ps1 ui-driver",
    "```",
    "",
    "Remote HTTP remains disabled unless you set the env values from remote-http.env and start docker/http mode.",
    ""
  ].join(os.EOL));

  console.log(JSON.stringify({
    ok: true,
    outDir: options.outDir,
    tailscaleUrl: remoteUrl,
    token: options.withToken ? "generated-redacted" : "placeholder",
    files
  }, null, 2));
}

await main();
