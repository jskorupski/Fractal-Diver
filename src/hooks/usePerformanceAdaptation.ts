/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { FRACTAL_CONFIGS, type FractalConfig } from '../constants/fractals';

/**
 * Adaptive quality parameters tracked per fractal type.
 */
export interface AdaptationState {
  interactiveResolutionScale: number;
  settledResolutionScale: number;
  interactiveSteps: number;
  settledSteps: number;
  interactiveEpsilon: number;
  settledEpsilon: number;
  interactiveIterations: number;
  settledIterations: number;
}

function createDefaultAdaptationState(config: FractalConfig): AdaptationState {
  return {
    interactiveResolutionScale: 1.0,
    settledResolutionScale: 1.0,
    interactiveSteps: config.interactiveSteps,
    settledSteps: config.settledSteps,
    interactiveEpsilon: config.defaultInteractiveEpsilon,
    settledEpsilon: config.defaultSettledEpsilon,
    interactiveIterations: config.defaultInteractiveIterations,
    settledIterations: config.defaultSettledIterations,
  };
}

/**
 * Closed-loop adaptive performance controller for real-time WebGPU raymarching.
 *
 * Control Architecture:
 * - **Asymmetric Exponential Moving Average (EMA)**: Smooths frame times while reacting ~3x faster
 *   to frame-time degradation than to improvements, with an instant fast-path (`alpha = 0.9`) for
 *   severe lag spikes (>100ms and >1.5x average).
 * - **Non-Destructive 4-Tier Interactive Cascade (`isInteracting = true`, 30 FPS / 33.3ms target)**:
 *   Sheds load sequentially with exact budget spillover so 3D fractal structure is preserved:
 *   1. `interactiveResolutionScale` -> `minInteractiveScale` (quadratic pixel cost)
 *   2. `interactiveSteps` -> `config.minInteractiveSteps`
 *   3. `interactiveEpsilon` -> `config.maxInteractiveEpsilon`
 *   4. `interactiveIterations` -> `config.minInteractiveIterations` (emergency survival floor)
 *   Recovers in strict reverse order (stopping iterations at `defaultInteractiveIterations`,
 *   with sub-pixel epsilon polish only after resolution scale and steps are fully restored).
 * - **Settled Progressive Refinement (`isInteracting = false`, 5 FPS / 200ms target)**:
 *   Inherits the interactive baseline on release (with `settledResolutionScale = 1.0`) and
 *   refines precision down to per-fractal ceilings or locks in `App.tsx`. Under severe lag
 *   (`multiplier > 2.5`), sheds `settledResolutionScale` first before relaxing toward the
 *   interactive baseline.
 */
