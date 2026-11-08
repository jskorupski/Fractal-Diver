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

  it('initializes with default values from config', () => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    const { result } = renderHook(() => usePerformanceAdaptation(fractalType, false));

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

    expect(result.current.interactiveEpsilon).toBeGreaterThan(initialEpsilon);
    expect(result.current.interactiveIterations).toBeLessThanOrEqual(initialIterations);
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
    expect(laggyEpsilon).toBeGreaterThan(0.0005); // Verify it actually moved
    
    // Now simulate fast frames (5ms < 33ms target) so EMA recovers and increases interactive quality
    act(() => {
      const now = performance.now() + 5000;
      for (let i = 0; i < 40; i++) {
        result.current.onFrameTime(0.005, now + i * 100);
      }
    });

    expect(result.current.interactiveEpsilon).toBeLessThan(laggyEpsilon);
  });

  it('supports overriding all performance knobs and preserves state across fractal switches', () => {
    const { result, rerender } = renderHook(
      ({ fractal, isInteracting }) => usePerformanceAdaptation(fractal, isInteracting),
      { initialProps: { fractal: 0, isInteracting: false } }
    );

    act(() => {
      result.current.overrideKnobs({
        interactiveIterations: 9,
        settledIterations: 13,
        interactiveEpsilon: 0.0012,
        settledEpsilon: 0.00025
      });
    });

    expect(result.current.interactiveIterations).toBe(9);
    expect(result.current.settledIterations).toBe(13);
    expect(result.current.interactiveEpsilon).toBe(0.0012);
    expect(result.current.settledEpsilon).toBe(0.00025);

    // Switch to Menger Sponge (fractal 1)
    rerender({ fractal: 1, isInteracting: false });
    expect(result.current.settledIterations).toBe(FRACTAL_CONFIGS["1"].defaultSettledIterations);

    // Switch back to Mandelbulb (fractal 0) - learned/overridden state should still be preserved
    rerender({ fractal: 0, isInteracting: false });
    expect(result.current.settledIterations).toBe(13);
  });

  it('decreases quality in settled mode if lagging badly but respects interactive floor', () => {
    // Start with a high-quality interactive state
    const { result, rerender } = renderHook(({ fractal, isInteracting }) => 
      usePerformanceAdaptation(fractal, isInteracting), 
      { initialProps: { fractal: fractalType, isInteracting: true } }
    );
    
    // Manually set interactive levels to something specific
    act(() => {
      result.current.overrideKnobs({
        interactiveEpsilon: 0.0005,
        interactiveIterations: 20
      });
    });

    // Switch to settled mode
    rerender({ fractal: fractalType, isInteracting: false });
    
    // Call onFrameTime to trigger the transition inheritance
    act(() => {
      result.current.onFrameTime(0.016, performance.now());
    });

    // Transitioning to settled mode should inherit interactive values
    expect(result.current.settledEpsilon).toBe(0.0005);
    expect(result.current.settledIterations).toBe(20);

    // Make it VERY fast in settled mode to improve quality beyond interactive
    act(() => {
      const now = performance.now();
      for (let i = 0; i < 20; i++) {
        result.current.onFrameTime(0.01, now + i * 10);
      }
    });

    const highQualityEpsilon = result.current.settledEpsilon;
    expect(highQualityEpsilon).toBeLessThan(0.0005);

    // Now simulate severe lag in settled mode (2000ms > 2.5x the 200ms settled target)
    act(() => {
      const now = performance.now();
      // Increase iterations to 60 to overcome the larger (15 frame) window and dampened multiplier
      for (let i = 0; i < 60; i++) {
        result.current.onFrameTime(2.0, now + i * 2000);
      }
    });

    // Should decrease quality but STOP at the interactive floor
    expect(result.current.settledEpsilon).toBe(0.0005);
    expect(result.current.settledIterations).toBe(20);
  });

  it('increases quality in settled mode when fast', () => {
    // Use a fractal where default is not the min
    const { result } = renderHook(() => usePerformanceAdaptation(fractalType, false));
    
    // Mandelbulb default settled epsilon is 0.0001, min is 0.00001
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
