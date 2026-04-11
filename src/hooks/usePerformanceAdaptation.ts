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

    const targetFrameTime = isInteracting ? 1 / 30 : 1 / 15;
    const error = smoothedDeltaRef.current - targetFrameTime;
    
    // Deadband: 15% of target frame time
    if (Math.abs(error) < targetFrameTime * 0.15) {
      return; // In the sweet spot, no adjustment needed
    }

    // Proportional adjustment
    // Scale the error relative to the target frame time
    const errorRatio = error / targetFrameTime;
    
    // Clamp the multiplier to prevent massive jumps (max 20% change per update)
    const adjustment = Math.max(-0.2, Math.min(0.2, errorRatio * 0.5));
    const multiplier = 1 + adjustment;

    let updated = false;

    if (isInteracting) {
      if (multiplier > 1) {
        // Lagging: Increase epsilon first, then decrease iterations
        if (state.interactiveEpsilon < config.maxInteractiveEpsilon) {
          state.interactiveEpsilon = Math.min(config.maxInteractiveEpsilon, state.interactiveEpsilon * multiplier);
          updated = true;
        } else if (state.interactiveIterations > config.minInteractiveIterations) {
          state.interactiveIterations = Math.max(config.minInteractiveIterations, Math.floor(state.interactiveIterations / multiplier));
          updated = true;
        }
      } else {
        // Fast: Decrease epsilon first, then increase iterations
        if (state.interactiveEpsilon > config.minInteractiveEpsilon) {
          state.interactiveEpsilon = Math.max(config.minInteractiveEpsilon, state.interactiveEpsilon * multiplier);
          updated = true;
        } else if (state.interactiveIterations < config.maxInteractiveIterations) {
          state.interactiveIterations = Math.min(config.maxInteractiveIterations, Math.ceil(state.interactiveIterations / multiplier));
          updated = true;
        }
      }
    } else {
      if (multiplier > 1) {
        // Lagging: Increase epsilon first, then decrease iterations
        if (state.settledEpsilon < config.maxSettledEpsilon) {
          state.settledEpsilon = Math.min(config.maxSettledEpsilon, state.settledEpsilon * multiplier);
          updated = true;
        } else if (state.settledIterations > config.minSettledIterations) {
          state.settledIterations = Math.max(config.minSettledIterations, Math.floor(state.settledIterations / multiplier));
          updated = true;
        }
      } else {
        // Fast: Decrease epsilon first, then increase iterations
        if (state.settledEpsilon > config.minSettledEpsilon) {
          state.settledEpsilon = Math.max(config.minSettledEpsilon, state.settledEpsilon * multiplier);
          updated = true;
        } else if (state.settledIterations < config.maxSettledIterations) {
          state.settledIterations = Math.min(config.maxSettledIterations, Math.ceil(state.settledIterations / multiplier));
          updated = true;
        }
      }
    }

    if (updated) {
      setCurrentValues({ ...state });
    }
  }, [fractalType, isInteracting]);

  // Function to manually override values (e.g., from DebugPanel)
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
