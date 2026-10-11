import type { JobsRuntime, JobsRuntimeContext } from "./runtime";
import { composeJobsRuntime } from "./composition";

/** Default production composition loaded by the existing jobs CLI. */
export function createJobsRuntime(context: JobsRuntimeContext): Promise<JobsRuntime> {
  return composeJobsRuntime(context);
}
