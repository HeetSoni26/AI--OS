import { z } from "zod";
import {
  clientStatusSchema,
  communicationDirectionSchema,
  communicationTypeSchema,
  entityIdSchema,
  isoDateTimeSchema,
  moneyAmountSchema,
  projectStatusSchema,
  projectTypeSchema,
} from "./clients";

export const CLIENT_EVENT_SCHEMA_VERSION = 1 as const;
export const clientEventEntityTypes = ["client", "contact", "project", "communication"] as const;
export const clientEventEntityTypeSchema = z.enum(clientEventEntityTypes);
export type ClientEventEntityType = z.infer<typeof clientEventEntityTypeSchema>;

const eventMetadataSchema = z.strictObject({
  eventId: entityIdSchema,
  schemaVersion: z.literal(CLIENT_EVENT_SCHEMA_VERSION),
  ownerId: entityIdSchema,
  correlationId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  occurredAt: isoDateTimeSchema,
});

/**
 * Safe projection payloads deliberately omit client/contact notes, communication
 * summary/body/next-action, contact names, email addresses, and phone numbers.
 */
export const safeClientEventPayloadSchema = z.strictObject({
  clientId: entityIdSchema,
  name: z.string().trim().min(1).max(255),
  status: clientStatusSchema,
  industry: z.string().trim().max(100).nullable(),
  mrr: moneyAmountSchema,
  archivedAt: isoDateTimeSchema.nullable(),
});
export type SafeClientEventPayload = z.infer<typeof safeClientEventPayloadSchema>;

export const safeContactEventPayloadSchema = z.strictObject({
  contactId: entityIdSchema,
  clientId: entityIdSchema,
  isPrimary: z.boolean(),
  lastContactAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
});
export type SafeContactEventPayload = z.infer<typeof safeContactEventPayloadSchema>;

export const safeProjectEventPayloadSchema = z.strictObject({
  projectId: entityIdSchema,
  clientId: entityIdSchema,
  name: z.string().trim().min(1).max(255),
  type: projectTypeSchema,
  status: projectStatusSchema,
  archivedAt: isoDateTimeSchema.nullable(),
});
export type SafeProjectEventPayload = z.infer<typeof safeProjectEventPayloadSchema>;

export const safeCommunicationEventPayloadSchema = z.strictObject({
  communicationId: entityIdSchema,
  clientId: entityIdSchema,
  contactId: entityIdSchema.nullable(),
  type: communicationTypeSchema,
  direction: communicationDirectionSchema,
  occurredAt: isoDateTimeSchema,
  source: z.string().trim().min(1).max(100).nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
});
export type SafeCommunicationEventPayload = z.infer<typeof safeCommunicationEventPayloadSchema>;

const clientEventTypes = [
  "client.created",
  "client.updated",
  "client.archived",
  "client.recovered",
  "client.deletion_scheduled",
  "client.deletion_cancelled",
  "client.deleted",
] as const;
const contactEventTypes = ["contact.created", "contact.updated", "contact.archived", "contact.recovered", "contact.deleted"] as const;
const projectEventTypes = ["project.created", "project.updated", "project.archived", "project.recovered", "project.deleted"] as const;
const communicationEventTypes = [
  "communication.created",
  "communication.updated",
  "communication.archived",
  "communication.recovered",
  "communication.deleted",
] as const;

export const clientDomainEventTypes = [...clientEventTypes, ...contactEventTypes, ...projectEventTypes, ...communicationEventTypes] as const;
export const clientDomainEventTypeSchema = z.enum(clientDomainEventTypes);
export type ClientDomainEventType = z.infer<typeof clientDomainEventTypeSchema>;

function createEventSchema<TEventType extends readonly [string, ...string[]], TPayload extends z.ZodType>(
  entityType: ClientEventEntityType,
  eventTypes: TEventType,
  payload: TPayload,
) {
  return eventMetadataSchema.extend({
    eventType: z.enum(eventTypes),
    entityType: z.literal(entityType),
    aggregateId: entityIdSchema,
    payload,
  });
}

export const clientEventSchema = createEventSchema("client", clientEventTypes, safeClientEventPayloadSchema);
export type ClientEvent = z.infer<typeof clientEventSchema>;
export const contactEventSchema = createEventSchema("contact", contactEventTypes, safeContactEventPayloadSchema);
export type ContactEvent = z.infer<typeof contactEventSchema>;
export const projectEventSchema = createEventSchema("project", projectEventTypes, safeProjectEventPayloadSchema);
export type ProjectEvent = z.infer<typeof projectEventSchema>;
export const communicationEventSchema = createEventSchema("communication", communicationEventTypes, safeCommunicationEventPayloadSchema);
export type CommunicationEvent = z.infer<typeof communicationEventSchema>;

export const clientDomainEventSchema = z.discriminatedUnion("entityType", [
  clientEventSchema,
  contactEventSchema,
  projectEventSchema,
  communicationEventSchema,
]);
export type ClientDomainEvent = z.infer<typeof clientDomainEventSchema>;
