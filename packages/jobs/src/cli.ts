#!/usr/bin/env -S tsx
import { pathToFileURL } from "node:url";
import { isAbsolute, resolve } from "node:path";

import type {
  JobsEnvironment,
  JobsRuntime,
  JobsRuntimeModule,
  JobsWorkerName,
} from "./runtime";

export interface JobsCliOptions {
  readonly environment: JobsEnvironment;
  readonly runtimeModule: string;
  readonly workers: readonly JobsWorkerName[];
  readonly mode: "once" | "daemon";
  readonly pollIntervalMs: number;
}

const WORKER_NAMES = new Set<JobsWorkerName>(["deletion", "outbox", "gmail"]);
const ENVIRONMENTS = new Set<JobsEnvironment>(["development", "staging", "production"]);

function valueAfter(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseJobsCliArgs(args: readonly string[]): JobsCliOptions {
  let environment: JobsEnvironment | undefined;
  let runtimeModule: string | undefined;
  let workers: JobsWorkerName[] = ["deletion", "outbox", "gmail"];
  let mode: "once" | "daemon" = "once";
  let pollIntervalMs = 5_000;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--environment") {
      const value = valueAfter(args, index, argument);
      if (!ENVIRONMENTS.has(value as JobsEnvironment)) {
        throw new Error("--environment must be development, staging, or production.");
      }
      environment = value as JobsEnvironment;
      index += 1;
    } else if (argument === "--runtime") {
      runtimeModule = valueAfter(args, index, argument);
      index += 1;
    } else if (argument === "--workers") {
      const values = valueAfter(args, index, argument).split(",").filter(Boolean);
      if (values.length === 0 || values.some((value) => !WORKER_NAMES.has(value as JobsWorkerName))) {
        throw new Error("--workers must be a comma-separated subset of deletion,outbox,gmail.");
      }
      workers = [...new Set(values)] as JobsWorkerName[];
      index += 1;
    } else if (argument === "--daemon") {
      mode = "daemon";
    } else if (argument === "--once") {
      mode = "once";
    } else if (argument === "--poll-interval-ms") {
      const value = Number(valueAfter(args, index, argument));
      if (!Number.isInteger(value) || value < 100) {
        throw new Error("--poll-interval-ms must be an integer of at least 100.");
      }
      pollIntervalMs = value;
      index += 1;
    } else {
      throw new Error(`Unknown jobs CLI option: ${argument ?? ""}.`);
    }
  }
  if (!environment) throw new Error("--environment is required.");
  if (!runtimeModule) throw new Error("--runtime is required.");
  return { environment, runtimeModule, workers, mode, pollIntervalMs };
}

function runtimeSpecifier(specifier: string): string {
  if (specifier.startsWith("file:") || specifier.startsWith("node:")) return specifier;
  if (specifier.startsWith(".") || specifier.startsWith("/") || isAbsolute(specifier)) {
    return pathToFileURL(resolve(specifier)).href;
  }
  return specifier;
}

async function loadRuntime(options: JobsCliOptions): Promise<JobsRuntime> {
  const imported = await import(runtimeSpecifier(options.runtimeModule)) as Partial<JobsRuntimeModule>;
  if (typeof imported.createJobsRuntime !== "function") {
    throw new Error("Runtime module must export createJobsRuntime(context).");
  }
  return imported.createJobsRuntime({ environment: options.environment });
}

async function runSelected(
  runtime: JobsRuntime,
  selected: readonly JobsWorkerName[],
  signal: AbortSignal,
): Promise<void> {
  for (const name of selected) {
    if (signal.aborted) return;
    const worker = runtime.workers[name];
    if (!worker) throw new Error(`Runtime did not provide the selected ${name} worker.`);
    await worker.runOnce(signal);
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveWait) => {
    if (signal.aborted) return resolveWait();
    const finish = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolveWait();
    };
    const timeout = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function runJobsCli(
  args = process.argv.slice(2),
  processEnvironment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const options = parseJobsCliArgs(args);
  if (options.mode === "daemon" && processEnvironment.NODE_ENV === "test") {
    throw new Error("Daemon mode is disabled when NODE_ENV=test.");
  }
  const controller = new AbortController();
  const stop = (): void => controller.abort(new Error("Worker shutdown requested."));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let runtime: JobsRuntime | undefined;
  try {
    runtime = await loadRuntime(options);
    do {
      await runSelected(runtime, options.workers, controller.signal);
      if (options.mode === "once" || controller.signal.aborted) break;
      await wait(options.pollIntervalMs, controller.signal);
    } while (!controller.signal.aborted);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await runtime?.close?.();
  }
}

function isEntrypoint(): boolean {
  const script = process.argv[1];
  return script !== undefined && import.meta.url === pathToFileURL(resolve(script)).href;
}

if (isEntrypoint()) {
  runJobsCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Jobs CLI failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
