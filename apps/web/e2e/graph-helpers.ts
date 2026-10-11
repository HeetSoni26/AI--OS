import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

import type {
  ClientDto,
  ContactDto,
  EdgeData,
  GraphDirectoryResponse,
  GraphEdgeListResponse,
  GraphNodeListResponse,
  GraphResponse,
  GraphSearchResponse,
  ProjectDto,
  TaskDto,
} from "@aios/contracts";

/**
 * Deterministic Part 4 graph E2E/evidence helpers.
 *
 * Seeding uses the real client-domain HTTP APIs of the running application;
 * nothing reaches into the DOM, bypasses routes, or mutates the database
 * directly. Cleanup uses the real delete/archive APIs in reverse order.
 */

export const PART4_EVIDENCE = path.resolve(__dirname, "../../../gui-test-screenshots/part-4");
export const TEST_PREFIX = "E2E GRAPH P4";

const FAST = process.env.CI ? { timeout: 20_000 } : { timeout: 15_000 };
void FAST;

export type GraphSeed = {
  client: ClientDto;
  contact: ContactDto;
  project: ProjectDto;
  task: TaskDto;
  nodes: {
    client: string;
    contact: string;
    task: string;
  };
  /** First ownership projection edges discovered after seeding. */
  ownershipEdges: {
    clientToContact: EdgeData;
    clientToTask: EdgeData;
  };
  latencyMs: {
    graph: number;
    nodesPage: number;
    edgesPage: number;
    search: number;
    directory: number;
  };
};

type ApiSuccessEnvelope<T> = { data: T; meta?: Record<string, unknown> };

