import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAdminAlertMail,
  detectModuleStatusAlerts,
  faultAlertLine,
  isAlertMailExcludedSite,
  statusAlertLine,
} from "./moduleAlerts.js";

describe("isAlertMailExcludedSite", () => {
  it("skips outgoing inspection and the prime lab only", () => {
    assert.equal(isAlertMailExcludedSite("testing"), true);
    assert.equal(isAlertMailExcludedSite("prime-rnd-1"), true);
    assert.equal(isAlertMailExcludedSite("lotte-haeundae-castle"), false);
    assert.equal(isAlertMailExcludedSite(null), false);
  });
});

describe("detectModuleStatusAlerts", () => {
  it("ignores the first snapshot", () => {
    assert.deepEqual(detectModuleStatusAlerts(null, [4, 0, 3]), []);
    assert.deepEqual(detectModuleStatusAlerts([], [2, 4]), []);
  });

  it("alerts when a running module goes offline or standby, or enters fault", () => {
    assert.deepEqual(detectModuleStatusAlerts([2, 2, 2, 2], [2, 4, 0, 3]), [
      { moduleIndex: 1, kind: "offline", from: 2, to: 4 },
      { moduleIndex: 2, kind: "standby", from: 2, to: 0 },
      { moduleIndex: 3, kind: "fault", from: 2, to: 3 },
    ]);
  });

  it("does not repeat a status that stayed the same", () => {
    assert.deepEqual(detectModuleStatusAlerts([4, 0, 3, 2], [4, 0, 3, 2]), []);
  });

  it("does not alert offline or standby unless the module was running", () => {
    assert.deepEqual(detectModuleStatusAlerts([1, 0, 4], [4, 4, 0]), []);
  });
});

describe("buildAdminAlertMail", () => {
  it("names a single transition in the subject", () => {
    const mail = buildAdminAlertMail({
      siteName: "대구 L사",
      installationLabel: "전기실",
      installationId: "PSVG-1",
      at: new Date("2026-10-17T00:00:00Z"),
      lines: [statusAlertLine({ moduleIndex: 2, kind: "offline", from: 2, to: 4 })],
    });
    assert.equal(mail.subject, "[PMCS] 대구 L사 전기실 — 모듈 3 오프라인");
    assert.match(mail.text, /상태: 가동 → 오프라인/);
    assert.match(mail.text, /설비 ID   : PSVG-1/);
    assert.match(mail.text, /2026-10-17 09:00/);
    assert.match(mail.html, /모듈 3 오프라인/);
  });

  it("counts multiple lines", () => {
    const mail = buildAdminAlertMail({
      siteName: "대구 L사",
      installationLabel: "전기실",
      installationId: "PSVG-1",
      at: new Date("2026-10-17T00:00:00Z"),
      lines: [
        statusAlertLine({ moduleIndex: 0, kind: "standby", from: 2, to: 0 }),
        faultAlertLine(4, "Over Temperature"),
      ],
    });
    assert.equal(mail.subject, "[PMCS] 대구 L사 전기실 — 상태 변경 2건");
    assert.match(mail.text, /1\. 모듈 1 대기/);
    assert.match(mail.text, /상태: 가동 → 대기/);
    assert.match(mail.text, /2\. 모듈 5 이상/);
    assert.match(mail.text, /내용: Over Temperature/);
  });
});