export function usePerformanceAdaptation(
  fractalType: number,
  isInteracting: boolean,
  dprScaleFloors?: { minInteractiveScale?: number; minSettledScale?: number }
) {
  // Store state for all fractals in a ref so switching fractals doesn't lose the learned performance state
  const stateRef = useRef<Record<number, AdaptationState>>({});

  // Initialize state if missing for this specific fractal
  if (!stateRef.current[fractalType]) {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    stateRef.current[fractalType] = createDefaultAdaptationState(config);
  }

  const rawMinInteractive = dprScaleFloors?.minInteractiveScale;
  const rawMinSettled = dprScaleFloors?.minSettledScale;
  const minInteractiveScale = Math.max(
    0.25,
    Math.min(1.0, typeof rawMinInteractive === 'number' && Number.isFinite(rawMinInteractive) ? rawMinInteractive : 1.0 / 1.5)
  );
  const minSettledScale = Math.max(
    0.25,
    Math.min(1.0, typeof rawMinSettled === 'number' && Number.isFinite(rawMinSettled) ? rawMinSettled : 1.0 / 2.25)
  );
  const scaleFloorsRef = useRef({ minInteractiveScale, minSettledScale });
  scaleFloorsRef.current = { minInteractiveScale, minSettledScale };

  // React state to trigger re-renders when adaptation values change
  const [currentValues, setCurrentValues] = useState<AdaptationState>(stateRef.current[fractalType]);

  // Sync state when fractalType changes
  useEffect(() => {
    if (!stateRef.current[fractalType]) {
      const config = FRACTAL_CONFIGS[fractalType.toString()];
      stateRef.current[fractalType] = createDefaultAdaptationState(config);
    }
    setCurrentValues({ ...stateRef.current[fractalType] });
  }, [fractalType]);

  // Performance tracking refs
  const lastUpdateRef = useRef<number>(0);
  const smoothedDeltaRef = useRef<number>(0);
  const sampleCountRef = useRef<number>(0);
  const lastInteractionStateRef = useRef<boolean>(isInteracting);

  // Immediately inherit interactive quality baseline when transitioning from interacting to settled
  // so the first settled frame doesn't render with stale high-cost settled parameters.
  useEffect(() => {
    const state = stateRef.current[fractalType];
    if (isInteracting !== lastInteractionStateRef.current) {
      if (!isInteracting && state) {
        state.settledEpsilon = state.interactiveEpsilon;
        state.settledIterations = state.interactiveIterations;
        state.settledResolutionScale = 1.0;
        setCurrentValues({ ...state });
      }
      lastInteractionStateRef.current = isInteracting;
      sampleCountRef.current = 0;
      smoothedDeltaRef.current = 1 / 30;
    }
  }, [fractalType, isInteracting]);

  /**
   * Called every frame with the time taken for the previous frame.
   * Updates the adaptive parameters if necessary.
   */
  const onFrameTime = useCallback((delta: number, now: number) => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    const state = stateRef.current[fractalType];

    // Reset tracking if interaction state changed (e.g., user started/stopped dragging)
    if (isInteracting !== lastInteractionStateRef.current) {
      if (!isInteracting) {
        // Transitioning from interacting to settled: inherit interactive state as a starting point.
        // This ensures the transition is smooth and doesn't jump to a lower quality.
        state.settledEpsilon = state.interactiveEpsilon;
        state.settledIterations = state.interactiveIterations;
        state.settledResolutionScale = 1.0;
        setCurrentValues({ ...state });
      }
      lastInteractionStateRef.current = isInteracting;
      sampleCountRef.current = 0;
      // Clamp initial delta on transition to prevent a single transition frame from poisoning the settled deadband
      smoothedDeltaRef.current = !isInteracting ? Math.min(delta, 1 / 30) : delta;
    }

    // Exponential Moving Average (EMA) for frame delta to smooth out jitter
    sampleCountRef.current++;

    // Asymmetric EMA window:
    // When performance improves (delta < current average), use a larger window for stability.
    // When performance degrades (delta > current average), use a smaller window to react faster to lag.
    const baseWindowSize = isInteracting ? 30 : 15;
    const isLaggingRelative = delta > smoothedDeltaRef.current;

    // React ~3x faster to performance degradation than to improvements
    const effectiveWindowSize = isLaggingRelative ? Math.max(2, baseWindowSize / 3) : baseWindowSize;
    let alpha = 1.0 / Math.min(sampleCountRef.current, effectiveWindowSize);

    // React instantly to severe lag spikes (sudden drops in FPS) to prevent UI freezes
    // If a frame is > 1.5x the average AND > 100ms, we force immediate reaction
    if (delta > smoothedDeltaRef.current * 1.5 && delta > 0.1) {
      alpha = 0.9;
    }

    smoothedDeltaRef.current = smoothedDeltaRef.current * (1 - alpha) + delta * alpha;

    // Throttle checks to 15Hz to avoid excessive React state updates
    if (now - lastUpdateRef.current < 66) return 'waiting';

    // Wait for at least a few samples before making decisions, unless we hit extreme lag
    if (sampleCountRef.current < 3 && !(!isInteracting && delta > 0.1)) return 'waiting';

    lastUpdateRef.current = now;

    // Interactive target: 30fps. Settled target: 5fps.
    const targetFrameTime = isInteracting ? 1 / 30 : 1 / 5;
    const error = smoothedDeltaRef.current - targetFrameTime;

    // Deadband: Avoid small oscillations if performance is within 15% of target
    if (Math.abs(error) < targetFrameTime * 0.15) {
      return false;
    }

    // Calculate how much we need to adjust parameters
    const multiplier = calculateAdjustmentMultiplier(error, targetFrameTime, isInteracting);
    const splitMultiplier = Math.sqrt(multiplier);

    const updated = applyPerformanceAdjustment(
      state,
      config,
      multiplier,
      splitMultiplier,
      isInteracting,
      scaleFloorsRef.current
    );

    if (updated) {
      setCurrentValues({ ...state });
    }

    return updated;
  }, [fractalType, isInteracting]);

  /**
   * Manually override performance adaptation values.
   * Useful for debug controls or resetting to known states.
   */
  const overrideKnobs = useCallback((knobs: Partial<AdaptationState>) => {
    const state = stateRef.current[fractalType];
    let updated = false;

    if (knobs.interactiveResolutionScale !== undefined) {
      state.interactiveResolutionScale = knobs.interactiveResolutionScale;
      updated = true;
    }
    if (knobs.settledResolutionScale !== undefined) {
      state.settledResolutionScale = knobs.settledResolutionScale;
      updated = true;
    }
    if (knobs.interactiveSteps !== undefined) {
      state.interactiveSteps = knobs.interactiveSteps;
      updated = true;
    }
    if (knobs.settledSteps !== undefined) {
      state.settledSteps = knobs.settledSteps;
      updated = true;
    }
    if (knobs.interactiveIterations !== undefined) {
      state.interactiveIterations = knobs.interactiveIterations;
      updated = true;
    }
    if (knobs.settledIterations !== undefined) {
      state.settledIterations = knobs.settledIterations;
      updated = true;
    }
    if (knobs.interactiveEpsilon !== undefined) {
      state.interactiveEpsilon = knobs.interactiveEpsilon;
      updated = true;
    }
    if (knobs.settledEpsilon !== undefined) {
      state.settledEpsilon = knobs.settledEpsilon;
      updated = true;
    }

    if (updated) {
      setCurrentValues({ ...state });
    }
  }, [fractalType]);

  return {
    ...currentValues,
    onFrameTime,
    overrideKnobs,
    smoothedDelta: smoothedDeltaRef.current
  };
}

