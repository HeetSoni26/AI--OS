import { apiFetch } from "@/lib/api-client";

export type BrandProfileDto = {
  id: string;
  clientId: string | null;
  scope: string;
  name: string;
  tone: string;
  vocabulary: string[];
  targetAudience: string;
  keyMessages: string[];
  prohibitedClaims: string[];
  examples: string[];
  version: number;
  updatedAt: string | null;
};

export type ContentArtifactDto = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  scope: string;
  type: string;
  status: string;
  title: string;
  brief: string | null;
  body: string;
  claimsToVerify: string[];
  currentVersion: number;
  updatedAt: string | null;
  createdAt: string | null;
};

export type ContentArtifactDetailDto = ContentArtifactDto & {
  versions: Array<{ version: number; status: string; title: string; body: string; createdAt: string | null }>;
  calendarEntries: Array<{ id: string; platform: string; status: string; publishAt: string | null }>;
  derived: Array<{ id: string; title: string; type: string }>;
};

export type ContentListResult = {
  items: ContentArtifactDto[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type CalendarEntryDto = {
  id: string;
  artifactId: string;
  artifactTitle: string | null;
  artifactType: string | null;
  clientId: string | null;
  scope: string;
  platform: string;
  status: string;
  publishAt: string;
};

export type ArtifactUpsertInput = {
  clientId?: string | null;
  scope: "client" | "agency";
  type: string;
  title: string;
  brief?: string | null;
  body: string;
  claimsToVerify: string[];
  parentArtifactId?: string | null;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
});

const data = <T>(path: string, init?: RequestInit) => apiFetch<T>(path, init).then((response) => response.data);

export const contentApi = {
  list: (query: { scope?: "client" | "agency"; search?: string; statuses?: string[]; limit?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(query.limit ?? 100));
    if (query.scope) params.set("scope", query.scope);
    if (query.search) params.set("search", query.search);
    for (const status of query.statuses ?? []) params.append("statuses", status);
    return data<ContentListResult>(`/api/v1/content?${params.toString()}`);
  },
  detail: (artifactId: string) => data<ContentArtifactDetailDto>(`/api/v1/content/${artifactId}`),
  create: (input: ArtifactUpsertInput) => data<ContentArtifactDetailDto>("/api/v1/content", json("POST", input)),
  update: (artifactId: string, input: { title?: string; body?: string; brief?: string | null; changeSummary?: string }) =>
    data<ContentArtifactDetailDto>(`/api/v1/content/${artifactId}`, json("PATCH", input)),
  setStatus: (artifactId: string, status: string, note?: string) =>
    data<ContentArtifactDetailDto>(`/api/v1/content/${artifactId}/status`, json("POST", { status, note })),
  schedule: (artifactId: string, publishAt: string, platform = "linkedin") =>
    data<ContentArtifactDetailDto>(`/api/v1/content/${artifactId}/calendar`, json("POST", { artifactId, publishAt, platform })),

  brandProfiles: (scope?: "client" | "agency") =>
    data<{ items: BrandProfileDto[] }>(`/api/v1/content/brand${scope ? `?scope=${scope}` : ""}`),
  upsertBrandProfile: (input: {
    clientId?: string | null;
    scope: "client" | "agency";
    name: string;
    tone: string;
    targetAudience: string;
    vocabulary?: string[];
    keyMessages?: string[];
    prohibitedClaims?: string[];
    examples?: string[];
  }) => data<BrandProfileDto>("/api/v1/content/brand", json("POST", input)),

  calendar: (scope?: "client" | "agency") => data<{ items: CalendarEntryDto[] }>(`/api/v1/content/calendar${scope ? `?scope=${scope}` : ""}`),
};
