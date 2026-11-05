import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRange } from "./otaRange.js";

const SIZE = 1000003; // tools/ota_make_test_file.py 기본 크기

describe("parseRange", () => {
  it("returns full when there is no Range header", () => {
    assert.deepEqual(parseRange(undefined, SIZE), { kind: "full" });
    assert.deepEqual(parseRange("", SIZE), { kind: "full" });
  });

  it("parses a 64 KB chunk the way the HMI asks for it", () => {
    assert.deepEqual(parseRange("bytes=65536-131071", SIZE), {
      kind: "partial",
      start: 65536,
      end: 131071,
    });
  });

  it("clamps the end of the last chunk to the file size", () => {
    assert.deepEqual(parseRange("bytes=983040-1048575", SIZE), {
      kind: "partial",
      start: 983040,
      end: SIZE - 1,
    });
  });

  it("supports an open end and a suffix range", () => {
    assert.deepEqual(parseRange("bytes=1000000-", SIZE), { kind: "partial", start: 1000000, end: SIZE - 1 });
    assert.deepEqual(parseRange("bytes=-3", SIZE), { kind: "partial", start: SIZE - 3, end: SIZE - 1 });
    assert.deepEqual(parseRange("bytes=-5000000", SIZE), { kind: "partial", start: 0, end: SIZE - 1 });
  });

  it("is unsatisfiable when the start is past the end of the file", () => {
    assert.deepEqual(parseRange(`bytes=${SIZE}-`, SIZE), { kind: "unsatisfiable" });
    assert.deepEqual(parseRange("bytes=-0", SIZE), { kind: "unsatisfiable" });
  });

  it("ignores multi-range, reversed and malformed headers", () => {
    assert.deepEqual(parseRange("bytes=0-1,5-9", SIZE), { kind: "full" });
    assert.deepEqual(parseRange("bytes=10-5", SIZE), { kind: "full" });
    assert.deepEqual(parseRange("items=0-10", SIZE), { kind: "full" });
    assert.deepEqual(parseRange("bytes=-", SIZE), { kind: "full" });
  });
});
