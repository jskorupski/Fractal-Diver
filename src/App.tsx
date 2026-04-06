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
    offset: [number, number];
    rotation: THREE.Euler;
    parameters: {
      iterations: number;
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
        offset: [...config.offset],
        rotation: config.rotation.clone(),
        parameters: { ...config.parameters },
        slicer: { ...config.slicer }
      };
    });
    return initial;
  });

  // Parameters panel state
  const [paramsEnabled, setParamsEnabled] = useState<boolean>(false);
  const [slicerExpanded, setSlicerExpanded] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // Refs for tracking interaction state across frames
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);

  // Interaction and visibility states
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [settleTime, setSettleTime] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  
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
    offset: [number, number]; 
    rotation: THREE.Euler;
    parameters: Partial<{ iterations: number; p1: number; p2: number; p3: number }>;
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
        offset: [...config.offset],
        rotation: config.rotation.clone(),
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
        offset: [...config.offset],
        rotation: config.rotation.clone(),
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

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  /**
   * Effect: Handle settle timer.
   * Increments when not interacting, used for progressive detail.
   * Only runs when the app is visible to save battery.
   */
  useEffect(() => {
    if (!isVisible) return;

    let frame: number;
    const update = () => {
      if (!isInteracting) {
        setSettleTime((prev) => {
          if (prev >= 1.0) return 1.0; // Stop updating once settled
          return Math.min(1.0, prev + 0.02);
        });
      } else {
        setSettleTime(0);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isInteracting, isVisible]);

  /**
   * Effect: Handle mouse wheel zoom events.
   * Uses a logarithmic scale for smoother zooming at different scales.
   */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
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
    if (e.touches.length === 1) {
      // Single touch: track position for rotation
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Multi-touch: track distance for pinch-to-zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 3) {
      // Three-finger touch: track position for panning
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
    setSettleTime(0);
    lastTouchRef.current = { x: e.clientX, y: e.clientY };
  };

  /**
   * Handles mouse move events for rotation or panning.
   * Implements zoom-aware sensitivity scaling to ensure consistent movement
   * regardless of magnification level.
   */
  const handleMouseMove = (e: ReactMouseEvent) => {
    if (isInteracting && lastTouchRef.current && !('touches' in e)) {
      const dx = e.clientX - lastTouchRef.current.x;
      const dy = e.clientY - lastTouchRef.current.y;

      setFractalViews(prev => {
        const current = prev[fractalType];
        
        if (e.shiftKey) {
          // Shift + Drag: Panning
          // Panning sensitivity scales inversely with zoom relative to the fractal's default scale.
          // This maintains a constant "perceived" speed on screen.
          const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
          const panSensitivity = 0.0012 * (defaultConfig.zoom / current.zoom);
          return {
            ...prev,
            [fractalType]: {
              ...current,
              offset: [
                current.offset[0] - dx * panSensitivity,
                current.offset[1] + dy * panSensitivity
              ]
            }
          };
        } else {
          // Normal Drag: Rotation
          // Rotation sensitivity also scales with zoom to allow for finer control at high zoom levels.
          const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
          const rotSensitivity = 0.003 * (defaultConfig.zoom / current.zoom);
          return {
            ...prev,
            [fractalType]: {
              ...current,
              rotation: new THREE.Euler(
                current.rotation.x + dy * rotSensitivity,
                current.rotation.y + dx * rotSensitivity,
                current.rotation.z
              )
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
    lastTouchRef.current = null;
  };

  /**
   * Handles touch movement during interaction.
   * Implements rotation logic with sensitivity dampening based on zoom level.
   */
  const handleTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 1 && lastTouchRef.current) {
      // Single finger: Rotation
      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchRef.current.x;
      const dy = touch.clientY - lastTouchRef.current.y;

      setFractalViews(prev => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
        const rotSensitivity = 0.003 * (defaultConfig.zoom / current.zoom);
        return {
          ...prev,
          [fractalType]: {
            ...current,
            rotation: new THREE.Euler(
              current.rotation.x + dy * rotSensitivity,
              current.rotation.y + dx * rotSensitivity,
              current.rotation.z
            )
          }
        };
      });

      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current) {
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
      // Three fingers: Panning
      const avgX = (e.touches[0].clientX + e.touches[1].clientX + e.touches[2].clientX) / 3;
      const avgY = (e.touches[0].clientY + e.touches[1].clientY + e.touches[2].clientY) / 3;
      
      const dx = avgX - lastTouchRef.current.x;
      const dy = avgY - lastTouchRef.current.y;

      setFractalViews(prev => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
        const panSensitivity = 0.0012 * (defaultConfig.zoom / current.zoom);
        return {
          ...prev,
          [fractalType]: {
            ...current,
            offset: [
              current.offset[0] - dx * panSensitivity,
              current.offset[1] + dy * panSensitivity
            ]
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
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
    } else {
      // Re-initialize tracking for the remaining fingers
      handleTouchStart(e);
    }
  };

  // --- Render ---

  return (
    <div 
      className="w-full h-screen bg-black relative touch-none overflow-hidden" 
      ref={containerRef}
    >
      {/* Branding & Navigation Overlay */}
      <div className="absolute top-8 left-8 z-10 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Fractal Diver Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" referrerPolicy="no-referrer" />
          <h1 className="text-cyan-400 font-mono font-bold uppercase tracking-[0.4em] text-sm sm:text-base drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
            Fractal Diver
          </h1>
        </div>
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
      <div className={`absolute bottom-6 right-6 z-10 flex flex-col items-end gap-3 max-w-[95vw] transition-opacity duration-300 ${isDragging ? 'opacity-20' : 'opacity-100'}`}>
        
        {/* Main Controls Group */}
        <div className="flex items-center gap-1 p-1 bg-black/60 backdrop-blur-2xl border border-cyan-500/40 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.2)] overflow-x-auto no-scrollbar max-w-full">
          
          {/* Fractal Selection Menu */}
          <Select 
            value={fractalType.toString()} 
            onValueChange={(value) => setFractalType(parseInt(value as string, 10))}
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
          <div className={`w-full sm:w-80 p-4 sm:p-5 bg-black/70 backdrop-blur-3xl border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-500 transition-opacity ${isDragging ? 'opacity-20' : 'opacity-100'}`}>
            <div className="flex flex-col gap-4 sm:gap-5">
              <div className="flex items-center gap-2 border-b border-cyan-500/20 pb-3">
                <Settings2 className="w-3 h-3 text-cyan-500" />
                <span className="text-[10px] font-mono uppercase text-cyan-400 tracking-[0.2em]">Fractal Parameters</span>
              </div>

              {/* Iterations Slider */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-mono uppercase text-cyan-500/60">Iterations</span>
                  <span className="text-[10px] font-mono text-cyan-400">{parameters.iterations}</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="128" 
                  step="1"
                  value={parameters.iterations}
                  onMouseDown={() => setIsDragging(true)}
                  onMouseUp={() => setIsDragging(false)}
                  onTouchStart={() => setIsDragging(true)}
                  onTouchEnd={() => setIsDragging(false)}
                  onChange={(e) => updateCurrentView({ parameters: { iterations: parseInt(e.target.value) } })}
                  className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                />
              </div>

              {/* Dynamic Parameter 1 */}
              {fractalType !== 2 && ( // Julia uses p2, p3
                <div className="flex flex-col gap-2">
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
                    onMouseDown={() => setIsDragging(true)}
                    onMouseUp={() => setIsDragging(false)}
                    onTouchStart={() => setIsDragging(true)}
                    onTouchEnd={() => setIsDragging(false)}
                    onChange={(e) => updateCurrentView({ parameters: { p1: parseFloat(e.target.value) } })}
                    className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                  />
                </div>
              )}

              {/* Dynamic Parameter 2 & 3 (Julia C or Mandelbox Radius) */}
              {(fractalType === 2 || fractalType === 4) && (
                <>
                  <div className="flex flex-col gap-2">
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
                      onMouseDown={() => setIsDragging(true)}
                      onMouseUp={() => setIsDragging(false)}
                      onTouchStart={() => setIsDragging(true)}
                      onTouchEnd={() => setIsDragging(false)}
                      onChange={(e) => updateCurrentView({ parameters: { p2: parseFloat(e.target.value) } })}
                      className="w-full h-1.5 bg-cyan-500/10 appearance-none cursor-pointer accent-cyan-400 rounded-full"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
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
                      onMouseDown={() => setIsDragging(true)}
                      onMouseUp={() => setIsDragging(false)}
                      onTouchStart={() => setIsDragging(true)}
                      onTouchEnd={() => setIsDragging(false)}
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
          <div className={`w-full sm:w-72 bg-black/70 backdrop-blur-3xl border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden transition-opacity ${isDragging ? 'opacity-20' : 'opacity-100'}`}>
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
                      onMouseDown={() => setIsDragging(true)}
                      onMouseUp={() => setIsDragging(false)}
                      onTouchStart={() => setIsDragging(true)}
                      onTouchEnd={() => setIsDragging(false)}
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
