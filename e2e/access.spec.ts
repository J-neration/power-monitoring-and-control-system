import { expect, test } from "@playwright/test";
import { E2E, loginAs } from "./fixtures";

/** 고객사 계정은 자기 현장만 봐야 한다 — 다른 건설사 현장이 보이면 즉시 보안 사고다. */
test.describe("construction company account (CLIENT · 롯데)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E.users.client);
  });

  test("sees only its own sites on the dashboard", async ({ page }) => {
    await expect(page.getByText(E2E.lotte.name).first()).toBeVisible();
    await expect(page.getByText(E2E.gs.name)).toHaveCount(0);
  });

  test("cannot open another company's site or device by URL", async ({ page }) => {
    await page.goto(`/sites/${E2E.gs.siteId}`);
    await expect(page.getByText(E2E.gs.name)).toHaveCount(0);

    await page.goto(`/devices/${E2E.gs.inst}`);
    await expect(page.getByText(E2E.gs.label)).toHaveCount(0);
  });

  test("is sent away from the admin panel", async ({ page }) => {
    await page.goto("/admin/sites");
    await expect(page).toHaveURL("/");
  });

  test("does not see the admin panel link", async ({ page }) => {
    await expect(page.getByRole("link", { name: "관리자 패널" })).toHaveCount(0);
  });
});

test.describe("site account (SITE · GS 현장)", () => {
  test("sees only its own site", async ({ page }) => {
    await loginAs(page, E2E.users.site);
    await expect(page.getByText(E2E.gs.name).first()).toBeVisible();
    await expect(page.getByText(E2E.lotte.name)).toHaveCount(0);
  });
});
