import type {
  AssignmentCreate,
  AssignmentDto,
  ClientArchiveRequest,
  ClientCreate,
  ClientDeletionCancellation,
  ClientDeletionImpact,
  ClientDeletionPlan,
  ClientDto,
  ClientInvoicesRelation,
  ClientListDto,
  ClientListQuery,
  ClientRecoverRequest,
  ClientUpdate,
  CommunicationCreate,
  CommunicationDto,
  CommunicationListQuery,
  CommunicationUpdate,
  ContactCreate,
  ContactDto,
  ContactUpdate,
  DeliverableCreate,
  DeliverableDto,
  DeliverableReorder,
  DeliverableUpdate,
  GmailMessageMatchResult,
  GmailNormalizedMessage,
  ProjectCreate,
  ProjectDto,
  ProjectUpdate,
  TaskCreate,
  TaskDto,
  TaskUpdate,
  TimeAggregation,
  TimeEntryCreate,
  TimeEntryDto,
} from "@aios/contracts";
import type { ClientDeletionImpactRegistry } from "./lifecycle";

export interface ClientRepository {
  list(query: ClientListQuery): Promise<ClientListDto>;
  findById(clientId: string, options?: { includeArchived?: boolean }): Promise<ClientDto | null>;
  create(input: ClientCreate): Promise<ClientDto>;
  update(clientId: string, input: ClientUpdate): Promise<ClientDto>;
  archive(clientId: string, input: ClientArchiveRequest, archivedAt: string): Promise<ClientDto>;
  recover(clientId: string, input: ClientRecoverRequest): Promise<ClientDto>;
}

export interface ContactRepository {
  listByClient(clientId: string, options?: { includeArchived?: boolean }): Promise<readonly ContactDto[]>;
  findById(contactId: string): Promise<ContactDto | null>;
  create(input: ContactCreate): Promise<ContactDto>;
  update(contactId: string, input: ContactUpdate): Promise<ContactDto>;
  archive(contactId: string, archivedAt: string): Promise<void>;
  clearPrimary(clientId: string, exceptContactId?: string): Promise<void>;
  updateLastContactAt(contactIds: readonly string[], occurredAt: string): Promise<void>;
}

export interface ProjectRepository {
  listByClient(clientId: string, options?: { includeArchived?: boolean }): Promise<readonly ProjectDto[]>;
  findById(projectId: string): Promise<ProjectDto | null>;
  create(input: ProjectCreate): Promise<ProjectDto>;
  update(projectId: string, input: ProjectUpdate): Promise<ProjectDto>;
  archive(projectId: string, archivedAt: string): Promise<void>;
}

export interface TaskRepository {
  listByProject(projectId: string, options?: { includeArchived?: boolean }): Promise<readonly TaskDto[]>;
  create(input: TaskCreate): Promise<TaskDto>;
  update(taskId: string, input: TaskUpdate): Promise<TaskDto>;
  archive(taskId: string, archivedAt: string): Promise<void>;
}

export interface AssignmentRepository {
  listByProject(projectId: string, options?: { includeArchived?: boolean }): Promise<readonly AssignmentDto[]>;
  create(input: AssignmentCreate): Promise<AssignmentDto>;
  complete(assignmentId: string, completedAt: string): Promise<AssignmentDto>;
  archive(assignmentId: string, archivedAt: string): Promise<void>;
}

export interface TimeEntryRepository {
  listByProject(projectId: string, options?: { includeArchived?: boolean }): Promise<readonly TimeEntryDto[]>;
  create(input: TimeEntryCreate): Promise<TimeEntryDto>;
  aggregateByProject(projectId: string): Promise<TimeAggregation>;
  existsForAgentRun(agentRunId: string): Promise<boolean>;
  archive(timeEntryId: string, archivedAt: string): Promise<void>;
}

export interface AgentRunDurationPort {
  getCompletedRunDuration(agentRunId: string): Promise<{
    agentRunId: string;
    projectId: string;
    taskId: string | null;
    startedAt: string;
    endedAt: string;
    durationMs: number;
  } | null>;
}

export interface DeliverableRepository {
  listByProject(projectId: string, options?: { includeArchived?: boolean }): Promise<readonly DeliverableDto[]>;
  create(input: DeliverableCreate): Promise<DeliverableDto>;
  update(deliverableId: string, input: DeliverableUpdate): Promise<DeliverableDto>;
  reorder(input: DeliverableReorder): Promise<readonly DeliverableDto[]>;
  archive(deliverableId: string, archivedAt: string): Promise<void>;
}

export interface CommunicationRepository {
  listByClient(clientId: string, query: CommunicationListQuery): Promise<readonly CommunicationDto[]>;
  create(input: CommunicationCreate): Promise<CommunicationDto>;
  update(communicationId: string, input: CommunicationUpdate): Promise<CommunicationDto>;
  providerMessageExists(source: string, providerMessageId: string): Promise<boolean>;
  archive(communicationId: string, archivedAt: string): Promise<void>;
}

export interface InvoiceRelationRepository {
  listByClient(clientId: string, query: { cursor?: string; limit: number }): Promise<ClientInvoicesRelation>;
}

export interface ClientDeletionRepository {
  findActiveByClient(clientId: string): Promise<ClientDeletionPlan | null>;
  create(plan: ClientDeletionPlan): Promise<ClientDeletionPlan>;
  cancel(input: ClientDeletionCancellation, cancelledAt: string): Promise<ClientDeletionPlan>;
  markExecuting(planId: string, version: number): Promise<ClientDeletionPlan>;
  markCompleted(planId: string, version: number, completedAt: string): Promise<ClientDeletionPlan>;
  permanentlyDeleteClient(clientId: string, impact: ClientDeletionImpact): Promise<void>;
}

export interface GmailMessageSourcePort {
  readonly provider: "gmail";
  connectionStatus(connectionId: string): Promise<"connected" | "degraded" | "revoked" | "disabled">;
  fetchNormalizedMessage(connectionId: string, providerMessageId: string): Promise<GmailNormalizedMessage>;
}

export interface GmailMessageIngestionPort {
  ingest(message: GmailNormalizedMessage): Promise<GmailMessageMatchResult>;
}

export interface ClientDomainEventPublisher<TEvent = unknown> {
  publish(event: TEvent): Promise<void>;
}

export interface ClientUnitOfWork {
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}

export interface ClockPort {
  now(): Date;
}

export interface IdGeneratorPort {
  uuid(): string;
}

export interface ClientApplicationPorts {
  clients: ClientRepository;
  contacts: ContactRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  assignments: AssignmentRepository;
  timeEntries: TimeEntryRepository;
  agentRuns: AgentRunDurationPort;
  deliverables: DeliverableRepository;
  communications: CommunicationRepository;
  invoices: InvoiceRelationRepository;
  deletions: ClientDeletionRepository;
  deletionImpacts: ClientDeletionImpactRegistry;
  gmail: GmailMessageSourcePort;
  events: ClientDomainEventPublisher;
  unitOfWork: ClientUnitOfWork;
  clock: ClockPort;
  ids: IdGeneratorPort;
}
