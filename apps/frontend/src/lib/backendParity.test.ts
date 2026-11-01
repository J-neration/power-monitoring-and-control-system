/**
 * 프론트와 백엔드가 같은 규칙을 각자 들고 있는 곳. 한쪽만 고치면 화면과 서버의 판단이 어긋난다
 * (예: 화면은 통과시킨 비밀번호를 서버가 거절, 화면은 "정상"인데 서버 알림은 "통신 끊김").
 * 어긋나면 여기서 실패한다 — 양쪽을 같이 고친다.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import * as feComm from "./commStatus";
import * as fePassword from "./passwordPolicy";
import * as feSettings from "./deviceSettingsFields";
import { WATCH_THRESHOLDS as FE_WATCH_THRESHOLDS } from "./watchThresholds";

import * as beComm from "../../../backend/src/lib/commStatus.js";
import * as bePassword from "../../../backend/src/modules/auth/passwordPolicy.js";
import * as beSettings from "../../../backend/src/lib/deviceSettingsKeys.js";
import { WATCH_THRESHOLDS as BE_WATCH_THRESHOLDS } from "../../../backend/src/lib/watchThresholds.js";

describe("password policy", () => {
  const cases: Array<[password: string, username?: string]> = [
    [""],
    ["short1!"],
    ["exactly8"],
    ["a".repeat(128)],
    ["a".repeat(129)],
    ["has space1"],
    ["tab\tinside1"],
    ["password123"],
    ["PASSWORD123"],
    ["pmcs1234"],
    ["operator01", "operator01"],
    ["Operator01", "operator01"],
    ["Regression#2026", "someone"],
    ["현장관리자비밀번호"],
  ];

  it("has the same limits", () => {
    assert.equal(fePassword.PASSWORD_MIN_LENGTH, bePassword.PASSWORD_MIN_LENGTH);
    assert.equal(fePassword.PASSWORD_MAX_LENGTH, bePassword.PASSWORD_MAX_LENGTH);
  });

  for (const [password, username] of cases) {
    it(`agrees on ${JSON.stringify(password.length > 20 ? `${password.slice(0, 8)}…(${password.length})` : password)}`, () => {
      assert.deepEqual(
        fePassword.validatePassword(password, { username }),
        bePassword.validatePassword(password, { username }),
      );
    });
  }
});

describe("communication-lost rule", () => {
  it("uses the same interval", () => {
    assert.equal(feComm.TELEMETRY_INTERVAL_MS, beComm.TELEMETRY_INTERVAL_MS);
    assert.equal(feComm.COMM_LOST_AFTER_MS, beComm.COMM_LOST_AFTER_MS);
  });

  it("gives the same answer around the threshold", () => {
    const now = Date.parse("2026-10-20T00:00:00Z");
    const minute = 60_000;
    for (const ageMin of [-5, 0, 1, 29, 30, 31, 600]) {
      const lastSeen = new Date(now - ageMin * minute);
      for (const input of [lastSeen, lastSeen.toISOString()]) {
        assert.equal(feComm.isCommLost(input, now), beComm.isCommLost(input, now), `age ${ageMin}m`);
      }
    }
    for (const empty of [null, undefined, "", "not-a-date"]) {
      assert.equal(feComm.isCommLost(empty, now), beComm.isCommLost(empty, now));
    }
  });
});

describe("watch thresholds", () => {
  it("are identical", () => {
    assert.deepEqual(FE_WATCH_THRESHOLDS, BE_WATCH_THRESHOLDS);
  });
});

describe("device settings keys (form ↔ setBasic filter)", () => {
  // 화면에 입력칸이 있는데 서버가 그 키를 버리면, 사용자가 바꾼 값이 조용히 무시된다.
  for (const moduleType of ["v1v2", "v3v4", "v5"] as const) {
    it(`match for ${moduleType}`, () => {
      const fe = [...feSettings.allowedKeysForModuleType(moduleType)].sort();
      const be = [...beSettings.allowedKeysForModuleType(moduleType)].sort();
      assert.deepEqual(fe, be);
    });
  }
});

describe("mirrored source files", () => {
  // 통째로 복사해 둔 큰 파일 — 입력 조합이 많아 동작 비교 대신 소스를 비교한다.
  // import 확장자(.js) 와 주석만 다를 수 있다.
  const normalize = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/from "(\.[^"]+)\.js"/g, 'from "$1"')
      .replace(/\s+/g, " ")
      .trim();

  const frontendLib = path.resolve(__dirname);
  const backendLib = path.resolve(__dirname, "../../../backend/src/lib");

  for (const file of ["watchAnomalies.ts", "watchFacts.ts"]) {
    it(`${file} is the same on both sides`, () => {
      const fe = normalize(readFileSync(path.join(frontendLib, file), "utf8"));
      const be = normalize(readFileSync(path.join(backendLib, file), "utf8"));
      assert.ok(fe === be, `${file} differs between apps/frontend/src/lib and apps/backend/src/lib`);
    });
  }
});