/**
 * Calculates a performance adjustment multiplier based on the current frame time error.
 */
function calculateAdjustmentMultiplier(error: number, targetFrameTime: number, isInteracting: boolean): number {
  const errorRatio = error / targetFrameTime;

  // Use higher gain and larger caps when settled to allow for faster quality ramp-up
  let gain = isInteracting ? 0.5 : 0.8;
  let maxAdjustment = isInteracting ? 0.25 : 0.4;

  // High-performance catch-up: if we are lagging by more than 2 target frames (e.g., 3x logic time)
  if (errorRatio > 2.0) {
    maxAdjustment = Math.min(2.0, errorRatio * 0.5);
    gain = 1.0;
  }

  const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, errorRatio * gain));
  return 1 + adjustment;
}

/**
 * Applies performance adjustments to the state based on calculated multipliers.
 * Returns true if the state was updated.
 */
function applyPerformanceAdjustment(
  state: AdaptationState,
  config: FractalConfig,
  multiplier: number,
  splitMultiplier: number,
  isInteracting: boolean,
  scaleFloors: { minInteractiveScale: number; minSettledScale: number }
): boolean {
  if (isInteracting) {
    return multiplier > 1
      ? applyInteractiveDegradation(state, config, multiplier, scaleFloors.minInteractiveScale)
      : applyInteractiveRecovery(state, config, multiplier);
  }
  return applySettledAdjustment(state, config, multiplier, splitMultiplier, scaleFloors.minSettledScale);
}

