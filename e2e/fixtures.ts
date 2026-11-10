import { expect, type Page } from "@playwright/test";

/** apps/backend/test/e2e/seed.ts 가 넣는 데이터와 같은 값. */
export const E2E = {
  password: "Regression#2026",
  users: { admin: "e2e-admin", client: "e2e-lotte", site: "e2e-gs-site", inspector: "e2e-inspector" },
  lotte: { siteId: "e2e-lotte", name: "E2E 롯데 현장", inst: "E2E-LOTTE-01", label: "변전실", iccid: "89820000000000000117" },
  gs: { siteId: "e2e-gs", name: "E2E GS 현장", inst: "E2E-GS-01", label: "전기실" },
  inspection: { siteId: "e2e-inspection", name: "E2E 출고검사" },
} as const;

/** 백엔드(E2E 서버)에 HMI 처럼 직접 보내기 — playwright.config.ts 의 포트·키와 같다. */
export const E2E_API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4100}`;
export const E2E_RECEIVER_KEY = "e2e-test-receiver-key";

export const login = async (page: Page, username: string, password: string = E2E.password) => {
  await page.goto("/login");
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "관제 시스템 접속" }).click();
};

export const loginAs = async (page: Page, username: string) => {
  await login(page, username);
  await expect(page).not.toHaveURL(/\/login/);
};
