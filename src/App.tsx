/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import FractalCanvas from './components/FractalCanvas';
import DebugPanel from './components/DebugPanel';
import { InteractionInstructions } from './components/InteractionInstructions';
import { FractalSelector } from './components/FractalSelector';
import { SlicerToggle, SlicerPanel } from './components/SlicerControls';
import { ParameterToggle, ParameterPanel } from './components/ParameterControls';
import { FRACTAL_CONFIGS } from './constants/fractals';
import { usePerformanceAdaptation } from './hooks/usePerformanceAdaptation';
import { useFractalInteraction } from './hooks/useFractalInteraction';

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
    parameters: Partial<{ qualityOffset: number; param1: number; param2: number; param3: number }>;
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
    const handleResize = () => {
      const newWidth = window.innerWidth;
      if (Math.abs(newWidth - lastWidth) > 5) {
        setIsSettledQualityLocked(false);
        lastWidth = newWidth;
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
   */
  const handleFrameTime = useCallback((delta: number, isMoving: boolean) => {
    const now = performance.now();
    
    // FPS Tracking
    renderCountRef.current = (renderCountRef.current + 1) % 100;
    framesSinceLastFpsRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      fpsRef.current = Math.round((framesSinceLastFpsRef.current * 1000) / (now - lastFpsTimeRef.current));
      framesSinceLastFpsRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    const isActuallyMoving = (now - lastActualMoveTimeRef.current < 100) || isMoving;
    
    // Smoothly transition settleTime
    if (isInteracting) {
      settleTimeRef.current = 0;
    } else {
      settleTimeRef.current = Math.min(1.0, settleTimeRef.current + delta * 2.5);
    }

    // Adapt performance
    if (!isInteracting && isSettledQualityLocked) return;

    const updated = onFrameTime(delta, now);

    // Lock quality if adaptation is complete
    if (!isInteracting && !updated && settleTimeRef.current >= 1.0 && !isActuallyMoving) {
      setIsSettledQualityLocked(true);
    }
  }, [isInteracting, onFrameTime, isSettledQualityLocked, lastActualMoveTimeRef]);

  // --- Render Calculations ---
  const currentView = fractalViews[fractalType];
  const { zoom, offset, rotation, parameters, slicer } = currentView;
  const zoomFactor = Math.log2(Math.max(1, zoom));

  const finalInteractiveIterations = Math.max(interactiveIterations, interactiveIterations + Math.min(24, zoomFactor * 2.0));
  const finalSettledIterations = Math.max(settledIterations, settledIterations + Math.min(24, zoomFactor * 3.0));

  return (
    <div 
      className="w-full h-[100dvh] bg-black relative touch-none overflow-hidden" 
      ref={containerRef}
      data-testid="app-container"
    >
      <InteractionInstructions isDragging={isDragging} />

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
        interactiveEpsilon={interactiveEpsilon}
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
        className={`absolute bottom-8 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-10 flex flex-col items-end gap-3 max-w-full sm:max-w-[400px] transition-opacity duration-300 ${isDragging && !draggingParam ? 'opacity-20' : 'opacity-100'}`}
      >
        <div 
          data-testid="main-controls-group"
          className={`flex items-center justify-between sm:justify-start gap-1 p-1 bg-black/60 backdrop-blur-2xl border border-cyan-500/40 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.25)] w-full sm:w-auto overflow-x-auto no-scrollbar transition-opacity duration-300 ${draggingParam ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
        >
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
      </div>
    </div>
  );
}
