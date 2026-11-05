import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHART_COLORS,
  THD_LOW_LOAD_COLOR,
  thdBarColor,
  thdDangerLineMuted,
} from "./chartTheme";

describe("thdBarColor", () => {
  it("keeps danger red when the phase is carrying load", () => {
    assert.equal(thdBarColor(20), CHART_COLORS.danger);
    assert.equal(thdBarColor(19.9), CHART_COLORS.accent);
    assert.equal(thdBarColor(null), CHART_COLORS.gridMuted);
  });

  it("paints a high THDi slate when that phase is lightly loaded", () => {
    assert.equal(thdBarColor(32, true), THD_LOW_LOAD_COLOR);
    assert.equal(thdBarColor(8, true), CHART_COLORS.accent);
    assert.notEqual(THD_LOW_LOAD_COLOR, CHART_COLORS.gridMuted);
    assert.notEqual(THD_LOW_LOAD_COLOR, CHART_COLORS.danger);
  });
});

describe("thdDangerLineMuted", () => {
  it("mutes the danger line only when every valued phase is low load", () => {
    assert.equal(
      thdDangerLineMuted([
        { before: 40, after: 10, lowLoad: true },
        { before: null, after: null, lowLoad: false },
      ]),
      true,
    );
    assert.equal(
      thdDangerLineMuted([
        { before: 40, after: 10, lowLoad: true },
        { before: 25, after: 8, lowLoad: false },
      ]),
      false,
    );
    assert.equal(
      thdDangerLineMuted([{ before: null, after: null, lowLoad: true }]),
      false,
    );
  });
});
