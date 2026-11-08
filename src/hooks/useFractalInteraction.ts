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
 * Manages mouse, wheel, and multi-touch interactions for navigating the 3D fractal scene:
 * - **Orbit Rotation**: 1-finger drag or primary mouse drag, with logarithmic zoom-depth
 *   sensitivity scaling (`getRotationScale`) so deep-zoom rotation stays responsive without locking up.
 * - **Camera Panning**: 2-finger drag, right-click + drag, or `Shift` + primary mouse drag, scaled
 *   inversely with zoom so world-space translation matches screen-space cursor motion.
 * - **Progressive Zoom**: Scroll wheel or 2-finger pinch with logarithmic depth deceleration
 *   (`getZoomDamping`) so zooming slows down naturally as you dive into intricate micro-detail,
 *   plus a 1.35x faster zoom-out recovery factor.
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
  const isRightClickPanRef = useRef<boolean>(false);
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
    
    gestureModeRef.current = 0;
    setIsSettledQualityLocked(false);
    lastViewUpdateRef.current = 0;
  }, [setIsInteracting, setInteractionType, settleTimeRef, setIsSettledQualityLocked]);

  /**
   * Logarithmic rotation scaling so deep-zoom rotation stays precise without locking up.
   */
  const getRotationScale = useCallback((currentZoom: number, defaultZoom: number) => {
    const zoomRatio = currentZoom / defaultZoom;
    return zoomRatio <= 1.0
      ? 1.0 / Math.max(0.25, zoomRatio)
      : 1.0 / (1.0 + 0.35 * Math.log2(zoomRatio));
  }, []);

  /**
   * Progressive zoom deceleration so zooming slows down as you dive deeper into fractal detail.
   */
  const getZoomDamping = useCallback((currentZoom: number, defaultZoom: number) => {
    const zoomDepth = Math.max(0, Math.log2(Math.max(1, currentZoom / defaultZoom)));
    return 1.0 / (1.0 + 0.35 * zoomDepth);
  }, []);

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
        const rotSensitivity = baseSensitivity * getRotationScale(current.zoom, defaultConfig.zoom);
        
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
          const damping = getZoomDamping(current.zoom, defaultConfig.zoom);
          const rawLogZoom = Math.log(Math.max(0.01, deltaZoom));
          const dampedLogZoom = rawLogZoom > 0 ? rawLogZoom * damping : rawLogZoom * Math.min(1.0, damping * 1.35);
          nextZoom = current.zoom * Math.exp(dampedLogZoom);
        } else if (gestureModeRef.current === 2) {
          const basePanSensitivity = 0.0012 * defaultConfig.panSensitivityMultiplier;
          const panSensitivity = basePanSensitivity * (defaultConfig.zoom / current.zoom);
          nextOffset = calculatePanning(current.rotation, current.offset, deltaX, deltaY, panSensitivity);
        }
        
        return {
          ...prev,
          [fractalType]: {
            ...current,
            zoom: Math.max(0.0001, Math.min(1000.0, nextZoom)),
            offset: nextOffset
          }
        };
      });

      if (gestureModeRef.current !== 0) {
        lastPinchDistRef.current = dist;
        lastTouchRef.current = { x: avgX, y: avgY };
      }
    }
  }, [fractalType, setFractalViews, calculateRotation, calculatePanning, getRotationScale, getZoomDamping]);

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
   * Handles mouse down events (left-click to rotate/Shift-pan, right-click to pan).
   */
  const handleMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button !== undefined && e.button !== 0 && e.button !== 2) return;
    isRightClickPanRef.current = e.button === 2;
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
        const isPanning = e.shiftKey || isRightClickPanRef.current || (e.buttons !== undefined && (e.buttons & 2) !== 0);
        
        if (isPanning) {
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
          const rotSensitivity = baseSensitivity * getRotationScale(current.zoom, defaultConfig.zoom);
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
  }, [isInteracting, fractalType, setFractalViews, calculateRotation, calculatePanning, getRotationScale]);

  /**
   * Handles mouse up events.
   */
  const handleMouseUp = useCallback(() => {
    endInteraction();
    isRightClickPanRef.current = false;
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

    const rawDelta = -e.deltaY * 0.001;
    setFractalViews((prev: any) => {
      const current = prev[fractalType];
      const defaultConfig = FRACTAL_CONFIGS[fractalType.toString()];
      const damping = getZoomDamping(current.zoom, defaultConfig.zoom);
      const dampedDelta = rawDelta > 0 ? rawDelta * damping : rawDelta * Math.min(1.0, damping * 1.35);
      const nextZoom = current.zoom * Math.exp(dampedDelta);
      return {
        ...prev,
        [fractalType]: {
          ...current,
          zoom: Math.max(0.0001, Math.min(1000.0, nextZoom))
        }
      };
    });
  }, [fractalType, startInteraction, endInteraction, setFractalViews, getZoomDamping]);

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
