import { expect, test, type APIResponse } from "@playwright/test";

import type { EdgeData, GraphNodeDetail, GraphNodeListResponse, GraphResponse } from "@aios/contracts";

import {
  BROWSER_PERFORMANCE_BLOCKED_COMMENT,
  TEST_PREFIX,
  cleanupGraphFixture,
  expectNoAxeViolations,
  screenshot,
  seedGraphFixture,
  type GraphSeed,
} from "./graph-helpers";

/**
 * Part 4 graph E2E/evidence suite.
 *
 * Auth: the managed webServer resolves the active owner through the
 * AIOS_E2E_AUTH_BYPASS development shell against the local DATABASE_URL (see
 * playwright.config.ts). Owner login credentials are NOT present in this
 * workspace - no Supabase email/password exists for the owner - so a real-auth
 * interactive login smoke remains external and out of scope; the bypass
 * resolves the SAME active owner row the real session flow would resolve.
 */

const HUB_KEYS = ["agents", "automations", "clients", "command", "content", "finance", "knowledge", "pipeline_crm", "tools"];
// apiFetch semantics but for raw assertions.
async function apiJson<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as { data: T };
  return body.data;
}

let seed: GraphSeed;
const cleanupAttempts: string[] = [];

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

test.beforeAll(async ({ request }) => {
  const runId = `${Date.now().toString(36)}`;
  seed = await seedGraphFixture(request, runId);
});

test.afterAll(async ({ request }) => {
  if (seed) {
    for (const attempt of await cleanupGraphFixture(request, seed)) cleanupAttempts.push(attempt);
  }
  // API latency evidence (real measured HTTP response latency for the current graph).
  console.log(
    `part-4 api-latency-ms ${JSON.stringify(seed?.latencyMs ?? {}, null, 0)}`,
  );
  console.log(`part-4 cleanup ${JSON.stringify(cleanupAttempts)}`);
  console.log(BROWSER_PERFORMANCE_BLOCKED_COMMENT);
});

