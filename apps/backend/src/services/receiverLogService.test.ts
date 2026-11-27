import test from "node:test";
import assert from "node:assert/strict";
import { bodyToText, clip, pickIccid, RECEIVER_LOG_BODY_MAX } from "./receiverLogService.js";

test("pickIccid: reads the HMI JSON text, even when it is broken", () => {
  assert.equal(pickIccid('{"iccid":"8982 0123-456789012345","vL1":220}', null), "89820123456789012345");
  // missing closing brace — still found
  assert.equal(pickIccid('{"iccid":"8982012345678901234F","vL1":', null), "8982012345678901234F");
  assert.equal(pickIccid('{"vL1":220}', null), null);
});

test("pickIccid: query wins over body, objects work too", () => {
  assert.equal(pickIccid('{"iccid":"111"}', { iccid: "222" }), "222");
  assert.equal(pickIccid({ iccid: " 333 " }, {}), "333");
  assert.equal(pickIccid(undefined, undefined), null);
});

test("bodyToText: keeps text as is and clips huge bodies", () => {
  assert.equal(bodyToText('{"a":1}'), '{"a":1}');
  assert.equal(bodyToText({ a: 1 }), '{"a":1}');
  assert.equal(bodyToText(Buffer.from("x")), "x");
  assert.equal(bodyToText(""), null);
  assert.equal(bodyToText(undefined), null);
  const big = "y".repeat(RECEIVER_LOG_BODY_MAX + 10);
  const out = bodyToText(big)!;
  assert.ok(out.startsWith("y".repeat(100)));
  assert.ok(out.includes(`전체 ${big.length}자`));
  assert.equal(clip("abc", 5), "abc");
});
