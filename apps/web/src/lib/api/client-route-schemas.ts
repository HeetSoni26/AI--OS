import { entityIdSchema } from "@aios/contracts";
import { z } from "zod";

export const manualTimeEntryCreateSchema = z.strictObject({
  projectId: entityIdSchema,
  taskId: entityIdSchema.nullable().optional(),
  assignmentId: entityIdSchema.nullable().optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }),
  minutes: z.number().int().positive().max(525_600).optional(),
  hourlyRate: z.number().finite().nonnegative().max(999_999_999_999.99).nullable().optional(),
}).superRefine((value, context) => {
  if (new Date(value.endedAt) <= new Date(value.startedAt)) {
    context.addIssue({ code: "custom", path: ["endedAt"], message: "End time must be after start time." });
  }
});

export const manualTimeEntryUpdateSchema = z.strictObject({
  taskId: entityIdSchema.nullable().optional(),
  assignmentId: entityIdSchema.nullable().optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
  endedAt: z.string().datetime({ offset: true }).optional(),
  minutes: z.number().int().positive().max(525_600).optional(),
  hourlyRate: z.number().finite().nonnegative().max(999_999_999_999.99).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one time entry field must be supplied.");

export const assignmentUpdateSchema = z.strictObject({
  role: z.string().trim().max(150).nullable().optional(),
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one assignment field must be supplied.");

export const projectStatusUpdateSchema = z.strictObject({
  status: z.enum(["planning", "in_progress", "review", "delivered", "revision", "complete"]),
  reason: z.string().trim().min(1).max(2_000).optional(),
});
