import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { runLab, type LabDefinition } from "./runner.js";

function printHuman(result: ReturnType<typeof runLab>): void {
  console.log(`\nNetSim lab: ${result.name}`);
  console.log(`${result.passed ? "PASS" : "FAIL"} — ${result.passedCount} passed, ${result.failedCount} failed\n`);

  for (const item of result.results) {
    console.log(`${item.passed ? "✓" : "✗"} ${item.message}`);
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const file = args.find((arg) => !arg.startsWith("--"));

  if (!file) {
    console.error("Usage: tsx src/labs/cli.ts <lab.json> [--json]");
    return 2;
  }

  try {
    // npm workspaces run this with cwd apps/api; resolve against the caller's directory.
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
    const definition = JSON.parse(await readFile(path, "utf8")) as LabDefinition;
    const result = runLab(definition);

    if (json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);

    return result.passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`NetSim lab verifier: ${message}`);
    return 2;
  }
}

process.exitCode = await main();
