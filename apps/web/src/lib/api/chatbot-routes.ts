import "server-only";

import { ChatbotOperationsError, PrismaChatbotService, type PrismaClient } from "@aios/data";
import { ApiRequestError } from "./errors";

export function mapChatbotError(error: unknown): unknown {
  if (error instanceof ChatbotOperationsError) {
    const statusByCode: Record<string, number> = {
      INVALID_IDENTITY: 403,
      NOT_FOUND: 404,
      INVALID_INPUT: 422,
      CONFIG_INVALID: 422,
      CONFLICT: 409,
      STATE_INVALID: 409,
    };
    return new ApiRequestError(error.code, error.message, { status: statusByCode[error.code] ?? 400, cause: error });
  }
  return error;
}

export function chatbotServiceFactory(database: PrismaClient) {
  return new PrismaChatbotService(database);
}
