import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const crmLeadStages = ["new", "contacted", "qualified", "proposal", "negotiating", "won", "lost"] as const;
export const crmLeadStageSchema = z.enum(crmLeadStages);
export type CrmLeadStage = z.infer<typeof crmLeadStageSchema>;
export const CRM_LEAD_STAGE_LABELS = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
} as const satisfies Record<CrmLeadStage, string>;

export const proposalStatuses = ["draft", "sent", "viewed", "accepted", "rejected", "expired"] as const;
export const proposalStatusSchema = z.enum(proposalStatuses);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export const PROPOSAL_STATUS_LABELS = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
} as const satisfies Record<ProposalStatus, string>;

export const sourcedLeadStages = ["sourced", "qualified", "outreach_sent", "replied", "meeting_booked", "converted", "disqualified"] as const;
export const sourcedLeadStageSchema = z.enum(sourcedLeadStages);
export type SourcedLeadStage = z.infer<typeof sourcedLeadStageSchema>;
export const SOURCED_LEAD_STAGE_LABELS = {
  sourced: "Sourced",
  qualified: "Qualified",
  outreach_sent: "Outreach Sent",
  replied: "Replied",
  meeting_booked: "Meeting Booked",
  converted: "Converted",
  disqualified: "Disqualified",
} as const satisfies Record<SourcedLeadStage, string>;

export const crmLeadCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  company: z.string().trim().max(255).nullable().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  interest: z.string().trim().max(2_000).nullable().optional(),
  notes: z.string().trim().max(5_000).nullable().optional(),
  value: z.number().min(0).max(999_999_999).nullable().optional(),
  expectedCloseProbability: z.number().min(0).max(1).nullable().optional(),
});
export type CrmLeadCreateInput = z.infer<typeof crmLeadCreateSchema>;

export const crmLeadUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  company: z.string().trim().max(255).nullable().optional(),
  interest: z.string().trim().max(2_000).nullable().optional(),
  notes: z.string().trim().max(5_000).nullable().optional(),
  value: z.number().min(0).max(999_999_999).nullable().optional(),
  expectedCloseProbability: z.number().min(0).max(1).nullable().optional(),
  followUpAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
export type CrmLeadUpdateInput = z.infer<typeof crmLeadUpdateSchema>;

export const crmLeadStageUpdateSchema = z.strictObject({
  stage: crmLeadStageSchema,
  reason: z.string().trim().max(500).nullable().optional(),
});
export type CrmLeadStageUpdateInput = z.infer<typeof crmLeadStageUpdateSchema>;

export const proposalCreateSchema = z.strictObject({
  crmLeadId: z.uuid(),
  title: z.string().trim().min(1).max(500),
  scope: z.string().trim().max(10_000),
  deliverables: z.string().trim().max(10_000).nullable().optional(),
  timeline: z.string().trim().max(2_000).nullable().optional(),
  pricing: z.string().trim().max(2_000).nullable().optional(),
  terms: z.string().trim().max(5_000).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type ProposalCreateInput = z.infer<typeof proposalCreateSchema>;

export const proposalStatusUpdateSchema = z.strictObject({
  status: proposalStatusSchema,
  note: z.string().trim().max(2_000).nullable().optional(),
});
export type ProposalStatusUpdateInput = z.infer<typeof proposalStatusUpdateSchema>;

export const sourcedLeadCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  company: z.string().trim().max(255).nullable().optional(),
  title: z.string().trim().max(255).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  linkedinUrl: z.string().trim().url().max(1000).nullable().optional(),
  companyDomain: z.string().trim().max(255).nullable().optional(),
  source: z.enum(["manual", "linkedin", "apollo", "crunchbase", "google_maps", "website"]),
  scope: z.enum(["client", "agency"]).default("agency"),
  clientId: z.uuid().nullable().optional(),
  fitScore: z.number().int().min(0).max(100).nullable().optional(),
  fitExplanation: z.string().trim().max(2_000).nullable().optional(),
});
export type SourcedLeadCreateInput = z.infer<typeof sourcedLeadCreateSchema>;

export const crmLeadListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  stages: z.array(crmLeadStageSchema).optional(),
  search: z.string().trim().max(200).optional(),
});
export type CrmLeadListQuery = z.infer<typeof crmLeadListQuerySchema>;
