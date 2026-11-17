import { describe, it, expect } from 'vitest';
import {
  INTERACTIVE_PIXEL_BUDGET,
  SETTLED_PIXEL_BUDGET,
  MAX_INTERACTIVE_DPR,
  MAX_SETTLED_DPR,
  LARGE_VIEWPORT_PIXEL_THRESHOLD,
  MIN_LARGE_VIEWPORT_INTERACTIVE_DPR,
  getDprBounds,
  calculateTargetDpr,
} from './dpr';

describe('dpr helpers', () => {
  it('exposes calibrated pixel-budget and DPR constants', () => {
    expect(INTERACTIVE_PIXEL_BUDGET).toBe(1_100_000);
    expect(SETTLED_PIXEL_BUDGET).toBe(2_200_000);
    expect(MAX_INTERACTIVE_DPR).toBe(1.5);
    expect(MAX_SETTLED_DPR).toBe(2.25);
    expect(LARGE_VIEWPORT_PIXEL_THRESHOLD).toBe(750_000);
    expect(MIN_LARGE_VIEWPORT_INTERACTIVE_DPR).toBe(0.75);
  });

  describe('getDprBounds', () => {
    it('computes mobile, tablet, desktop, and 1x DPR bounds across interactive and settled regimes', () => {
      // Samsung S24 Ultra (412x915 CSS px @ 3.5x native DPR -> < 750k threshold)
      expect(getDprBounds(412, 915, 3.5, false)).toEqual({ minDpr: 1, maxDpr: 1.5 });
      expect(getDprBounds(412, 915, 3.5, true)).toEqual({ minDpr: 1, maxDpr: 2.25 });

      // Tablet portrait (820x1180 CSS px @ 2.0x -> >= 750k threshold gets 0.75x interactive DRS floor)
      expect(getDprBounds(820, 1180, 2.0, false)).toEqual({ minDpr: 0.75, maxDpr: 1 });
      expect(getDprBounds(820, 1180, 2.0, true)).toEqual({ minDpr: 1, maxDpr: 1.5 });

      // Large Retina laptop (1728x1117 @ 2.0x) and 1080p standard monitor (1920x1080 @ 1.0x)
      expect(getDprBounds(1728, 1117, 2.0, false)).toEqual({ minDpr: 0.75, maxDpr: 1 });
      expect(getDprBounds(1728, 1117, 2.0, true)).toEqual({ minDpr: 1, maxDpr: 1 });
      expect(getDprBounds(1920, 1080, 1.0, false)).toEqual({ minDpr: 0.75, maxDpr: 1 });
      expect(getDprBounds(1920, 1080, 1.0, true)).toEqual({ minDpr: 1, maxDpr: 1 });
    });

    it('guards non-finite, zero, and negative viewport dimensions and DPR values', () => {
      expect(getDprBounds(Number.NaN, 915, 3.5, false)).toEqual({ minDpr: 1, maxDpr: 1.5 });
      expect(getDprBounds(412, Number.POSITIVE_INFINITY, 3.5, true)).toEqual({ minDpr: 1, maxDpr: 2.25 });
      expect(getDprBounds(0, 0, 2.0, false)).toEqual({ minDpr: 1, maxDpr: 1.5 });
      expect(getDprBounds(412, 915, 0, true)).toEqual({ minDpr: 1, maxDpr: 1 });
      expect(getDprBounds(412, 915, -2, false)).toEqual({ minDpr: 1, maxDpr: 1 });
      expect(getDprBounds(412, 915, Number.NaN, true)).toEqual({ minDpr: 1, maxDpr: 1 });
    });
  });

  describe('calculateTargetDpr', () => {
    it('quantizes resolutionScale in 0.25x steps and enforces interactive and settled floors', () => {
      // High-DPI phone (412x915 @ 3.5x): steps 1.5 -> 1.25 -> 1.0 interactively
      expect(calculateTargetDpr(412, 915, 3.5, false, 1)).toBe(1.5);
      expect(calculateTargetDpr(412, 915, 3.5, false, 0.85)).toBe(1.25);
      expect(calculateTargetDpr(412, 915, 3.5, false, 0.67)).toBe(1);
      expect(calculateTargetDpr(412, 915, 3.5, false, 0.2)).toBe(1);

      // Settled phone supports 2.25 -> 1.0 floor
      expect(calculateTargetDpr(412, 915, 3.5, true, 1)).toBe(2.25);
      expect(calculateTargetDpr(412, 915, 3.5, true, 0.5)).toBe(1);

      // Large Retina desktop (1728x1117 @ 2.0x): drops to 0.75x interactively, stays >= 1.0x when settled
      expect(calculateTargetDpr(1728, 1117, 2.0, false, 1)).toBe(1);
      expect(calculateTargetDpr(1728, 1117, 2.0, false, 0.9)).toBe(0.75);
      expect(calculateTargetDpr(1728, 1117, 2.0, false, 0.1)).toBe(0.75);
      expect(calculateTargetDpr(1728, 1117, 2.0, true, 0.5)).toBe(1);
    });

    it('handles non-finite and out-of-range resolutionScale safely', () => {
      expect(calculateTargetDpr(412, 915, 3.5, false, Number.NaN)).toBe(1.5);
      expect(calculateTargetDpr(412, 915, 3.5, false, -0.5)).toBe(1);
      expect(calculateTargetDpr(412, 915, 3.5, false, 2.5)).toBe(1.5);
      expect(calculateTargetDpr(1728, 1117, 2.0, false, -1)).toBe(0.75);
    });
  });
});
