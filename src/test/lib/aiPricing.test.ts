import { describe, it, expect } from "vitest";
import {
  normalizeModelId,
  getModelRate,
  estimateCostUsd,
  formatUsd,
  MODEL_RATES,
} from "@/lib/aiPricing";

describe("normalizeModelId", () => {
  it("strips a trailing 8-digit date snapshot", () => {
    expect(normalizeModelId("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
  });

  it("leaves undated ids untouched", () => {
    expect(normalizeModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(normalizeModelId("claude-sonnet-5")).toBe("claude-sonnet-5");
  });

  it("does not strip version segments that are not dates", () => {
    // -4-5 is a version, not an 8-digit date
    expect(normalizeModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });
});

describe("getModelRate", () => {
  it("resolves dated snapshots to the base model rate", () => {
    expect(getModelRate("claude-haiku-4-5-20251001")).toEqual(MODEL_RATES["claude-haiku-4-5"]);
  });

  it("falls back to a non-zero rate for unknown models", () => {
    const rate = getModelRate("claude-future-9");
    expect(rate.input).toBeGreaterThan(0);
    expect(rate.output).toBeGreaterThan(0);
  });
});

describe("estimateCostUsd", () => {
  it("computes input + output cost at per-MTok rates", () => {
    // Haiku 4.5: $1 in / $5 out per MTok
    const cost = estimateCostUsd("claude-haiku-4-5", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6, 10);
  });

  it("bills cache reads at 10% and cache writes at 125% of input rate", () => {
    // Sonnet 4.6: $3 in per MTok → reads $0.30, writes $3.75
    const cost = estimateCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.3 + 3.75, 10);
  });

  it("treats missing cache fields as zero", () => {
    const cost = estimateCostUsd("claude-sonnet-5", {
      input_tokens: 500_000,
      output_tokens: 100_000,
    });
    // $2/MTok * 0.5 + $10/MTok * 0.1
    expect(cost).toBeCloseTo(1 + 1, 10);
  });
});

describe("formatUsd", () => {
  it("scales precision with magnitude", () => {
    expect(formatUsd(123.456)).toBe("$123");
    expect(formatUsd(12.345)).toBe("$12.35");
    expect(formatUsd(0.1234)).toBe("$0.123");
  });
});
