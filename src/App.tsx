/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Code, Bug, Camera, Loader2 } from 'lucide-react';
import FractalCanvas from './components/FractalCanvas';
import DebugPanel from './components/DebugPanel';
import { InteractionInstructions } from './components/InteractionInstructions';
import { FractalSelector } from './components/FractalSelector';
import { SlicerToggle, SlicerPanel } from './components/SlicerControls';
import { ParameterToggle, ParameterPanel } from './components/ParameterControls';
import { FRACTAL_CONFIGS } from './constants/fractals';
import { usePerformanceAdaptation } from './hooks/usePerformanceAdaptation';
import { useFractalInteraction } from './hooks/useFractalInteraction';
import { takeWallpaperScreenshot } from './utils/screenshot';

/**
 * Main Application Component.
 * Manages the state for fractal selection, camera controls, and UI overlays.
 * Orchestrates interaction logic and performance adaptation.
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
      param1: number;
      param2: number;
      param3: number;
      baseColor?: string;
      accentColor?: string;
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
        parameters: { qualityOffset: 0, ...config.parameters },
        slicer: { ...config.slicer }
      };
    });
    return initial;
  });

  // UI Panel states
  const [paramsEnabled, setParamsEnabled] = useState<boolean>(false);
  const [draggingParam, setDraggingParam] = useState<string | null>(null);
  const [slicerExpanded, setSlicerExpanded] = useState<boolean>(() => {
    const config = FRACTAL_CONFIGS["0"];
    return !config?.slicer.enabled;
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [debugExpanded, setDebugExpanded] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  
  // Interaction and visibility states
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [interactionType, setInteractionType] = useState<number>(0); // 0: none, 1: pan/rotate, 2: zoom
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [isSettledQualityLocked, setIsSettledQualityLocked] = useState<boolean>(false);

  // Performance Knobs (Dynamic Overrides)
  const [interactiveSteps, setInteractiveSteps] = useState<number>(FRACTAL_CONFIGS["0"].interactiveSteps);
  const [settledSteps, setSettledSteps] = useState<number>(FRACTAL_CONFIGS["0"].settledSteps);
  
  // Refs for tracking state across frames without triggering re-renders
  const containerRef = useRef<HTMLDivElement>(null);
  const settleTimeRef = useRef<number>(0);
  const renderCountRef = useRef<number>(0);
  const fpsRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(0);
  const framesSinceLastFpsRef = useRef<number>(0);

  // --- Performance Adaptation ---
  const {
    interactiveEpsilon,
    settledEpsilon,
    interactiveIterations,
    settledIterations,
    onFrameTime,
    overrideKnobs
  } = usePerformanceAdaptation(fractalType, isInteracting);

  /**
   * Updates the current fractal view state with a partial update.
   */
  const updateCurrentView = useCallback((updates: Partial<{ 
    zoom: number; 
    offset: THREE.Vector3; 
    rotation: THREE.Quaternion;
    parameters: Partial<{ qualityOffset: number; param1: number; param2: number; param3: number; baseColor: string; accentColor: string }>;
    slicer: Partial<{ enabled: boolean; offset: number; axis: number }>;
  }>) => {
    // Reset settled quality lock when parameters change
    if (updates.parameters || updates.slicer) {
      setIsSettledQualityLocked(false);
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

  // --- Interaction Logic ---
  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    lastActualMoveTimeRef
  } = useFractalInteraction({
    fractalType,
    isInteracting,
    setIsInteracting,
    setInteractionType,
    updateCurrentView,
    setFractalViews,
    settleTimeRef,
    setIsSettledQualityLocked,
    setInteractiveSteps,
    setSettledSteps
  });

  /**
   * Resets the camera view and slicer to the default configuration.
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

  // Sync performance knobs when fractal type changes
  useEffect(() => {
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    setInteractiveSteps(config.interactiveSteps);
    setSettledSteps(config.settledSteps);
    setIsSettledQualityLocked(false);
  }, [fractalType]);

  // Handle window resize to reset settled quality lock
  useEffect(() => {
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      if (Math.abs(newWidth - lastWidth) > 5 || Math.abs(newHeight - lastHeight) > 5) {
        setIsSettledQualityLocked(false);
        lastWidth = newWidth;
        lastHeight = newHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle Page Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Attach wheel listener to container
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  /**
   * Callback for frame timings from the renderer.
   * This is the "Pulse" of the application, orchestrating performance adaptation,
   * smooth transitions ("settling"), and background quality locking.
   */
  const handleFrameTime = useCallback((delta: number, isMoving: boolean) => {
    const now = performance.now();
    
    // Performance optimization: 
    // If not interacting and quality is already locked (maximum quality for current view reached),
    // we stop updating timers and adaptation logic to save CPU/Battery.
    if (!isInteracting && isSettledQualityLocked && !isMoving) {
      return;
    }

    // FPS Tracking (Updated every 1000ms)
    renderCountRef.current = (renderCountRef.current + 1) % 100;
    framesSinceLastFpsRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      fpsRef.current = Math.round((framesSinceLastFpsRef.current * 1000) / (now - lastFpsTimeRef.current));
      framesSinceLastFpsRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    // isActuallyMoving determines if we are still visually updating (momentum zoom, etc)
    const isActuallyMoving = (now - lastActualMoveTimeRef.current < 100) || isMoving;
    
    // Smoothly transition settleTime from 0.0 (interactive) to 1.0 (settled).
    // This TSL uniform is used in shaders to interpolate between interactive and settled precision.
    if (isInteracting) {
      settleTimeRef.current = 0;
    } else {
      settleTimeRef.current = Math.min(1.0, settleTimeRef.current + delta * 2.5);
    }

    // Pipe the frame time into the performance adaptation hook
    const updated = onFrameTime(delta, now);

    // Locking Logic:
    // We lock the quality if:
    // 1. User is not interacting.
    // 2. The adaptation hook reports it has reached a stable point (updated === false).
    // 3. The visual transition to settled mode is complete (settleTime === 1.0).
    // 4. There is no background movement (momentum/animation).
    if (!isInteracting && updated === false && settleTimeRef.current >= 1.0 && !isActuallyMoving) {
      setIsSettledQualityLocked(true);
    }
  }, [isInteracting, onFrameTime, isSettledQualityLocked, lastActualMoveTimeRef]);

  // --- Render Calculations ---
  const currentView = fractalViews[fractalType];
  const { zoom, offset, rotation, parameters, slicer } = currentView;
  
  // zoomFactor represents the doubling of magnification.
  // We use this to provide a "Manual LOD Boost" that stacks with the adaptive systems.
  const zoomFactor = Math.log2(Math.max(1, zoom));

  // Boost iterations as we zoom in to maintain surface detail at extreme scales.
  // We clamp the interactive iterations boost so we don't completely destroy framerate.
  const finalInteractiveIterations = Math.max(interactiveIterations, interactiveIterations + Math.min(12, Math.floor(zoomFactor * 0.5)));
  const finalSettledIterations = Math.max(settledIterations, settledIterations + Math.min(32, Math.floor(zoomFactor * 3.0)));
  
  // Loosen the hit-detection threshold (epsilon) when interacting at high zoom levels
  // to maintain interactive frame rates without completely blowing out the settled quality.
  const finalInteractiveEpsilon = interactiveEpsilon * (1.0 + Math.max(0, zoomFactor * 1.5));
  
  const handleScreenshot = async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      await takeWallpaperScreenshot({
        fractalType,
        zoom,
        offset,
        rotation,
        parameters,
        slicerEnabled: slicer.enabled,
        slicerOffset: slicer.offset,
        slicerAxis: slicer.axis,
        adaptiveSettledIterations: finalSettledIterations,
        settledSteps,
        interactiveSteps,
        interactiveEpsilon: finalInteractiveEpsilon,
        settledEpsilon
      });
    } catch (e) {
      console.error("Screenshot failed", e);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div 
      className="w-full h-[100dvh] bg-black relative touch-none overflow-hidden" 
      ref={containerRef}
      data-testid="app-container"
    >
      <InteractionInstructions isDragging={isDragging} />
      
      {isCapturing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-cyan-400">
          <Loader2 size={48} className="animate-spin mb-6" />
          <h2 className="text-xl sm:text-2xl font-light tracking-widest uppercase mb-2">Rendering Wallpaper</h2>
          <p className="text-white/60 text-sm tracking-wide">Processing at native device resolution...</p>
        </div>
      )}

      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-30 flex items-center gap-2">
        <a
          href="https://github.com/jskorupski/Fractal-Diver"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 h-9 rounded-lg bg-black/40 backdrop-blur-md border border-white/5 hover:border-cyan-500/30 text-white/30 hover:text-cyan-400/80 transition-all duration-300 group text-[10px] font-mono uppercase tracking-wider shadow-lg"
          title="View source on GitHub"
        >
          <Code size={16} className="group-hover:rotate-12 transition-transform duration-300" />
          <span className="hidden sm:inline">Source Code</span>
        </a>

        {((import.meta as any).env?.MODE !== 'test') && (
          <button
            onClick={() => setDebugExpanded(!debugExpanded)}
            className={`flex items-center justify-center w-9 h-9 rounded-lg backdrop-blur-md border transition-all duration-300 group shadow-lg ${
              debugExpanded 
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' 
                : 'bg-black/40 border-white/5 text-white/30 hover:text-cyan-400 hover:border-cyan-500/30'
            }`}
            title={debugExpanded ? "Close Debug Panel" : "Open Debug Panel"}
          >
            <Bug size={16} className={`${debugExpanded ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-300`} />
          </button>
        )}
      </div>

      {((import.meta as any).env?.MODE !== 'test') && (
        <DebugPanel 
          expanded={debugExpanded}
          onClose={() => setDebugExpanded(false)}
          currentInteractiveIterations={finalInteractiveIterations}
          currentSettledIterations={finalSettledIterations}
          settleTimeRef={settleTimeRef}
          fractalType={fractalType}
          renderCountRef={renderCountRef}
          fpsRef={fpsRef}
          performanceKnobs={{
            interactiveSteps,
            settledSteps,
            interactiveEpsilon,
            settledEpsilon
          }}
          onUpdateKnobs={(knobs) => {
            overrideKnobs(knobs);
            if (knobs.settledIterations !== undefined || knobs.settledEpsilon !== undefined) {
              setIsSettledQualityLocked(false);
            }
            if (knobs.interactiveSteps !== undefined) setInteractiveSteps(knobs.interactiveSteps);
            if (knobs.settledSteps !== undefined) setSettledSteps(knobs.settledSteps);
          }}
        />
      )}

      <FractalCanvas 
        {...currentView}
        fractalType={fractalType} 
        isInteracting={isInteracting}
        interactionType={interactionType}
        isSettledQualityLocked={isSettledQualityLocked}
        adaptiveIterations={finalInteractiveIterations}
        adaptiveSettledIterations={finalSettledIterations}
        interactiveSteps={interactiveSteps}
        settledSteps={settledSteps}
        interactiveEpsilon={finalInteractiveEpsilon}
        settledEpsilon={settledEpsilon}
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

      <div 
        data-testid="ui-controls-overlay"
        className={`absolute bottom-8 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-10 flex flex-col items-end gap-3 sm:w-[480px] transition-opacity duration-300 ${isDragging && !draggingParam ? 'opacity-20' : 'opacity-100'}`}
      >
        <div 
          data-testid="main-controls-group"
          className={`flex items-center justify-between sm:justify-start gap-1 p-1 bg-black/60 backdrop-blur-2xl border border-cyan-500/40 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.25)] w-full overflow-x-auto no-scrollbar transition-opacity duration-300 ${draggingParam ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
        >
          <button
            onClick={handleScreenshot}
            disabled={isCapturing}
            className={`flex items-center justify-center w-11 h-11 shrink-0 rounded-lg transition-all duration-300 group ${
              isCapturing
                ? 'bg-cyan-500/20 text-cyan-400 cursor-wait'
                : 'text-white/60 hover:text-cyan-400 hover:bg-cyan-500/10'
            }`}
            title="Download Ultra-HD Wallpaper"
          >
            {isCapturing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Camera size={18} className="group-hover:scale-110 transition-transform duration-300" />
            )}
          </button>

          <div className="w-[1px] h-6 bg-cyan-500/20 shrink-0" />

          <FractalSelector 
            fractalType={fractalType}
            onFractalChange={(type) => {
              setFractalType(type);
              setSlicerExpanded(!FRACTAL_CONFIGS[type.toString()]?.slicer.enabled);
            }}
            onResetView={resetView}
          />

          <SlicerToggle 
            enabled={slicer.enabled}
            onToggle={() => {
              const newState = !slicer.enabled;
              updateCurrentView({ slicer: { enabled: newState } });
              if (newState) setSlicerExpanded(true);
            }}
          />

          <ParameterToggle 
            enabled={paramsEnabled}
            onToggle={() => setParamsEnabled(!paramsEnabled)}
          />
        </div>

        <SlicerPanel 
          {...slicer}
          expanded={slicerExpanded}
          onExpandToggle={() => setSlicerExpanded(!slicerExpanded)}
          onUpdate={(updates) => updateCurrentView({ slicer: updates })}
          isDragging={isDragging}
          draggingParam={draggingParam}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />

        <ParameterPanel 
          fractalType={fractalType}
          parameters={parameters}
          enabled={paramsEnabled}
          onUpdate={(updates) => updateCurrentView({ parameters: updates })}
          isDragging={isDragging}
          draggingParam={draggingParam}
          setIsDragging={setIsDragging}
          setDraggingParam={setDraggingParam}
        />
      </div>
    </div>
  );
}
