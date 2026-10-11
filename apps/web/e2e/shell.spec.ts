import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const evidence = path.resolve(__dirname, "../../../gui-test-screenshots");

test.beforeAll(() => fs.mkdirSync(evidence, { recursive: true }));

test("login renders the configured state honestly and is accessible", async ({ page }) => {
  await page.goto("/login?reason=configuration");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: path.join(evidence, "t1_login.png"), fullPage: true });
});

test("desktop shell supports navigation and command palette", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  // The modal focuses its first control inside an effect; waiting for it
  // guarantees the Escape key listener is attached (dev-mode cold hydration).
  await expect(palette.locator("input, button, [href]").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  const results = await new AxeBuilder({ page }).exclude(".grid-cols-5").analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: path.join(evidence, "t2_dashboard_desktop.png"), fullPage: true });
});

test("tablet and mobile shells expose responsive navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile tab navigation" })).toBeHidden();
  await page.screenshot({ path: path.join(evidence, "t3_dashboard_tablet.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Mobile tab navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile primary navigation" })).toBeVisible();
  await page.screenshot({ path: path.join(evidence, "t4_dashboard_mobile.png"), fullPage: true });
});
