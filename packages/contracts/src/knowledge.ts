import { z } from "zod";
import { cursorSchema, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./api";

export const knowledgeCategories = ["sop", "template", "brand_voice", "client_data", "research", "lesson", "decision", "meeting_note", "other"] as const;
export const knowledgeCategorySchema = z.enum(knowledgeCategories);
export type KnowledgeCategoryName = z.infer<typeof knowledgeCategorySchema>;
export const KNOWLEDGE_CATEGORY_LABELS = {
  sop: "SOP",
  template: "Template",
  brand_voice: "Brand Voice",
  client_data: "Client Data",
  research: "Industry Research",
  lesson: "Lesson Learned",
  decision: "Decision",
  meeting_note: "Meeting Note",
  other: "Other",
} as const satisfies Record<KnowledgeCategoryName, string>;

export const knowledgeCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(500),
  category: knowledgeCategorySchema,
  content: z.string().trim().min(1).max(100_000),
  tags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  clientId: z.uuid().nullable().optional(),
});
export type KnowledgeCreateInput = z.infer<typeof knowledgeCreateSchema>;

export const knowledgeUpdateSchema = z.strictObject({
  title: z.string().trim().min(1).max(500).optional(),
  category: knowledgeCategorySchema.optional(),
  content: z.string().trim().min(1).max(100_000).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  changeSummary: z.string().trim().max(500).optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
export type KnowledgeUpdateInput = z.infer<typeof knowledgeUpdateSchema>;

export const knowledgeListQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(200).optional(),
  searchMode: z.enum(["keyword", "semantic"]).optional(),
  categories: z.array(knowledgeCategorySchema).optional(),
  clientId: z.uuid().optional(),
});
export type KnowledgeListQuery = z.infer<typeof knowledgeListQuerySchema>;

export const sopCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(500),
  expectedOutcome: z.string().trim().min(1).max(2_000),
  materials: z.array(z.string().trim().min(1).max(255)).max(20).default([]),
  clientId: z.uuid().nullable().optional(),
  steps: z.array(z.strictObject({
    title: z.string().trim().min(1).max(500),
    instructions: z.string().trim().min(1).max(10_000),
    expectedResult: z.string().trim().max(1_000).nullable().optional(),
    isOptional: z.boolean().default(false),
  })).min(1).max(50),
});
export type SopCreateInput = z.infer<typeof sopCreateSchema>;

export const sopExecutionSchema = z.strictObject({
  status: z.enum(["completed", "failed"]),
  stepResults: z.array(z.strictObject({
    position: z.number().int().positive(),
    done: z.boolean(),
  })).max(50).default([]),
  errorMessage: z.string().trim().max(2_000).nullable().optional(),
});
export type SopExecutionInput = z.infer<typeof sopExecutionSchema>;

export const notificationDtoSchema = z.strictObject({
  id: z.uuid(),
  type: z.string(),
  priority: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.uuid().nullable(),
  read: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});
export type NotificationDto = z.infer<typeof notificationDtoSchema>;
