import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchReceiverApiKey } from "./receiverApiKey.js";

describe("matchReceiverApiKey", () => {
  it("accepts the current key", () => {
    assert.equal(
      matchReceiverApiKey("new-key-123", "new-key-123", "old-key-123"),
      "current",
    );
  });

  it("accepts the previous key while it is set", () => {
    assert.equal(
      matchReceiverApiKey("old-key-123", "new-key-123", "old-key-123"),
      "previous",
    );
  });

  it("rejects the previous key once it is removed", () => {
    assert.equal(matchReceiverApiKey("old-key-123", "new-key-123"), null);
    assert.equal(matchReceiverApiKey("old-key-123", "new-key-123", ""), null);
  });

  it("rejects a missing, empty or wrong key", () => {
    assert.equal(
      matchReceiverApiKey(undefined, "new-key-123", "old-key-123"),
      null,
    );
    assert.equal(matchReceiverApiKey("", "new-key-123", "old-key-123"), null);
    assert.equal(
      matchReceiverApiKey("new-key-12", "new-key-123", "old-key-123"),
      null,
    );
    assert.equal(matchReceiverApiKey(["new-key-123"], "new-key-123"), null);
  });
});
