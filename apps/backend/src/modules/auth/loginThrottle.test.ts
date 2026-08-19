import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  LoginLockedError,
  assertNotLocked,
  clearLoginFailures,
  recordLoginFailure,
  _resetLoginThrottleForTests,
  _setNowForTests,
} from "./loginThrottle.js";

describe("loginThrottle", () => {
  beforeEach(() => {
    _resetLoginThrottleForTests();
  });

  it("locks after max failures and unlocks after the window", () => {
    let now = 1_000_000;
    _setNowForTests(() => now);

    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i += 1) {
      const result = recordLoginFailure("Admin");
      assert.equal(result.locked, false);
    }

    const fifth = recordLoginFailure("admin");
    assert.equal(fifth.locked, true);
    assert.ok(fifth.retryAfterSec > 0);

    assert.throws(() => assertNotLocked("ADMIN"), LoginLockedError);

    now += LOGIN_WINDOW_MS;
    assert.doesNotThrow(() => assertNotLocked("admin"));
  });

  it("clears failures after a successful login", () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      recordLoginFailure("lotte");
    }
    assert.throws(() => assertNotLocked("lotte"), LoginLockedError);

    clearLoginFailures("lotte");
    assert.doesNotThrow(() => assertNotLocked("lotte"));
  });
});
