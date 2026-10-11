import type {
  AssignmentCreate,
  AssignmentDto,
  ClientCreate,
  ClientDeletionCancellation,
  ClientDeletionPlan,
  ClientDeletionRequest,
  ClientDeletionState,
  ClientDto,
  ClientInvoicesRelation,
  ClientListDto,
  ClientListQuery,
  ClientUpdate,
  CommunicationCreate,
  CommunicationDto,
  ContactCreate,
  ContactDto,
  ContactUpdate,
  DeliverableCreate,
  DeliverableDto,
  DeliverableReorder,
  DeliverableUpdate,
  ProjectCreate,
  ProjectDetailDto,
  ProjectDto,
  ProjectUpdate,
  TaskCreate,
  TaskDto,
  TaskUpdate,
  TimeAggregation,
  TimeEntryCreate,
  TimeEntryDto,
} from "@aios/contracts";
import { apiFetch } from "@/lib/api-client";

export type ClientAuditSummary = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: string;
  correlationId: string;
  changeSummary: unknown | null;
  createdAt: string;
};

export type ClientDetailDto = ClientDto & {
  auditSummaries?: readonly ClientAuditSummary[];
};

export type AssignmentUpdate = Partial<Pick<AssignmentDto, "role" | "completedAt">>;
export type ManualTimeEntryUpdate = Partial<
  Pick<TimeEntryCreate, "taskId" | "description" | "startedAt" | "endedAt" | "minutes" | "hourlyRate">
>;
type WithoutProjectId<T> = T extends unknown ? Omit<T, "projectId"> : never;
export type AssignmentCreateInput = WithoutProjectId<AssignmentCreate>;

type Collection<T> = readonly T[] | { items: readonly T[] };
type ProjectTimeDto = { items: readonly TimeEntryDto[]; aggregation: TimeAggregation };

function queryString(query: ClientListQuery): string {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit));
  params.set("archiveScope", query.archiveScope);
  params.set("sort", query.sort);
  params.set("direction", query.direction);
  params.set("view", query.view);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.search) params.set("search", query.search);
  if (query.industry) params.set("industry", query.industry);
  if (query.status) {
    const statuses = Array.isArray(query.status) ? query.status : [query.status];
    for (const status of statuses) params.append("status", status);
  }
  return params.toString();
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);
const isItemCollection = <T>(value: Collection<T>): value is { items: readonly T[] } => !Array.isArray(value);
const items = <T>(path: string, init?: RequestInit) => data<Collection<T>>(path, init).then((value) => isItemCollection(value) ? [...value.items] : [...value]);
const projectPath = (clientId: string, projectId: string) => `/api/v1/clients/${clientId}/projects/${projectId}`;

