import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAdminAlertMail,
  detectModuleStatusAlerts,
  detectTemperatureAlerts,
  faultAlertLine,
  isAlertMailExcludedInstallation,
  isAlertMailExcludedSite,
  statusAlertLine,
  temperatureAlertLine,
} from "./moduleAlerts.js";

describe("isAlertMailExcludedSite", () => {
  it("skips outgoing inspection only", () => {
    assert.equal(isAlertMailExcludedSite("testing"), true);
    assert.equal(isAlertMailExcludedSite("prime-rnd-1"), false);
    assert.equal(isAlertMailExcludedSite("lotte-haeundae-castle"), false);
    assert.equal(isAlertMailExcludedSite(null), false);
    assert.equal(isAlertMailExcludedInstallation("prime-parkinglot"), true);
    assert.equal(isAlertMailExcludedInstallation("prime-rnd-lab"), false);
  });
});

describe("detectModuleStatusAlerts", () => {
  it("ignores the first snapshot", () => {
    assert.deepEqual(detectModuleStatusAlerts(null, [4, 0, 3]), []);
    assert.deepEqual(detectModuleStatusAlerts([], [2, 4]), []);
  });

  it("alerts on every status change, whatever the direction", () => {
    assert.deepEqual(detectModuleStatusAlerts([2, 2, 2, 2], [2, 4, 0, 3]), [
      { moduleIndex: 1, from: 2, to: 4 },
      { moduleIndex: 2, from: 2, to: 0 },
      { moduleIndex: 3, from: 2, to: 3 },
    ]);
    assert.deepEqual(detectModuleStatusAlerts([1, 0, 4], [4, 4, 0]), [
      { moduleIndex: 0, from: 1, to: 4 },
      { moduleIndex: 1, from: 0, to: 4 },
      { moduleIndex: 2, from: 4, to: 0 },
    ]);
  });

  it("alerts when a module appears or disappears", () => {
    assert.deepEqual(detectModuleStatusAlerts([2, 2], [2]), [
      { moduleIndex: 1, from: 2, to: null },
    ]);
    assert.deepEqual(detectModuleStatusAlerts([2], [2, 0]), [
      { moduleIndex: 1, from: null, to: 0 },
    ]);
  });

  it("does not repeat a status that stayed the same", () => {
    assert.deepEqual(detectModuleStatusAlerts([4, 0, 3, 2], [4, 0, 3, 2]), []);
  });
});

describe("detectTemperatureAlerts", () => {
  it("mails when ambient crosses 40°C or a module crosses 90°C", () => {
    assert.deepEqual(
      detectTemperatureAlerts({
        previousArea: [39.4],
        nextArea: [40],
        previousModule: [89.9, 70],
        nextModule: [91.2, 70],
      }),
      [
        { kind: "area", index: 0, value: 40, threshold: 40 },
        { kind: "module", index: 0, value: 91.2, threshold: 90 },
      ],
    );
  });

  it("does not repeat while the reading stays over the limit", () => {
    assert.deepEqual(
      detectTemperatureAlerts({
        previousArea: [41],
        nextArea: [44.2],
        previousModule: [95],
        nextModule: [96],
      }),
      [],
    );
  });

  it("mails again after the reading falls back under the limit", () => {
    assert.deepEqual(
      detectTemperatureAlerts({
        previousArea: [38],
        nextArea: [40.5],
        previousModule: [80],
        nextModule: [90],
      }).map(temperatureAlertLine),
      [
        {
          summary: "주위 온도 1 초과",
          headline: "주위 온도 1 초과",
          change: "40.5°C (기준 40°C)",
        },
        {
          summary: "모듈 온도 1 초과",
          headline: "모듈 온도 1 초과",
          change: "90°C (기준 90°C)",
        },
      ],
    );
  });

  it("ignores sensor error values", () => {
    assert.deepEqual(
      detectTemperatureAlerts({
        previousArea: [-40],
        nextArea: [-40],
        previousModule: [-1],
        nextModule: [20],
      }),
      [],
    );
    assert.deepEqual(
      detectTemperatureAlerts({
        previousArea: [-40],
        nextArea: [41],
      }),
      [{ kind: "area", index: 0, value: 41, threshold: 40 }],
    );
  });

  it("skips a metric the payload did not include", () => {
    assert.deepEqual(
      detectTemperatureAlerts({
        previousArea: [30],
        previousModule: [20],
      }),
      [],
    );
  });
});

describe("buildAdminAlertMail", () => {
  it("names a single transition in the subject", () => {
    const mail = buildAdminAlertMail({
      siteName: "대구 L사",
      installationLabel: "전기실",
      installationId: "PSVG-1",
      at: new Date("2026-10-17T00:00:00Z"),
      lines: [statusAlertLine({ moduleIndex: 2, from: 2, to: 4 })],
    });
    assert.equal(mail.subject, "[PQMS] 대구 L사 전기실 — 모듈 3 오프라인");
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
        statusAlertLine({ moduleIndex: 0, from: 2, to: 0 }),
        faultAlertLine(4, "Over Temperature"),
      ],
    });
    assert.equal(mail.subject, "[PQMS] 대구 L사 전기실 — 상태 변경 2건");
    assert.match(mail.text, /1\. 모듈 1 대기/);
    assert.match(mail.text, /상태: 가동 → 대기/);
    assert.match(mail.text, /2\. 모듈 5 이상/);
    assert.match(mail.text, /내용: Over Temperature/);
  });
});