/**
 * Interactive 4-tier load-shedding cascade with exact spillover:
 * resolution scale -> raymarch steps -> surface epsilon -> emergency iterations.
 */
function applyInteractiveDegradation(
  state: AdaptationState,
  config: FractalConfig,
  multiplier: number,
  minInteractiveScale: number
): boolean {
  let updated = false;
  let remaining = multiplier;

  // Tier 1: Resolution scale (quadratic pixel cost)
  if (remaining > 1.001 && state.interactiveResolutionScale > minInteractiveScale) {
    const prevScale = state.interactiveResolutionScale;
    const nextScale = Math.max(minInteractiveScale, prevScale / Math.sqrt(remaining));
    if (nextScale < prevScale) {
      const used = (prevScale / nextScale) ** 2;
      state.interactiveResolutionScale = nextScale;
      remaining /= used;
      updated = true;
    }
  }

  // Tier 2: Interactive raymarch steps
  if (remaining > 1.001 && state.interactiveSteps > config.minInteractiveSteps) {
    const prevSteps = state.interactiveSteps;
    const nextSteps = Math.max(config.minInteractiveSteps, Math.floor(prevSteps / remaining));
    if (nextSteps < prevSteps) {
      const used = prevSteps / nextSteps;
      state.interactiveSteps = nextSteps;
      remaining /= used;
      updated = true;
    }
  }

  // Tier 3: Interactive epsilon
  if (remaining > 1.001 && state.interactiveEpsilon < config.maxInteractiveEpsilon) {
    const prevEps = state.interactiveEpsilon;
    const nextEps = Math.min(config.maxInteractiveEpsilon, prevEps * remaining);
    if (nextEps > prevEps) {
      const used = nextEps / prevEps;
      state.interactiveEpsilon = nextEps;
      remaining /= used;
      updated = true;
    }
  }

  // Tier 4: Emergency interactive iteration survival floor
  if (remaining > 1.001 && state.interactiveIterations > config.minInteractiveIterations) {
    const prevIter = state.interactiveIterations;
    const nextIter = Math.max(config.minInteractiveIterations, Math.floor(prevIter / Math.sqrt(remaining)));
    if (nextIter < prevIter) {
      state.interactiveIterations = nextIter;
      updated = true;
    }
  }

  return updated;
}

/**
 * Reverse-order interactive quality recovery:
 * iterations -> epsilon -> steps -> resolution scale -> sub-pixel epsilon polish.
 */
