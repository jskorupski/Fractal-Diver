/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, TouchEvent as ReactTouchEvent, MouseEvent as ReactMouseEvent, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import FractalCanvas from './components/FractalCanvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Button } from './components/ui/button';
import { FRACTAL_NAMES, FRACTAL_CONFIGS } from './constants/fractals';

import { Settings2, ChevronRight, ChevronDown } from 'lucide-react';

/**
 * Main Application Component.
 * Manages the state for fractal selection, camera controls (zoom, offset, rotation),
 * and handles user interaction events (touch/mouse).
 */
export default function App() {
  // --- State Management ---
  
  // Current fractal type being rendered (0-5)
  const [fractalType, setFractalType] = useState<number>(0);
  
  // Per-fractal view states to store camera parameters separately
  const [fractalViews, setFractalViews] = useState<Record<number, {
    zoom: number;
    offset: THREE.Vector3;
    rotation: THREE.Quaternion;
    parameters: {
      qualityOffset: number;
      qualityStep: number;
      p1: number;
      p2: number;
      p3: number;
    };
    slicer: {
      enabled: boolean;
      offset: number;
      axis: number;
    };
  }>>(() => {
    const initial: Record<number, any> = {};
    Object.entries(FRACTAL_CONFIGS).forEach(([key, config]) => {
      initial[parseInt(key)] = {
        zoom: config.zoom,
        offset: new THREE.Vector3(...config.offset),
        rotation: new THREE.Quaternion().setFromEuler(config.rotation),
        parameters: { ...config.parameters },
        slicer: { ...config.slicer }
      };
    });
    return initial;
  });

  // Parameters panel state
  const [paramsEnabled, setParamsEnabled] = useState<boolean>(false);
  const [draggingParam, setDraggingParam] = useState<string | null>(null);
  const [slicerExpanded, setSlicerExpanded] = useState<boolean>(() => {
    const config = FRACTAL_CONFIGS["0"];
    return !config?.slicer.enabled;
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // Refs for tracking interaction state across frames
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);

  // Interaction and visibility states
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [interactionType, setInteractionType] = useState<number>(0); // 0: none, 1: pan/rotate, 2: zoom
  
  // Adaptive iteration counts for interactive mode (targets 30fps)
  const [adaptiveIterations, setAdaptiveIterations] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    Object.entries(FRACTAL_CONFIGS).forEach(([key, config]) => {
      initial[parseInt(key)] = config.minInteractiveIterations;
    });
    return initial;
  });

  // Adaptive iteration counts for settled mode (targets 15fps)
  const [adaptiveSettledIterations, setAdaptiveSettledIterations] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    Object.entries(FRACTAL_CONFIGS).forEach(([key, config]) => {
      initial[parseInt(key)] = config.minSettledIterations;
    });
    return initial;
  });
  
  // Throttling refs for state updates
  const lastAdaptiveUpdateRef = useRef<number>(0);
  const lastSettledAdaptiveUpdateRef = useRef<number>(0);
  const interactionStartTimeRef = useRef<number>(0);
  const smoothedDeltaRef = useRef<Record<number, number>>({});
  const lastActualMoveTimeRef = useRef<number>(0);
  const lastViewUpdateRef = useRef<number>(0);

  const [settleTime, setSettleTime] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get current view parameters
  const currentView = fractalViews[fractalType];
  const { zoom, offset, rotation, parameters, slicer } = currentView;

  /**
   * Updates the current fractal view state with a partial update.
   * This ensures that camera and parameter changes are persisted per fractal type.
   * 
   * @param updates - Partial fractal view configuration to apply.
   */
  const updateCurrentView = useCallback((updates: Partial<{ 
    zoom: number; 
    offset: THREE.Vector3; 
    rotation: THREE.Quaternion;
    parameters: Partial<{ qualityOffset: number; qualityStep: number; p1: number; p2: number; p3: number }>;
    slicer: Partial<{ enabled: boolean; offset: number; axis: number }>;
  }>) => {
    setFractalViews(prev => {
      const current = prev[fractalType];
      return {
        ...prev,
        [fractalType]: {
          ...current,
          ...updates,
          parameters: updates.parameters 
            ? { ...current.parameters, ...updates.parameters }
            : current.parameters,
          slicer: updates.slicer
            ? { ...current.slicer, ...updates.slicer }
            : current.slicer
        }
      };
    });
  }, [fractalType]);

  /**
   * Resets the camera view and slicer to the default configuration for the current fractal type.
   */
  const resetView = useCallback(() => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    if (config) {
      updateCurrentView({
        zoom: config.zoom,
        offset: new THREE.Vector3(...config.offset),
        rotation: new THREE.Quaternion().setFromEuler(config.rotation),
        parameters: { ...config.parameters },
        slicer: { ...config.slicer }
      });
    }
  }, [fractalType, updateCurrentView]);

  // --- Lifecycle Hooks ---

  /**
   * Effect: Handle fractal type changes.
   * User wants to reset view on switch but keep slicer setting, 
   * unless it's the first time for Apollonian.
   */
  useEffect(() => {
    // Reset view to default when switching models as requested
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    if (config) {
      updateCurrentView({
        zoom: config.zoom,
        offset: new THREE.Vector3(...config.offset),
        rotation: new THREE.Quaternion().setFromEuler(config.rotation),
        parameters: { ...config.parameters },
        slicer: { ...config.slicer }
      });
    }
  }, [fractalType]);

  /**
   * Effect: Handle Page Visibility API to pause rendering when the tab is hidden.
   * This prevents unnecessary background processing and saves battery.
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    const handleResize = () => {
      resetView();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
    };
  }, [resetView]);

  /**
   * Effect: Handle settle timer.
   * Increments when not interacting, used for progressive detail.
   * Only runs when the app is visible to save battery.
   */
  useEffect(() => {
    if (!isVisible) return;
    
    // Only run the timer if we are interacting or not yet settled
    if (settleTime >= 1.0 && !isInteracting) return;

    const interval = setInterval(() => {
      if (isInteracting) {
        setSettleTime(0);
      } else {
        setSettleTime((prev) => {
          if (prev >= 1.0) return 1.0;
          return Math.min(1.0, prev + 0.02);
        });
      }
    }, 16); // ~60fps target

    return () => clearInterval(interval);
  }, [isInteracting, isVisible, settleTime >= 1.0]);

  /**
   * Effect: Handle mouse wheel zoom events.
   * Uses a logarithmic scale for smoother zooming at different scales.
   */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const now = performance.now();
      lastActualMoveTimeRef.current = now;
      
      setIsInteracting(true);
      setInteractionType(2); // Zoom
      setSettleTime(0);
      
      // Throttle camera state updates to ~60fps
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      interactionStartTimeRef.current = now;

      // Clear existing timeout
      if (wheelTimeoutRef.current) {
        clearTimeout(wheelTimeoutRef.current);
      }

      // Set timeout to end interaction
      wheelTimeoutRef.current = setTimeout(() => {
        setIsInteracting(false);
        setInteractionType(0);
        wheelTimeoutRef.current = null;
      }, 200);

      const delta = -e.deltaY * 0.001;
      setFractalViews(prev => {
        const current = prev[fractalType];
        const nextZoom = current.zoom * Math.exp(delta);
        return {
          ...prev,
          [fractalType]: {
            ...current,
            zoom: Math.max(0.0001, Math.min(100.0, nextZoom))
          }
        };
      });
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [fractalType]);

  // --- Interaction Handlers ---

  /**
   * Handles the start of a touch interaction.
   * Supports both single-touch (rotation/panning) and multi-touch (pinching for zoom).
   */
  const handleTouchStart = (e: ReactTouchEvent) => {
    setIsInteracting(true);
    setSettleTime(0);
    interactionStartTimeRef.current = performance.now();
    
    if (e.touches.length === 1) {
      // Single touch: track position for rotation
      setInteractionType(1); // Pan/Rotate
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Multi-touch: track distance for pinch-to-zoom
      setInteractionType(2); // Zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 3) {
      // Three-finger touch: track position for panning
      setInteractionType(1); // Pan/Rotate
      // Use the average position of the three fingers
      const avgX = (e.touches[0].clientX + e.touches[1].clientX + e.touches[2].clientX) / 3;
      const avgY = (e.touches[0].clientY + e.touches[1].clientY + e.touches[2].clientY) / 3;
      lastTouchRef.current = { x: avgX, y: avgY };
    }
  };

  /**
   * Handles mouse down events for rotation or panning.
   * Resets settle time to trigger interactive (low-detail) rendering.
   */
  const handleMouseDown = (e: ReactMouseEvent) => {
    setIsInteracting(true);
    setInteractionType(1); // Pan/Rotate
    setSettleTime(0);
    interactionStartTimeRef.current = performance.now();
    lastTouchRef.current = { x: e.clientX, y: e.clientY };
  };

  /**
   * Handles mouse move events for rotation or panning.
   * Implements zoom-aware sensitivity scaling to ensure consistent movement
   * regardless of magnification level.
   */
  const handleMouseMove = (e: ReactMouseEvent) => {
    if (isInteracting && lastTouchRef.current && !('touches' in e)) {
      const now = performance.now();
      lastActualMoveTimeRef.current = now;
      
      // Throttle camera state updates to ~60fps to prevent main thread saturation
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      const dx = e.clientX - lastTouchRef.current.x;
      const dy = e.clientY - lastTouchRef.current.y;

      setFractalViews(prev => {
        const current = prev[fractalType];
        
        if (e.shiftKey) {
          // Shift + Drag: Panning
          // Panning sensitivity scales inversely with zoom relative to the fractal's default scale.
          const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
          // Boost sensitivity for Julia set (type 2) as it feels too slow when zoomed in
          const baseSensitivity = fractalType === 2 ? 0.005 : 0.0012;
          const panSensitivity = baseSensitivity * (defaultConfig.zoom / current.zoom);
          
          // Calculate camera-relative right and up vectors
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(current.rotation);
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(current.rotation);
          
          const deltaPan = right.multiplyScalar(-dx * panSensitivity).add(up.multiplyScalar(dy * panSensitivity));
          
          return {
            ...prev,
            [fractalType]: {
              ...current,
              offset: current.offset.clone().add(deltaPan)
            }
          };
        } else {
          // Normal Drag: Rotation
          // Rotation sensitivity also scales with zoom to allow for finer control at high zoom levels.
          const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
          // Boost sensitivity for Julia set (type 2) as it feels too slow when zoomed in
          const baseSensitivity = fractalType === 2 ? 0.012 : 0.003;
          const rotSensitivity = baseSensitivity * (defaultConfig.zoom / current.zoom);
          
          // Calculate camera-relative rotation
          const deltaRotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * rotSensitivity);
          const deltaRotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * rotSensitivity);
          
          // Apply rotations: Y is applied globally (turntable), X is applied locally
          const nextRotation = current.rotation.clone().multiply(deltaRotX).premultiply(deltaRotY);
          
          return {
            ...prev,
            [fractalType]: {
              ...current,
              rotation: nextRotation
            }
          };
        }
      });

      lastTouchRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  /**
   * Handles mouse up events.
   */
  const handleMouseUp = () => {
    setIsInteracting(false);
    setInteractionType(0);
    lastTouchRef.current = null;
  };

  /**
   * Handles touch movement during interaction.
   * Implements rotation logic with sensitivity dampening based on zoom level.
   */
  const handleTouchMove = (e: ReactTouchEvent) => {
    const now = performance.now();
    lastActualMoveTimeRef.current = now;

    if (e.touches.length === 1 && lastTouchRef.current) {
      // Throttle camera state updates to ~60fps
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      // Single finger: Rotation
      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchRef.current.x;
      const dy = touch.clientY - lastTouchRef.current.y;

      setFractalViews(prev => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
        // Boost sensitivity for Julia set (type 2) as it feels too slow when zoomed in
        const baseSensitivity = fractalType === 2 ? 0.012 : 0.003;
        const rotSensitivity = baseSensitivity * (defaultConfig.zoom / current.zoom);
        
        const deltaRotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * rotSensitivity);
        const deltaRotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * rotSensitivity);
        const nextRotation = current.rotation.clone().multiply(deltaRotX).premultiply(deltaRotY);
        
        return {
          ...prev,
          [fractalType]: {
            ...current,
            rotation: nextRotation
          }
        };
      });

      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current) {
      // Throttle camera state updates to ~60fps
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      // Two fingers: Pinch-to-zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = dist / lastPinchDistRef.current;

      setFractalViews(prev => {
        const current = prev[fractalType];
        const nextZoom = current.zoom * delta;
        return {
          ...prev,
          [fractalType]: {
            ...current,
            zoom: Math.max(0.0001, Math.min(100.0, nextZoom))
          }
        };
      });

      lastPinchDistRef.current = dist;
    } else if (e.touches.length === 3 && lastTouchRef.current) {
      // Throttle camera state updates to ~60fps
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      // Three fingers: Panning
      const avgX = (e.touches[0].clientX + e.touches[1].clientX + e.touches[2].clientX) / 3;
      const avgY = (e.touches[0].clientY + e.touches[1].clientY + e.touches[2].clientY) / 3;
      
      const dx = avgX - lastTouchRef.current.x;
      const dy = avgY - lastTouchRef.current.y;

      setFractalViews(prev => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
        // Boost sensitivity for Julia set (type 2) as it feels too slow when zoomed in
        const baseSensitivity = fractalType === 2 ? 0.005 : 0.0012;
        const panSensitivity = baseSensitivity * (defaultConfig.zoom / current.zoom);
        
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(current.rotation);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(current.rotation);
        const deltaPan = right.multiplyScalar(-dx * panSensitivity).add(up.multiplyScalar(dy * panSensitivity));
        
        return {
          ...prev,
          [fractalType]: {
            ...current,
            offset: current.offset.clone().add(deltaPan)
          }
        };
      });

      lastTouchRef.current = { x: avgX, y: avgY };
    }
  };

  /**
   * Handles the end of a touch interaction.
   * Resets interaction flags and refs.
   */
  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length === 0) {
      setIsInteracting(false);
      setInteractionType(0);
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
    } else {
      // Re-initialize tracking for the remaining fingers
      handleTouchStart(e);
    }
  };

  /**
   * Callback for frame timings from the renderer.
   * Used to adaptively adjust iteration counts to target 30fps (interactive) or 15fps (settled).
   * This ensures that the app remains performant on a wide range of devices.
   */
  const handleFrameTime = useCallback((delta: number) => {
    const now = performance.now();
    const currentConfig = FRACTAL_CONFIGS[fractalType.toString()];
    const userOffset = parameters.qualityOffset * parameters.qualityStep;

    // Exponential smoothing for frame delta to prevent "popping"
    // We use a faster smoothing factor for interactive mode to respond quickly to lag,
    // and a slower one for settled mode to keep the quality stable.
    const smoothingFactor = isInteracting ? 0.2 : 0.05;
    const prevSmoothed = smoothedDeltaRef.current[fractalType] ?? delta;
    const smoothedDelta = prevSmoothed * (1 - smoothingFactor) + delta * smoothingFactor;
    smoothedDeltaRef.current[fractalType] = smoothedDelta;

    if (isInteracting) {
      // Interactive mode: target 30fps for smooth navigation
      const targetFrameTime = 1 / 30; // 33.3ms
      
      // Calculate how long we've been interacting to adjust aggressiveness.
      // We want the iteration count to snap quickly to the target FPS when interaction starts,
      // then settle into a smoother adjustment phase.
      const interactionDuration = now - interactionStartTimeRef.current;
      
      // Aggressiveness starts high (8.0) and decays exponentially to 1.0 over ~1 second.
      const aggressiveness = Math.max(1.0, 8.0 * Math.exp(-interactionDuration / 1000));
      
      // Normalize delta to ignore the user's quality offset impact.
      // This ensures the adaptive logic targets the base performance of the device.
      const currentBase = adaptiveIterations[fractalType];
      const totalIter = Math.max(1, currentBase + userOffset);
      const normalizedDelta = smoothedDelta * (currentBase / totalIter);

      setAdaptiveIterations(prev => {
        const current = prev[fractalType];
        let nextIter = current;
        
        if (normalizedDelta > targetFrameTime * 1.5) {
          // Very slow: drop iterations even more aggressively to recover frame rate immediately
          nextIter = Math.max(currentConfig.minInteractiveIterations, nextIter - 2.5 * aggressiveness);
        } else if (normalizedDelta > targetFrameTime * 1.1) {
          // Too slow: decrease iterations aggressively at the start of interaction.
          nextIter = Math.max(currentConfig.minInteractiveIterations, nextIter - 0.8 * aggressiveness);
        } else if (normalizedDelta < targetFrameTime * 0.9) {
          // Fast enough: increase iterations to improve quality.
          nextIter = Math.min(currentConfig.maxInteractiveIterations, nextIter + 0.3 * aggressiveness);
        }
        
        if (nextIter === current) return prev;
        
        // Throttle state updates to prevent React re-render overhead from becoming the bottleneck.
        // While actively moving, we keep the throttle low (16ms) to ensure the shader responds.
        const isActuallyMoving = now - lastActualMoveTimeRef.current < 100;
        const throttleTime = isActuallyMoving ? 16 : Math.max(16, Math.min(100, interactionDuration / 10));
        
        if (now - lastAdaptiveUpdateRef.current < throttleTime) return prev;
        lastAdaptiveUpdateRef.current = now;
        
        return { ...prev, [fractalType]: nextIter };
      });
    } else {
      // Settled mode: target 15fps for higher detail when static
      const targetFrameTime = 1 / 15; // 66.6ms
      
      // Normalize delta to ignore the user's quality offset impact
      const currentBase = adaptiveSettledIterations[fractalType];
      const totalIter = Math.max(1, currentBase + userOffset);
      const normalizedDelta = smoothedDelta * (currentBase / totalIter);

      setAdaptiveSettledIterations(prev => {
        const current = prev[fractalType];
        let nextIter = current;
        
        if (normalizedDelta > targetFrameTime * 1.1) {
          // Too slow, decrease settled iterations
          nextIter = Math.max(currentConfig.minSettledIterations, nextIter - 1.0);
        } else if (normalizedDelta < targetFrameTime * 0.9) {
          // Fast enough, increase settled iterations
          nextIter = Math.min(currentConfig.maxSettledIterations, nextIter + 0.5);
        }
        
        if (nextIter === current) return prev;
        
        // Throttle state updates to ~5fps for settled mode as it's less critical
        if (now - lastSettledAdaptiveUpdateRef.current < 200) return prev;
        lastSettledAdaptiveUpdateRef.current = now;
        
        return { ...prev, [fractalType]: nextIter };
      });
    }
  }, [isInteracting, fractalType, parameters.qualityOffset, parameters.qualityStep, adaptiveIterations, adaptiveSettledIterations]);

  // --- Render ---

  return (
    <div 
      className="w-full h-[100dvh] bg-black relative touch-none overflow-hidden" 
      ref={containerRef}
    >
      {/* Branding & Navigation Overlay */}
      <div className={`absolute top-4 left-4 sm:top-8 sm:left-8 z-10 flex flex-col gap-1.5 pointer-events-none transition-opacity duration-500 ${isDragging ? 'opacity-20' : 'opacity-100'}`}>
        <h1 className="text-cyan-400 font-mono font-bold uppercase tracking-[0.4em] text-xs sm:text-base drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
          Fractal Diver
        </h1>
        <div className="h-[1px] w-12 bg-cyan-500/50" />
        <div className="flex flex-col gap-0.5">
          <div className="text-cyan-500/40 text-[8px] sm:text-[9px] uppercase font-mono tracking-[0.2em]">
            Drag to Rotate • Shift+Drag to Pan
          </div>
          <div className="text-cyan-500/40 text-[8px] sm:text-[9px] uppercase font-mono tracking-[0.2em]">
            Scroll or Pinch to Zoom
          </div>
        </div>
      </div>

      {/* 
        The FractalCanvas component handles the WebGPU rendering logic.
        We pass all camera and interaction state as props.
      */}
      <FractalCanvas 
        fractalType={fractalType} 
        zoom={zoom} 
        offset={offset} 
        rotation={rotation}
        parameters={parameters}
        isInteracting={isInteracting}
        interactionType={interactionType}
        adaptiveIterations={adaptiveIterations[fractalType] + (parameters.qualityOffset * parameters.qualityStep)}
        adaptiveSettledIterations={adaptiveSettledIterations[fractalType] + (parameters.qualityOffset * parameters.qualityStep)}
        onFrameTime={handleFrameTime}
        settleTime={settleTime}
        isVisible={isVisible}
        slicerEnabled={slicer.enabled}
        slicerOffset={slicer.offset}
        slicerAxis={slicer.axis}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* UI Controls Overlay - Futuristic Styling */}
      <div 
        data-testid="ui-controls-overlay"
        className={`absolute bottom-8 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-10 flex flex-col items-end gap-3 max-w-full sm:max-w-[400px] transition-opacity duration-300 ${isDragging && !draggingParam ? 'opacity-20' : 'opacity-100'}`}
      >
        
        {/* Main Controls Group */}
        <div 
          data-testid="main-controls-group"
          className={`flex items-center gap-1 p-1 bg-black/60 backdrop-blur-2xl border border-cyan-500/40 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.25)] w-full sm:w-auto overflow-x-auto no-scrollbar transition-opacity duration-300 ${draggingParam ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
        >
          
          {/* Fractal Selection Menu */}
          <Select 
            value={fractalType.toString()} 
            onValueChange={(value) => {
              const nextType = parseInt(value as string, 10);
              setFractalType(nextType);
              const config = FRACTAL_CONFIGS[nextType.toString()];
              if (config?.slicer.enabled) {
                setSlicerExpanded(false);
              } else {
                setSlicerExpanded(true);
              }
            }}
          >
            <SelectTrigger className="w-[140px] sm:w-[160px] bg-transparent text-cyan-400 border-none focus:ring-0 font-mono uppercase tracking-wider text-[10px] sm:text-[11px] h-11 hover:text-cyan-300 transition-colors px-3 sm:px-4">
              <SelectValue>
                {FRACTAL_NAMES[fractalType.toString()]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-black/95 backdrop-blur-3xl border border-cyan-500/40 text-cyan-400 font-mono uppercase text-[11px]">
              {Object.entries(FRACTAL_NAMES).map(([val, name]) => (
                <SelectItem key={val} value={val} className="focus:bg-cyan-400 focus:text-black cursor-pointer py-3">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Reset View Button */}
          <Button 
            onClick={resetView} 
            variant="ghost"
            className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 font-mono uppercase tracking-widest text-[10px] sm:text-[11px] h-11 px-3 sm:px-5 border-l border-cyan-500/20 rounded-none shrink-0"
          >
            Reset
          </Button>

          {/* Slicer Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-l border-cyan-500/20 h-11 shrink-0">
            <div 
              data-testid="slicer-toggle"
              onClick={() => {
                const newState = !slicer.enabled;
                updateCurrentView({ slicer: { enabled: newState } });
                if (newState) setSlicerExpanded(true);
              }}
              className={`w-8 sm:w-10 h-4 sm:h-5 rounded-full relative cursor-pointer transition-colors duration-300 ${slicer.enabled ? 'bg-cyan-500' : 'bg-gray-800'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-3 sm:w-4 h-3 sm:h-4 rounded-full bg-white transition-transform duration-300 ${slicer.enabled ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0'}`} />
            </div>
            <span className={`text-[10px] sm:text-[11px] font-mono uppercase tracking-tight ${slicer.enabled ? 'text-cyan-400' : 'text-gray-500'}`}>
              Slicer
            </span>
          </div>

          {/* Parameters Toggle */}
          <Button 
            onClick={() => setParamsEnabled(!paramsEnabled)} 
            variant="ghost"
            aria-label="Settings"
            className={`h-11 px-3 sm:px-4 border-l border-cyan-500/20 rounded-none transition-colors shrink-0 ${paramsEnabled ? 'text-cyan-300 bg-cyan-500/20' : 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10'}`}
          >
            <Settings2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Fractal Parameters Panel */}
        {paramsEnabled && (
          <div 
            data-testid="parameters-panel"
            className={`w-full sm:w-80 p-4 sm:p-5 bg-black/70 backdrop-blur-3xl border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-500 transition-opacity max-h-[40dvh] sm:max-h-[60dvh] overflow-y-auto ${isDragging && !draggingParam ? 'opacity-20' : 'opacity-100'}`}
          >
            <div className="flex flex-col gap-4 sm:gap-5">
              <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-3">
                <Settings2 className="w-3 h-3 text-cyan-500" />
                <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-[0.2em]">Fractal Parameters</span>
              </div>

              {/* Quality Offset Slider */}
              <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'quality' ? 'opacity-20' : 'opacity-100'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-mono uppercase text-cyan-500/60">Render Quality</span>
                  <span className="text-[10px] font-mono text-cyan-400">
                    {parameters.qualityOffset > 0 ? `+${parameters.qualityOffset}` : parameters.qualityOffset}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[8px] font-mono text-cyan-500/40 uppercase">Low</span>
                  <input 
                    type="range" 
                    aria-label="Quality"
                    min="-10" 
                    max="10" 
                    step="1"
                    value={parameters.qualityOffset}
                    onMouseDown={() => { setIsDragging(true); setDraggingParam('quality'); }}
                    onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                    onTouchStart={() => { setIsDragging(true); setDraggingParam('quality'); }}
                    onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                    onChange={(e) => updateCurrentView({ parameters: { qualityOffset: parseInt(e.target.value) } })}
                    className="flex-1 h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                  />
                  <span className="text-[8px] font-mono text-cyan-500/40 uppercase">High</span>
                </div>
              </div>

              {/* Dynamic Parameter 1 */}
              {fractalType !== 2 && ( // Julia uses p2, p3
                <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'p1' ? 'opacity-20' : 'opacity-100'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                      {fractalType === 0 ? 'Power' : (fractalType === 1 || fractalType === 3 || fractalType === 4) ? 'Scale' : 'Param 1'}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400">{parameters.p1.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" 
                    min={fractalType === 0 ? "2" : "1"} 
                    max={fractalType === 0 ? "20" : (fractalType === 1 ? "12" : "5")} 
                    step="0.01"
                    value={parameters.p1}
                    onMouseDown={() => { setIsDragging(true); setDraggingParam('p1'); }}
                    onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                    onTouchStart={() => { setIsDragging(true); setDraggingParam('p1'); }}
                    onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                    onChange={(e) => updateCurrentView({ parameters: { p1: parseFloat(e.target.value) } })}
                    className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                  />
                </div>
              )}

              {/* Dynamic Parameter 2 & 3 (Julia C or Mandelbox Radius) */}
              {(fractalType === 2 || fractalType === 4) && (
                <>
                  <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'p2' ? 'opacity-20' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                        {fractalType === 2 ? 'C Real' : 'Min Radius'}
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400">{parameters.p2.toFixed(3)}</span>
                    </div>
                    <input 
                      type="range" 
                      min={fractalType === 2 ? "-2" : "0.01"} 
                      max={fractalType === 2 ? "2" : "2"} 
                      step="0.001"
                      value={parameters.p2}
                      onMouseDown={() => { setIsDragging(true); setDraggingParam('p2'); }}
                      onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                      onTouchStart={() => { setIsDragging(true); setDraggingParam('p2'); }}
                      onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                      onChange={(e) => updateCurrentView({ parameters: { p2: parseFloat(e.target.value) } })}
                      className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                    />
                  </div>
                  <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'p3' ? 'opacity-20' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                        {fractalType === 2 ? 'C Imag' : 'Fixed Radius'}
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400">{parameters.p3.toFixed(3)}</span>
                    </div>
                    <input 
                      type="range" 
                      min={fractalType === 2 ? "-2" : "0.1"} 
                      max={fractalType === 2 ? "2" : "3"} 
                      step="0.001"
                      value={parameters.p3}
                      onMouseDown={() => { setIsDragging(true); setDraggingParam('p3'); }}
                      onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                      onTouchStart={() => { setIsDragging(true); setDraggingParam('p3'); }}
                      onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                      onChange={(e) => updateCurrentView({ parameters: { p3: parseFloat(e.target.value) } })}
                      className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Advanced Slicer Panel */}
        {slicer.enabled && (
          <div className={`w-full sm:w-72 bg-black/70 backdrop-blur-3xl border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden transition-opacity max-h-[30vh] sm:max-h-[40vh] overflow-y-auto ${isDragging && draggingParam !== 'slicer' ? 'opacity-20' : 'opacity-100'}`}>
            <div 
              className="flex items-center justify-between px-5 py-3 border-b border-cyan-500/10 cursor-pointer hover:bg-cyan-500/5 transition-colors"
              onClick={() => setSlicerExpanded(!slicerExpanded)}
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full bg-cyan-500 ${slicer.enabled ? 'animate-pulse' : ''}`} />
                <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-[0.2em]">Slicer Controls</span>
              </div>
              {slicerExpanded ? <ChevronDown className="w-4 h-4 text-cyan-500" /> : <ChevronRight className="w-4 h-4 text-cyan-500" />}
            </div>

            {slicerExpanded && (
              <div className="p-5 flex flex-col gap-5">
                {/* Axis Selection */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono uppercase text-cyan-500/70 tracking-[0.2em]">Axis</span>
                  <div className="flex gap-1.5">
                    {[
                      { id: 0, label: 'X' },
                      { id: 1, label: 'Y' },
                      { id: 2, label: 'Z' }
                    ].map((axis) => (
                      <button
                        key={axis.id}
                        onClick={() => updateCurrentView({ slicer: { axis: axis.id } })}
                        className={`flex-1 py-2 rounded-lg font-mono text-[10px] sm:text-[11px] uppercase transition-all duration-300 border ${
                          slicer.axis === axis.id 
                            ? 'bg-cyan-500/30 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                            : 'bg-transparent border-cyan-500/10 text-gray-500 hover:border-cyan-500/30'
                        }`}
                      >
                        {axis.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Offset Slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase text-cyan-500/70 tracking-[0.2em]">Shift</span>
                    <span className="text-[11px] font-mono text-cyan-400 tabular-nums">{slicer.offset.toFixed(2)}</span>
                  </div>
                  <div className="relative h-8 flex items-center">
                    <div className="absolute w-full h-[2px] bg-cyan-500/20" />
                    <input 
                      type="range" 
                      min="-2" 
                      max="2" 
                      step="0.01"
                      value={slicer.offset}
                      onMouseDown={() => { setIsDragging(true); setDraggingParam('slicer'); }}
                      onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                      onTouchStart={() => { setIsDragging(true); setDraggingParam('slicer'); }}
                      onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                      onChange={(e) => updateCurrentView({ slicer: { offset: parseFloat(e.target.value) } })}
                      className="w-full h-2 bg-transparent appearance-none cursor-pointer accent-cyan-400 relative z-10"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
