import { z } from "zod";

export const deletionImpactSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.uuid(),
  records: z.array(z.object({ type: z.string().min(1), count: z.number().int().nonnegative() })),
  files: z.array(z.object({ bucket: z.string().min(1), count: z.number().int().nonnegative() })),
  providerReferences: z.array(z.object({ provider: z.string().min(1), count: z.number().int().nonnegative() })),
  legalHold: z.boolean().default(false),
});

export const deletionPlanSchema = z.object({
  id: z.uuid(),
  requestedBy: z.string().min(1).max(255),
  requestedAt: z.string().datetime(),
  notBefore: z.string().datetime(),
  status: z.enum(["pending", "cancelled", "executing", "completed", "failed", "recovered"]),
  version: z.number().int().positive(),
  impact: deletionImpactSchema,
});

export type DeletionPlan = z.infer<typeof deletionPlanSchema>;

export function validateDeletionExecution(plan: DeletionPlan, now = new Date()): { valid: boolean; reason?: string } {
  const parsed = deletionPlanSchema.parse(plan);
  if (parsed.status !== "pending") return { valid: false, reason: "Deletion plan is not pending." };
  if (parsed.impact.legalHold) return { valid: false, reason: "Deletion plan is blocked by a legal hold." };
  if (new Date(parsed.notBefore) > now) return { valid: false, reason: "The seven-day recovery window has not expired." };
  return { valid: true };
}
