import type { TestApp } from "../integration/helpers/app.js";
import { createInstallation, createSite, createUser } from "../integration/helpers/fixtures.js";

/** e2e/fixtures.ts 와 같은 값이어야 한다. */
export const E2E = {
  password: "Regression#2026",
  users: { admin: "e2e-admin", client: "e2e-lotte", site: "e2e-gs-site" },
  lotte: { siteId: "e2e-lotte", name: "E2E 롯데 현장", inst: "E2E-LOTTE-01", label: "변전실", iccid: "89820000000000000117" },
  gs: { siteId: "e2e-gs", name: "E2E GS 현장", inst: "E2E-GS-01", label: "전기실", iccid: "89820000000000000125" },
} as const;

/**
 * 화면 시나리오에 필요한 최소 데이터. 텔레메트리는 HMI 와 같은 경로(/receiver)로 넣어
 * 수신 → 저장 → 화면 표시 전체가 한 번에 검증되게 한다.
 */
export const seedE2eData = async (app: TestApp) => {
  for (const s of [{ ...E2E.lotte, client: "lotte" }, { ...E2E.gs, client: "gs" }]) {
    await createSite({ id: s.siteId, client: s.client, name: s.name });
    await createInstallation({ id: s.inst, siteId: s.siteId, label: s.label, iccid: s.iccid });
  }

  await createUser({ username: E2E.users.admin, role: "ADMIN", password: E2E.password });
  await createUser({ username: E2E.users.client, role: "CLIENT", clientKey: "lotte", password: E2E.password });
  await createUser({ username: E2E.users.site, role: "SITE", siteId: E2E.gs.siteId, password: E2E.password });

  const now = Math.floor(Date.now() / 1000);
  const ingest = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/receiver",
      headers: { "x-api-key": "e2e-test-receiver-key", "content-type": "application/json" },
      payload: JSON.stringify(payload),
    });

  // 롯데: 정상 가동 중, 최근 1시간 이력 6건
  for (let i = 5; i >= 0; i--) {
    await ingest({
      iccid: E2E.lotte.iccid,
      model: "psvg",
      timestamp: now - i * 600,
      numOfMods: 3,
      moduleStatus: [2, 2, 2],
      vL1: 221.5,
      vL2: 220.4,
      vL3: 219.8,
      gridCurrentL1: 80 + i,
      loadCurrentL1: 120 + i,
      tpf1: -13.7,
      tpf2: -93.2,
      uncompP: 7.3,
      totalCapacity: 150,
      operatingCapacity: 100,
      csq: 21,
      rsrp: -84,
    });
  }

  // GS: 모듈 하나가 이상(3)
  await ingest({
    iccid: E2E.gs.iccid,
    model: "psvg",
    timestamp: now,
    numOfMods: 3,
    moduleStatus: [2, 3, 2],
    vL1: 218.2,
    vL2: 219.1,
    vL3: 220.3,
    totalCapacity: 100,
    csq: 15,
  });
};
