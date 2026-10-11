import type { RunOnceWorker } from "./worker";

export type JobsEnvironment = "development" | "staging" | "production";
export type JobsWorkerName = "deletion" | "outbox" | "gmail";

export interface JobsRuntimeContext {
  readonly environment: JobsEnvironment;
}

export interface JobsRuntimeCapability {
  readonly database: "postgresql";
  readonly outboxDispatch: "local_only" | "external_idempotent_http";
  readonly storageDeletion: "supabase_service_role" | "not_configured";
  readonly gmailIngestion: "gmail_history_metadata" | "not_configured_no_claim";
}

export interface JobsRuntime {
  readonly capabilities?: JobsRuntimeCapability;
  readonly workers: Readonly<Partial<Record<JobsWorkerName, RunOnceWorker>>>;
  close?(): Promise<void>;
}

/** Runtime modules supply unavailable domain services and deployment adapters. */
export interface JobsRuntimeModule {
  createJobsRuntime(context: JobsRuntimeContext): Promise<JobsRuntime> | JobsRuntime;
}
