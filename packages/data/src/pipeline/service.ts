import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../generated/client/client";
import {
  CrmLeadStage,
  IntegrationProvider,
  LeadScope,
  NotificationPriority,
  NotificationType,
  ProposalStatus,
  SourcedLeadCategory,
  SourcedLeadStage,
} from "../generated/client/enums";
import { appendMutationRecords, requireActiveOwnerInTransaction } from "../clients/internal";
import { recordNotification } from "../knowledge/service";
import type { OwnerIdentity } from "../clients/types";
import {
  type CrmLeadCreateInput,
  type CrmLeadListQuery,
  type CrmLeadStageUpdateInput,
  type CrmLeadUpdateInput,
  type ProposalCreateInput,
  type ProposalStatusUpdateInput,
  type SourcedLeadCreateInput,
} from "@aios/contracts";

export type {
  CrmLeadCreateInput,
  CrmLeadListQuery,
  CrmLeadStageUpdateInput,
  CrmLeadUpdateInput,
  ProposalCreateInput,
  ProposalStatusUpdateInput,
  SourcedLeadCreateInput,
};

export type PipelineOperationsErrorCode =
  | "INVALID_IDENTITY" | "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "STATE_INVALID" | "DUPLICATE_LEAD";

export class PipelineOperationsError extends Error {
  constructor(public readonly code: PipelineOperationsErrorCode, message: string) {
    super(message);
    this.name = "PipelineOperationsError";
  }
}

const LIST_LIMIT = 200;

/** Deterministic deduplication fingerprint over normalized contact identity. */
export function leadFingerprint(input: { email?: string | null; companyDomain?: string | null; linkedinUrl?: string | null; name: string }): string {
  const email = input.email?.trim().toLowerCase() || "";
  const domain = input.companyDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "") || "";
  const linkedin = input.linkedinUrl?.trim().toLowerCase().replace(/\/$/, "") || "";
  // Only identity-bearing fields form the fingerprint; anonymous leads fall
  // back to the normalized name so distinct people without contact details
  // never collide (an empty join would otherwise be truthy for everyone).
  const identity = [email, domain, linkedin].filter(Boolean).join("|") || input.name.trim().toLowerCase();
  return createHash("sha256").update(identity).digest("hex").slice(0, 64);
}

export class PrismaPipelineService {
  constructor(private readonly database: PrismaClient) {}

  // ── Agency CRM ────────────────────────────────────────────────────────────

