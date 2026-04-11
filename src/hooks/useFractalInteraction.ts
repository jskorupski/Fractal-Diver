/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useCallback, TouchEvent as ReactTouchEvent, MouseEvent as ReactMouseEvent, useEffect } from 'react';
import * as THREE from 'three';
import { FRACTAL_CONFIGS } from '../constants/fractals';

interface InteractionProps {
  fractalType: number;
  isInteracting: boolean;
  setIsInteracting: (interacting: boolean) => void;
  setInteractionType: (type: number) => void;
  updateCurrentView: (updates: any) => void;
  setFractalViews: React.Dispatch<React.SetStateAction<any>>;
  settleTimeRef: React.MutableRefObject<number>;
  setIsSettledQualityLocked: (locked: boolean) => void;
  setInteractiveSteps: (steps: number) => void;
  setSettledSteps: (steps: number) => void;
}

/**
 * useFractalInteraction Hook.
 * Manages mouse and touch interactions for navigating the fractal scene.
 * Handles rotation, panning, and zooming with sensitivity scaling.
 */
export function useFractalInteraction({
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
}: InteractionProps) {
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const gestureModeRef = useRef<number>(0); // 0: none, 1: zoom, 2: pan
  const pinchStartDistRef = useRef<number>(0);
  const panStartMidpointRef = useRef<{ x: number; y: number } | null>(null);
  const lastViewUpdateRef = useRef<number>(0);
  const lastActualMoveTimeRef = useRef<number>(0);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Initializes interaction state for any input method.
   */
  const startInteraction = useCallback((type: number) => {
    setIsInteracting(true);
    setInteractionType(type);
    settleTimeRef.current = 0;
    
    const config = FRACTAL_CONFIGS[fractalType.toString()];
    setInteractiveSteps(config.interactiveSteps);
    setSettledSteps(config.settledSteps);
    
    gestureModeRef.current = 0;
    setIsSettledQualityLocked(false);
    lastViewUpdateRef.current = 0;
  }, [fractalType, setIsInteracting, setInteractionType, settleTimeRef, setInteractiveSteps, setSettledSteps, setIsSettledQualityLocked]);

  /**
   * Finalizes interaction state.
   */
  const endInteraction = useCallback(() => {
    setIsInteracting(false);
    setInteractionType(0);
  }, [setIsInteracting, setInteractionType]);

  /**
   * Helper to calculate a new rotation quaternion based on drag deltas.
   */
  const calculateRotation = useCallback((currentRotation: THREE.Quaternion, dx: number, dy: number, sensitivity: number) => {
    const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(currentRotation);
    const horizontalDirection = upVector.y < 0 ? -1 : 1;
    
    const deltaRotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * sensitivity);
    const deltaRotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * sensitivity * horizontalDirection);
    
    return currentRotation.clone().multiply(deltaRotX).premultiply(deltaRotY);
  }, []);

  /**
   * Helper to calculate a new offset vector based on drag deltas.
   */
  const calculatePanning = useCallback((currentRotation: THREE.Quaternion, currentOffset: THREE.Vector3, dx: number, dy: number, sensitivity: number) => {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(currentRotation);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(currentRotation);
    
    const deltaPan = right.multiplyScalar(-dx * sensitivity).add(up.multiplyScalar(dy * sensitivity));
    return currentOffset.clone().add(deltaPan);
  }, []);

  /**
   * Handles touch start events.
   */
  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 1) {
      startInteraction(1);
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      startInteraction(2);
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
  }, [startInteraction]);

  /**
   * Handles touch move events.
   */
  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    const now = performance.now();
    lastActualMoveTimeRef.current = now;

    if (e.touches.length === 1 && lastTouchRef.current) {
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchRef.current.x;
      const dy = touch.clientY - lastTouchRef.current.y;

      setFractalViews((prev: any) => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
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

      if (gestureModeRef.current === 0) {
        const pinchDelta = Math.abs(dist - pinchStartDistRef.current);
        const panDeltaX = avgX - (panStartMidpointRef.current?.x || avgX);
        const panDeltaY = avgY - (panStartMidpointRef.current?.y || avgY);
        const panDist = Math.sqrt(panDeltaX * panDeltaX + panDeltaY * panDeltaY);

        const PINCH_THRESHOLD = 15;
        const PAN_THRESHOLD = 10;

        if (pinchDelta > PINCH_THRESHOLD && pinchDelta > panDist) {
          gestureModeRef.current = 1;
        } else if (panDist > PAN_THRESHOLD && panDist > pinchDelta) {
          gestureModeRef.current = 2;
        }
      }

      setFractalViews((prev: any) => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
        
        let nextZoom = current.zoom;
        let nextOffset = current.offset.clone();

        if (gestureModeRef.current === 1) {
          nextZoom = current.zoom * deltaZoom;
        } else if (gestureModeRef.current === 2) {
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
  }, [fractalType, setFractalViews, calculateRotation, calculatePanning]);

  /**
   * Handles touch end events.
   */
  const handleTouchEnd = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length === 0) {
      endInteraction();
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
    } else {
      handleTouchStart(e);
    }
  }, [endInteraction, handleTouchStart]);

  /**
   * Handles mouse down events.
   */
  const handleMouseDown = useCallback((e: ReactMouseEvent) => {
    startInteraction(1);
    lastTouchRef.current = { x: e.clientX, y: e.clientY };
  }, [startInteraction]);

  /**
   * Handles mouse move events.
   */
  const handleMouseMove = useCallback((e: ReactMouseEvent) => {
    if (isInteracting && lastTouchRef.current && !('touches' in e)) {
      const now = performance.now();
      lastActualMoveTimeRef.current = now;
      
      if (now - lastViewUpdateRef.current < 16) return;
      lastViewUpdateRef.current = now;

      const dx = e.clientX - lastTouchRef.current.x;
      const dy = e.clientY - lastTouchRef.current.y;

      setFractalViews((prev: any) => {
        const current = prev[fractalType];
        const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
        
        if (e.shiftKey) {
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
  }, [isInteracting, fractalType, setFractalViews, calculateRotation, calculatePanning]);

  /**
   * Handles mouse up events.
   */
  const handleMouseUp = useCallback(() => {
    endInteraction();
    lastTouchRef.current = null;
  }, [endInteraction]);

  /**
   * Handles mouse wheel zoom events.
   */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    const now = performance.now();
    lastActualMoveTimeRef.current = now;
    
    startInteraction(2);
    
    if (now - lastViewUpdateRef.current < 16) return;
    lastViewUpdateRef.current = now;

    if (wheelTimeoutRef.current) {
      clearTimeout(wheelTimeoutRef.current);
    }

    wheelTimeoutRef.current = setTimeout(() => {
      endInteraction();
      wheelTimeoutRef.current = null;
    }, 200);

    const delta = -e.deltaY * 0.001;
    setFractalViews((prev: any) => {
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
  }, [fractalType, startInteraction, endInteraction, setFractalViews]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    lastActualMoveTimeRef
  };
}
