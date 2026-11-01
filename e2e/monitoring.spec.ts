import { expect, test } from "@playwright/test";
import { E2E, loginAs } from "./fixtures";

/** 시드: 롯데 = 3모듈 모두 가동, GS = 2번 모듈 이상. */
test.describe("dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E.users.admin);
  });

  test("summarizes every device by status", async ({ page }) => {
    const summary = (label: string) => page.locator(`:text-is("${label}")`).first().locator("..");
    await expect(summary("장비 전체")).toContainText("2");
    await expect(summary("가동")).toContainText("1");
    await expect(summary("이상")).toContainText("1");
  });

  test("lists both sites with their status", async ({ page }) => {
    await expect(page.getByText(E2E.lotte.name).first()).toBeVisible();
    await expect(page.getByText(E2E.gs.name).first()).toBeVisible();
  });

  test("raises an alarm for the faulted installation", async ({ page }) => {
    await expect(page.getByText(`${E2E.gs.name}·${E2E.gs.label}·이상`).first()).toBeVisible();
  });

  test("shows live telemetry received from the HMI", async ({ page }) => {
    await page.getByText(E2E.lotte.name).first().click();
    await expect(page.getByText("221.5").first()).toBeVisible();
    await expect(page.getByText("RSRP -84 · CSQ 21", { exact: false }).first()).toBeVisible();
  });
});

test.describe("drill-down", () => {
  test("dashboard → site → device", async ({ page }) => {
    await loginAs(page, E2E.users.admin);

    await page.goto(`/sites/${E2E.lotte.siteId}`);
    await expect(page.getByRole("heading", { name: E2E.lotte.name })).toBeVisible();

    // 장치 화면은 같은 탭에서 열린다 (3cbe589).
    await page.locator(`a[href="/devices/${E2E.lotte.inst}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/devices/${E2E.lotte.inst}`));
    await expect(page.getByText(E2E.lotte.inst).first()).toBeVisible();
    await expect(page.getByText("가동중")).toHaveCount(3);
  });

  test("device page shows the fault module", async ({ page }) => {
    await loginAs(page, E2E.users.admin);
    await page.goto(`/devices/${E2E.gs.inst}`);
    await expect(page.getByText("가동중")).toHaveCount(2);
    await expect(page.getByText(/이상/).first()).toBeVisible();
  });
});
