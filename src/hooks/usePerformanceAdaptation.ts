import { useState, useRef, useCallback, useEffect } from 'react';
import { FRACTAL_CONFIGS } from '../constants/fractals';

interface AdaptationState {
  interactiveEpsilon: number;
  settledEpsilon: number;
  interactiveIterations: number;
  settledIterations: number;
}

export function usePerformanceAdaptation(fractalType: number, isInteracting: boolean) {
  // Store state for all fractals so switching doesn't reset them
  const stateRef = useRef<Record<number, AdaptationState>>({});

  // Initialize state if missing
  if (!stateRef.current[fractalType]) {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    stateRef.current[fractalType] = {
      interactiveEpsilon: config.defaultInteractiveEpsilon,
      settledEpsilon: config.defaultSettledEpsilon,
      interactiveIterations: config.defaultInteractiveIterations,
      settledIterations: config.defaultSettledIterations,
    };
  }

  // React state to trigger re-renders when values change significantly
  const [currentValues, setCurrentValues] = useState<AdaptationState>(stateRef.current[fractalType]);

  // Sync state when fractalType changes
  useEffect(() => {
    setCurrentValues(stateRef.current[fractalType]);
  }, [fractalType]);

  // Throttling and tracking refs
  const lastUpdateRef = useRef<number>(0);
  const smoothedDeltaRef = useRef<number>(0);
  const sampleCountRef = useRef<number>(0);
  const lastInteractionStateRef = useRef<boolean>(isInteracting);

  const onFrameTime = useCallback((delta: number, now: number) => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    const state = stateRef.current[fractalType];

    // Reset tracking if interaction state changed
    if (isInteracting !== lastInteractionStateRef.current) {
      if (!isInteracting) {
        // Transitioning from interacting to settled: inherit interactive state as a starting point
        state.settledEpsilon = state.interactiveEpsilon;
        state.settledIterations = state.interactiveIterations;
        setCurrentValues({ ...state });
      }
      lastInteractionStateRef.current = isInteracting;
      sampleCountRef.current = 0;
      smoothedDeltaRef.current = delta;
    }

    // Exponential Moving Average (EMA) for frame delta
    // Starts with high weight for new samples, then settles to ~1 second window
    sampleCountRef.current++;
    const alpha = 1.0 / Math.min(sampleCountRef.current, 30);
    smoothedDeltaRef.current = smoothedDeltaRef.current * (1 - alpha) + delta * alpha;

    // Throttle adaptation updates to ~15Hz (66ms) to allow React/WebGPU to catch up
    if (now - lastUpdateRef.current < 66) return;
    
    // Wait for at least a few samples before adapting
    if (sampleCountRef.current < 3) return;

    lastUpdateRef.current = now;

    const targetFrameTime = isInteracting ? 1 / 30 : 1 / 8;
    const error = smoothedDeltaRef.current - targetFrameTime;
    
    // Deadband: 15% of target frame time
    if (Math.abs(error) < targetFrameTime * 0.15) {
      return false; // In the sweet spot, no adjustment needed
    }

    // Calculate adjustment multiplier based on performance error
    const multiplier = calculateAdjustmentMultiplier(error, targetFrameTime, isInteracting);
    
    // Split the performance adjustment equally between epsilon and iterations
    // This ensures we adjust precision and depth in parallel to avoid "blobs"
    const splitMultiplier = Math.sqrt(multiplier);

    const updated = applyPerformanceAdjustment(state, config, multiplier, splitMultiplier, isInteracting);

    if (updated) {
      setCurrentValues({ ...state });
    }
    
    return updated;
  }, [fractalType, isInteracting]);

  /**
   * Manually override performance adaptation values.
   * Useful for debug controls or specific scene requirements.
   */
  const overrideKnobs = useCallback((knobs: Partial<AdaptationState>) => {
    const state = stateRef.current[fractalType];
    let updated = false;
    
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
  // Scale the error relative to the target frame time
  const errorRatio = error / targetFrameTime;
  
  // Gain and clamp: More aggressive recovery when settled
  const gain = isInteracting ? 0.5 : 0.8;
  const maxAdjustment = isInteracting ? 0.2 : 0.4;
  
  const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, errorRatio * gain));
  return 1 + adjustment;
}

/**
 * Applies performance adjustments to the adaptation state.
 * Returns true if any values were actually changed.
 */
function applyPerformanceAdjustment(
  state: AdaptationState, 
  config: any, 
  multiplier: number, 
  splitMultiplier: number, 
  isInteracting: boolean
): boolean {
  let updated = false;

  if (isInteracting) {
    if (multiplier > 1) {
      // Lagging: Decrease quality (increase epsilon, decrease iterations)
      if (state.interactiveEpsilon < config.maxInteractiveEpsilon) {
        state.interactiveEpsilon = Math.min(config.maxInteractiveEpsilon, state.interactiveEpsilon * splitMultiplier);
        updated = true;
      }
      if (state.interactiveIterations > config.minInteractiveIterations) {
        state.interactiveIterations = Math.max(config.minInteractiveIterations, Math.floor(state.interactiveIterations / splitMultiplier));
        updated = true;
      }
    } else {
      // Fast: Increase quality (decrease epsilon, increase iterations)
      if (state.interactiveEpsilon > config.minInteractiveEpsilon) {
        state.interactiveEpsilon = Math.max(config.minInteractiveEpsilon, state.interactiveEpsilon * splitMultiplier);
        updated = true;
      }
      if (state.interactiveIterations < config.maxInteractiveIterations) {
        state.interactiveIterations = Math.min(config.maxInteractiveIterations, Math.ceil(state.interactiveIterations / splitMultiplier));
        updated = true;
      }
    }
  } else {
    // Settled mode: Only increase quality if we have frame budget
    if (multiplier < 1) {
      // Fast: Increase quality (decrease epsilon, increase iterations)
      if (state.settledEpsilon > config.minSettledEpsilon) {
        state.settledEpsilon = Math.max(config.minSettledEpsilon, state.settledEpsilon * splitMultiplier);
        updated = true;
      }
      if (state.settledIterations < config.maxSettledIterations) {
        state.settledIterations = Math.min(config.maxSettledIterations, Math.ceil(state.settledIterations / splitMultiplier));
        updated = true;
      }
    }
    // Note: We never decrease quality in settled mode to hit a frame rate target,
    // as we prefer a high-quality static image over a fast-rendering one.
  }

  return updated;
}