export const clientApi = {
  list: (query: ClientListQuery) => data<ClientListDto>(`/api/v1/clients?${queryString(query)}`),
  detail: (clientId: string) => data<ClientDetailDto>(`/api/v1/clients/${clientId}`),
  create: (input: ClientCreate) => data<ClientDto>("/api/v1/clients", json("POST", input)),
  update: (clientId: string, input: ClientUpdate) => data<ClientDto>(`/api/v1/clients/${clientId}`, json("PATCH", input)),
  archive: (clientId: string, reason = "Archived by owner") => data<ClientDto>(`/api/v1/clients/${clientId}`, json("DELETE", { reason })),
  recover: (clientId: string) => data<ClientDto>(`/api/v1/clients/${clientId}/recover`, json("POST", { reason: "Recovered by owner" })),

  deletionState: (clientId: string) => data<ClientDeletionState>(`/api/v1/clients/${clientId}/deletion`),
  deletionImpact: (clientId: string) => data<ClientDeletionState>(`/api/v1/clients/${clientId}/deletion`).then((state) => state.impact),
  scheduleDeletion: (clientId: string, input: Omit<ClientDeletionRequest, "clientId">) =>
    data<ClientDeletionPlan>(`/api/v1/clients/${clientId}/deletion`, json("POST", { ...input, clientId })),
  cancelDeletion: (clientId: string, deletionPlanId: string, reason = "Cancelled by owner") =>
    data<ClientDeletionPlan>(`/api/v1/clients/${clientId}/deletion`, json("DELETE", { clientId, deletionPlanId, reason } satisfies ClientDeletionCancellation)),

  contacts: (clientId: string) => items<ContactDto>(`/api/v1/clients/${clientId}/contacts`),
  contact: (clientId: string, contactId: string) => data<ContactDto>(`/api/v1/clients/${clientId}/contacts/${contactId}`),
  createContact: (clientId: string, input: Omit<ContactCreate, "clientId">) =>
    data<ContactDto>(`/api/v1/clients/${clientId}/contacts`, json("POST", { ...input, clientId })),
  updateContact: (clientId: string, contactId: string, input: ContactUpdate) => data<ContactDto>(`/api/v1/clients/${clientId}/contacts/${contactId}`, json("PATCH", input)),
  promoteContact: (clientId: string, contactId: string) => data<ContactDto>(`/api/v1/clients/${clientId}/contacts/${contactId}`, json("PATCH", { isPrimary: true } satisfies ContactUpdate)),
  deleteContact: (clientId: string, contactId: string) => data<ContactDto>(`/api/v1/clients/${clientId}/contacts/${contactId}`, json("DELETE")),

  projects: (clientId: string) => items<ProjectDto>(`/api/v1/clients/${clientId}/projects`),
  project: (clientId: string, projectId: string) => data<ProjectDetailDto>(projectPath(clientId, projectId)),
  createProject: (clientId: string, input: Omit<ProjectCreate, "clientId">) =>
    data<ProjectDto>(`/api/v1/clients/${clientId}/projects`, json("POST", { ...input, clientId })),
  updateProject: (clientId: string, projectId: string, input: ProjectUpdate) => data<ProjectDto>(projectPath(clientId, projectId), json("PATCH", input)),
  updateProjectStatus: (clientId: string, projectId: string, status: ProjectUpdate["status"], reason?: string) =>
    data<ProjectDto>(`${projectPath(clientId, projectId)}/status`, json("PATCH", { status, reason })),
  deleteProject: (clientId: string, projectId: string) => data<ProjectDto>(projectPath(clientId, projectId), json("DELETE")),

  tasks: (clientId: string, projectId: string) => items<TaskDto>(`${projectPath(clientId, projectId)}/tasks`),
  createTask: (clientId: string, projectId: string, input: Omit<TaskCreate, "projectId">) =>
    data<TaskDto>(`${projectPath(clientId, projectId)}/tasks`, json("POST", { ...input, projectId })),
  updateTask: (clientId: string, projectId: string, taskId: string, input: TaskUpdate) => data<TaskDto>(`${projectPath(clientId, projectId)}/tasks/${taskId}`, json("PATCH", input)),
  deleteTask: (clientId: string, projectId: string, taskId: string) => data<TaskDto>(`${projectPath(clientId, projectId)}/tasks/${taskId}`, json("DELETE")),

  assignments: (clientId: string, projectId: string) => items<AssignmentDto>(`${projectPath(clientId, projectId)}/assignments`),
  createAssignment: (clientId: string, projectId: string, input: AssignmentCreateInput) =>
    data<AssignmentDto>(`${projectPath(clientId, projectId)}/assignments`, json("POST", { ...input, projectId })),
  updateAssignment: (clientId: string, projectId: string, assignmentId: string, input: AssignmentUpdate) => data<AssignmentDto>(`${projectPath(clientId, projectId)}/assignments/${assignmentId}`, json("PATCH", input)),
  deleteAssignment: (clientId: string, projectId: string, assignmentId: string) => data<AssignmentDto>(`${projectPath(clientId, projectId)}/assignments/${assignmentId}`, json("DELETE")),

  projectTime: (clientId: string, projectId: string) => data<ProjectTimeDto>(`${projectPath(clientId, projectId)}/time`),
  createManualTimeEntry: (clientId: string, projectId: string, input: Omit<TimeEntryCreate, "projectId" | "source" | "agentRunId">) =>
    data<TimeEntryDto>(`${projectPath(clientId, projectId)}/time`, json("POST", { ...input, projectId })),
  updateManualTimeEntry: (clientId: string, projectId: string, timeEntryId: string, input: ManualTimeEntryUpdate) => data<TimeEntryDto>(`${projectPath(clientId, projectId)}/time/${timeEntryId}`, json("PATCH", input)),
  deleteManualTimeEntry: (clientId: string, projectId: string, timeEntryId: string) => data<TimeEntryDto>(`${projectPath(clientId, projectId)}/time/${timeEntryId}`, json("DELETE")),

  deliverables: (clientId: string, projectId: string) => items<DeliverableDto>(`${projectPath(clientId, projectId)}/deliverables`),
  createDeliverable: (clientId: string, projectId: string, input: Omit<DeliverableCreate, "projectId">) =>
    data<DeliverableDto>(`${projectPath(clientId, projectId)}/deliverables`, json("POST", { ...input, projectId })),
  updateDeliverable: (clientId: string, projectId: string, deliverableId: string, input: DeliverableUpdate) => data<DeliverableDto>(`${projectPath(clientId, projectId)}/deliverables/${deliverableId}`, json("PATCH", input)),
  deleteDeliverable: (clientId: string, projectId: string, deliverableId: string) => data<DeliverableDto>(`${projectPath(clientId, projectId)}/deliverables/${deliverableId}`, json("DELETE")),
  reorderDeliverables: (clientId: string, projectId: string, orderedDeliverableIds: string[]) =>
    items<DeliverableDto>(`${projectPath(clientId, projectId)}/deliverables/reorder`, json("PATCH", { projectId, orderedDeliverableIds } satisfies DeliverableReorder)),

  communications: (clientId: string) => items<CommunicationDto>(`/api/v1/clients/${clientId}/communications?limit=100&order=reverse_chronological`),
  createCommunication: (clientId: string, input: Omit<CommunicationCreate, "clientId">) =>
    data<CommunicationDto>(`/api/v1/clients/${clientId}/communications`, json("POST", { ...input, clientId })),
  invoices: (clientId: string) => data<ClientInvoicesRelation>(`/api/v1/clients/${clientId}/invoices?limit=100`),

  uploadLogo: (clientId: string, file: File) => data<{ logoUrl: string; width: number; height: number }>(`/api/v1/clients/${clientId}/logo`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  }),
  deleteLogo: (clientId: string) => data<{ removed: boolean }>(`/api/v1/clients/${clientId}/logo`, { method: "DELETE" }),
};
