/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePerformanceAdaptation } from './usePerformanceAdaptation';
import { FRACTAL_CONFIGS } from '../constants/fractals';

describe('usePerformanceAdaptation Hook', () => {
  const fractalType = 0; // Mandelbulb

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('initializes all 8 adaptation parameters with default values from config', () => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    const { result } = renderHook(() => usePerformanceAdaptation(fractalType, false));

    expect(result.current.interactiveResolutionScale).toBe(1.0);
    expect(result.current.settledResolutionScale).toBe(1.0);
    expect(result.current.interactiveSteps).toBe(config.interactiveSteps);
    expect(result.current.settledSteps).toBe(config.settledSteps);
    expect(result.current.interactiveIterations).toBe(config.defaultInteractiveIterations);
    expect(result.current.settledIterations).toBe(config.defaultSettledIterations);
    expect(result.current.interactiveEpsilon).toBe(config.defaultInteractiveEpsilon);
    expect(result.current.settledEpsilon).toBe(config.defaultSettledEpsilon);
  });

  it('adjusts quality down when frame time is high (lagging)', () => {
    const { result } = renderHook(() => usePerformanceAdaptation(fractalType, true));
    const initialEpsilon = result.current.interactiveEpsilon;
    const initialIterations = result.current.interactiveIterations;

    // Simulate multiple slow frames to overcome smoothing and deadband
    // Target is 30fps (~33ms). 100ms is well above.
    act(() => {
      const now = performance.now();
      for (let i = 0; i < 10; i++) {
        result.current.onFrameTime(0.1, now + i * 100);
      }
    });

    expect(result.current.interactiveResolutionScale).toBeLessThan(1.0);
    expect(result.current.interactiveSteps).toBeLessThan(120);
    expect(result.current.interactiveEpsilon).toBeGreaterThan(initialEpsilon);
    expect(result.current.interactiveIterations).toBeLessThanOrEqual(initialIterations);
  });

  it('degrades across all 4 interactive tiers in strict priority order', () => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    const minInteractiveScale = 1.0 / 1.5;
    const { result } = renderHook(() =>
      usePerformanceAdaptation(fractalType, true, {
        minInteractiveScale,
        minSettledScale: 1.0 / 2.25,
      })
    );

    let sawTier1Only = false;
    let sawTier2 = false;
    let sawTier3 = false;
    let sawTier4 = false;

    const frameDeltas = [
      ...Array(10).fill(0.055),
      ...Array(12).fill(0.085),
      ...Array(12).fill(0.14),
      ...Array(16).fill(0.28),
    ];

    let now = performance.now();
    for (const delta of frameDeltas) {
      now += 100;
      act(() => {
        result.current.onFrameTime(delta, now);
      });

      const s = result.current;
      if (s.interactiveResolutionScale < 1.0 && s.interactiveResolutionScale > minInteractiveScale + 1e-6) {
        sawTier1Only = true;
        expect(s.interactiveSteps).toBe(config.interactiveSteps);
        expect(s.interactiveEpsilon).toBe(config.defaultInteractiveEpsilon);
        expect(s.interactiveIterations).toBe(config.defaultInteractiveIterations);
      }
      if (s.interactiveSteps < config.interactiveSteps) {
        sawTier2 = true;
        expect(s.interactiveResolutionScale).toBeCloseTo(minInteractiveScale, 6);
        if (s.interactiveSteps > config.minInteractiveSteps) {
          expect(s.interactiveEpsilon).toBe(config.defaultInteractiveEpsilon);
          expect(s.interactiveIterations).toBe(config.defaultInteractiveIterations);
        }
      }
      if (s.interactiveEpsilon > config.defaultInteractiveEpsilon) {
        sawTier3 = true;
        expect(s.interactiveResolutionScale).toBeCloseTo(minInteractiveScale, 6);
        expect(s.interactiveSteps).toBe(config.minInteractiveSteps);
        if (s.interactiveEpsilon < config.maxInteractiveEpsilon - 1e-9) {
          expect(s.interactiveIterations).toBe(config.defaultInteractiveIterations);
        }
      }
      if (s.interactiveIterations < config.defaultInteractiveIterations) {
        sawTier4 = true;
        expect(s.interactiveResolutionScale).toBeCloseTo(minInteractiveScale, 6);
        expect(s.interactiveSteps).toBe(config.minInteractiveSteps);
        expect(s.interactiveEpsilon).toBeCloseTo(config.maxInteractiveEpsilon, 9);
      }
    }

    expect(sawTier1Only).toBe(true);
    expect(sawTier2).toBe(true);
    expect(sawTier3).toBe(true);
    expect(sawTier4).toBe(true);
    expect(result.current.interactiveIterations).toBe(config.minInteractiveIterations);
  });

  it('recovers in strict reverse order and never pushes interactiveIterations above default', () => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    const minInteractiveScale = 1.0 / 1.5;
    const { result } = renderHook(() =>
      usePerformanceAdaptation(fractalType, true, {
        minInteractiveScale,
        minSettledScale: 1.0 / 2.25,
      })
    );

    act(() => {
      result.current.overrideKnobs({
        interactiveResolutionScale: minInteractiveScale,
        interactiveSteps: config.minInteractiveSteps,
        interactiveEpsilon: config.maxInteractiveEpsilon,
        interactiveIterations: config.minInteractiveIterations,
      });
    });

    let sawIterRecovery = false;
    let sawStepsRecovery = false;
    let sawScaleRecovery = false;

    let now = performance.now();
    for (let i = 0; i < 50; i++) {
      now += 100;
      act(() => {
        result.current.onFrameTime(0.005, now);
      });

      const s = result.current;
      // Iterations must never automatically exceed defaultInteractiveIterations
      expect(s.interactiveIterations).toBeLessThanOrEqual(config.defaultInteractiveIterations);

      if (s.interactiveIterations < config.defaultInteractiveIterations) {
        sawIterRecovery = true;
        expect(s.interactiveSteps).toBe(config.minInteractiveSteps);
        expect(s.interactiveResolutionScale).toBeCloseTo(minInteractiveScale, 6);
      }
      if (s.interactiveEpsilon > config.defaultInteractiveEpsilon + 1e-9) {
        expect(s.interactiveSteps).toBe(config.minInteractiveSteps);
        expect(s.interactiveResolutionScale).toBeCloseTo(minInteractiveScale, 6);
      }
      if (s.interactiveSteps > config.minInteractiveSteps && s.interactiveSteps < config.interactiveSteps) {
        sawStepsRecovery = true;
        expect(s.interactiveIterations).toBe(config.defaultInteractiveIterations);
        expect(s.interactiveEpsilon).toBeCloseTo(config.defaultInteractiveEpsilon, 9);
        expect(s.interactiveResolutionScale).toBeCloseTo(minInteractiveScale, 6);
      }
      if (s.interactiveResolutionScale > minInteractiveScale + 1e-6 && s.interactiveResolutionScale < 1.0 - 1e-6) {
        sawScaleRecovery = true;
        expect(s.interactiveIterations).toBe(config.defaultInteractiveIterations);
        expect(s.interactiveSteps).toBe(config.interactiveSteps);
        expect(s.interactiveEpsilon).toBeGreaterThanOrEqual(config.defaultInteractiveEpsilon - 1e-9);
      }
    }

    expect(sawIterRecovery).toBe(true);
    expect(sawStepsRecovery).toBe(true);
    expect(sawScaleRecovery).toBe(true);

    // Final recovered state: resolution & steps at 100%, iterations capped at default (not max),
    // and sub-pixel bonus polish active down to minInteractiveEpsilon.
    expect(result.current.interactiveIterations).toBe(config.defaultInteractiveIterations);
    expect(result.current.interactiveSteps).toBe(config.interactiveSteps);
    expect(result.current.interactiveResolutionScale).toBe(1.0);
    expect(result.current.interactiveEpsilon).toBe(config.minInteractiveEpsilon);
  });

  it('adjusts quality up when frame time is low (fast)', () => {
    const { result } = renderHook(() => usePerformanceAdaptation(fractalType, true));

    // First, make it laggy to move away from min limits
    act(() => {
      const now = performance.now();
      for (let i = 0; i < 20; i++) {
        result.current.onFrameTime(0.1, now + i * 100);
      }
    });

    const laggyEpsilon = result.current.interactiveEpsilon;
    expect(laggyEpsilon).toBeGreaterThan(0.0005);

    // Now simulate fast frames (5ms < 33ms target) so EMA recovers through Tier 4 -> Tier 3
    act(() => {
      const now = performance.now() + 5000;
      for (let i = 0; i < 60; i++) {
        result.current.onFrameTime(0.005, now + i * 100);
      }
    });

    expect(result.current.interactiveEpsilon).toBeLessThan(laggyEpsilon);
  });

  it('supports overriding all 8 performance knobs and preserves state across fractal switches', () => {
    const { result, rerender } = renderHook(
      ({ fractal, isInteracting }) => usePerformanceAdaptation(fractal, isInteracting),
      { initialProps: { fractal: 0, isInteracting: false } }
    );

    act(() => {
      result.current.overrideKnobs({
        interactiveResolutionScale: 0.75,
        settledResolutionScale: 0.8,
        interactiveSteps: 96,
        settledSteps: 640,
        interactiveIterations: 9,
        settledIterations: 13,
        interactiveEpsilon: 0.0012,
        settledEpsilon: 0.00025
      });
    });

    expect(result.current.interactiveResolutionScale).toBe(0.75);
    expect(result.current.settledResolutionScale).toBe(0.8);
    expect(result.current.interactiveSteps).toBe(96);
    expect(result.current.settledSteps).toBe(640);
    expect(result.current.interactiveIterations).toBe(9);
    expect(result.current.settledIterations).toBe(13);
    expect(result.current.interactiveEpsilon).toBe(0.0012);
    expect(result.current.settledEpsilon).toBe(0.00025);

    // Switch to Menger Sponge (fractal 1)
    rerender({ fractal: 1, isInteracting: false });
    expect(result.current.settledIterations).toBe(FRACTAL_CONFIGS["1"].defaultSettledIterations);
    expect(result.current.interactiveSteps).toBe(FRACTAL_CONFIGS["1"].interactiveSteps);

    // Switch back to Mandelbulb (fractal 0) - learned/overridden state should still be preserved
    rerender({ fractal: 0, isInteracting: false });
    expect(result.current.interactiveResolutionScale).toBe(0.75);
    expect(result.current.settledResolutionScale).toBe(0.8);
    expect(result.current.interactiveSteps).toBe(96);
    expect(result.current.settledSteps).toBe(640);
    expect(result.current.interactiveIterations).toBe(9);
    expect(result.current.settledIterations).toBe(13);
    expect(result.current.interactiveEpsilon).toBe(0.0012);
    expect(result.current.settledEpsilon).toBe(0.00025);
  });

  it('decreases settled resolution scale first under severe lag and respects interactive floors', () => {
    const minSettledScale = 1.0 / 2.25;
    const { result, rerender } = renderHook(
      ({ fractal, isInteracting }) =>
        usePerformanceAdaptation(fractal, isInteracting, {
          minInteractiveScale: 1.0 / 1.5,
          minSettledScale,
        }),
      { initialProps: { fractal: fractalType, isInteracting: true } }
    );

    // Manually set interactive levels (including degraded resolution scale)
    act(() => {
      result.current.overrideKnobs({
        interactiveResolutionScale: 0.75,
        interactiveEpsilon: 0.0005,
        interactiveIterations: 8
      });
    });

    // Switch to settled mode: inherits interactive baseline and resets settledResolutionScale to 1.0
    rerender({ fractal: fractalType, isInteracting: false });

    act(() => {
      result.current.onFrameTime(0.016, performance.now());
    });

    expect(result.current.settledEpsilon).toBe(0.0005);
    expect(result.current.settledIterations).toBe(8);
    expect(result.current.settledResolutionScale).toBe(1.0);

    // Make it fast in settled mode to improve quality beyond interactive
    act(() => {
      const now = performance.now();
      for (let i = 0; i < 20; i++) {
        result.current.onFrameTime(0.01, now + i * 10);
      }
    });

    const highQualityEpsilon = result.current.settledEpsilon;
    expect(highQualityEpsilon).toBeLessThan(0.0005);
    expect(result.current.settledIterations).toBeGreaterThan(8);

    // Simulate severe lag in settled mode (2000ms > 2.5x the 200ms settled target)
    let sawSettledScaleShedFirst = false;
    let now = performance.now();
    for (let i = 0; i < 60; i++) {
      now += 2000;
      act(() => {
        result.current.onFrameTime(2.0, now);
      });
      if (result.current.settledResolutionScale < 1.0 && result.current.settledResolutionScale > minSettledScale + 1e-6) {
        sawSettledScaleShedFirst = true;
        expect(result.current.settledEpsilon).toBe(highQualityEpsilon);
      }
    }

    expect(sawSettledScaleShedFirst).toBe(true);
    expect(result.current.settledResolutionScale).toBeCloseTo(minSettledScale, 6);
    // Should decrease quality but STOP at the interactive floor
    expect(result.current.settledEpsilon).toBe(0.0005);
    expect(result.current.settledIterations).toBe(8);

    // Fast frames recover settledResolutionScale back to 1.0
    act(() => {
      for (let i = 0; i < 60; i++) {
        now += 100;
        result.current.onFrameTime(0.01, now);
      }
    });
    expect(result.current.settledResolutionScale).toBe(1.0);
  });

  it('increases quality in settled mode when fast', () => {
    const { result } = renderHook(() => usePerformanceAdaptation(fractalType, false));

    const initialEpsilon = result.current.settledEpsilon;

    // Simulate fast frames in settled mode
    act(() => {
      const now = performance.now();
      for (let i = 0; i < 10; i++) {
        result.current.onFrameTime(0.02, now + i * 20);
      }
    });

    expect(result.current.settledEpsilon).toBeLessThan(initialEpsilon);
  });
});
