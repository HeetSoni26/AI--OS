import {
  CLIENT_EVENT_SCHEMA_VERSION,
  clientEventSchema,
  communicationEventSchema,
  contactEventSchema,
  projectEventSchema,
  type ClientDto,
  type ClientEvent,
  type CommunicationDto,
  type CommunicationEvent,
  type ContactDto,
  type ContactEvent,
  type ProjectDto,
  type ProjectEvent,
} from "@aios/contracts";

export interface DomainEventContext {
  eventId: string;
  ownerId: string;
  correlationId: string;
  occurredAt: string;
}

type ClientEventType = ClientEvent["eventType"];
type ContactEventType = ContactEvent["eventType"];
type ProjectEventType = ProjectEvent["eventType"];
type CommunicationEventType = CommunicationEvent["eventType"];

function eventMetadata(context: DomainEventContext) {
  return {
    ...context,
    schemaVersion: CLIENT_EVENT_SCHEMA_VERSION,
  } as const;
}

export function createSafeClientEvent(
  eventType: ClientEventType,
  client: Pick<ClientDto, "id" | "name" | "status" | "industry" | "mrr" | "archivedAt">,
  context: DomainEventContext,
): ClientEvent {
  return clientEventSchema.parse({
    ...eventMetadata(context),
    eventType,
    entityType: "client",
    aggregateId: client.id,
    payload: {
      clientId: client.id,
      name: client.name,
      status: client.status,
      industry: client.industry,
      mrr: client.mrr,
      archivedAt: client.archivedAt,
    },
  });
}

export function createSafeContactEvent(
  eventType: ContactEventType,
  contact: Pick<ContactDto, "id" | "clientId" | "isPrimary" | "lastContactAt" | "archivedAt">,
  context: DomainEventContext,
): ContactEvent {
  return contactEventSchema.parse({
    ...eventMetadata(context),
    eventType,
    entityType: "contact",
    aggregateId: contact.id,
    payload: {
      contactId: contact.id,
      clientId: contact.clientId,
      isPrimary: contact.isPrimary,
      lastContactAt: contact.lastContactAt,
      archivedAt: contact.archivedAt,
    },
  });
}

export function createSafeProjectEvent(
  eventType: ProjectEventType,
  project: Pick<ProjectDto, "id" | "clientId" | "name" | "type" | "status" | "archivedAt">,
  context: DomainEventContext,
): ProjectEvent {
  return projectEventSchema.parse({
    ...eventMetadata(context),
    eventType,
    entityType: "project",
    aggregateId: project.id,
    payload: {
      projectId: project.id,
      clientId: project.clientId,
      name: project.name,
      type: project.type,
      status: project.status,
      archivedAt: project.archivedAt,
    },
  });
}

export function createSafeCommunicationEvent(
  eventType: CommunicationEventType,
  communication: Pick<
    CommunicationDto,
    "id" | "clientId" | "contactId" | "type" | "direction" | "occurredAt" | "source" | "archivedAt"
  >,
  context: DomainEventContext,
): CommunicationEvent {
  return communicationEventSchema.parse({
    ...eventMetadata(context),
    eventType,
    entityType: "communication",
    aggregateId: communication.id,
    payload: {
      communicationId: communication.id,
      clientId: communication.clientId,
      contactId: communication.contactId,
      type: communication.type,
      direction: communication.direction,
      occurredAt: communication.occurredAt,
      source: communication.source,
      archivedAt: communication.archivedAt,
    },
  });
}
