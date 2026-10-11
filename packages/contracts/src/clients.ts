import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const clientStatuses = ["prospect", "onboarding", "active", "paused", "churned"] as const;
export const clientStatusSchema = z.enum(clientStatuses);
export type ClientStatus = z.infer<typeof clientStatusSchema>;
export const CLIENT_STATUS_LABELS = {
  prospect: "Prospect",
  onboarding: "Onboarding",
  active: "Active",
  paused: "Paused",
  churned: "Churned",
} as const satisfies Record<ClientStatus, string>;

export const projectTypes = ["chatbot", "workflow", "content", "lead_gen", "custom"] as const;
export const projectTypeSchema = z.enum(projectTypes);
export type ProjectType = z.infer<typeof projectTypeSchema>;
export const PROJECT_TYPE_LABELS = {
  chatbot: "Chatbot Build",
  workflow: "Workflow Automation",
  content: "Content Package",
  lead_gen: "Lead Generation",
  custom: "Custom",
} as const satisfies Record<ProjectType, string>;

export const projectStatuses = ["planning", "in_progress", "review", "delivered", "revision", "complete"] as const;
export const projectStatusSchema = z.enum(projectStatuses);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export const PROJECT_STATUS_LABELS = {
  planning: "Planning",
  in_progress: "In Progress",
  review: "Review",
  delivered: "Delivered",
  revision: "Revision",
  complete: "Complete",
} as const satisfies Record<ProjectStatus, string>;

export const taskStatuses = ["backlog", "todo", "in_progress", "blocked", "review", "done", "cancelled"] as const;
export const taskStatusSchema = z.enum(taskStatuses);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const TASK_STATUS_LABELS = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
} as const satisfies Record<TaskStatus, string>;

export const taskPriorities = ["low", "medium", "high", "critical"] as const;
export const taskPrioritySchema = z.enum(taskPriorities);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export const TASK_PRIORITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
} as const satisfies Record<TaskPriority, string>;

export const assignmentTypes = ["agent", "human"] as const;
export const assignmentTypeSchema = z.enum(assignmentTypes);
export type AssignmentType = z.infer<typeof assignmentTypeSchema>;
export const ASSIGNMENT_TYPE_LABELS = { agent: "AI Agent", human: "Human" } as const satisfies Record<AssignmentType, string>;

export const timeEntrySources = ["manual", "agent_run"] as const;
export const timeEntrySourceSchema = z.enum(timeEntrySources);
export type TimeEntrySource = z.infer<typeof timeEntrySourceSchema>;
export const TIME_ENTRY_SOURCE_LABELS = { manual: "Manual", agent_run: "Agent Run" } as const satisfies Record<TimeEntrySource, string>;

export const communicationTypes = ["email", "note", "call_summary", "slack_message", "social_dm", "chatbot"] as const;
export const communicationTypeSchema = z.enum(communicationTypes);
export type CommunicationType = z.infer<typeof communicationTypeSchema>;
export const COMMUNICATION_TYPE_LABELS = {
  email: "Email",
  note: "Note",
  call_summary: "Call Summary",
  slack_message: "Slack Message",
  social_dm: "Social Direct Message",
  chatbot: "Chatbot",
} as const satisfies Record<CommunicationType, string>;

export const communicationDirections = ["inbound", "outbound", "internal"] as const;
export const communicationDirectionSchema = z.enum(communicationDirections);
export type CommunicationDirection = z.infer<typeof communicationDirectionSchema>;
export const COMMUNICATION_DIRECTION_LABELS = {
  inbound: "Inbound",
  outbound: "Outbound",
  internal: "Internal",
} as const satisfies Record<CommunicationDirection, string>;

export const invoiceTypes = ["one_time", "recurring", "usage"] as const;
export const invoiceTypeSchema = z.enum(invoiceTypes);
export type InvoiceType = z.infer<typeof invoiceTypeSchema>;
export const INVOICE_TYPE_LABELS = { one_time: "One-time", recurring: "Recurring", usage: "Usage" } as const satisfies Record<InvoiceType, string>;

