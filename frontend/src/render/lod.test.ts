import { describe, it, expect } from "vitest";
import {
  tierForDistance,
  amasOpacity,
  TIER_THRESHOLDS,
} from "./lod";

const { cluster, container } = TIER_THRESHOLDS;

describe("tierForDistance", () => {
  it("picks the cluster tier when zoomed out (namespace nebulae)", () => {
    expect(tierForDistance(cluster + 100)).toBe("cluster");
    expect(tierForDistance(cluster)).toBe("cluster");
  });

  it("picks the container tier when zoomed in close", () => {
    expect(tierForDistance(container - 50)).toBe("container");
    expect(tierForDistance(container)).toBe("container");
  });

  it("picks the detail tier in between", () => {
    expect(tierForDistance((container + cluster) / 2)).toBe("detail");
  });
});

describe("amasOpacity", () => {
  it("strong when far, zero once entered", () => {
    expect(amasOpacity(cluster + 100)).toBeGreaterThan(0.4);
    expect(amasOpacity(container - 50)).toBeLessThan(0.02);
  });
});
