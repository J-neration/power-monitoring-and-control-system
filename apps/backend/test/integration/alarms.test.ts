import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../../src/lib/prisma.js";
import { syncAlarms } from "../../src/services/alarmService.js";
import { http, useTestApp } from "./helpers/app.js";
import { IDS, INSPECTION, createInstallation, seedInspection } from "./helpers/fixtures.js";

const t = useTestApp();

type AlarmJson = {
  id: number;
  installationId: string;
  siteId: string;
  kind: string;
  state: string;
  ackedBy: string | null;
  ackNote: string | null;
};

/** seedInspection + 검사 현장 설치지점. 빈 Device 행(수신 없음)이라 전부 offline 대상. */
const seed = async () => {
  const world = await seedInspection(t.app);
  await createInstallation({ id: "TEST-INSPECT-01", siteId: INSPECTION.site, label: "검사대 1" });
  await syncAlarms();
  return world;
};

const list = async (token: string) => {
  const res = await http(t.app).get("/alarms", { token });
  assert.equal(res.statusCode, 200);
  return (res.json() as { alarms: AlarmJson[] }).alarms;
};

describe("alarm sync", () => {
  it("raises offline alarms for never-seen installations, skipping the inspection site", async () => {
    await seed();
    const rows = await prisma.alarm.findMany({ orderBy: { installationId: "asc" } });
    assert.deepEqual(
      rows.map((r) => [r.installationId, r.kind, r.clearedAt]),
      [
        [IDS.gsInst, "offline", null],
        [IDS.lotteInst, "offline", null],
      ],
    );
  });

  it("does not duplicate open alarms on repeated sync", async () => {
    await seed();
    await syncAlarms();
    assert.equal(await prisma.alarm.count(), 2);
  });
});

describe("GET /alarms", () => {
  it("scopes by account: admin/viewer all, client own client, site own site", async () => {
    const { tokens } = await seed();
    assert.equal((await list(tokens.admin)).length, 2);
    assert.equal((await list(tokens.viewer)).length, 2);
    assert.deepEqual((await list(tokens.client)).map((a) => a.siteId), [IDS.lotteSite]);
    assert.deepEqual((await list(tokens.site)).map((a) => a.siteId), [IDS.gsSite]);
  });

  it("requires login", async () => {
    const res = await http(t.app).get("/alarms");
    assert.equal(res.statusCode, 401);
  });
});

describe("POST /alarms/:id/ack", () => {
  it("client acks its own alarm once with a note; second ack is 409", async () => {
    const { tokens } = await seed();
    const [alarm] = await list(tokens.client);

    const res = await http(t.app).post(`/alarms/${alarm.id}/ack`, { note: "  현장 확인 요청함 " }, { token: tokens.client });
    assert.equal(res.statusCode, 200);
    const acked = (res.json() as { alarm: AlarmJson }).alarm;
    assert.equal(acked.state, "active_acked");
    assert.equal(acked.ackedBy, "lotte-reg");
    assert.equal(acked.ackNote, "현장 확인 요청함");

    const again = await http(t.app).post(`/alarms/${alarm.id}/ack`, {}, { token: tokens.admin });
    assert.equal(again.statusCode, 409);
    assert.equal((again.json() as { alarm: AlarmJson }).alarm.ackedBy, "lotte-reg");
  });

  it("client cannot ack another client's alarm (404)", async () => {
    const { tokens } = await seed();
    const gsAlarm = (await list(tokens.admin)).find((a) => a.siteId === IDS.gsSite)!;
    const res = await http(t.app).post(`/alarms/${gsAlarm.id}/ack`, {}, { token: tokens.client });
    assert.equal(res.statusCode, 404);
  });

  it("site, viewer and inspector accounts cannot ack (403)", async () => {
    const { tokens, inspectorToken } = await seed();
    const [alarm] = await list(tokens.admin);
    for (const token of [tokens.site, tokens.viewer, inspectorToken]) {
      const res = await http(t.app).post(`/alarms/${alarm.id}/ack`, {}, { token });
      assert.equal(res.statusCode, 403);
    }
  });

  it("rejects a note over 200 chars and a bad id", async () => {
    const { tokens } = await seed();
    const [alarm] = await list(tokens.admin);
    const longNote = await http(t.app).post(`/alarms/${alarm.id}/ack`, { note: "가".repeat(201) }, { token: tokens.admin });
    assert.equal(longNote.statusCode, 400);
    const badId = await http(t.app).post("/alarms/abc/ack", {}, { token: tokens.admin });
    assert.equal(badId.statusCode, 400);
  });
});

