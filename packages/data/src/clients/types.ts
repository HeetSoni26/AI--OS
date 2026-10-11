import type {
  AssignmentType,
  ClientStatus,
  CommunicationDirection,
  CommunicationType,
  DeletionStatus,
  FilePurpose,
  MalwareScanStatus,
  ProjectStatus,
  ProjectType,
  TaskPriority,
  TaskStatus,
  TimeEntrySource,
} from "../generated/client/enums";
import type { Prisma } from "../generated/client/client";

export interface OwnerIdentity {
  /** Auth provider subject. It must resolve to the active OwnerAccount row. */
  ownerSubject: string;
  /** Database identity from the authenticated session. */
  ownerAccountId: string;
  correlationId: string;
  actorType?: "owner" | "system" | "worker";
  ipHash?: string;
}

export type ClientLifecycle = "active" | "archived" | "deletion_scheduled" | "deleted" | "all";
export type ClientSort = "name" | "mrr" | "startDate" | "status";
export type SortOrder = "asc" | "desc";

export interface ClientListCursor {
  version: 1;
  sort: ClientSort;
  order: SortOrder;
  value: string | null;
  id: string;
}

export interface ListClientsInput {
  q?: string;
  industry?: string;
  status?: ClientStatus | readonly ClientStatus[];
  lifecycle?: ClientLifecycle;
  sort?: ClientSort;
  order?: SortOrder;
  cursor?: string;
  limit?: number;
}

export interface ClientListItem {
  id: string;
  name: string;
  industry: string | null;
  status: ClientStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  logoFileId: string | null;
  mrr: Prisma.Decimal;
  totalRevenue: Prisma.Decimal;
  startDate: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contactCount: number;
  projectCount: number;
}