test.describe("Part 4 graph API", () => {
  test("uses the explicit deterministic owner bypass while production auth rejection remains route-tested", async ({ request }) => {
    // This suite deliberately enables the non-production owner bypass so it can
    // exercise real PostgreSQL-backed graph behavior without storing a password.
    // In that mode getOwner resolves the active owner regardless of bearer input;
    // 401 behavior is covered by direct route tests and live auth remains external.
    for (const pathName of [
      "/api/v1/graph",
      "/api/v1/graph/nodes?limit=5",
      "/api/v1/graph/edges?limit=5",
      "/api/v1/graph/directory",
      `/api/v1/graph/search?query=${encodeURIComponent(TEST_PREFIX)}`,
    ]) {
      const response = await request.get(pathName);
      expect(response.status(), `bypass owner ${pathName}`).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-api-version"]).toBe("v1");
    }
  });

  test("complete graph contains the nine hubs, real client/contact/task projections, and ownership edges", async ({ request }) => {
    const graph = await apiJson<GraphResponse>(await request.get("/api/v1/graph"));
    expect(graph.nodes.some((node) => node.stableKey.startsWith("seed:") || node.entityId?.startsWith("10000000-0000-4000-8000-000000000"))).toBe(false);
    expect(graph.nodes.some((node) => node.label.startsWith("Synthetic "))).toBe(false);
    const hubs = graph.nodes.filter((node) => node.type === "hub").map((node) => node.metadata.hubKey).sort();
    expect(hubs).toEqual(HUB_KEYS);

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const [label, nodeId, type] of [
      ["client", seed.nodes.client, "client"],
      ["contact", seed.nodes.contact, "human_contact"],
      ["task", seed.nodes.task, "task"],
    ] as const) {
      const node = byId.get(nodeId);
      expect(node, `${label} projection node`).toBeDefined();
      expect(node?.type).toBe(type);
      expect(node?.entityId, `${label} entityId`).toBe(seed[label === "contact" ? "contact" : label].id);
      expect(node?.label).toContain(TEST_PREFIX);
    }

    expect(seed.ownershipEdges.clientToContact.origin).toBe("projection");
    expect(seed.ownershipEdges.clientToTask.origin).toBe("projection");
    for (const edge of graph.edges) {
      if (edge.targetNodeId === seed.nodes.contact || edge.targetNodeId === seed.nodes.task) {
        expect(edge.type).toBe("ownership");
      }
    }
  });

  test("owner edge lifecycle: invalid input, duplicate create, idempotent create, projected delete rejection, owner delete with idempotency", async ({ request }) => {
    const csrf = { "sec-fetch-site": "same-origin" };
    // Validation: self reference and invalid node ids.
    const selfResponse = await request.post("/api/v1/graph/edges", {
      data: { sourceNodeId: seed.nodes.client, targetNodeId: seed.nodes.client, type: "data_flow", label: null },
      headers: csrf,
    });
    expect(selfResponse.status()).toBe(422);

    const unknownNodeResponse = await request.post("/api/v1/graph/edges", {
      data: { sourceNodeId: seed.nodes.client, targetNodeId: "00000000-0000-4000-8000-000000000000", type: "data_flow", label: null },
      headers: csrf,
    });
    expect(unknownNodeResponse.status()).toBe(404);

    // Valid owner edge: client data_flow -> its own task.
    const idempotencyKey = `e2e_p4_edge_${Date.now().toString(36)}`;
    const createPayload = { sourceNodeId: seed.nodes.client, targetNodeId: seed.nodes.task, type: "data_flow", label: `${TEST_PREFIX} owner edge` };
    const created = await request.post("/api/v1/graph/edges", { data: createPayload, headers: { ...csrf, "Idempotency-Key": idempotencyKey } });
    expect(created.status()).toBe(201);
    const createdEdge = await apiJson<EdgeData>(created);
    expect(createdEdge.origin).toBe("owner");

    // Idempotent replay returns the same edge with 200.
    const replay = await request.post("/api/v1/graph/edges", { data: createPayload, headers: { ...csrf, "Idempotency-Key": idempotencyKey } });
    expect(replay.status()).toBe(200);
    const replayEdge = await apiJson<EdgeData>(replay);
    expect(replayEdge.id).toBe(createdEdge.id);

    // Duplicate without the key conflicts.
    const duplicate = await request.post("/api/v1/graph/edges", { data: createPayload, headers: csrf });
    expect(duplicate.status()).toBe(409);
    const duplicateBody = (await duplicate.json()) as { error: { code: string } };
    expect(["DUPLICATE_EDGE", "CONFLICT"]).toContain(duplicateBody.error.code);

    // Projected ownership edge cannot be deleted.
    const projectedDelete = await request.delete(`/api/v1/graph/edges/${seed.ownershipEdges.clientToContact.id}`, { data: {}, headers: csrf });
    expect(projectedDelete.status()).toBe(409);
    const projectedDeleteBody = (await projectedDelete.json()) as { error: { code: string } };
    expect(projectedDeleteBody.error.code).toBe("PROJECTED_EDGE_IMMUTABLE");

    // Owner edge deletes cleanly and the delete itself is idempotent.
    const deleteKey = `e2e_p4_del_${Date.now().toString(36)}`;
    const firstDelete = await request.delete(`/api/v1/graph/edges/${createdEdge.id}`, { data: {}, headers: { ...csrf, "Idempotency-Key": deleteKey } });
    expect(firstDelete.status()).toBe(200);
    const secondDelete = await request.delete(`/api/v1/graph/edges/${createdEdge.id}`, { data: {}, headers: { ...csrf, "Idempotency-Key": deleteKey } });
    expect(secondDelete.status()).toBe(200);
  });

  test("node/edge list cursors paginate deterministically and expose totals", async ({ request }) => {
    const nodesFirst = await apiJson<GraphNodeListResponse>(await request.get("/api/v1/graph/nodes?limit=2"));
    expect(nodesFirst.meta.total).toBeGreaterThanOrEqual(9 + 3); // hubs + seeded client/contact/task
    expect(nodesFirst.nodes.length).toBeLessThanOrEqual(2);
    if (nodesFirst.meta.hasMore) {
      expect(nodesFirst.meta.cursor).toBeTruthy();
      const nodesSecond = await apiJson<GraphNodeListResponse>(
        await request.get(`/api/v1/graph/nodes?limit=2&cursor=${encodeURIComponent(nodesFirst.meta.cursor!)}`),
      );
      expect(nodesSecond.meta.cursor === null || typeof nodesSecond.meta.cursor === "string").toBe(true);
      const firstIds = new Set(nodesFirst.nodes.map((node) => node.id));
      expect(nodesSecond.nodes.some((node) => firstIds.has(node.id))).toBe(false);
    }

    const edgesFirst = await apiJson<{ edges: EdgeData[]; meta: { total: number; cursor: string | null; hasMore: boolean } }>(
      await request.get("/api/v1/graph/edges?limit=2"),
    );
    if (edgesFirst.meta.hasMore) {
      const edgesSecond = await apiJson<{ edges: EdgeData[]; meta: { total: number } }>(
        await request.get(`/api/v1/graph/edges?limit=2&cursor=${encodeURIComponent(edgesFirst.meta.cursor!)}`),
      );
      expect(edgesSecond.meta.total).toBe(edgesFirst.meta.total);
    }

    // Invalid cursor is a deterministic 422, not a crash.
    const invalidCursor = await request.get("/api/v1/graph/nodes?limit=2&cursor=not-a-cursor");
    expect(invalidCursor.status()).toBe(422);
  });

  test("directory and search project the seeded entities", async ({ request }) => {
    const directory = await apiJson<{ groups: { key: string; items: { nodeId: string; label: string }[] }[]; total: number }>(
      await request.get("/api/v1/graph/directory"),
    );
    const clients = directory.groups.find((group) => group.key === "clients");
    expect(clients?.items.some((item) => item.nodeId === seed.nodes.client)).toBe(true);
    const tasks = directory.groups.find((group) => group.key === "recent_tasks");
    expect(tasks?.items.some((item) => item.nodeId === seed.nodes.task)).toBe(true);

    const search = await apiJson<{ results: { node: { id: string; label: string } }[]; total: number }>(
      await request.get(`/api/v1/graph/search?query=${encodeURIComponent(seed.client.name)}&limit=10`),
    );
    expect(search.results.some((result) => result.node.id === seed.nodes.client)).toBe(true);

    // Node detail for the seeded contact resolves the connected client.
    const detail = await apiJson<GraphNodeDetail>(await request.get(`/api/v1/graph/nodes/${seed.nodes.contact}`));
    expect(detail.node.id).toBe(seed.nodes.contact);
    expect(detail.connections.some((connection) => connection.node.id === seed.nodes.client)).toBe(true);
  });
});

