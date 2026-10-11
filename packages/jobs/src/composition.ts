import {
  createDatabaseClient,
  type PrismaClient,
} from "@aios/data";

import {
  createClientDeletionParticipants,
} from "./deletion/participants";
import { DeletionParticipantRegistry } from "./deletion/registry";
import { DeletionWorker } from "./deletion/worker";
import type { GmailIngestionService } from "./gmail/contracts";
import { CompositeGmailWorker, GmailCredentialCleanupWorker } from "./gmail/credential-cleanup";
import {
  ConfiguredGmailIngestionService,
  parseGmailRuntimeConfiguration,
} from "./gmail/service";
import { GmailSyncWorker } from "./gmail/worker";
import {
  ComposedOutboxPublisher,
  IdempotentHttpOutboxDispatchSink,
  LocalOnlyOutboxDispatchSink,
  jsonStderrLogger,
  type JobsLogger,
  type OutboxDispatchSink,
} from "./outbox/publisher";
import type { EventPublisher } from "./outbox/contracts";
import { OutboxWorker } from "./outbox/worker";
import { createPostgresJobsRepositories } from "./postgres/repository";
import {
  GraphRealtimeOutboxPublisher,
  SupabaseRealtimeBroadcastSink,
} from "./realtime";
import type {
  JobsRuntime,
  JobsRuntimeCapability,
  JobsRuntimeContext,
} from "./runtime";
import {
  SupabaseStorageObjectRemover,
  UnconfiguredStorageObjectRemover,
  type StorageObjectRemover,
} from "./storage";
import type { RunOnceWorker, WorkerBatchResult } from "./worker";

export interface CreateJobsRuntimeOptions {
  readonly processEnvironment?: NodeJS.ProcessEnv;
  readonly database?: PrismaClient;
  readonly storage?: StorageObjectRemover;
  readonly dispatchSink?: OutboxDispatchSink;
  readonly realtimePublisher?: EventPublisher;
  readonly gmailIngestionService?: GmailIngestionService;
  readonly logger?: JobsLogger;
}

class NonConfiguredGmailWorker implements RunOnceWorker<WorkerBatchResult> {
  constructor(private readonly logger: JobsLogger) {}

  async runOnce(): Promise<WorkerBatchResult> {
    this.logger({
      component: "gmail",
      message: "Gmail worker is not configured; no scheduled jobs were claimed.",
      configured: false,
      claimedIngestion: false,
      requiredConfiguration: [
        "GOOGLE_GMAIL_CLIENT_ID",
        "GOOGLE_GMAIL_CLIENT_SECRET",
        "Supabase Vault credential reference per Gmail connection",
      ],
    });
    return { claimed: 0, succeeded: 0, failed: 0, deferred: 0 };
  }
}

class LoggingWorker implements RunOnceWorker<unknown> {
  constructor(
    private readonly name: string,
    private readonly worker: RunOnceWorker,
    private readonly logger: JobsLogger,
  ) {}