export const invoiceStatuses = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
export const invoiceStatusSchema = z.enum(invoiceStatuses);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export const INVOICE_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
} as const satisfies Record<InvoiceStatus, string>;

export const entityIdSchema = z.uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable();
export const dateOnlySchema = z.iso.date();
export const normalizedEmailSchema = z
  .string()
  .trim()
  .max(320)
  .email()
  .transform((email) => email.toLowerCase());
export const phoneSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[0-9+().\-\s]+$/, "Phone number contains unsupported characters.");
export const websiteSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((website) => {
    try {
      const protocol = new URL(website).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Website must use HTTP or HTTPS.");
export const moneyAmountSchema = z.number().finite().nonnegative().max(999_999_999_999.99);
export const currencyCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

const optionalNullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const optionalNullableEmail = normalizedEmailSchema.nullable().optional();
const optionalNullablePhone = phoneSchema.nullable().optional();
const optionalNullableWebsite = websiteSchema.nullable().optional();
const optionalNullableDate = dateOnlySchema.nullable().optional();

export const clientCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  industry: optionalNullableText(100),
  status: clientStatusSchema.default("prospect"),
  contactName: optionalNullableText(255),
  contactEmail: optionalNullableEmail,
  contactPhone: optionalNullablePhone,
  website: optionalNullableWebsite,
  notes: optionalNullableText(20_000),
  logoFileId: entityIdSchema.nullable().optional(),
  mrr: moneyAmountSchema.default(0),
  totalRevenue: moneyAmountSchema.default(0),
  startDate: optionalNullableDate,
});
export type ClientCreate = z.infer<typeof clientCreateSchema>;

export const clientUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(255).optional(),
    industry: optionalNullableText(100),
    status: clientStatusSchema.optional(),
    contactName: optionalNullableText(255),
    contactEmail: optionalNullableEmail,
    contactPhone: optionalNullablePhone,
    website: optionalNullableWebsite,
    notes: optionalNullableText(20_000),
    logoFileId: entityIdSchema.nullable().optional(),
    mrr: moneyAmountSchema.optional(),
    totalRevenue: moneyAmountSchema.optional(),
    startDate: optionalNullableDate,
  })
  .refine((value) => Object.keys(value).length > 0, "At least one client field must be supplied.");
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

export const clientSortFields = ["name", "mrr", "startDate", "status"] as const;
export const clientSortFieldSchema = z.enum(clientSortFields);
export type ClientSortField = z.infer<typeof clientSortFieldSchema>;
export const sortDirectionSchema = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof sortDirectionSchema>;
export const archiveScopeSchema = z.enum(["active", "archived", "all"]);
export type ArchiveScope = z.infer<typeof archiveScopeSchema>;

export const clientListFilterSchema = z.strictObject({
  search: z.string().trim().min(1).max(200).optional(),
  statuses: z.array(clientStatusSchema).max(clientStatuses.length).optional(),
  industry: z.string().trim().min(1).max(100).optional(),
  archiveScope: archiveScopeSchema.default("active"),
});
export type ClientListFilter = z.infer<typeof clientListFilterSchema>;

export const clientListSortSchema = z.strictObject({
  field: clientSortFieldSchema.default("name"),
  direction: sortDirectionSchema.default("asc"),
});
export type ClientListSort = z.infer<typeof clientListSortSchema>;

export const clientListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.union([clientStatusSchema, z.array(clientStatusSchema)]).optional(),
  industry: z.string().trim().min(1).max(100).optional(),
  archiveScope: archiveScopeSchema.default("active"),
  sort: clientSortFieldSchema.default("name"),
  direction: sortDirectionSchema.default("asc"),
  view: z.enum(["list", "grid"]).default("list"),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const clientCursorPayloadSchema = z.strictObject({
  version: z.literal(1),
  sort: clientSortFieldSchema,
  direction: sortDirectionSchema,
  value: z.union([z.string(), z.number(), z.null()]),
  id: entityIdSchema,
});
export type ClientCursorPayload = z.infer<typeof clientCursorPayloadSchema>;