  async listCrmLeads(identity: OwnerIdentity, input: Partial<CrmLeadListQuery> = {}) {
    await this.requireActiveOwner(identity);
    const limit = Math.max(1, Math.min(input.limit ?? 100, LIST_LIMIT));
    const where: Prisma.CrmLeadWhereInput = { deletedAt: null };
    const stages = (input.stages ?? []).map((stage) => stage.toUpperCase());
    if (stages.length) where.stage = { in: stages as CrmLeadStage[] };
    if (input.search) {
      where.OR = [
        { name: { contains: input.search, mode: "insensitive" } },
        { company: { contains: input.search, mode: "insensitive" } },
        { email: { contains: input.search, mode: "insensitive" } },
      ];
    }
    return this.database.crmLead.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { proposals: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 3 } },
    });
  }

  async getCrmLead(identity: OwnerIdentity, leadId: string) {
    await this.requireActiveOwner(identity);
    const lead = await this.database.crmLead.findFirst({
      where: { id: leadId, deletedAt: null },
      include: {
        proposals: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        stageHistory: { orderBy: { changedAt: "desc" }, take: 20 },
      },
    });
    if (!lead) throw new PipelineOperationsError("NOT_FOUND", "Lead not found.");
    return lead;
  }

  async createCrmLead(identity: OwnerIdentity, input: CrmLeadCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const lead = await transaction.crmLead.create({
        data: {
          id: randomUUID(),
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          company: input.company ?? null,
          source: input.source ?? null,
          interest: input.interest ?? null,
          notes: input.notes ?? null,
          value: input.value ?? null,
          expectedCloseProbability: input.expectedCloseProbability ?? null,
        },
      });
      await transaction.crmLeadStageHistory.create({
        data: { crmLeadId: lead.id, toStage: CrmLeadStage.NEW, reason: "Lead created", changedBy: identity.ownerSubject },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "crm_lead",
        entityId: lead.id,
        action: "create",
        eventType: "pipeline.lead_created",
        payload: { name: lead.name, company: lead.company },
        changedFields: ["name"],
      }]);
      await recordNotification(transaction, {
        type: NotificationType.NEW_LEAD,
        priority: NotificationPriority.MEDIUM,
        title: `New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
        body: lead.interest ?? null,
        entityType: "crm_lead",
        entityId: lead.id,
        dedupeKey: `lead:${lead.id}`,
      });
      return lead;
    });
  }

  async updateCrmLead(identity: OwnerIdentity, leadId: string, input: CrmLeadUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const lead = await transaction.crmLead.findFirst({ where: { id: leadId, deletedAt: null } });
      if (!lead) throw new PipelineOperationsError("NOT_FOUND", "Lead not found.");
      const updated = await transaction.crmLead.update({
        where: { id: leadId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.company !== undefined ? { company: input.company } : {}),
          ...(input.interest !== undefined ? { interest: input.interest } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.value !== undefined ? { value: input.value } : {}),
          ...(input.expectedCloseProbability !== undefined ? { expectedCloseProbability: input.expectedCloseProbability } : {}),
          ...(input.followUpAt !== undefined ? { followUpAt: input.followUpAt === null ? null : new Date(input.followUpAt) } : {}),
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "crm_lead",
        entityId: leadId,
        action: "update",
        eventType: "pipeline.lead_updated",
        payload: { name: updated.name },
        changedFields: Object.keys(input),
      }]);
      return updated;
    });
  }

  async updateCrmLeadStage(identity: OwnerIdentity, leadId: string, input: CrmLeadStageUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const lead = await transaction.crmLead.findFirst({ where: { id: leadId, deletedAt: null } });
      if (!lead) throw new PipelineOperationsError("NOT_FOUND", "Lead not found.");
      const nextStage = input.stage.toUpperCase() as CrmLeadStage;
      if (lead.stage === nextStage) return lead;
      await transaction.crmLead.update({ where: { id: leadId }, data: { stage: nextStage } });
      await transaction.crmLeadStageHistory.create({
        data: {
          crmLeadId: leadId,
          fromStage: lead.stage,
          toStage: nextStage,
          reason: input.reason ?? null,
          changedBy: identity.ownerSubject,
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "crm_lead",
        entityId: leadId,
        action: "stage",
        eventType: "pipeline.stage_changed",
        payload: { name: lead.name, from: lead.stage, to: nextStage },
      }]);
      return this.getCrmLeadInTransaction(transaction, leadId);
    });
  }

  // ── Proposals ─────────────────────────────────────────────────────────────

  async createProposal(identity: OwnerIdentity, input: ProposalCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const lead = await transaction.crmLead.findFirst({ where: { id: input.crmLeadId, deletedAt: null } });
      if (!lead) throw new PipelineOperationsError("INVALID_INPUT", "The lead does not exist.");
      const proposal = await transaction.proposal.create({
        data: {
          id: randomUUID(),
          crmLeadId: input.crmLeadId,
          title: input.title,
          status: ProposalStatus.DRAFT,
          currentVersion: 1,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await transaction.proposalVersion.create({
        data: {
          proposalId: proposal.id,
          version: 1,
          scope: input.scope,
          deliverables: (input.deliverables ?? "") as unknown as Prisma.InputJsonValue,
          timeline: input.timeline ?? "",
          pricing: (input.pricing ?? "") as unknown as Prisma.InputJsonValue,
          terms: input.terms ?? "",
          contentHash: createHash("sha256").update(`${input.scope}|${input.deliverables ?? ""}|${input.pricing ?? ""}`).digest("hex").slice(0, 64),
          changeSummary: "Initial version",
        },
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "proposal",
        entityId: proposal.id,
        action: "create",
        eventType: "pipeline.proposal_created",
        payload: { title: proposal.title, lead: lead.name },
        changedFields: ["title", "scope"],
      }]);
      return proposal;
    });
  }

  async listProposals(identity: OwnerIdentity) {
    await this.requireActiveOwner(identity);
    return this.database.proposal.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { crmLead: { select: { name: true, company: true } }, versions: { orderBy: { version: "desc" }, take: 1 } },
    });
  }

  async updateProposalStatus(identity: OwnerIdentity, proposalId: string, input: ProposalStatusUpdateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const proposal = await transaction.proposal.findFirst({ where: { id: proposalId, deletedAt: null } });
      if (!proposal) throw new PipelineOperationsError("NOT_FOUND", "Proposal not found.");
      const status = input.status.toUpperCase() as ProposalStatus;
      const data: Prisma.ProposalUpdateInput = { status };
      if (status === ProposalStatus.SENT) data.sentAt = new Date();
      if (status === ProposalStatus.VIEWED) data.viewedAt = new Date();
      if (status === ProposalStatus.ACCEPTED) data.acceptedAt = new Date();
      const updated = await transaction.proposal.update({ where: { id: proposalId }, data });
      // An accepted proposal moves its lead to Won; rejected moves to Negotiating.
      if (status === ProposalStatus.ACCEPTED || status === ProposalStatus.REJECTED) {
        const lead = await transaction.crmLead.findFirst({ where: { id: proposal.crmLeadId } });
        if (lead && lead.stage !== CrmLeadStage.WON) {
          const nextStage = status === ProposalStatus.ACCEPTED ? CrmLeadStage.WON : CrmLeadStage.NEGOTIATING;
          await transaction.crmLead.update({ where: { id: lead.id }, data: { stage: nextStage } });
          await transaction.crmLeadStageHistory.create({
            data: {
              crmLeadId: lead.id,
              fromStage: lead.stage,
              toStage: nextStage,
              reason: `Proposal ${status.toLowerCase()}`,
              changedBy: identity.ownerSubject,
            },
          });
        }
      }
      await appendMutationRecords(transaction, identity, [{
        entityType: "proposal",
        entityId: proposalId,
        action: "status",
        eventType: "pipeline.proposal_status",
        payload: { title: proposal.title, status },
      }]);
      return updated;
    });
  }

  // ── Client sourced leads ─────────────────────────────────────────────────

  async listSourcedLeads(identity: OwnerIdentity, clientId?: string) {
    await this.requireActiveOwner(identity);
    return this.database.sourcedLead.findMany({
      where: { deletedAt: null, ...(clientId ? { clientId } : {}) },
      orderBy: [{ dateFound: "desc" }],
      take: 200,
    });
  }

  async createSourcedLead(identity: OwnerIdentity, input: SourcedLeadCreateInput) {
    return this.database.$transaction(async (transaction) => {
      await requireActiveOwnerInTransaction(transaction, identity);
      const fingerprint = leadFingerprint(input);
      const duplicate = await transaction.sourcedLead.findFirst({
        where: { dedupeFingerprint: fingerprint, deletedAt: null },
      });
      if (duplicate) {
        throw new PipelineOperationsError("DUPLICATE_LEAD", "This lead already exists in the pipeline (matching email, domain, or profile).");
      }
      const lead = await transaction.sourcedLead.create({
        data: {
          id: randomUUID(),
          clientId: input.clientId ?? null,
          scope: input.scope.toUpperCase() as LeadScope,
          name: input.name,
          company: input.company ?? null,
          title: input.title ?? null,
          email: input.email ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
          companyDomain: input.companyDomain ?? null,
          source: sourceToProvider(input.source),
          fitScore: input.fitScore ?? null,
          fitExplanation: input.fitExplanation ?? null,
          category: input.fitScore == null ? null : (input.fitScore >= 70 ? SourcedLeadCategory.HOT : input.fitScore >= 40 ? SourcedLeadCategory.WARM : SourcedLeadCategory.COLD),
          stage: SourcedLeadStage.SOURCED,
          dedupeFingerprint: fingerprint,
        },
      }).catch((error: unknown) => {
        if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
          throw new PipelineOperationsError("DUPLICATE_LEAD", "This lead already exists in the pipeline (matching email, domain, or profile).");
        }
        throw error;
      });
      await appendMutationRecords(transaction, identity, [{
        entityType: "sourced_lead",
        entityId: lead.id,
        action: "create",
        eventType: "pipeline.sourced_lead_created",
        payload: { name: lead.name, company: lead.company, source: lead.source },
        changedFields: ["name"],
      }]);
      return lead;
    });
  }

  private async requireActiveOwner(identity: OwnerIdentity): Promise<void> {
    const owner = await this.database.ownerAccount.findFirst({ where: { authSubject: identity.ownerSubject, active: true }, select: { id: true } });
    if (!owner) throw new PipelineOperationsError("INVALID_IDENTITY", "The authenticated owner is not active.");
  }

  private async getCrmLeadInTransaction(transaction: Prisma.TransactionClient, leadId: string) {
    return transaction.crmLead.findFirstOrThrow({
      where: { id: leadId, deletedAt: null },
      include: { proposals: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 3 }, stageHistory: { orderBy: { changedAt: "desc" }, take: 20 } },
    });
  }
}

function sourceToProvider(source: string): IntegrationProvider {
  const map: Record<string, string> = {
    linkedin: "LINKEDIN",
    apollo: "APOLLO",
    crunchbase: "CRUNCHBASE",
    google_maps: "GOOGLE_MAPS",
    website: "GOOGLE",
  };
  return (map[source] ?? "OTHER") as IntegrationProvider;
}