test.describe("Part 4 graph GUI", () => {
  test("desktop graph workspace: LENS filters write the URL and fade excluded nodes to 10% opacity, Clear All resets", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Desktop-only GUI assertions");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/knowledge-graph");
    await expect(page.getByRole("heading", { name: "Business command map" })).toBeVisible();
    await expect(page.locator("section[aria-label=\"Graph legend\"]")).toBeVisible();

    // LENS entity filter -> URL + 10% opacity on excluded node.
    await page.getByLabel("Entity filter").selectOption("hub");
    await expect(page).toHaveURL(/entity=hub/);
    const taskNode = page.locator(`#graph-node-${seed.nodes.task}`);
    await expect(taskNode).toBeVisible();
    await expect(taskNode).toHaveAttribute("opacity", "0.1");
    await page.getByLabel("Function filter").selectOption("clients");
    await expect(page).toHaveURL(/function=clients/);
    await page.getByLabel("Action filter").selectOption("pending");
    await expect(page).toHaveURL(/action=pending/);
    await screenshot(page, "t1_graph_desktop_lens.png");

    // Clear All.
    await page.getByRole("button", { name: "Clear All" }).click();
    await expect(page).not.toHaveURL(/entity=|function=|action=/);
    await expect(taskNode).toHaveAttribute("opacity", /^(1|1\.0)?$/);

    // Ctrl+K search dialog opens and finds the seeded client.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await expect(page.getByRole("dialog", { name: "Search knowledge graph" })).toBeVisible();
    await page.getByPlaceholder("Search clients, contacts, hubs, tasks…").fill(seed.client.name);
    const searchDialog = page.getByRole("dialog", { name: "Search knowledge graph" });
    const searchResult = searchDialog.getByRole("button", { name: new RegExp(seed.client.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
    await expect(searchResult).toBeVisible();
    await screenshot(page, "t2_graph_search_dialog.png");
    await searchResult.click();
    await expect(searchDialog).toBeHidden();

    // Keyboard Enter is the stable accessible equivalent for opening a moving node.
    const clientNode = page.locator(`#graph-node-${seed.nodes.client}`);
    await clientNode.focus();
    await clientNode.press("Enter");
    const clientDialog = page.getByRole("dialog", { name: seed.client.name });
    await expect(clientDialog).toBeVisible();
    await expect(clientDialog.getByRole("heading", { name: seed.client.name }).first()).toBeVisible();
    await expect(clientDialog.getByText(/Client graph detail/i)).toBeVisible();
    await screenshot(page, "t3_graph_client_detail.png");
    await page.keyboard.press("Escape");
    await expect(clientDialog).toBeHidden();

    // Contact detail drawer shows source contact + client through keyboard open.
    const contactNode = page.locator(`#graph-node-${seed.nodes.contact}`);
    await contactNode.focus();
    await contactNode.press("Enter");
    const contactDialog = page.getByRole("dialog", { name: seed.contact.name });
    await expect(contactDialog).toBeVisible();
    await expect(contactDialog.getByRole("heading", { name: seed.contact.name }).first()).toBeVisible();
    await expect(contactDialog.getByText(seed.client.name).first()).toBeVisible();
    await screenshot(page, "t4_graph_contact_detail.png");
    await page.keyboard.press("Escape");
    await expect(contactDialog).toBeHidden();

    // Keyboard context-menu alternative appears with Connect.
    await clientNode.focus();
    await clientNode.press("Shift+F10");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: /Connect/ }).click();
    await screenshot(page, "t5_graph_connect_dialog.png");
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await expectNoAxeViolations(page, "graph desktop");
    await screenshot(page, "t6_graph_desktop_final.png");
  });

  test("directory and accessible structure render on tablet with axe clean", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "Tablet-only GUI assertions");
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/knowledge-graph");
    await expect(page.getByRole("heading", { name: "Business command map" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open graph directory" })).toBeVisible();
    await page.getByRole("button", { name: "Open graph directory" }).click();
    const directoryDialog = page.getByRole("dialog", { name: "Graph directory" });
    await expect(directoryDialog).toBeVisible();
    await expect(directoryDialog.getByRole("textbox", { name: "Search graph directory" })).toBeVisible();
    await screenshot(page, "t7_graph_tablet_directory.png");
    await page.keyboard.press("Escape");
    await expectNoAxeViolations(page, "graph tablet");
    await screenshot(page, "t8_graph_tablet.png");
  });

  test("mobile graph list exposes the seeded nodes searchably with axe clean", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile-only GUI assertions");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/knowledge-graph");
    await expect(page.getByRole("heading", { name: "Business command map" })).toBeVisible();
    await expect(page.getByTestId("graph-mobile-list")).toBeVisible();
    await page.getByPlaceholder("Search nodes, tags, status…").fill(TEST_PREFIX);
    await expect(page.getByText(seed.client.name).first()).toBeVisible();
    await expect(page.getByText(seed.task.title).first()).toBeVisible();
    await expectNoAxeViolations(page, "graph mobile");
    await screenshot(page, "t9_graph_mobile.png");
  });
});

test.describe("Part 4 graph performance", () => {
  test("real graph API latency is recorded; browser render performance is externally blocked", async ({ request }) => {
    test.skip(true, BROWSER_PERFORMANCE_BLOCKED_COMMENT);
    void request;
  });
});
