/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, TouchEvent as ReactTouchEvent, MouseEvent as ReactMouseEvent, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import FractalCanvas from './components/FractalCanvas';
import DebugPanel from './components/DebugPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Button } from './components/ui/button';
import { FRACTAL_NAMES, FRACTAL_CONFIGS } from './constants/fractals';
import { usePerformanceAdaptation } from './hooks/usePerformanceAdaptation';

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
      param1: number;
      param2: number;
      param3: number;
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
  
  // Gesture mode for multi-touch (0: none, 1: zoom, 2: pan)
  const gestureModeRef = useRef<number>(0);
  const pinchStartDistRef = useRef<number>(0);
  const panStartMidpointRef = useRef<{ x: number; y: number } | null>(null);

  // Interaction and visibility states
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [interactionType, setInteractionType] = useState<number>(0); // 0: none, 1: pan/rotate, 2: zoom

  // Use the new performance adaptation hook
  const {
    interactiveEpsilon,
    settledEpsilon,
    interactiveIterations,
    settledIterations,
    onFrameTime,
    overrideKnobs,
    smoothedDelta
  } = usePerformanceAdaptation(fractalType, isInteracting);
  
  const lastActualMoveTimeRef = useRef<number>(0);
  const lastViewUpdateRef = useRef<number>(0);
  
  // Lock for settled quality to prevent continuous rendering
  const settledQualityLockedRef = useRef<boolean>(false);
  const lastSettledDirectionRef = useRef<number>(0);
  
  // FPS and Frame tracking
  const renderCountRef = useRef<number>(0);
  const fpsRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);
  const framesSinceLastFpsRef = useRef<number>(0);
  
  const settleTimeRef = useRef<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  
  // Performance Knobs (Dynamic Overrides)
  const [interactiveSteps, setInteractiveSteps] = useState<number>(FRACTAL_CONFIGS["0"].interactiveSteps);
  const [settledSteps, setSettledSteps] = useState<number>(FRACTAL_CONFIGS["0"].settledSteps);
  
    // Reset performance knobs and locks when fractal type changes
  useEffect(() => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    setInteractiveSteps(config.interactiveSteps);
    setSettledSteps(config.settledSteps);
    
    // Reset settled quality lock
    settledQualityLockedRef.current = false;
    lastSettledDirectionRef.current = 0;
  }, [fractalType]);
  
  const fractalViewsRef = useRef(fractalViews);
  useEffect(() => { fractalViewsRef.current = fractalViews; }, [fractalViews]);
  
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
    parameters: Partial<{ param1: number; param2: number; param3: number }>;
    slicer: Partial<{ enabled: boolean; offset: number; axis: number }>;
  }>) => {
    // Reset settled quality lock when parameters change
    if (updates.parameters || updates.slicer) {
      settledQualityLockedRef.current = false;
      lastSettledDirectionRef.current = 0;
    }

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
   * Effect: Handle mouse wheel zoom events.
   * Uses a logarithmic scale for smoother zooming at different scales.
   */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const now = performance.now();
      lastActualMoveTimeRef.current = now;
      
      startInteraction(2); // Zoom
      
      // Throttle camera state updates to ~60fps
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      // Clear existing timeout
      if (wheelTimeoutRef.current) {
        clearTimeout(wheelTimeoutRef.current);
      }

      // Set timeout to end interaction
      wheelTimeoutRef.current = setTimeout(() => {
        endInteraction();
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
   * Initializes interaction state for any input method (mouse, touch, wheel).
   * Resets adaptive iteration counters and gesture tracking.
   * @param type The type of interaction (1: Pan/Rotate, 2: Zoom/Pan)
   */
  const startInteraction = useCallback((type: number) => {
    setIsInteracting(true);
    setInteractionType(type);
    settleTimeRef.current = 0;
    
    // Reset performance knobs to defaults on new interaction
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    setInteractiveSteps(config.interactiveSteps);
    setSettledSteps(config.settledSteps);
    
    // Reset multi-touch gesture tracking
    gestureModeRef.current = 0; // 0: none, 1: zoom, 2: pan
    
    // Reset settled quality lock
    settledQualityLockedRef.current = false;
    lastSettledDirectionRef.current = 0;
    
    // Reset view update throttle to allow immediate response for new interaction
    lastViewUpdateRef.current = 0;
  }, [fractalType]);

  /**
   * Finalizes interaction state.
   * Resets settled iteration counters to ensure a clean transition to settled mode.
   */
  const endInteraction = useCallback(() => {
    setIsInteracting(false);
    setInteractionType(0);
  }, []);

  /**
   * Handles the start of a touch interaction.
   * Supports both single-touch (rotation/panning) and multi-touch (pinching for zoom).
   */
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch: track position for rotation
      startInteraction(1); // Pan/Rotate
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Multi-touch: track distance for pinch-to-zoom AND midpoint for panning
      startInteraction(2); // Zoom/Pan
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      lastPinchDistRef.current = dist;
      pinchStartDistRef.current = dist;
      
      const avgX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      lastTouchRef.current = { x: avgX, y: avgY };
      panStartMidpointRef.current = { x: avgX, y: avgY };
    }
  };

  /**
   * Handles mouse down events for rotation or panning.
   * Resets settle time to trigger interactive (low-detail) rendering.
   */
  const handleMouseDown = (e: ReactMouseEvent) => {
    startInteraction(1); // Pan/Rotate
    lastTouchRef.current = { x: e.clientX, y: e.clientY };
  };

  /**
   * Helper to calculate a new rotation quaternion based on drag deltas.
   * Inverts horizontal rotation if the camera is upside down.
   */
  const calculateRotation = (currentRotation: THREE.Quaternion, dx: number, dy: number, sensitivity: number) => {
    const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(currentRotation);
    const horizontalDirection = upVector.y < 0 ? -1 : 1;
    
    const deltaRotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * sensitivity);
    const deltaRotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * sensitivity * horizontalDirection);
    
    return currentRotation.clone().multiply(deltaRotX).premultiply(deltaRotY);
  };

  /**
   * Helper to calculate a new offset vector based on drag deltas.
   * Moves the camera relative to its current orientation.
   */
  const calculatePanning = (currentRotation: THREE.Quaternion, currentOffset: THREE.Vector3, dx: number, dy: number, sensitivity: number) => {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(currentRotation);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(currentRotation);
    
    const deltaPan = right.multiplyScalar(-dx * sensitivity).add(up.multiplyScalar(dy * sensitivity));
    return currentOffset.clone().add(deltaPan);
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
          const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
          const baseSensitivity = 0.0012 * defaultConfig.panSensitivityMultiplier;
          const panSensitivity = baseSensitivity * (defaultConfig.zoom / current.zoom);
          
          return {
            ...prev,
            [fractalType]: {
              ...current,
              offset: calculatePanning(current.rotation, current.offset, dx, dy, panSensitivity)
            }
          };
        } else {
          // Normal Drag: Rotation
          const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
          const baseSensitivity = 0.003 * defaultConfig.rotSensitivityMultiplier;
          const rotSensitivity = baseSensitivity * (defaultConfig.zoom / current.zoom);
          
          return {
            ...prev,
            [fractalType]: {
              ...current,
              rotation: calculateRotation(current.rotation, dx, dy, rotSensitivity)
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
    endInteraction();
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
        const baseSensitivity = 0.012 * defaultConfig.rotSensitivityMultiplier;
        const rotSensitivity = baseSensitivity * (defaultConfig.zoom / current.zoom);
        
        return {
          ...prev,
          [fractalType]: {
            ...current,
            rotation: calculateRotation(current.rotation, dx, dy, rotSensitivity)
          }
        };
      });

      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current && lastTouchRef.current) {
      // Throttle camera state updates to ~60fps
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const avgX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      const deltaZoom = dist / lastPinchDistRef.current;
      const deltaX = avgX - lastTouchRef.current.x;
      const deltaY = avgY - lastTouchRef.current.y;

      // Detect gesture type if not already locked
      if (gestureModeRef.current === 0) {
        const pinchDelta = Math.abs(dist - pinchStartDistRef.current);
        const panDeltaX = avgX - (panStartMidpointRef.current?.x || avgX);
        const panDeltaY = avgY - (panStartMidpointRef.current?.y || avgY);
        const panDist = Math.sqrt(panDeltaX * panDeltaX + panDeltaY * panDeltaY);

        // Thresholds for gesture detection (in pixels)
        const PINCH_THRESHOLD = 15;
        const PAN_THRESHOLD = 10;

        if (pinchDelta > PINCH_THRESHOLD && pinchDelta > panDist) {
          gestureModeRef.current = 1; // Zoom
        } else if (panDist > PAN_THRESHOLD && panDist > pinchDelta) {
          gestureModeRef.current = 2; // Pan
        }
      }

      setFractalViews(prev => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
        
        let nextZoom = current.zoom;
        let nextOffset = current.offset.clone();

        if (gestureModeRef.current === 1) {
          // Locked to Zoom
          nextZoom = current.zoom * deltaZoom;
        } else if (gestureModeRef.current === 2) {
          // Locked to Pan
          const basePanSensitivity = 0.0012 * defaultConfig.panSensitivityMultiplier;
          const panSensitivity = basePanSensitivity * (defaultConfig.zoom / current.zoom);
          nextOffset = calculatePanning(current.rotation, current.offset, deltaX, deltaY, panSensitivity);
        }
        
        return {
          ...prev,
          [fractalType]: {
            ...current,
            zoom: Math.max(0.0001, Math.min(100.0, nextZoom)),
            offset: nextOffset
          }
        };
      });

      lastPinchDistRef.current = dist;
      lastTouchRef.current = { x: avgX, y: avgY };
    }
  };

  /**
   * Handles the end of a touch interaction.
   * Resets interaction flags and refs.
   */
  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length === 0) {
      endInteraction();
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
  const handleFrameTime = useCallback((delta: number, isMoving: boolean) => {
    const now = performance.now();
    
    // --- FPS and Render Count Tracking ---
    renderCountRef.current = (renderCountRef.current + 1) % 100;
    framesSinceLastFpsRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      fpsRef.current = Math.round((framesSinceLastFpsRef.current * 1000) / (now - lastFpsTimeRef.current));
      framesSinceLastFpsRef.current = 0;
      lastFpsTimeRef.current = now;
    }
    // -------------------------------------

    const isActuallyMoving = (now - lastActualMoveTimeRef.current < 100) || isMoving;
    
    // Smoothly transition settleTime from 0.0 to 1.0 over ~400ms when not interacting
    if (isInteracting) {
      settleTimeRef.current = 0;
    } else {
      settleTimeRef.current = Math.min(1.0, settleTimeRef.current + delta * 2.5);
    }

    // Delegate to the new performance adaptation hook
    onFrameTime(delta, now);

  }, [isInteracting, onFrameTime]);

  // --- Render Calculations ---

  // Calculate safe minimum iterations for the current view to prevent blocky rendering
  const currentZoom = fractalViews[fractalType].zoom;
  const zoomFactor = Math.log2(Math.max(1, currentZoom));
  const currentConfig = FRACTAL_CONFIGS[fractalType.toString()];
  
  // Continuous Iteration Levels
  const baseInteractiveIter = interactiveIterations;
  const baseSettledIter = settledIterations;

  const zoomMultiplierInteractive = 2.0;
  const finalInteractiveIterations = Math.max(baseInteractiveIter, baseInteractiveIter + Math.min(24, zoomFactor * zoomMultiplierInteractive));

  const zoomMultiplierSettled = 3.0;
  const finalSettledIterations = Math.max(baseSettledIter, baseSettledIter + Math.min(24, zoomFactor * zoomMultiplierSettled));

  // Use adaptive epsilon directly
  const finalInteractiveEpsilon = interactiveEpsilon;
  const finalSettledEpsilon = settledEpsilon;

  return (
    <div 
      className="w-full h-[100dvh] bg-black relative touch-none overflow-hidden" 
      ref={containerRef}
      data-testid="app-container"
    >
      {/* Branding & Navigation Overlay */}
      <div className={`absolute top-4 left-4 sm:top-8 sm:left-8 z-10 flex flex-col gap-1.5 pointer-events-none transition-opacity duration-500 ${isDragging ? 'opacity-20' : 'opacity-100'}`}>
        <h1 className="text-cyan-400 font-mono font-bold uppercase tracking-[0.4em] text-xs sm:text-base drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
          Fractal Diver
        </h1>
        <div className="h-[1px] w-12 bg-cyan-500/50" />
        <div className="flex flex-col gap-0.5">
          <div className="text-cyan-500/40 text-[8px] sm:text-[9px] uppercase font-mono tracking-[0.2em]">
            Drag to Rotate • 2-Finger Drag or Shift+Drag to Pan
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
        adaptiveIterations={finalInteractiveIterations}
        adaptiveSettledIterations={finalSettledIterations}
        interactiveSteps={interactiveSteps}
        settledSteps={settledSteps}
        interactiveEpsilon={finalInteractiveEpsilon}
        settledEpsilon={finalSettledEpsilon}
        onFrameTime={handleFrameTime}
        settleTimeRef={settleTimeRef}
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

              {/* Dynamic Parameter 1 */}
              {fractalType !== 2 && ( // Julia uses p2, p3
                <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'p1' ? 'opacity-20' : 'opacity-100'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                      {fractalType === 0 ? 'Power' : (fractalType === 1 || fractalType === 3 || fractalType === 4) ? 'Scale' : 'Param 1'}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400">{parameters.param1.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" 
                    aria-label={fractalType === 0 ? 'Power' : (fractalType === 1 || fractalType === 3 || fractalType === 4) ? 'Scale' : 'Param 1'}
                    min={fractalType === 0 ? "2" : "1"} 
                    max={fractalType === 0 ? "20" : (fractalType === 1 ? "12" : "5")} 
                    step="0.01"
                    value={parameters.param1}
                    onMouseDown={() => { setIsDragging(true); setDraggingParam('param1'); }}
                    onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                    onTouchStart={() => { setIsDragging(true); setDraggingParam('param1'); }}
                    onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                    onChange={(e) => updateCurrentView({ parameters: { param1: parseFloat(e.target.value) } })}
                    className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                  />
                </div>
              )}

              {/* Dynamic Parameter 2 & 3 (Julia C or Mandelbox Radius) */}
              {(fractalType === 2 || fractalType === 4) && (
                <>
                  <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'param2' ? 'opacity-20' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                        {fractalType === 2 ? 'C Real' : 'Min Radius'}
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400">{parameters.param2.toFixed(3)}</span>
                    </div>
                    <input 
                      type="range" 
                      aria-label={fractalType === 2 ? 'C Real' : 'Min Radius'}
                      min={fractalType === 2 ? "-2" : "0.01"} 
                      max={fractalType === 2 ? "2" : "2"} 
                      step="0.001"
                      value={parameters.param2}
                      onMouseDown={() => { setIsDragging(true); setDraggingParam('param2'); }}
                      onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                      onTouchStart={() => { setIsDragging(true); setDraggingParam('param2'); }}
                      onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                      onChange={(e) => updateCurrentView({ parameters: { param2: parseFloat(e.target.value) } })}
                      className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                    />
                  </div>
                  <div className={`flex flex-col gap-2 transition-opacity duration-300 ${draggingParam && draggingParam !== 'param3' ? 'opacity-20' : 'opacity-100'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono uppercase text-cyan-500/60">
                        {fractalType === 2 ? 'C Imag' : 'Fixed Radius'}
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400">{parameters.param3.toFixed(3)}</span>
                    </div>
                    <input 
                      type="range" 
                      aria-label={fractalType === 2 ? 'C Imag' : 'Fixed Radius'}
                      min={fractalType === 2 ? "-2" : "0.1"} 
                      max={fractalType === 2 ? "2" : "3"} 
                      step="0.001"
                      value={parameters.param3}
                      onMouseDown={() => { setIsDragging(true); setDraggingParam('param3'); }}
                      onMouseUp={() => { setIsDragging(false); setDraggingParam(null); }}
                      onTouchStart={() => { setIsDragging(true); setDraggingParam('param3'); }}
                      onTouchEnd={() => { setIsDragging(false); setDraggingParam(null); }}
                      onChange={(e) => updateCurrentView({ parameters: { param3: parseFloat(e.target.value) } })}
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
                      aria-label="Slicer Offset"
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
        {((import.meta as any).env?.MODE !== 'test') && (
          <DebugPanel 
            currentInteractiveIterations={finalInteractiveIterations}
            currentSettledIterations={finalSettledIterations}
            settleTimeRef={settleTimeRef}
            fractalType={fractalType}
            renderCountRef={renderCountRef}
            fpsRef={fpsRef}
            performanceKnobs={{
              interactiveSteps,
              settledSteps,
              interactiveEpsilon: finalInteractiveEpsilon,
              settledEpsilon: finalSettledEpsilon
            }}
            onUpdateKnobs={(knobs) => {
              overrideKnobs(knobs);
              if (knobs.settledIterations !== undefined || knobs.settledEpsilon !== undefined) {
                settledQualityLockedRef.current = false;
                lastSettledDirectionRef.current = 0;
              }
              if (knobs.interactiveSteps !== undefined) setInteractiveSteps(knobs.interactiveSteps);
              if (knobs.settledSteps !== undefined) setSettledSteps(knobs.settledSteps);
            }}
          />
        )}
      </div>
    </div>
  );
}
