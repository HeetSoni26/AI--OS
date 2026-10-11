import { apiFetch } from "@/lib/api-client";

export type CrmLeadDto = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  interest: string | null;
  notes: string | null;
  stage: string;
  value: number | null;
  expectedCloseProbability: number | null;
  followUpAt: string | null;
  convertedClientId: string | null;
  proposals: ProposalDto[];
  stageHistory: Array<{ fromStage: string | null; toStage: string; reason: string | null; changedAt: string | null }>;
  updatedAt: string | null;
  createdAt: string | null;
};

export type ProposalDto = {
  id: string;
  crmLeadId: string;
  leadName: string | null;
  leadCompany: string | null;
  title: string;
  status: string;
  currentVersion: number;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  scope: string | null;
  createdAt: string | null;
};

export type SourcedLeadDto = {
  id: string;
  clientId: string | null;
  scope: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  companyDomain: string | null;
  source: string;
  fitScore: number | null;
  fitExplanation: string | null;
  category: string | null;
  stage: string;
  dateFound: string;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);

export const pipelineApi = {
  leads: () => data<{ items: CrmLeadDto[] }>("/api/v1/pipeline/leads?limit=100"),
  lead: (leadId: string) => data<CrmLeadDto>(`/api/v1/pipeline/leads/${leadId}`),
  createLead: (input: {
    name: string;
    email?: string | null;
    company?: string | null;
    interest?: string | null;
    notes?: string | null;
    value?: number | null;
    source?: string | null;
  }) => data<CrmLeadDto>("/api/v1/pipeline/leads", json("POST", input)),
  updateLead: (leadId: string, input: { notes?: string | null; value?: number | null; followUpAt?: string | null }) =>
    data<CrmLeadDto>(`/api/v1/pipeline/leads/${leadId}`, json("PATCH", input)),
  setStage: (leadId: string, stage: string, reason?: string) =>
    data<CrmLeadDto>(`/api/v1/pipeline/leads/${leadId}/stage`, json("POST", { stage, reason })),

  proposals: () => data<{ items: ProposalDto[] }>("/api/v1/pipeline/proposals"),
  createProposal: (input: {
    crmLeadId: string;
    title: string;
    scope: string;
    deliverables?: string | null;
    timeline?: string | null;
    pricing?: string | null;
    terms?: string | null;
  }) => data<ProposalDto>("/api/v1/pipeline/proposals", json("POST", input)),
  setProposalStatus: (proposalId: string, status: string) =>
    data<ProposalDto>(`/api/v1/pipeline/proposals/${proposalId}/status`, json("POST", { status })),

  sourcedLeads: (clientId?: string) =>
    data<{ items: SourcedLeadDto[] }>(`/api/v1/pipeline/sourced-leads${clientId ? `?clientId=${clientId}` : ""}`),
  createSourcedLead: (input: {
    name: string;
    company?: string | null;
    title?: string | null;
    email?: string | null;
    linkedinUrl?: string | null;
    companyDomain?: string | null;
    source: string;
    scope?: "client" | "agency";
    clientId?: string | null;
    fitScore?: number | null;
    fitExplanation?: string | null;
  }) => data<SourcedLeadDto>("/api/v1/pipeline/sourced-leads", json("POST", input)),
};
