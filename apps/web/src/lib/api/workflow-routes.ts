import "server-only";

import { WorkflowOperationsError, PrismaWorkflowService, type PrismaClient } from "@aios/data";
import { ApiRequestError } from "./errors";

export function mapWorkflowError(error: unknown): unknown {
  if (error instanceof WorkflowOperationsError) {
    const statusByCode: Record<string, number> = {
      INVALID_IDENTITY: 403,
      NOT_FOUND: 404,
      INVALID_INPUT: 422,
      BLUEPRINT_INVALID: 422,
      CONFLICT: 409,
      STATE_INVALID: 409,
      PROVIDER_UNCONFIGURED: 409,
    };
    return new ApiRequestError(error.code, error.message, { status: statusByCode[error.code] ?? 400, cause: error });
  }
  return error;
}

export function workflowServiceFactory(database: PrismaClient) {
  return new PrismaWorkflowService(database);
}
