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

  test("clears every installation of the inspection site at once", async ({ page }) => {
    // 검사 장비 2대 등록 (관리자 API — 화면과 같은 쿠키 세션)
    for (const [id, label] of [["E2E-INSP-A", "검사대 A"], ["E2E-INSP-B", "검사대 B"]]) {
      const res = await page.request.post(`/api/admin/sites/${E2E.inspection.siteId}/installations`, {
        data: { id, label },
      });
      expect(res.status(), await res.text()).toBe(201);
    }
    await page.goto("/admin/sites");
    await expect(page.getByText("출고검사", { exact: true })).toBeVisible();

    // 고객 현장에는 일괄 삭제 버튼이 없다
    await expect(page.getByRole("button", { name: /지점 전체 삭제/ })).toHaveCount(1);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "지점 전체 삭제 (2)" }).click();
    await expect(page.getByText("출고검사 설치지점 2개를 삭제했습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "지점 전체 삭제 (0)" })).toBeDisabled();
  });

  test("lists accounts in user management", async ({ page }) => {
    await page.goto("/admin/users");
    for (const username of Object.values(E2E.users)) {
      await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
    }
  });
});