export const clientSummarySchema = z.strictObject({
  id: entityIdSchema,
  name: z.string().min(1).max(255),
  industry: z.string().max(100).nullable(),
  status: clientStatusSchema,
  website: websiteSchema.nullable(),
  logoFileId: entityIdSchema.nullable(),
  mrr: moneyAmountSchema,
  totalRevenue: moneyAmountSchema,
  startDate: dateOnlySchema.nullable(),
  primaryContactId: entityIdSchema.nullable(),
  primaryContactName: z.string().max(255).nullable(),
  projectCount: z.number().int().nonnegative(),
  contactCount: z.number().int().nonnegative(),
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ClientSummary = z.infer<typeof clientSummarySchema>;

export const clientListDtoSchema = z.strictObject({
  items: z.array(clientSummarySchema),
  nextCursor: cursorSchema.nullable(),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative(),
});
export type ClientListDto = z.infer<typeof clientListDtoSchema>;

export const clientDtoSchema = clientSummarySchema.extend({
  contactName: z.string().max(255).nullable(),
  contactEmail: normalizedEmailSchema.nullable(),
  contactPhone: phoneSchema.nullable(),
  notes: z.string().max(20_000).nullable(),
  deletedAt: nullableIsoDateTimeSchema,
});
export type ClientDto = z.infer<typeof clientDtoSchema>;

export const contactCreateSchema = z.strictObject({
  clientId: entityIdSchema,
  name: z.string().trim().min(1).max(255),
  role: optionalNullableText(150),
  email: optionalNullableEmail,
  phone: optionalNullablePhone,
  notes: optionalNullableText(20_000),
  isPrimary: z.boolean().default(false),
  lastContactAt: nullableIsoDateTimeSchema.optional(),
});
export type ContactCreate = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(255).optional(),
    role: optionalNullableText(150),
    email: optionalNullableEmail,
    phone: optionalNullablePhone,
    notes: optionalNullableText(20_000),
    isPrimary: z.boolean().optional(),
    lastContactAt: nullableIsoDateTimeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one contact field must be supplied.");
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;

export const contactDtoSchema = z.strictObject({
  id: entityIdSchema,
  clientId: entityIdSchema,
  name: z.string().min(1).max(255),
  role: z.string().max(150).nullable(),
  email: normalizedEmailSchema.nullable(),
  phone: phoneSchema.nullable(),
  notes: z.string().max(20_000).nullable(),
  isPrimary: z.boolean(),
  lastContactAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ContactDto = z.infer<typeof contactDtoSchema>;

function validateProjectDates(value: { startDate?: string | null; dueDate?: string | null }, context: z.RefinementCtx): void {
  if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Due date must not be before the start date." });
  }
}

export const projectCreateSchema = z
  .strictObject({
    clientId: entityIdSchema,
    name: z.string().trim().min(1).max(255),
    type: projectTypeSchema,
    status: projectStatusSchema.default("planning"),
    description: optionalNullableText(20_000),
    startDate: optionalNullableDate,
    dueDate: optionalNullableDate,
    price: moneyAmountSchema.nullable().optional(),
  })
  .superRefine(validateProjectDates);
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(255).optional(),
    type: projectTypeSchema.optional(),
    status: projectStatusSchema.optional(),
    description: optionalNullableText(20_000),
    startDate: optionalNullableDate,
    dueDate: optionalNullableDate,
    price: moneyAmountSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one project field must be supplied.")
  .superRefine(validateProjectDates);
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const projectDtoSchema = z.strictObject({
  id: entityIdSchema,
  clientId: entityIdSchema,
  name: z.string().min(1).max(255),
  type: projectTypeSchema,
  status: projectStatusSchema,
  description: z.string().max(20_000).nullable(),
  startDate: dateOnlySchema.nullable(),
  dueDate: dateOnlySchema.nullable(),
  price: moneyAmountSchema.nullable(),
  hoursSpent: z.number().finite().nonnegative(),
  taskCount: z.number().int().nonnegative(),
  deliverableCount: z.number().int().nonnegative(),
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const projectStatusHistorySchema = z.strictObject({
  id: entityIdSchema,
  projectId: entityIdSchema,
  fromStatus: projectStatusSchema.nullable(),
  toStatus: projectStatusSchema,
  changedAt: isoDateTimeSchema,
  changedBy: z.string().min(1).max(255).nullable(),
  reason: z.string().max(2_000).nullable(),
});
export type ProjectStatusHistory = z.infer<typeof projectStatusHistorySchema>;
export const projectDetailDtoSchema = projectDtoSchema.extend({
  statusHistory: z.array(projectStatusHistorySchema),
});
export type ProjectDetailDto = z.infer<typeof projectDetailDtoSchema>;

export const taskCreateSchema = z.strictObject({
  projectId: entityIdSchema,
  parentTaskId: entityIdSchema.nullable().optional(),
  title: z.string().trim().min(1).max(500),
  description: optionalNullableText(20_000),
  status: taskStatusSchema.default("todo"),
  priority: taskPrioritySchema.default("medium"),
  dueAt: nullableIsoDateTimeSchema.optional(),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .strictObject({
    parentTaskId: entityIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(500).optional(),
    description: optionalNullableText(20_000),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    dueAt: nullableIsoDateTimeSchema.optional(),
    completedAt: nullableIsoDateTimeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one task field must be supplied.");
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const taskDtoSchema = z.strictObject({
  id: entityIdSchema,
  projectId: entityIdSchema,
  parentTaskId: entityIdSchema.nullable(),
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: nullableIsoDateTimeSchema,
  completedAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TaskDto = z.infer<typeof taskDtoSchema>;

const assignmentBaseShape = {
  projectId: entityIdSchema,
  role: optionalNullableText(150),
  assignedAt: isoDateTimeSchema.optional(),
};
export const agentAssignmentCreateSchema = z.strictObject({
  ...assignmentBaseShape,
  taskId: entityIdSchema.nullable().optional(),
  assigneeType: z.literal("agent"),
  agentId: entityIdSchema,
});
export const humanAssignmentCreateSchema = z.strictObject({
  ...assignmentBaseShape,
  taskId: entityIdSchema,
  assigneeType: z.literal("human"),
});
export const assignmentCreateSchema = z.discriminatedUnion("assigneeType", [agentAssignmentCreateSchema, humanAssignmentCreateSchema]);
export type AssignmentCreate = z.infer<typeof assignmentCreateSchema>;

export const assignmentDtoSchema = z.strictObject({
  id: entityIdSchema,
  projectId: entityIdSchema,
  taskId: entityIdSchema.nullable(),
  assigneeType: assignmentTypeSchema,
  agentId: entityIdSchema.nullable(),
  ownerSubject: z.string().max(255).nullable(),
  role: z.string().max(150).nullable(),
  assignedAt: isoDateTimeSchema,
  completedAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
});
export type AssignmentDto = z.infer<typeof assignmentDtoSchema>;

export const timeEntryCreateSchema = z
  .strictObject({
    projectId: entityIdSchema,
    taskId: entityIdSchema.nullable().optional(),
    agentRunId: entityIdSchema.nullable().optional(),
    source: timeEntrySourceSchema,
    description: optionalNullableText(2_000),
    startedAt: isoDateTimeSchema,
    endedAt: nullableIsoDateTimeSchema.optional(),
    minutes: z.number().int().positive().max(525_600),
    hourlyRate: moneyAmountSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.endedAt && new Date(value.endedAt) <= new Date(value.startedAt)) {
      context.addIssue({ code: "custom", path: ["endedAt"], message: "End time must be after start time." });
    }
    if (value.source === "agent_run" && !value.agentRunId) {
      context.addIssue({ code: "custom", path: ["agentRunId"], message: "Agent-run time requires an agent run ID." });
    }
    if (value.source === "manual" && value.agentRunId) {
      context.addIssue({ code: "custom", path: ["agentRunId"], message: "Manual time must not reference an agent run." });
    }
  });
export type TimeEntryCreate = z.infer<typeof timeEntryCreateSchema>;

export const timeEntryDtoSchema = z.strictObject({
  id: entityIdSchema,
  projectId: entityIdSchema,
  taskId: entityIdSchema.nullable(),
  agentRunId: entityIdSchema.nullable(),
  source: timeEntrySourceSchema,
  description: z.string().max(2_000).nullable(),
  startedAt: isoDateTimeSchema,
  endedAt: nullableIsoDateTimeSchema,
  minutes: z.number().int().positive(),
  hourlyRate: moneyAmountSchema.nullable(),
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TimeEntryDto = z.infer<typeof timeEntryDtoSchema>;

export const timeAggregationSchema = z.strictObject({
  projectId: entityIdSchema,
  totalMinutes: z.number().int().nonnegative(),
  manualMinutes: z.number().int().nonnegative(),
  agentRunMinutes: z.number().int().nonnegative(),
  billableAmount: moneyAmountSchema,
});
export type TimeAggregation = z.infer<typeof timeAggregationSchema>;

export const deliverableCreateSchema = z.strictObject({
  projectId: entityIdSchema,
  title: z.string().trim().min(1).max(500),
  description: optionalNullableText(20_000),
  position: z.number().int().nonnegative(),
  isRequired: z.boolean().default(true),
});
export type DeliverableCreate = z.infer<typeof deliverableCreateSchema>;

export const deliverableUpdateSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(500).optional(),
    description: optionalNullableText(20_000),
    isRequired: z.boolean().optional(),
    completedAt: nullableIsoDateTimeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one deliverable field must be supplied.");
export type DeliverableUpdate = z.infer<typeof deliverableUpdateSchema>;

export const deliverableDtoSchema = z.strictObject({
  id: entityIdSchema,
  projectId: entityIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).nullable(),
  position: z.number().int().nonnegative(),
  isRequired: z.boolean(),
  completedAt: nullableIsoDateTimeSchema,
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type DeliverableDto = z.infer<typeof deliverableDtoSchema>;

export const deliverableReorderSchema = z
  .strictObject({
    projectId: entityIdSchema,
    orderedDeliverableIds: z.array(entityIdSchema).min(1).max(1_000),
  })
  .refine((value) => new Set(value.orderedDeliverableIds).size === value.orderedDeliverableIds.length, {
    path: ["orderedDeliverableIds"],
    message: "Deliverable IDs must be unique.",
  });
export type DeliverableReorder = z.infer<typeof deliverableReorderSchema>;

export const deliveryBlockerSchema = z.strictObject({
  deliverableId: entityIdSchema,
  title: z.string().min(1).max(500),
  reason: z.literal("required_incomplete"),
});
export type DeliveryBlocker = z.infer<typeof deliveryBlockerSchema>;
export const deliveryGateResultSchema = z.discriminatedUnion("allowed", [
  z.strictObject({ allowed: z.literal(true), blockers: z.tuple([]) }),
  z.strictObject({ allowed: z.literal(false), blockers: z.array(deliveryBlockerSchema).min(1) }),
]);
export type DeliveryGateResult = z.infer<typeof deliveryGateResultSchema>;

export const communicationCreateSchema = z.strictObject({
  clientId: entityIdSchema,
  contactId: entityIdSchema.nullable().optional(),
  type: communicationTypeSchema,
  direction: communicationDirectionSchema.default("internal"),
  occurredAt: isoDateTimeSchema,
  summary: z.string().trim().min(1).max(5_000),
  body: optionalNullableText(100_000),
  nextAction: optionalNullableText(5_000),
  source: optionalNullableText(100),
  providerMessageId: optionalNullableText(255),
});
export type CommunicationCreate = z.infer<typeof communicationCreateSchema>;

export const communicationUpdateSchema = z
  .strictObject({
    contactId: entityIdSchema.nullable().optional(),
    type: communicationTypeSchema.optional(),
    direction: communicationDirectionSchema.optional(),
    occurredAt: isoDateTimeSchema.optional(),
    summary: z.string().trim().min(1).max(5_000).optional(),
    body: optionalNullableText(100_000),
    nextAction: optionalNullableText(5_000),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one communication field must be supplied.");
export type CommunicationUpdate = z.infer<typeof communicationUpdateSchema>;

export const communicationDtoSchema = z.strictObject({
  id: entityIdSchema,
  clientId: entityIdSchema,
  contactId: entityIdSchema.nullable(),
  type: communicationTypeSchema,
  direction: communicationDirectionSchema,
  occurredAt: isoDateTimeSchema,
  summary: z.string().min(1).max(5_000),
  body: z.string().max(100_000).nullable(),
  nextAction: z.string().max(5_000).nullable(),
  source: z.string().max(100).nullable(),
  providerMessageId: z.string().max(255).nullable(),
  archivedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CommunicationDto = z.infer<typeof communicationDtoSchema>;

export const communicationListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  type: communicationTypeSchema.optional(),
  direction: communicationDirectionSchema.optional(),
  order: z.enum(["chronological", "reverse_chronological"]).default("reverse_chronological"),
});
export type CommunicationListQuery = z.infer<typeof communicationListQuerySchema>;

export const clientArchiveRequestSchema = z.strictObject({ reason: z.string().trim().min(1).max(2_000).optional() });
export type ClientArchiveRequest = z.infer<typeof clientArchiveRequestSchema>;
export const clientRecoverRequestSchema = z.strictObject({ reason: z.string().trim().min(1).max(2_000).optional() });
export type ClientRecoverRequest = z.infer<typeof clientRecoverRequestSchema>;
export const clientDeletionRequestSchema = z
  .strictObject({
    clientId: entityIdSchema,
    confirmation: z.string(),
    impactAcknowledged: z.literal(true),
    reason: z.string().trim().min(1).max(2_000).optional(),
  })
  .refine((value) => value.confirmation === `DELETE ${value.clientId}`, {
    path: ["confirmation"],
    message: "Confirmation must exactly match DELETE followed by the client ID.",
  });
export type ClientDeletionRequest = z.infer<typeof clientDeletionRequestSchema>;

export const deletionImpactItemSchema = z.strictObject({
  resourceType: z.string().trim().min(1).max(100),
  count: z.number().int().nonnegative(),
  deletionMode: z.enum(["cascade", "detach", "provider_delete", "retain"]),
});
export type DeletionImpactItem = z.infer<typeof deletionImpactItemSchema>;
export const clientDeletionImpactSchema = z.strictObject({
  clientId: entityIdSchema,
  items: z.array(deletionImpactItemSchema),
  legalHold: z.boolean(),
  blockers: z.array(z.string().min(1).max(500)),
});
export type ClientDeletionImpact = z.infer<typeof clientDeletionImpactSchema>;

export const clientDeletionPlanSchema = z.strictObject({
  id: entityIdSchema,
  clientId: entityIdSchema,
  status: z.enum(["pending", "cancelled", "executing", "completed", "failed", "recovered"]),
  requestedAt: isoDateTimeSchema,
  notBefore: isoDateTimeSchema,
  cancelledAt: nullableIsoDateTimeSchema,
  completedAt: nullableIsoDateTimeSchema,
  impact: clientDeletionImpactSchema,
  version: z.number().int().positive(),
});
export type ClientDeletionPlan = z.infer<typeof clientDeletionPlanSchema>;
export const clientDeletionStateSchema = z.strictObject({
  impact: clientDeletionImpactSchema,
  plan: clientDeletionPlanSchema.nullable(),
});
export type ClientDeletionState = z.infer<typeof clientDeletionStateSchema>;
export const clientDeletionCancellationSchema = z.strictObject({
  clientId: entityIdSchema,
  deletionPlanId: entityIdSchema,
  reason: z.string().trim().min(1).max(2_000).optional(),
});
export type ClientDeletionCancellation = z.infer<typeof clientDeletionCancellationSchema>;

export const invoiceRelationDtoSchema = z.strictObject({
  id: entityIdSchema,
  clientId: entityIdSchema,
  type: invoiceTypeSchema,
  status: invoiceStatusSchema,
  amount: moneyAmountSchema,
  currency: currencyCodeSchema,
  dueDate: dateOnlySchema,
  paidAt: nullableIsoDateTimeSchema,
  sentAt: nullableIsoDateTimeSchema,
  hostedInvoiceUrl: websiteSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type InvoiceRelationDto = z.infer<typeof invoiceRelationDtoSchema>;
export const clientInvoicesRelationSchema = z.strictObject({
  clientId: entityIdSchema,
  items: z.array(invoiceRelationDtoSchema),
  total: z.number().int().nonnegative(),
  nextCursor: cursorSchema.nullable(),
  hasMore: z.boolean(),
});
export type ClientInvoicesRelation = z.infer<typeof clientInvoicesRelationSchema>;

export const gmailNormalizedMessageSchema = z.strictObject({
  schemaVersion: z.literal(1),
  provider: z.literal("gmail"),
  connectionId: entityIdSchema,
  providerMessageId: z.string().trim().min(1).max(255),
  providerThreadId: z.string().trim().min(1).max(255).nullable().optional(),
  occurredAt: isoDateTimeSchema,
  from: normalizedEmailSchema,
  to: z.array(normalizedEmailSchema).max(500),
  cc: z.array(normalizedEmailSchema).max(500).default([]),
  bcc: z.array(normalizedEmailSchema).max(500).default([]),
});
export type GmailNormalizedMessage = z.infer<typeof gmailNormalizedMessageSchema>;

export const gmailContactMatchSchema = z.strictObject({ clientId: entityIdSchema, contactId: entityIdSchema });
export type GmailContactMatch = z.infer<typeof gmailContactMatchSchema>;
export const gmailMessageMatchResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("matched"), providerMessageId: z.string().min(1).max(255), matches: z.array(gmailContactMatchSchema).min(1), retryable: z.literal(false) }),
  z.strictObject({ status: z.literal("no_match"), providerMessageId: z.string().min(1).max(255), matches: z.tuple([]), retryable: z.literal(false) }),
  z.strictObject({ status: z.literal("duplicate"), providerMessageId: z.string().min(1).max(255), matches: z.tuple([]), retryable: z.literal(false) }),
  z.strictObject({ status: z.literal("malformed"), providerMessageId: z.string().max(255).nullable(), matches: z.tuple([]), retryable: z.literal(false) }),
  z.strictObject({ status: z.literal("revoked"), providerMessageId: z.string().max(255).nullable(), matches: z.tuple([]), retryable: z.literal(false) }),
  z.strictObject({ status: z.literal("rate_limited"), providerMessageId: z.string().max(255).nullable(), matches: z.tuple([]), retryable: z.literal(true), retryAt: isoDateTimeSchema }),
  z.strictObject({ status: z.literal("retry"), providerMessageId: z.string().max(255).nullable(), matches: z.tuple([]), retryable: z.literal(true), retryAt: isoDateTimeSchema }),
]);
export type GmailMessageMatchResult = z.infer<typeof gmailMessageMatchResultSchema>;