async function envelope<T>(response: APIResponse, action: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as ApiSuccessEnvelope<T> | null;
  if (!response.ok() || !body || typeof body !== "object" || !("data" in body)) {
    throw new Error(`${action} failed with HTTP ${response.status()}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

function sameOriginHeaders(): Record<string, string> {
  // Server-rendered fetch traffic must satisfy the same-origin CSRF contract
  // exactly like the browser does for credentialed mutations.
  return { "sec-fetch-site": "same-origin" };
}

async function postJson<T>(request: APIRequestContext, pathName: string, body: unknown, action: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await request.post(pathName, { data: body, headers: { ...sameOriginHeaders(), ...headers } });
  return envelope<T>(response, action);
}

async function deleteJson<T>(request: APIRequestContext, pathName: string, action: string, headers: Record<string, string> = {}): Promise<T> {
  // The route parsers expect a JSON body ({} carries the archive reason), and
  // the CSRF guard requires the same-origin fetch header for mutations.
  const response = await request.delete(pathName, { data: {}, headers: { ...sameOriginHeaders(), ...headers } });
  const body = (await response.json().catch(() => null)) as unknown;
  // Deletes are idempotent archive operations; 404 after a successful archive
  // just means the record is already outside the active projection scope.
  if (response.status() === 404) return body as T;
  if (!response.ok()) throw new Error(`${action} failed with HTTP ${response.status()}: ${JSON.stringify(body)}`);
  return (body as ApiSuccessEnvelope<T>).data;
}

async function getJson<T>(request: APIRequestContext, pathName: string, action: string): Promise<T> {
  const response = await request.get(pathName);
  return envelope<T>(response, action);
}

/**
 * Seeds one unique client/contact/project/task chain with the test prefix via
 * the real client APIs, then locates the resulting graph projections through
 * the real graph API. Throws (never fabricates) if a projection is missing.
 */
export async function seedGraphFixture(request: APIRequestContext, runId: string): Promise<GraphSeed> {
  const suffix = `${runId}`;
  const client = await postJson<ClientDto>(request, "/api/v1/clients", {
    name: `${TEST_PREFIX} Client ${suffix}`,
    industry: "Graph QA",
    status: "active",
    mrr: 0,
    totalRevenue: 0,
  }, "create client");

  const contact = await postJson<ContactDto>(request, `/api/v1/clients/${client.id}/contacts`, {
    clientId: client.id,
    name: `${TEST_PREFIX} Contact ${suffix}`,
    role: "Graph QA owner liaison",
    isPrimary: true,
  }, "create contact");

  const project = await postJson<ProjectDto>(request, `/api/v1/clients/${client.id}/projects`, {
    clientId: client.id,
    name: `${TEST_PREFIX} Project ${suffix}`,
    type: "custom",
    status: "in_progress",
  }, "create project");

  const task = await postJson<TaskDto>(request, `/api/v1/clients/${client.id}/projects/${project.id}/tasks`, {
    projectId: project.id,
    title: `${TEST_PREFIX} Task ${suffix}`,
    status: "todo",
    priority: "medium",
  }, "create task");

  const tGraphStart = Date.now();
  const graph = await getJson<GraphResponse>(request, "/api/v1/graph", "load complete graph");
  const graphLatency = Date.now() - tGraphStart;

  const byStableKey = new Map(graph.nodes.map((node) => [node.stableKey, node.id]));
  const nodes = {
    client: byStableKey.get(`client:${client.id}`),
    contact: byStableKey.get(`contact:${contact.id}`),
    task: byStableKey.get(`task:${task.id}`),
  };
  if (!nodes.client || !nodes.contact || !nodes.task) {
    throw new Error(
      `Seeded projections missing from /api/v1/graph (client=${nodes.client ?? "absent"}, contact=${nodes.contact ?? "absent"}, task=${nodes.task ?? "absent"}). ` +
        "The real projection pipeline did not project the freshly seeded source records.",
    );
  }

  const ownershipEdges = {
    clientToContact: graph.edges.find(
      (edge) => edge.sourceNodeId === nodes.client && edge.targetNodeId === nodes.contact && edge.type === "ownership" && edge.origin === "projection",
    ),
    clientToTask: graph.edges.find(
      (edge) => edge.sourceNodeId === nodes.client && edge.targetNodeId === nodes.task && edge.type === "ownership" && edge.origin === "projection",
    ),
  };
  if (!ownershipEdges.clientToContact || !ownershipEdges.clientToTask) {
    throw new Error("Projected ownership edges for the seeded client/contact/task are absent from the complete graph.");
  }

  const t2 = Date.now();
  await getJson<GraphNodeListResponse>(request, "/api/v1/graph/nodes?limit=100", "list nodes");
  const nodesLatency = Date.now() - t2;
  const t3 = Date.now();
  await getJson<GraphEdgeListResponse>(request, "/api/v1/graph/edges?limit=100", "list edges");
  const edgesLatency = Date.now() - t3;
  const t4 = Date.now();
  await getJson<GraphSearchResponse>(request, `/api/v1/graph/search?query=${encodeURIComponent(TEST_PREFIX)}&limit=10`, "search graph");
  const searchLatency = Date.now() - t4;
  const t5 = Date.now();
  await getJson<GraphDirectoryResponse>(request, "/api/v1/graph/directory", "load directory");
  const directoryLatency = Date.now() - t5;

  return {
    client,
    contact,
    project,
    task,
    nodes: { client: nodes.client, contact: nodes.contact, task: nodes.task },
    ownershipEdges: {
      clientToContact: ownershipEdges.clientToContact,
      clientToTask: ownershipEdges.clientToTask,
    },
    latencyMs: {
      graph: graphLatency,
      nodesPage: nodesLatency,
      edgesPage: edgesLatency,
      search: searchLatency,
      directory: directoryLatency,
    },
  };
}

/**
 * Best-effort teardown through the real delete/archive APIs in reverse
 * dependency order. Never throws; records every step so blocked cleanup is
 * visible in the final report instead of silently leaking rows.
 */
export async function cleanupGraphFixture(request: APIRequestContext, seed: GraphSeed): Promise<string[]> {
  const attempts: string[] = [];
  const record = (step: string, error?: unknown) => attempts.push(`${step}${error ? ` FAILED: ${error instanceof Error ? error.message : String(error)}` : ""}`);
  try {
    await deleteJson(request, `/api/v1/clients/${seed.client.id}/projects/${seed.project.id}/tasks/${seed.task.id}`, "delete task");
    record(`delete task ${seed.task.id}`);
  } catch (error) { record(`delete task ${seed.task.id}`, error); }
  try {
    await deleteJson(request, `/api/v1/clients/${seed.client.id}/projects/${seed.project.id}`, "delete project");
    record(`delete project ${seed.project.id}`);
  } catch (error) { record(`delete project ${seed.project.id}`, error); }
  try {
    await deleteJson(request, `/api/v1/clients/${seed.client.id}/contacts/${seed.contact.id}`, "delete contact");
    record(`delete contact ${seed.contact.id}`);
  } catch (error) { record(`delete contact ${seed.contact.id}`, error); }
  try {
    await deleteJson(request, `/api/v1/clients/${seed.client.id}`, "archive client");
    record(`archive client ${seed.client.id}`);
  } catch (error) { record(`archive client ${seed.client.id}`, error); }
  return attempts;
}

export async function expectNoAxeViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`),
    `${context} has axe violations`,
  ).toEqual([]);
}

export async function screenshot(page: Page, name: string) {
  fs.mkdirSync(PART4_EVIDENCE, { recursive: true });
  await page.screenshot({ path: path.join(PART4_EVIDENCE, name), fullPage: true });
}

/** Exact comment required for the externally blocked browser-performance case. */
export const BROWSER_PERFORMANCE_BLOCKED_COMMENT =
  "SKIPPED deterministically: no safe read-only worker/service is exposed by the running app to construct and serialize synthetic 100/300/500-node payloads without fabricating production data, so browser-side performance assertions are externally blocked. Real API latency for the current graph is still measured and recorded.";
