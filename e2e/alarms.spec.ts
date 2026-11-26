import { expect, test, type Page } from "@playwright/test";
import { E2E, loginAs } from "./fixtures";

/**
 * 알람 목록 서랍 — 시드: GS 현장 2번 모듈 이상 → 서버 알람 1건(발생·미확인).
 * 출고검사 현장은 알람에서 빠진다. 확인은 관리자·고객사만.
 * ALARM_SHOTS=<dir> 를 주면 화면을 그 폴더에 저장한다 (리뷰용).
 */
const shot = async (page: Page, name: string) => {
  const dir = process.env.ALARM_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
};

const openDrawer = async (page: Page) => {
  await page.getByRole("button", { name: /알람 보기/ }).click();
  const drawer = page.getByRole("complementary", { name: "알람 목록" });
  await expect(drawer).toBeVisible();
  return drawer;
};

test.describe.serial("alarm drawer", () => {
  test("site account sees the list but cannot ack", async ({ page }) => {
    await loginAs(page, E2E.users.site);
    const drawer = await openDrawer(page);
    await expect(drawer.getByText(E2E.gs.name)).toBeVisible();
    await expect(drawer.getByRole("button", { name: "확인", exact: true })).toHaveCount(0);
  });

  test("admin acks one alarm with a note", async ({ page }) => {
    await loginAs(page, E2E.users.admin);
    await expect(page.getByRole("button", { name: "알람 보기 · 미확인 1" })).toBeVisible();
    await shot(page, "1-ticker");

    const drawer = await openDrawer(page);
    await expect(drawer.getByRole("heading", { name: /발생 · 미확인/ })).toBeVisible();
    await expect(drawer.getByText(E2E.inspection.name)).toHaveCount(0);
    await shot(page, "2-drawer-unacked");

    await drawer.getByRole("button", { name: "확인", exact: true }).click();
    await drawer.getByPlaceholder(/조치 메모/).fill("현장 담당자 통화, 모듈 교체 예정");
    await shot(page, "3-ack-form");
    await drawer.getByRole("button", { name: "확인 저장" }).click();

    await expect(drawer.getByRole("heading", { name: /발생 · 확인됨/ })).toBeVisible();
    await expect(drawer.getByText(/e2e-admin/)).toBeVisible();
    await expect(drawer.getByText("현장 담당자 통화, 모듈 교체 예정", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "알람 보기", exact: true })).toBeVisible();
    await shot(page, "4-drawer-acked");

    await drawer.getByRole("tab", { name: "이력" }).click();
    await expect(drawer.getByText("발생 · 확인됨").first()).toBeVisible();
    await shot(page, "5-history");

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // 띠: 확인된 알람은 계속 흐르되 ✓확인 표시
    await expect(page.locator(".alarm-ticker-item--acked").first()).toContainText("✓확인");
  });

  test("alarm layout shows the same server list (acked state persists across reload)", async ({ page }) => {
    await loginAs(page, E2E.users.admin);
    await page.getByRole("toolbar", { name: "관제 화면 설정" }).getByRole("button", { name: "알람", exact: true }).click();
    const panel = page.locator(".alarm-panel--server");
    await expect(panel.getByRole("heading", { name: /알람 목록/ })).toBeVisible();
    await expect(panel.getByRole("heading", { name: /발생 · 확인됨/ })).toBeVisible();
    await expect(panel.getByText(/e2e-admin/)).toBeVisible();
    await shot(page, "6-alarm-layout");
  });

  test("admin puts an installation under maintenance and releases it", async ({ page }) => {
    await loginAs(page, E2E.users.admin);
    const drawer = await openDrawer(page);

    await drawer.getByRole("button", { name: "점검 중", exact: true }).first().click();
    await drawer.getByRole("radio", { name: "7일" }).click();
    await drawer.getByPlaceholder(/사유/).fill("모듈 교체 대기");
    await drawer.getByRole("button", { name: "점검 중 저장" }).click();

    await expect(drawer.getByRole("heading", { name: /점검 중/ })).toBeVisible();
    await expect(drawer.getByText("모듈 교체 대기", { exact: false })).toBeVisible();
    await expect(drawer.getByText(/처리할 알람이 없습니다.*점검 중 1곳 제외/)).toBeVisible();
    await shot(page, "7-maintenance");

    // 띠에서도 빠진다
    await page.keyboard.press("Escape");
    await expect(page.getByText("알람 없음", { exact: false })).toBeVisible();

    const again = await openDrawer(page);
    await again.getByRole("button", { name: "점검 해제" }).click();
    await expect(again.getByRole("heading", { name: /점검 중/ })).toHaveCount(0);
    await expect(again.getByRole("heading", { name: /발생 · 확인됨/ })).toBeVisible();
  });
});
