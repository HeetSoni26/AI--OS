import { z } from "zod";

/** The current stable API namespace. Resource routes are rooted at `/api/v1`. */
export const API_VERSION = "v1" as const;
export const API_VERSION_HEADER = "x-api-version" as const;
export const API_VERSION_PATH = "/api/v1" as const;
export const REQUEST_ID_HEADER = "x-request-id" as const;
export const CORRELATION_ID_HEADER = "x-correlation-id" as const;

/** Platform limits from the API quality gates. Values are bytes unless noted. */
export const STANDARD_REQUEST_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
export const FILE_UPLOAD_BODY_LIMIT_BYTES = 100 * 1024 * 1024;
export const API_RATE_LIMIT_REQUESTS = 100;
export const API_RATE_LIMIT_WINDOW_SECONDS = 60;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const apiVersionSchema = z.literal(API_VERSION);
export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Request IDs may only contain safe identifier characters.");
export const cursorSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/, "Cursor must be base64url encoded.");

export const paginationMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  cursor: cursorSchema.nullable(),
  hasMore: z.boolean(),
});

export const apiResponseMetaSchema = paginationMetaSchema.extend({
  requestId: requestIdSchema,
  apiVersion: apiVersionSchema,
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type ApiResponseMeta = z.infer<typeof apiResponseMetaSchema>;

export function createApiSuccessSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: apiResponseMetaSchema,
  });
}

export const apiSuccessEnvelopeSchema = createApiSuccessSchema(z.unknown());
export type ApiSuccessEnvelope<T = unknown> = {
  data: T;
  meta: ApiResponseMeta;
};

export const apiErrorDetailSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  details: z.unknown().optional(),
});

export const apiErrorEnvelopeSchema = z.object({
  error: apiErrorDetailSchema,
  meta: z.object({ requestId: requestIdSchema, apiVersion: apiVersionSchema }),
});

/** Backward-compatible name for the normalized error envelope. */
export const apiErrorSchema = apiErrorEnvelopeSchema;
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiError = z.infer<typeof apiErrorEnvelopeSchema>;
export type ApiErrorEnvelope = ApiError;

export const paginationQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const ownerIdentitySchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
});

export const authContextSchema = z.object({
  owner: ownerIdentitySchema,
  ownerId: z.string().min(1),
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  requestId: requestIdSchema,
  apiVersion: apiVersionSchema,
});
export type OwnerIdentityContract = z.infer<typeof ownerIdentitySchema>;
export type AuthContext = z.infer<typeof authContextSchema>;

export const encodedCursorPayloadSchema = z.object({
  version: z.literal(1),
  value: z.unknown(),
});
export type EncodedCursorPayload = z.infer<typeof encodedCursorPayloadSchema>;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Cursor is not valid base64url.");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class InvalidCursorError extends Error {
  readonly code = "INVALID_CURSOR" as const;

  constructor(message = "The cursor is invalid or expired.") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

/** Encodes cursor state as an opaque, URL-safe value. Do not put secrets in cursor state. */
export function encodeCursor(value: unknown): string {
  try {
    const json = JSON.stringify({ version: 1, value });
    if (json === undefined) throw new Error("Cursor value is not serializable.");
    return bytesToBase64Url(new TextEncoder().encode(json));
  } catch {
    throw new InvalidCursorError("Cursor value cannot be encoded.");
  }
}

/** Decodes and validates an opaque cursor. Invalid input is rejected rather than trusted. */
export function decodeCursor<T = unknown>(cursor: string): T {
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(cursor));
    const payload = encodedCursorPayloadSchema.parse(JSON.parse(json));
    return payload.value as T;
  } catch {
    throw new InvalidCursorError();
  }
}

export function tryDecodeCursor<T = unknown>(cursor: string | null | undefined): T | null {
  if (!cursor) return null;
  try {
    return decodeCursor<T>(cursor);
  } catch {
    return null;
  }
}

export type OpenApiSchema = Record<string, unknown>;
export type OpenApiPaths = Record<string, Record<string, unknown>>;

export interface OpenApiDocumentOptions {
  title?: string;
  description?: string;
  version?: string;
  serverUrl?: string;
  paths?: OpenApiPaths;
}

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; description: string; version: string };
  servers: Array<{ url: string }>;
  paths: OpenApiPaths;
  security: Array<Record<string, string[]>>;
  components: {
    securitySchemes: Record<string, OpenApiSchema>;
    schemas: Record<string, OpenApiSchema>;
  };
}

export function createOpenApiDocument(options: OpenApiDocumentOptions = {}): OpenApiDocument {
  const jsonSchema = (schema: z.ZodType): OpenApiSchema => {
    const generated = z.toJSONSchema(schema, { target: "draft-2020-12" }) as OpenApiSchema & { $schema?: string };
    delete generated.$schema;
    return generated;
  };

  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "AI OS API",
      description: options.description ?? "Versioned API contracts for the AI Automation Agency OS.",
      version: options.version ?? "0.1.0",
    },
    servers: [{ url: options.serverUrl ?? API_VERSION_PATH }],
    paths: options.paths ?? {},
    security: [{ BearerAuth: [] }],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        ApiResponseMeta: jsonSchema(apiResponseMetaSchema),
        ApiError: jsonSchema(apiErrorDetailSchema),
        ApiErrorEnvelope: jsonSchema(apiErrorEnvelopeSchema),
        PaginationQuery: jsonSchema(paginationQuerySchema),
        ApiSuccessEnvelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: {},
            meta: { $ref: "#/components/schemas/ApiResponseMeta" },
          },
          examples: [{ data: { id: "example" }, meta: { total: 1, cursor: null, hasMore: false, requestId: "req_example", apiVersion: API_VERSION } }],
        },
      },
    },
  };
}

export const generateOpenApiDocument = createOpenApiDocument;
