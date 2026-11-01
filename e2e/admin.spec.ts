import { expect, test } from "@playwright/test";
import { E2E, loginAs } from "./fixtures";

test.describe("admin panel", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E.users.admin);
  });

  test("/admin opens the site management page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/sites/);
    await expect(page.getByText(E2E.lotte.name)).toBeVisible();
    await expect(page.getByText(E2E.gs.name)).toBeVisible();
  });

  test("creates and deletes a site", async ({ page }) => {
    const id = `e2e-temp-${Date.now()}`;
    const name = `E2E 임시 현장 ${Date.now()}`;
    await page.goto("/admin/sites");

    await page.getByRole("button", { name: "+ 새 현장 추가" }).click();
    await page.getByPlaceholder("lotte-dongtan-xi").fill(id);
    await page.getByPlaceholder("동탄 롯데캐슬").fill(name);
    await page.getByPlaceholder("경기도 화성시 동탄대로 123").fill("서울시 임시구 1");
    await page.getByRole("button", { name: "현장 저장" }).click();
    await expect(page.getByText(name)).toBeVisible();

    // 다른 시나리오의 데이터를 흐트러뜨리지 않도록 지운다.
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".admin-sites-item, li, div").filter({ hasText: name }).getByRole("button", { name: "삭제" }).last().click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("lists accounts in user management", async ({ page }) => {
    await page.goto("/admin/users");
    for (const username of Object.values(E2E.users)) {
      await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
    }
  });
});
