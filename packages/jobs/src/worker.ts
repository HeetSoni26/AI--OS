export interface RunOnceWorker<TResult = unknown> {
  runOnce(signal?: AbortSignal): Promise<TResult>;
}

export interface WorkerBatchResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly deferred?: number;
  readonly deadLettered?: number;
}
