import { useState, useRef, useCallback, useEffect } from 'react';
import { FRACTAL_CONFIGS, type FractalConfig } from '../constants/fractals';

interface AdaptationState {
  interactiveEpsilon: number;
  settledEpsilon: number;
  interactiveIterations: number;
  settledIterations: number;
}

/**
 * Hook to manage performance adaptation logic.
 * It tracks frame times and adjusts fractal quality parameters (epsilon and iterations)
 * to maintain a target frame rate, while ensuring quality never drops below interactive levels.
 */
export function usePerformanceAdaptation(fractalType: number, isInteracting: boolean) {
  // Store state for all fractals in a ref so switching fractals doesn't lose the learned performance state
  const stateRef = useRef<Record<number, AdaptationState>>({});

  // Initialize state if missing for this specific fractal
  if (!stateRef.current[fractalType]) {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    stateRef.current[fractalType] = {
      interactiveEpsilon: config.defaultInteractiveEpsilon,
      settledEpsilon: config.defaultSettledEpsilon,
      interactiveIterations: config.defaultInteractiveIterations,
      settledIterations: config.defaultSettledIterations,
    };
  }

  // React state to trigger re-renders when adaptation values change
  const [currentValues, setCurrentValues] = useState<AdaptationState>(stateRef.current[fractalType]);

  // Sync state when fractalType changes
  useEffect(() => {
    setCurrentValues(stateRef.current[fractalType]);
  }, [fractalType]);

  // Performance tracking refs
  const lastUpdateRef = useRef<number>(0);
  const smoothedDeltaRef = useRef<number>(0);
  const sampleCountRef = useRef<number>(0);
  const lastInteractionStateRef = useRef<boolean>(isInteracting);

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
        setCurrentValues({ ...state });
      }
      lastInteractionStateRef.current = isInteracting;
      sampleCountRef.current = 0;
      smoothedDeltaRef.current = delta;
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

    // Interactive target: 30fps. Settled target: 10fps.
    // Settled mode is allowed to be much heavier to produce high-quality final images.
    const targetFrameTime = isInteracting ? 1 / 30 : 1 / 10; 
    const error = smoothedDeltaRef.current - targetFrameTime;
    
    // Deadband: Avoid small oscillations if performance is within 15% of target
    if (Math.abs(error) < targetFrameTime * 0.15) {
      return false; 
    }

    // Calculate how much we need to adjust parameters
    const multiplier = calculateAdjustmentMultiplier(error, targetFrameTime, isInteracting);
    
    // Split the adjustment equally between epsilon (precision) and iterations (depth).
    // Adjusting them together prevents the "blobby but detailed" or "noisy but sharp" looks.
    const splitMultiplier = Math.sqrt(multiplier);

    const updated = applyPerformanceAdjustment(state, config, multiplier, splitMultiplier, isInteracting);

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
    // Settled mode: Usually only increases quality, unless the system is severely struggling.
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
    } else if (multiplier > 2.5) {
      // Severe lag in settled mode: Slowly decrease settled quality if it has exceeded the floor.
      // We only do this if it's struggling significantly (e.g. > 250ms per frame).
      // We also use a dampened multiplier (Math.pow(splitMultiplier, 0.5)) to avoid snapping.
      const dampenedMultiplier = Math.pow(splitMultiplier, 0.5);
      
      if (state.settledEpsilon < state.interactiveEpsilon) {
        state.settledEpsilon = Math.min(state.interactiveEpsilon, state.settledEpsilon * dampenedMultiplier);
        updated = true;
      }
      if (state.settledIterations > state.interactiveIterations) {
        state.settledIterations = Math.max(state.interactiveIterations, Math.floor(state.settledIterations / dampenedMultiplier));
        updated = true;
      }
    }
  }

  return updated;
}
