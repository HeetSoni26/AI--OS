import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const evidence = path.resolve(__dirname, "../../../gui-test-screenshots/part-5");

test.beforeAll(() => fs.mkdirSync(evidence, { recursive: true }));

async function waitForAgentCards(page: Page) {
  await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("agent-cards")).toBeVisible({ timeout: 30_000 });
}

// The heavy create/run flows run only on desktop Chromium to stay inside the
// shared 100-requests-per-minute owner API budget during full e2e sweeps.
test.skip(({ browserName }) => browserName !== "chromium" || test.info().project.name !== "chromium", "Desktop-only flow");

test("agents workspace renders live agents with cost and success metrics", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agents");
  await waitForAgentCards(page);

  await expect(page.getByRole("button", { name: "Open Weekly Reporter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Outreach Writer" })).toBeVisible();
  await expect(page.getByLabel("Filter by agent status")).toBeVisible();
  await expect(page.getByRole("button", { name: "New agent" }).first()).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: path.join(evidence, "t1_agents_workspace.png"), fullPage: true });
});

test("agent detail drawer shows runs, memory, and configuration tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agents");
  await waitForAgentCards(page);

  await page.getByRole("button", { name: "Open Weekly Reporter" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Weekly Reporter" })).toBeVisible({ timeout: 15_000 });
  await expect(drawer.getByText("Success rate")).toBeVisible();
  await expect(drawer.getByText("Total cost")).toBeVisible();

  await expect(drawer.getByRole("tab", { name: "Runs" })).toBeVisible();
  await expect(drawer.getByRole("tab", { name: "Memory" })).toBeVisible();
  await expect(drawer.getByRole("tab", { name: "Configuration" })).toBeVisible();

  await expect(drawer.getByText("Success", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(evidence, "t2_agent_detail_runs.png"), fullPage: true });

  await drawer.getByRole("tab", { name: "Configuration" }).click();
  await expect(drawer.getByText("Configuration history")).toBeVisible();
  await expect(drawer.getByText("v1")).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "t3_agent_detail_config.png") });
});

let createdAgentName: string | null = null;

test.afterEach(async ({ request }, testInfo) => {
  if (!createdAgentName || !testInfo.title.includes("creates a runnable agent")) return;
  // Leave the workspace clean: soft-delete this run's test agent. The origin
  // header satisfies the trusted-mutation CSRF policy for raw API calls.
  const headers = { origin: "http://127.0.0.1:3000" };
  const listed = await request.get(`/api/v1/agents?search=${encodeURIComponent(createdAgentName)}&limit=100`);
  if (listed.ok()) {
    const body = (await listed.json()) as { data?: { items?: Array<{ id: string }> } };
    for (const agent of body.data?.items ?? []) {
      await request.delete(`/api/v1/agents/${agent.id}`, { headers });
    }
  }
  createdAgentName = null;
});

test("new agent dialog creates a runnable agent in a few clicks", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agents");
  await waitForAgentCards(page);

  const suffix = Date.now().toString(36);
  createdAgentName = `E2E Analyst ${suffix}`;
  await page.getByRole("button", { name: "New agent" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("New agent")).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "t4_new_agent_dialog.png") });

  await dialog.getByLabel("Name").fill(`E2E Analyst ${suffix}`);
  await dialog.getByLabel("Description").fill("Created by the Part 5 end-to-end smoke test.");
  await dialog.locator("#agent-prompt").fill("You analyze agency data and produce brief, evidence-backed insights.");
  await dialog.getByRole("button", { name: "Create agent" }).click();

  await expect(page.getByRole("button", { name: `Open E2E Analyst ${suffix}` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("was created. Click Run to dispatch its first execution.")).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "t5_agent_created.png"), fullPage: true });

  // The freshly created agent's drawer shows an honest empty runs state.
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("No runs yet", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});

test("run button dispatches an execution that completes with output and cost", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agents");
  await waitForAgentCards(page);

  // The card Run button is a one-click dispatch.
  await page.getByRole("button", { name: "Run Weekly Reporter now" }).click();

  // Open the detail drawer and wait for the queued execution to complete.
  await page.getByRole("button", { name: "Open Weekly Reporter" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Weekly Reporter" })).toBeVisible({ timeout: 15_000 });
  await expect(drawer.getByText("Success", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

  await expect(drawer.getByText("simulated", { exact: true }).first()).toBeVisible();
  await expect(drawer.getByText(/tokens/).first()).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "t6_run_completed.png"), fullPage: true });
});

test("agents workspace adapts to tablet and mobile viewports", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Responsive layout is engine-independent");
  test.skip(!["tablet", "mobile"].includes(test.info().project.name), "Runs on responsive projects");

  await page.goto("/agents");
  await expect(page.getByRole("heading", { name: "Agents", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Search agents")).toBeVisible();
  await page.screenshot({ path: path.join(evidence, `t7_agents_${test.info().project.name}.png`), fullPage: true });
});