describe("alarm lifecycle (4 states)", () => {
  it("active → cleared_unacked stays listed → ack moves it to history only", async () => {
    const { tokens } = await seed();
    await prisma.device.update({
      where: { installationId: IDS.lotteInst },
      data: { moduleStatus: [2, 2], lastSeenAt: new Date() },
    });
    await syncAlarms();

    const lotte = (await list(tokens.admin)).find((a) => a.installationId === IDS.lotteInst)!;
    assert.equal(lotte.state, "cleared_unacked");

    const ack = await http(t.app).post(`/alarms/${lotte.id}/ack`, {}, { token: tokens.admin });
    assert.equal(ack.statusCode, 200);
    assert.equal((ack.json() as { alarm: AlarmJson }).alarm.state, "cleared_acked");

    const after = await list(tokens.admin);
    assert.equal(after.some((a) => a.id === lotte.id), false);

    const hist = await http(t.app).get("/alarms/history", { token: tokens.admin });
    assert.equal(hist.statusCode, 200);
    const histAlarms = (hist.json() as { alarms: AlarmJson[] }).alarms;
    assert.equal(histAlarms.find((a) => a.id === lotte.id)?.state, "cleared_acked");
  });

  it("an alarm that recurs after being cleared+acked opens as a new unacked row", async () => {
    const { tokens } = await seed();
    await prisma.device.update({
      where: { installationId: IDS.lotteInst },
      data: { moduleStatus: [2], lastSeenAt: new Date() },
    });
    await syncAlarms();
    const cleared = (await list(tokens.admin)).find((a) => a.installationId === IDS.lotteInst)!;
    await http(t.app).post(`/alarms/${cleared.id}/ack`, {}, { token: tokens.admin });

    await prisma.device.update({ where: { installationId: IDS.lotteInst }, data: { moduleStatus: [3] } });
    await syncAlarms();
    const again = (await list(tokens.admin)).find((a) => a.installationId === IDS.lotteInst)!;
    assert.notEqual(again.id, cleared.id);
    assert.equal(again.kind, "fault");
    assert.equal(again.state, "active_unacked");
  });
});

describe("GET /alarms/history", () => {
  it("validates the range", async () => {
    const { tokens } = await seed();
    const tooLong = await http(t.app).get(
      "/alarms/history?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z",
      { token: tokens.admin },
    );
    assert.equal(tooLong.statusCode, 400);
    const reversed = await http(t.app).get(
      "/alarms/history?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z",
      { token: tokens.admin },
    );
    assert.equal(reversed.statusCode, 400);
  });

  it("filters by site and respects account scope", async () => {
    const { tokens } = await seed();
    const own = await http(t.app).get(`/alarms/history?siteId=${IDS.lotteSite}`, { token: tokens.client });
    assert.equal((own.json() as { alarms: AlarmJson[] }).alarms.length, 1);
    const other = await http(t.app).get(`/alarms/history?siteId=${IDS.gsSite}`, { token: tokens.client });
    assert.equal((other.json() as { alarms: AlarmJson[] }).alarms.length, 0);
  });
});

