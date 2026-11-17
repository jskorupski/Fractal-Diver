/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const INTERACTIVE_PIXEL_BUDGET = 1_100_000;
export const SETTLED_PIXEL_BUDGET = 2_200_000;
export const MAX_INTERACTIVE_DPR = 1.5;
export const MAX_SETTLED_DPR = 2.25;
export const LARGE_VIEWPORT_PIXEL_THRESHOLD = 750_000;
export const MIN_LARGE_VIEWPORT_INTERACTIVE_DPR = 0.75;

/**
 * Computes minimum and maximum allowable DPR bounds for a given CSS viewport, native DPR,
 * and interaction regime. Large viewports (>= 750k CSS pixels) may step down to 0.75x DPR
 * during interactive dynamic resolution scaling while keeping settled DPR >= 1.0x.
 */
export function getDprBounds(
  width: number,
  height: number,
  devicePixelRatio: number = 1,
  isSettled: boolean = true
): { minDpr: number; maxDpr: number } {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const rawArea = Number.isFinite(width) && Number.isFinite(height) ? width * height : 1;
  const cssPixels = Math.max(1, rawArea);

  let maxDpr: number;
  if (safeDpr <= 1) {
    maxDpr = 1;
  } else {
    const pixelBudget = isSettled ? SETTLED_PIXEL_BUDGET : INTERACTIVE_PIXEL_BUDGET;
    const cap = isSettled ? MAX_SETTLED_DPR : MAX_INTERACTIVE_DPR;
    const budgetDpr = Math.sqrt(pixelBudget / cssPixels);
    maxDpr = Math.max(1, Math.floor(Math.min(safeDpr, cap, budgetDpr) * 4) / 4);
  }

  const minDpr = !isSettled && cssPixels >= LARGE_VIEWPORT_PIXEL_THRESHOLD
    ? Math.min(maxDpr, MIN_LARGE_VIEWPORT_INTERACTIVE_DPR)
    : 1;

  return { minDpr, maxDpr };
}

/**
 * Computes an adaptive device pixel ratio bounded by a total physical-pixel budget and
 * scaled by the controller's continuous `resolutionScale` (`[0, 1]`), quantized to `0.25` increments.
 */
export function calculateTargetDpr(
  width: number,
  height: number,
  devicePixelRatio: number = 1,
  isSettled: boolean = true,
  resolutionScale: number = 1
): number {
  const { minDpr, maxDpr } = getDprBounds(width, height, devicePixelRatio, isSettled);
  const safeScale = Number.isFinite(resolutionScale) ? Math.max(0, Math.min(1, resolutionScale)) : 1;
  const rawDpr = maxDpr * safeScale;
  const quantized = Math.floor(rawDpr * 4 + 1e-6) / 4;

  return Math.max(minDpr, Math.min(maxDpr, quantized));
}
