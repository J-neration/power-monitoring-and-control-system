import test from "node:test";
import assert from "node:assert/strict";
import { kindOf, missingTelemetryFields, statusInfo, summarize, type ReceiverLogRow } from "./commLog.js";

const row = (over: Partial<ReceiverLogRow>): ReceiverLogRow => ({
  id: 1,
  createdAt: "2026-11-27T00:00:00Z",
  method: "POST",
  path: "/receiver",
  statusCode: 200,
  durationMs: 5,
  iccid: null,
  ip: null,
  requestBody: null,
  responseBody: null,
  installationId: null,
  installationLabel: null,
  siteName: null,
  ...over,
});

test("kindOf: query string is ignored", () => {
  assert.equal(kindOf("/receiver/commands?iccid=123").label, "명령 확인");
  assert.equal(kindOf("/receiver").label, "측정값 보고");
  assert.equal(kindOf("/receiver/unknown").label, "/receiver/unknown");
});

test("statusInfo: explains the common failures in plain words", () => {
  assert.equal(statusInfo(200, null).label, "정상");
  assert.equal(statusInfo(400, '{"message":"Unexpected end of JSON input"}').label, "JSON 깨짐");
  assert.equal(statusInfo(400, '{"message":"Invalid harmonics body"}').label, "형식 오류");
  assert.equal(statusInfo(401, null).label, "인증 실패");
  assert.equal(statusInfo(422, null).label, "미등록 장비");
  assert.equal(statusInfo(500, null).tone, "error");
});

test("missingTelemetryFields: flags absent and empty values only for telemetry", () => {
  const body = { iccid: "1", moduleStatus: [1], numOfMods: 3, vL1: 220, vL2: "", vL3: null, gridCurrentL1: 1, gridCurrentL2: 1, gridCurrentL3: 1, loadCurrentL1: 1, loadCurrentL2: 1, loadCurrentL3: 1, tpf1: 0.9 };
  assert.deepEqual(missingTelemetryFields(row({ requestBody: JSON.stringify(body) })), ["vL2", "vL3", "tpf2"]);
  assert.deepEqual(missingTelemetryFields(row({ path: "/receiver/faults", requestBody: "{}" })), []);
  assert.deepEqual(missingTelemetryFields(row({ requestBody: "{broken" })), []);
});

test("summarize: one readable line", () => {
  const s = summarize(row({ requestBody: JSON.stringify({ vL1: 220, vL2: 221.46, vL3: "219", numOfMods: 3, rsrp: -84 }) }));
  assert.equal(s, "전압 220 / 221.5 / 219V · 모듈 3대 · 신호 -84dBm");
  assert.equal(summarize(row({ requestBody: '{"iccid":"1",' })), "읽을 수 없는 데이터 13자");
  assert.equal(summarize(row({ method: "GET", path: "/receiver/commands?iccid=1", responseBody: "{}" })), "대기 중인 명령 없음");
});

test("summarize: an empty string is shown as missing, not 0", () => {
  const s = summarize(row({ requestBody: JSON.stringify({ vL1: 219.9, vL2: "", vL3: null }) }));
  assert.equal(s, "전압 219.9 / – / –V");
});