describe("POST /alarms/ack-bulk", () => {
  it("acks only the given ids within the account's scope", async () => {
    const { tokens } = await seed();
    const all = await list(tokens.admin);
    // 롯데 고객사가 둘 다 보내도 자기 현장 것만 확인된다
    const res = await http(t.app).post(
      "/alarms/ack-bulk",
      { ids: all.map((a) => a.id), note: "일괄 확인" },
      { token: tokens.client },
    );
    assert.equal(res.statusCode, 200);
    const body = res.json() as { acked: number; alarms: AlarmJson[] };
    assert.equal(body.acked, 1);
    assert.equal(body.alarms[0].siteId, IDS.lotteSite);
    assert.equal(body.alarms[0].ackNote, "일괄 확인");

    const after = await list(tokens.admin);
    assert.equal(after.find((a) => a.siteId === IDS.gsSite)?.state, "active_unacked");
  });

  it("does not overwrite an earlier ack and rejects empty / site accounts", async () => {
    const { tokens } = await seed();
    const all = await list(tokens.admin);
    await http(t.app).post(`/alarms/${all[0].id}/ack`, { note: "먼저" }, { token: tokens.admin });
    const res = await http(t.app).post("/alarms/ack-bulk", { ids: all.map((a) => a.id) }, { token: tokens.admin });
    assert.equal((res.json() as { acked: number }).acked, 1);
    const first = (await list(tokens.admin)).find((a) => a.id === all[0].id);
    assert.equal(first?.ackNote, "먼저");

    const empty = await http(t.app).post("/alarms/ack-bulk", { ids: [] }, { token: tokens.admin });
    assert.equal(empty.statusCode, 400);
    const site = await http(t.app).post("/alarms/ack-bulk", { ids: [all[0].id] }, { token: tokens.site });
    assert.equal(site.statusCode, 403);
  });
});

describe("maintenance (점검 중)", () => {
  type Maint = { installationId: string; until: string | null; by: string | null; note: string | null };
  const getAll = async (token: string) =>
    (await http(t.app).get("/alarms", { token })).json() as { alarms: AlarmJson[]; maintenance: Maint[] };

  it("client sets maintenance on its own installation with a period and note, then clears it", async () => {
    const { tokens } = await seed();
    const set = await http(t.app).put(
      `/alarms/maintenance/${IDS.lotteInst}`,
      { days: 7, note: "모듈 교체 대기" },
      { token: tokens.client },
    );
    assert.equal(set.statusCode, 200);

    const { maintenance, alarms } = await getAll(tokens.admin);
    assert.equal(maintenance.length, 1);
    assert.equal(maintenance[0].installationId, IDS.lotteInst);
    assert.equal(maintenance[0].by, "lotte-reg");
    assert.equal(maintenance[0].note, "모듈 교체 대기");
    const days = (Date.parse(maintenance[0].until!) - Date.now()) / 86_400_000;
    assert.ok(days > 6.9 && days <= 7);
    // 알람 기록은 그대로 남는다 (화면이 따로 묶는다)
    assert.equal(alarms.length, 2);

    const clear = await http(t.app).delete(`/alarms/maintenance/${IDS.lotteInst}`, { token: tokens.client });
    assert.equal(clear.statusCode, 200);
    assert.equal((await getAll(tokens.admin)).maintenance.length, 0);
  });

  it("days=null means until cleared; expired maintenance disappears", async () => {
    const { tokens } = await seed();
    await http(t.app).put(`/alarms/maintenance/${IDS.gsInst}`, { days: null }, { token: tokens.admin });
    let m = (await getAll(tokens.admin)).maintenance;
    assert.equal(m[0].until, null);

    await prisma.installation.update({
      where: { id: IDS.gsInst },
      data: { maintenanceUntil: new Date(Date.now() - 1000) },
    });
    m = (await getAll(tokens.admin)).maintenance;
    assert.equal(m.length, 0);
  });

  it("scope and permissions: other client 404, site/viewer 403, bad days 400", async () => {
    const { tokens } = await seed();
    const other = await http(t.app).put(`/alarms/maintenance/${IDS.gsInst}`, { days: 1 }, { token: tokens.client });
    assert.equal(other.statusCode, 404);
    for (const token of [tokens.site, tokens.viewer]) {
      const res = await http(t.app).put(`/alarms/maintenance/${IDS.gsInst}`, { days: 1 }, { token });
      assert.equal(res.statusCode, 403);
    }
    const bad = await http(t.app).put(`/alarms/maintenance/${IDS.gsInst}`, { days: 3 }, { token: tokens.admin });
    assert.equal(bad.statusCode, 400);
    // 다른 고객사 계정은 남의 점검 목록을 보지 못한다
    await http(t.app).put(`/alarms/maintenance/${IDS.gsInst}`, { days: 1 }, { token: tokens.admin });
    assert.equal((await getAll(tokens.client)).maintenance.length, 0);
  });
});
