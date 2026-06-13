#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildHypernimbusDockerProfilePlan, HYPERNIMBUS_PROFILE_ID } from "../src/docker-profile.js";

const execFileAsync = promisify(execFile);

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code?: unknown;
};

function argValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function displayCommand(command: string, args: string[]) {
  return [command, ...args.map((arg) => arg.includes(" ") ? `"${arg}"` : arg)].join(" ");
}

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const execError = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer; code?: unknown };
    return {
      ok: false,
      stdout: String(execError.stdout ?? "").trim(),
      stderr: String(execError.stderr ?? execError.message).trim(),
      code: execError.code
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const verifyOnly = args.includes("--verify");
  const profile = argValue(args, "--profile") ?? HYPERNIMBUS_PROFILE_ID;
  const catalogPath = argValue(args, "--catalog");
  const backupPath = argValue(args, "--backup");
  const planOptions: { profile: string; catalogPath?: string; backupPath?: string } = { profile };
  if (catalogPath) planOptions.catalogPath = catalogPath;
  if (backupPath) planOptions.backupPath = backupPath;
  const plan = buildHypernimbusDockerProfilePlan(planOptions);

  if (!apply && !verifyOnly) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      profile: plan.profile,
      endpoint: plan.endpoint,
      catalogPath: plan.catalogPath,
      catalogRef: plan.catalogRef,
      allowedTools: plan.allowlist.length,
      commands: plan.commands.map((command) => ({
        description: command.description,
        command: displayCommand(command.command, command.args)
      }))
    }, null, 2));
    return;
  }

  const commands = verifyOnly
    ? plan.commands.filter((command) => command.description.includes("verification"))
    : plan.commands;

  await fs.mkdir(path.dirname(plan.commands[0]!.args.at(-1)!), { recursive: true });
  const results = [];
  for (const command of commands) {
    const result = await runCommand(command.command, command.args);
    results.push({
      description: command.description,
      command: displayCommand(command.command, command.args),
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code
    });
    if (!result.ok) {
      console.log(JSON.stringify({
        ok: false,
        applied: false,
        verified: false,
        profile: plan.profile,
        endpoint: plan.endpoint,
        allowedTools: plan.allowlist.length,
        failedCommand: displayCommand(command.command, command.args),
        results
      }, null, 2));
      process.exitCode = 1;
      return;
    }
  }

  console.log(JSON.stringify({
    ok: true,
    applied: apply && !verifyOnly,
    verified: verifyOnly,
    profile: plan.profile,
    endpoint: plan.endpoint,
    allowedTools: plan.allowlist.length,
    results
  }, null, 2));
}

await main();
