import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const contentScopes = ["client", "agency"] as const;
export const contentScopeSchema = z.enum(contentScopes);
export type ContentScopeName = z.infer<typeof contentScopeSchema>;

export const contentTypes = ["linkedin_post", "x_post", "x_thread", "instagram", "newsletter", "blog", "video_script", "case_study", "other"] as const;
export const contentTypeSchema = z.enum(contentTypes);
export type ContentTypeName = z.infer<typeof contentTypeSchema>;
export const CONTENT_TYPE_LABELS = {
  linkedin_post: "LinkedIn Post",
  x_post: "X Post",
  x_thread: "X Thread",
  instagram: "Instagram",
  newsletter: "Newsletter",
  blog: "Blog Article",
  video_script: "Video Script",
  case_study: "Case Study",
  other: "Other",
} as const satisfies Record<ContentTypeName, string>;

export const contentStatuses = ["draft", "owner_review", "client_review", "approved", "scheduled", "published", "failed", "archived"] as const;
export const contentStatusSchema = z.enum(contentStatuses);
export type ContentStatus = z.infer<typeof contentStatusSchema>;
export const CONTENT_STATUS_LABELS = {
  draft: "Draft",
  owner_review: "Owner review",
  client_review: "Client review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
} as const satisfies Record<ContentStatus, string>;

export const brandProfileSchema = z.strictObject({
  id: z.uuid(),
  clientId: z.uuid().nullable(),
  scope: contentScopeSchema,
  name: z.string(),
  tone: z.string(),
  vocabulary: z.array(z.string()),
  targetAudience: z.string(),
  keyMessages: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  examples: z.array(z.string()),
  version: z.number().int().positive(),
});
export type BrandProfileDto = z.infer<typeof brandProfileSchema>;

export const brandProfileUpsertSchema = z.strictObject({
  clientId: z.uuid().nullable().optional(),
  scope: contentScopeSchema.default("client"),
  name: z.string().trim().min(1).max(255),
  tone: z.string().trim().min(1).max(2_000),
  targetAudience: z.string().trim().min(1).max(2_000),
  vocabulary: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  keyMessages: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  prohibitedClaims: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  examples: z.array(z.string().trim().min(1).max(2_000)).max(20).default([]),
});
export type BrandProfileUpsertInput = z.infer<typeof brandProfileUpsertSchema>;

export const contentArtifactCreateSchema = z.strictObject({
  clientId: z.uuid().nullable().optional(),
  scope: contentScopeSchema,
  type: contentTypeSchema,
  title: z.string().trim().min(1).max(500),
  brief: z.string().trim().max(5_000).nullable().optional(),
  body: z.string().trim().min(1).max(100_000),
  claimsToVerify: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  parentArtifactId: z.uuid().nullable().optional(),
});
export type ContentArtifactCreateInput = z.infer<typeof contentArtifactCreateSchema>;

export const contentArtifactUpdateSchema = z.strictObject({
  title: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().min(1).max(100_000).optional(),
  brief: z.string().trim().max(5_000).nullable().optional(),
  claimsToVerify: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  changeSummary: z.string().trim().max(500).optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
export type ContentArtifactUpdateInput = z.infer<typeof contentArtifactUpdateSchema>;

export const contentStatusUpdateSchema = z.strictObject({
  status: contentStatusSchema,
  note: z.string().trim().max(2_000).nullable().optional(),
});
export type ContentStatusUpdateInput = z.infer<typeof contentStatusUpdateSchema>;

/** Client artifacts: Draft → Owner Review → Client Review → Approved. Agency: Draft → Review → Approved. */
export const CONTENT_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["owner_review", "review", "archived"],
  owner_review: ["client_review", "draft"],
  review: ["approved", "draft"],
  client_review: ["approved", "draft"],
  approved: ["scheduled", "draft"],
  scheduled: ["published", "draft"],
  published: [],
  failed: ["draft"],
  archived: [],
};

export function canTransitionContentStatus(from: string, to: string): boolean {
  return (CONTENT_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export const contentCalendarEntrySchema = z.strictObject({
  id: z.uuid(),
  artifactId: z.uuid().nullable(),
  clientId: z.uuid().nullable(),
  scope: contentScopeSchema,
  platform: z.string(),
  publishAt: z.string().datetime({ offset: true }),
  status: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type ContentCalendarEntryDto = z.infer<typeof contentCalendarEntrySchema>;

export const calendarEntryCreateSchema = z.strictObject({
  artifactId: z.uuid(),
  publishAt: z.string().datetime({ offset: true }),
  platform: z.string().trim().min(1).max(100).default("linkedin"),
});
export type CalendarEntryCreateInput = z.infer<typeof calendarEntryCreateSchema>;

export const contentListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  scope: contentScopeSchema.optional(),
  clientId: z.uuid().optional(),
  types: z.array(contentTypeSchema).optional(),
  statuses: z.array(contentStatusSchema).optional(),
  search: z.string().trim().max(200).optional(),
});
export type ContentListQuery = z.infer<typeof contentListQuerySchema>;
