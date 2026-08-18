import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePassword } from "./passwordPolicy.js";

describe("validatePassword", () => {
  it("accepts an 8+ character password that is not on the deny list", () => {
    assert.equal(validatePassword("lotte2026").ok, true);
    assert.equal(validatePassword("현장담당-2026a").ok, true);
  });

  it("rejects short passwords", () => {
    const result = validatePassword("abc123");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /8자/);
    }
  });

  it("rejects common passwords even when they meet the length", () => {
    const result = validatePassword("test1234");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /흔한/);
    }
  });

  it("rejects password equal to username", () => {
    const result = validatePassword("Manager1", { username: "manager1" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /아이디/);
    }
  });

  it("rejects whitespace", () => {
    const result = validatePassword("pass word");
    assert.equal(result.ok, false);
  });
});