  async runOnce(signal?: AbortSignal): Promise<unknown> {
    const startedAt = Date.now();
    const result = await this.worker.runOnce(signal);
    this.logger({
      component: this.name,
      message: "Worker batch completed.",
      durationMs: Date.now() - startedAt,
      result,
    });
    return result;
  }
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function booleanFlag(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const configured = environment[name]?.trim().toLowerCase();
  if (configured === undefined || configured === "") return fallback;
  if (configured === "true") return true;
  if (configured === "false") return false;
  throw new Error(`${name} must be either true or false.`);
}

export function createStorageObjectRemoverFromEnvironment(
  environment: NodeJS.ProcessEnv,
): StorageObjectRemover {
  const url = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY ?? environment.SUPABASE_SERVICE_KEY;
  if (!url && !serviceRoleKey) return new UnconfiguredStorageObjectRemover();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage configuration is partial; set both NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return new SupabaseStorageObjectRemover({ url, serviceRoleKey });
}

export function createOutboxDispatchSinkFromEnvironment(
  environment: NodeJS.ProcessEnv,
  logger: JobsLogger,
): OutboxDispatchSink {
  const url = environment.AIOS_OUTBOX_DISPATCH_URL;
  const bearerToken = environment.AIOS_OUTBOX_DISPATCH_TOKEN;
  if (!url && !bearerToken) return new LocalOnlyOutboxDispatchSink(logger);
  if (!url || !bearerToken) {
    throw new Error(
      "External outbox dispatch configuration is partial; set both AIOS_OUTBOX_DISPATCH_URL and AIOS_OUTBOX_DISPATCH_TOKEN.",
    );
  }
  return new IdempotentHttpOutboxDispatchSink({ url, bearerToken });
}

export function createRealtimePublisherFromEnvironment(
  environment: NodeJS.ProcessEnv,
  database: PrismaClient,
  logger: JobsLogger,
): EventPublisher | undefined {
  if (!booleanFlag(environment, "AIOS_REALTIME_ENABLED", false)) return undefined;

  const url = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY ?? environment.SUPABASE_SERVICE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Realtime is enabled but not configured; set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const timeoutMs = positiveInteger(environment, "AIOS_SUPABASE_REALTIME_TIMEOUT_MS", 5_000, 100);
  return new GraphRealtimeOutboxPublisher(
    database,
    new SupabaseRealtimeBroadcastSink({ url, serviceRoleKey, timeoutMs }),
    logger,
  );
}

/** Composes the PostgreSQL polling workers and deployment adapters used by the CLI. */
export async function composeJobsRuntime(
  context: JobsRuntimeContext,
  options: CreateJobsRuntimeOptions = {},
): Promise<JobsRuntime> {
  const environment = options.processEnvironment ?? process.env;
  const logger = options.logger ?? jsonStderrLogger;
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!options.database && !databaseUrl) {
    throw new Error("DATABASE_URL is required to create the production jobs runtime.");
  }
  const database = options.database ?? createDatabaseClient({
    connectionString: databaseUrl,
    connectionLimit: positiveInteger(environment, "AIOS_JOBS_DB_CONNECTION_LIMIT", 10, 1),
  });
  const ownsDatabase = options.database === undefined;
  const storage = options.storage ?? createStorageObjectRemoverFromEnvironment(environment);
  const dispatchSink = options.dispatchSink
    ?? createOutboxDispatchSinkFromEnvironment(environment, logger);
  const realtimePublisher = options.realtimePublisher
    ?? createRealtimePublisherFromEnvironment(environment, database, logger);
  const repositories = createPostgresJobsRepositories(database);
  const registry = new DeletionParticipantRegistry(
    1,
    createClientDeletionParticipants(database, storage),
  );
  const deletion = new DeletionWorker({
    repository: repositories.deletion,
    registry,
    batchSize: positiveInteger(environment, "AIOS_DELETION_BATCH_SIZE", 10, 1),
    leaseTimeoutMs: positiveInteger(environment, "AIOS_DELETION_LEASE_TIMEOUT_MS", 300_000, 1_000),
    maximumAttempts: positiveInteger(environment, "AIOS_DELETION_MAXIMUM_ATTEMPTS", 5, 1),
  });
  const outbox = new OutboxWorker({
    repository: repositories.outbox,
    publisher: new ComposedOutboxPublisher(dispatchSink, storage, logger, realtimePublisher),
    batchSize: positiveInteger(environment, "AIOS_OUTBOX_BATCH_SIZE", 50, 1),
    leaseTimeoutMs: positiveInteger(environment, "AIOS_OUTBOX_LEASE_TIMEOUT_MS", 60_000, 1_000),
    maximumAttempts: positiveInteger(environment, "AIOS_OUTBOX_MAXIMUM_ATTEMPTS", 10, 1),
  });

  const gmailConfiguration = parseGmailRuntimeConfiguration(environment);
  const gmailService = options.gmailIngestionService
    ?? (gmailConfiguration
      ? new ConfiguredGmailIngestionService(database, gmailConfiguration, logger)
      : null);
  const gmailSync: RunOnceWorker<WorkerBatchResult> = gmailService
    ? new GmailSyncWorker({
      repository: repositories.gmail,
      ingestionService: gmailService,
      batchSize: positiveInteger(environment, "AIOS_GMAIL_BATCH_SIZE", 10, 1),
      leaseTimeoutMs: positiveInteger(environment, "AIOS_GMAIL_LEASE_TIMEOUT_MS", 300_000, 1_000),
    })
    : new NonConfiguredGmailWorker(logger);
  const gmailCleanup = new GmailCredentialCleanupWorker({
    database,
    batchSize: positiveInteger(environment, "AIOS_GMAIL_CLEANUP_BATCH_SIZE", 10, 1),
    leaseTimeoutMs: positiveInteger(environment, "AIOS_GMAIL_LEASE_TIMEOUT_MS", 300_000, 1_000),
    logger,
  });
  const gmail: RunOnceWorker<WorkerBatchResult> = new CompositeGmailWorker(gmailCleanup, gmailSync);

  const capabilities: JobsRuntimeCapability = {
    database: "postgresql",
    outboxDispatch: dispatchSink.mode,
    storageDeletion: storage.configured ? "supabase_service_role" : "not_configured",
    gmailIngestion: gmailService ? "gmail_history_metadata" : "not_configured_no_claim",
  };
  logger({
    component: "runtime",
    message: "Jobs runtime composed.",
    environment: context.environment,
    capabilities,
    realtimeBroadcast: realtimePublisher ? "supabase_private" : "not_configured",
  });

  return {
    capabilities,
    workers: {
      deletion: new LoggingWorker("deletion", deletion, logger),
      outbox: new LoggingWorker("outbox", outbox, logger),
      gmail: new LoggingWorker("gmail", gmail, logger),
    },
    async close(): Promise<void> {
      if (ownsDatabase) await database.$disconnect();
    },
  };
}
