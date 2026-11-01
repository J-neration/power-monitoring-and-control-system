import { expect, test } from "@playwright/test";
import { E2E, login, loginAs } from "./fixtures";

test.describe("login", () => {
  test("sends an anonymous visitor to the login page and remembers where they were going", async ({ page }) => {
    await page.goto(`/sites/${E2E.lotte.siteId}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?from=%2Fsites%2F${E2E.lotte.siteId}`));
    await expect(page.getByRole("heading", { name: "운영자 로그인" })).toBeVisible();
  });

  test("shows an error for a wrong password and stays on the login page", async ({ page }) => {
    await login(page, E2E.users.admin, "Wrong#Password1");
    await expect(page.getByText("아이디 또는 비밀번호가 올바르지 않습니다.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("asks for both fields before calling the server", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "관제 시스템 접속" }).click();
    await expect(page.getByText("아이디와 비밀번호를 입력해주세요.")).toBeVisible();
  });

  test("sets an httpOnly session cookie and opens the dashboard", async ({ page, context }) => {
    await loginAs(page, E2E.users.admin);
    await expect(page).toHaveURL("/");
    await expect(page.getByText("장비 전체")).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === "pmcs_token");
    expect(cookie?.httpOnly).toBe(true);
    // 쿠키가 있어도 스크립트에서는 읽을 수 없어야 한다 (XSS 로 토큰 탈취 방지).
    expect(await page.evaluate(() => document.cookie)).not.toContain("pmcs_token");
  });

  test("sends a logged-in user away from /login", async ({ page }) => {
    await loginAs(page, E2E.users.admin);
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });
});

test.describe("session", () => {
  test("logout clears the session and protects pages again", async ({ page }) => {
    await loginAs(page, E2E.users.admin);

    await page.getByTitle("로그아웃").click();
    await page.locator(".logout-popover").getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects a forged session cookie", async ({ page, context, baseURL }) => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiJ4IiwidXNlcm5hbWUiOiJ4Iiwicm9sZSI6IkFETUlOIn0." +
      "c2lnbmVkLXdpdGgtYW5vdGhlci1zZWNyZXQ";
    await context.addCookies([{ name: "pmcs_token", value: forged, url: baseURL! }]);

    await page.goto("/");

    await expect(page).toHaveURL(/\/login/);
    expect((await context.cookies()).some((c) => c.name === "pmcs_token")).toBe(false);
  });
});
