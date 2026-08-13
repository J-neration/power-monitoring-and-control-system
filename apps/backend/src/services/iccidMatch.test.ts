import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  iccidLookupCandidates,
  normalizeIccid,
  pickPreferredIccidMatch,
} from "../lib/iccid.js";

describe("normalizeIccid / iccidLookupCandidates", () => {
  it("strips spaces and hyphens", () => {
    assert.equal(normalizeIccid(" 8934-0412 3456 "), "893404123456");
  });

  it("20-digit HMI value also matches 19-digit card print", () => {
    const twenty = "89823001234567890123";
    const nineteen = twenty.slice(0, 19);
    const cands = iccidLookupCandidates(twenty);
    assert.ok(cands.includes(twenty));
    assert.ok(cands.includes(nineteen));
  });

  it("trailing F padding also maps to 19 digits", () => {
    const padded = "8982300123456789012F";
    const cands = iccidLookupCandidates(padded);
    assert.ok(cands.includes("8982300123456789012"));
  });

  it("19-digit registration still returns itself as candidate", () => {
    const nineteen = "8982300123456789012";
    assert.deepEqual(iccidLookupCandidates(nineteen), [nineteen]);
  });

  it("prefers real site over unknown/lte auto row", () => {
    const pick = pickPreferredIccidMatch([
      {
        id: "lte-89823001234567890123",
        iccid: "89823001234567890123",
        siteId: "unknown",
      },
      {
        id: "factory-test-1",
        iccid: "8982300123456789012",
        siteId: "factory-outgoing",
      },
    ]);
    assert.equal(pick?.id, "factory-test-1");
  });
});