function applyInteractiveRecovery(
  state: AdaptationState,
  config: FractalConfig,
  multiplier: number
): boolean {
  let updated = false;
  let budget = 1 / multiplier;

  // Restore Tier 4 -> defaultInteractiveIterations (never push above default automatically)
  if (budget > 1.001 && state.interactiveIterations < config.defaultInteractiveIterations) {
    const prevIter = state.interactiveIterations;
    const nextIter = Math.min(config.defaultInteractiveIterations, Math.ceil(prevIter * Math.sqrt(budget)));
    if (nextIter > prevIter) {
      budget /= nextIter / prevIter;
      state.interactiveIterations = nextIter;
      updated = true;
    }
  }

  // Restore Tier 3 -> defaultInteractiveEpsilon
  if (budget > 1.001 && state.interactiveEpsilon > config.defaultInteractiveEpsilon) {
    const prevEps = state.interactiveEpsilon;
    const nextEps = Math.max(config.defaultInteractiveEpsilon, prevEps / budget);
    if (nextEps < prevEps) {
      budget /= prevEps / nextEps;
      state.interactiveEpsilon = nextEps;
      updated = true;
    }
  }

  // Restore Tier 2 -> config.interactiveSteps
  if (budget > 1.001 && state.interactiveSteps < config.interactiveSteps) {
    const prevSteps = state.interactiveSteps;
    const nextSteps = Math.min(config.interactiveSteps, Math.ceil(prevSteps * budget));
    if (nextSteps > prevSteps) {
      budget /= nextSteps / prevSteps;
      state.interactiveSteps = nextSteps;
      updated = true;
    }
  }

  // Restore Tier 1 -> 1.0
  if (budget > 1.001 && state.interactiveResolutionScale < 1.0) {
    const prevScale = state.interactiveResolutionScale;
    const nextScale = Math.min(1.0, prevScale * Math.sqrt(budget));
    if (nextScale > prevScale) {
      budget /= (nextScale / prevScale) ** 2;
      state.interactiveResolutionScale = nextScale;
      updated = true;
    }
  }

  // Sub-pixel bonus polish only once resolution scale & step count are fully restored
  if (
    state.interactiveResolutionScale >= 1.0 &&
    state.interactiveSteps >= config.interactiveSteps &&
    budget > 1.001 &&
    state.interactiveEpsilon > config.minInteractiveEpsilon
  ) {
    const nextEps = Math.max(config.minInteractiveEpsilon, state.interactiveEpsilon / budget);
    if (nextEps < state.interactiveEpsilon) {
      state.interactiveEpsilon = nextEps;
      updated = true;
    }
  }

  return updated;
}

/**
 * Settled progressive refinement (5 FPS target) and severe-lag protection.
 */
function applySettledAdjustment(
  state: AdaptationState,
  config: FractalConfig,
  multiplier: number,
  splitMultiplier: number,
  minSettledScale: number
): boolean {
  let updated = false;

  if (multiplier < 1) {
    if (state.settledResolutionScale < 1.0) {
      const nextScale = Math.min(1.0, state.settledResolutionScale / splitMultiplier);
      if (nextScale > state.settledResolutionScale) {
        state.settledResolutionScale = nextScale;
        updated = true;
      }
    }
    if (state.settledEpsilon > config.minSettledEpsilon) {
      const nextEps = Math.max(config.minSettledEpsilon, state.settledEpsilon * splitMultiplier);
      if (nextEps < state.settledEpsilon) {
        state.settledEpsilon = nextEps;
        updated = true;
      }
    }
    if (state.settledIterations < config.maxSettledIterations) {
      const nextIter = Math.min(config.maxSettledIterations, Math.ceil(state.settledIterations / splitMultiplier));
      if (nextIter > state.settledIterations) {
        state.settledIterations = nextIter;
        updated = true;
      }
    }
  } else if (multiplier > 2.5) {
    // Severe lag in settled mode: shed resolution scale first before relaxing toward interactive baseline.
    const dampenedMultiplier = Math.pow(splitMultiplier, 0.5);
    let remaining = dampenedMultiplier;

    if (remaining > 1.001 && state.settledResolutionScale > minSettledScale) {
      const prevScale = state.settledResolutionScale;
      const nextScale = Math.max(minSettledScale, prevScale / Math.sqrt(remaining));
      if (nextScale < prevScale) {
        const used = (prevScale / nextScale) ** 2;
        state.settledResolutionScale = nextScale;
        remaining /= used;
        updated = true;
      }
    }

    if (remaining > 1.001) {
      const remSplit = Math.sqrt(remaining);
      if (state.settledEpsilon < state.interactiveEpsilon) {
        const nextEps = Math.min(state.interactiveEpsilon, state.settledEpsilon * remSplit);
        if (nextEps > state.settledEpsilon) {
          state.settledEpsilon = nextEps;
          updated = true;
        }
      }
      if (state.settledIterations > state.interactiveIterations) {
        const nextIter = Math.max(state.interactiveIterations, Math.floor(state.settledIterations / remSplit));
        if (nextIter < state.settledIterations) {
          state.settledIterations = nextIter;
          updated = true;
        }
      }
    }
  }

  return updated;
}
