import { expect, test } from "@playwright/test";
import { E2E, E2E_API, E2E_RECEIVER_KEY, loginAs } from "./fixtures";

/**
 * 출고검사 계정: 모든 현장을 보지만, ICCID 등록·해제는 자기 검사 현장에서만 하고 장비 제어는 못 한다.
 * 이 시나리오는 끝에 검사 장비를 지워서 다른 스펙(가동중 개수 등)에 영향을 남기지 않는다.
 */
test.describe("shipping inspection account (INSPECTOR)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E.users.inspector);
  });

  test("sees every customer site on the dashboard", async ({ page }) => {
    await expect(page.getByText(E2E.lotte.name).first()).toBeVisible();
    await expect(page.getByText(E2E.gs.name).first()).toBeVisible();
  });

  test("registers a USIM, sees the HMI come online, then releases and deletes it", async ({ page, request }) => {
    const iccid = "89820000000000000216";

    await page.getByRole("button", { name: "메뉴 열기" }).click();
    await page.getByRole("link", { name: "출고검사 ICCID 등록" }).click();
    await expect(page).toHaveURL("/inspection");
    await expect(page.getByText("등록된 검사 장비가 없습니다.")).toBeVisible();

    // 바코드 스캐너처럼 공백 섞어 입력하고 Enter
    await page.getByLabel("장비 이름 / S/N").fill("S/N E2E-001");
    await page.getByLabel(/^ICCID/).fill("8982 0000 0000 0000 0216");
    await page.getByLabel(/^ICCID/).press("Enter");

    const row = page.getByRole("row", { name: /S\/N E2E-001/ });
    await expect(row).toBeVisible();
    await expect(row.getByText(iccid)).toBeVisible();
    await expect(row.getByText("수신 대기")).toBeVisible();

    // HMI 가 텔레메트리를 보내면 (10초 주기 새로고침) '수신 중'
    const sent = await request.post(`${E2E_API}/receiver`, {
      headers: { "x-api-key": E2E_RECEIVER_KEY },
      data: {
        iccid,
        model: "psvg",
        timestamp: Math.floor(Date.now() / 1000),
        numOfMods: 2,
        moduleStatus: [0, 0],
        vL1: 220,
        vL2: 220,
        vL3: 220,
        csq: 23,
        rsrp: -80,
      },
    });
    expect(sent.ok()).toBeTruthy();
    await expect(row.getByText(/수신 중/)).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText(/CSQ 23/)).toBeVisible();

    // 고객 현장에 이미 쓰는 ICCID 는 거부
    await page.getByLabel(/^ICCID/).fill(E2E.lotte.iccid);
    await page.getByRole("button", { name: "등록", exact: true }).click();
    await expect(page.getByText("이미 다른 현장에 등록된 ICCID입니다", { exact: false })).toBeVisible();

    // 검사 끝: 해제 → 삭제
    page.on("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "ICCID 해제" }).click();
    await expect(row.getByText("해제됨")).toBeVisible();

    await row.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText("등록된 검사 장비가 없습니다.")).toBeVisible();
  });

  test("can open a customer device but has no settings or control tab", async ({ page }) => {
    await page.goto(`/devices/${E2E.lotte.inst}`);
    await expect(page.getByText(E2E.lotte.label).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "설정" })).toHaveCount(0);
  });

  test("is sent away from the admin panel", async ({ page }) => {
    await page.goto("/admin/sites");
    await expect(page).toHaveURL("/");
  });
});