export interface ListClientsResult {
  items: ClientListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface CreateClientInput {
  id?: string;
  name: string;
  industry?: string | null;
  status?: ClientStatus;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  notes?: string | null;
  logoFileId?: string | null;
  mrr?: Prisma.Decimal | Prisma.DecimalJsLike | string | number;
  totalRevenue?: Prisma.Decimal | Prisma.DecimalJsLike | string | number;
  startDate?: Date | null;
}

export interface UpdateClientInput {
  name?: string;
  industry?: string | null;
  status?: ClientStatus;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  notes?: string | null;
  logoFileId?: string | null;
  mrr?: Prisma.Decimal | Prisma.DecimalJsLike | string | number;
  totalRevenue?: Prisma.Decimal | Prisma.DecimalJsLike | string | number;
  startDate?: Date | null;
}

export interface CreateContactInput {
  id?: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
  lastContactAt?: Date | null;
}

export interface UpdateContactInput {
  name?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
  lastContactAt?: Date | null;
}

export interface CreateProjectInput {
  id?: string;
  name: string;
  type: ProjectType;
  status?: ProjectStatus;
  description?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  price?: Prisma.Decimal | Prisma.DecimalJsLike | string | number | null;
  statusReason?: string;
}

export interface UpdateProjectInput {
  name?: string;
  type?: ProjectType;
  status?: ProjectStatus;
  description?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  price?: Prisma.Decimal | Prisma.DecimalJsLike | string | number | null;
  statusReason?: string;
}

export interface CreateTaskInput {
  id?: string;
  parentTaskId?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: Date | null;
  completedAt?: Date | null;
}

export interface UpdateTaskInput {
  parentTaskId?: string | null;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: Date | null;
  completedAt?: Date | null;
}

export type CreateAssignmentInput =
  | { id?: string; taskId?: string | null; assigneeType: Extract<AssignmentType, "AGENT">; agentId: string; role?: string | null; assignedAt?: Date }
  | { id?: string; taskId: string; assigneeType: Extract<AssignmentType, "HUMAN">; role?: string | null; assignedAt?: Date };

export interface UpdateAssignmentInput {
  role?: string | null;
  completedAt?: Date | null;
}

export interface CreateManualTimeEntryInput {
  id?: string;
  taskId?: string | null;
  assignmentId?: string | null;
  description?: string | null;
  startedAt: Date;
  endedAt: Date;
  minutes?: number;
  hourlyRate?: Prisma.Decimal | Prisma.DecimalJsLike | string | number | null;
}

export interface UpdateManualTimeEntryInput {
  taskId?: string | null;
  assignmentId?: string | null;
  description?: string | null;
  startedAt?: Date;
  endedAt?: Date;
  minutes?: number;
  hourlyRate?: Prisma.Decimal | Prisma.DecimalJsLike | string | number | null;
}

export interface CreateAgentRunTimeEntryInput {
  id?: string;
  agentRunId: string;
  taskId?: string | null;
  assignmentId?: string | null;
  description?: string | null;
  /** Ignored for aggregation; persisted timing is derived from the completed AgentRun. */
  startedAt?: Date;
  /** Ignored for aggregation; persisted timing is derived from the completed AgentRun. */
  endedAt?: Date | null;
  /** Ignored for aggregation; persisted timing is derived from AgentRun.durationMs or timestamps. */
  minutes?: number;
  hourlyRate?: Prisma.Decimal | Prisma.DecimalJsLike | string | number | null;
}

export interface TimeAggregation {
  projectId: string;
  totalMinutes: number;
  manualMinutes: number;
  agentRunMinutes: number;
  billableAmount: Prisma.Decimal;
}

export interface CreateDeliverableInput {
  id?: string;
  title: string;
  description?: string | null;
  position?: number;
  isRequired?: boolean;
  completedAt?: Date | null;
}

export interface UpdateDeliverableInput {
  title?: string;
  description?: string | null;
  isRequired?: boolean;
  completedAt?: Date | null;
}

export interface DeliveryBlocker {
  deliverableId: string;
  title: string;
  reason: "required_incomplete";
}

export interface CommunicationParticipant {
  contactId: string;
}

export interface CreateCommunicationInput {
  id?: string;
  contactId?: string | null;
  contactIds?: readonly string[];
  type: CommunicationType;
  direction?: CommunicationDirection;
  occurredAt: Date;
  summary: string;
  body?: string | null;
  nextAction?: string | null;
  source?: string | null;
  providerMessageId?: string | null;
  providerThreadId?: string | null;
  integrationConnectionId?: string | null;
  ingestedAt?: Date | null;
  metadata?: Prisma.InputJsonValue;
}

export interface ListCommunicationsInput {
  type?: CommunicationType;
  direction?: CommunicationDirection;
  cursor?: string;
  limit?: number;
  order?: "chronological" | "reverse_chronological";
}

export interface NormalizedGmailMessage {
  schemaVersion: 1;
  connectionId: string;
  providerMessageId: string;
  providerThreadId?: string | null;
  occurredAt: Date;
  from: string;
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  summary: string;
  body?: string | null;
  nextAction?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export type GmailIngestionResult =
  | { status: "created"; communications: Array<{ communicationId: string; clientId: string; contactIds: string[] }> }
  | { status: "duplicate"; communications: Array<{ communicationId: string; clientId: string }> }
  | { status: "no_match" };

export interface FileMetadataInput {
  id?: string;
  purpose: FilePurpose;
  bucket: string;
  objectPath: string;
  originalName: string;
  contentType: string;
  sizeBytes: bigint;
  checksumSha256: string;
  ownerEntityType?: string | null;
  ownerEntityId?: string | null;
  malwareScanStatus?: MalwareScanStatus;
  scannedAt?: Date | null;
  storageVersion?: string | null;
}

export interface ClientDeletionImpactItem {
  resourceType: string;
  count: number;
  deletionMode: "cascade" | "detach" | "retain";
}

export interface ClientDeletionImpact {
  clientId: string;
  items: ClientDeletionImpactItem[];
  legalHold: boolean;
  blockers: string[];
}

export interface ScheduleClientDeletionInput {
  confirmation: string;
  impactAcknowledged: boolean;
  reason?: string;
  now?: Date;
}

export interface ClientDeletionPlan {
  id: string;
  clientId: string;
  status: DeletionStatus;
  requestedAt: Date;
  executeAfter: Date;
  recoveryUntil: Date;
  impact: ClientDeletionImpact;
  version: number;
}

export interface AuditSummary {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: string;
  correlationId: string;
  changeSummary: Prisma.JsonValue | null;
  createdAt: Date;
}
