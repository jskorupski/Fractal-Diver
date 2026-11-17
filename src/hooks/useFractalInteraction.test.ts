/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useFractalInteraction } from './useFractalInteraction';
import { FRACTAL_CONFIGS } from '../constants/fractals';

function setupHook(initialZoom = FRACTAL_CONFIGS['0'].zoom) {
  let isInteracting = false;
  let interactionType = 0;
  let isLocked = false;
  let views: Record<number, { zoom: number; offset: THREE.Vector3; rotation: THREE.Quaternion }> = {
    0: {
      zoom: initialZoom,
      offset: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Quaternion(),
    },
  };

  const setIsInteracting = vi.fn((val: boolean) => {
    isInteracting = val;
  });
  const setInteractionType = vi.fn((val: number) => {
    interactionType = val;
  });
  const setIsSettledQualityLocked = vi.fn((val: boolean) => {
    isLocked = val;
  });
  const setFractalViews = vi.fn((updater: any) => {
    views = typeof updater === 'function' ? updater(views) : updater;
  });
  const updateCurrentView = vi.fn();
  const setInteractiveSteps = vi.fn();
  const setSettledSteps = vi.fn();
  const settleTimeRef = { current: 1.0 };

  const hook = renderHook(
    ({ interacting }) =>
      useFractalInteraction({
        fractalType: 0,
        isInteracting: interacting,
        setIsInteracting,
        setInteractionType,
        updateCurrentView,
        setFractalViews,
        settleTimeRef,
        setIsSettledQualityLocked,
        setInteractiveSteps,
        setSettledSteps,
      }),
    { initialProps: { interacting: isInteracting } }
  );

  return {
    hook,
    getState: () => ({ views, isInteracting, interactionType, isLocked, settleTime: settleTimeRef.current }),
    setRotation: (q: THREE.Quaternion) => {
      views[0].rotation = q;
    },
    settleTimeRef,
    setIsInteracting,
    setInteractionType,
    setIsSettledQualityLocked,
  };
}

describe('useFractalInteraction', () => {
  let currentTime = 1000;

  beforeEach(() => {
    currentTime = 1000;
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies progressive zoom deceleration, faster zoom-out recovery, bounds clamping, and 200ms debounce', () => {
    // 1. Default zoom step vs deep zoom step
    const base = setupHook(FRACTAL_CONFIGS['0'].zoom);
    act(() => {
      base.hook.result.current.handleWheel({
        deltaY: -200,
        preventDefault: vi.fn(),
      } as unknown as WheelEvent);
    });
    const defaultRatio = base.getState().views[0].zoom / FRACTAL_CONFIGS['0'].zoom;

    const deep = setupHook(32 * FRACTAL_CONFIGS['0'].zoom);
    act(() => {
      deep.hook.result.current.handleWheel({
        deltaY: -200,
        preventDefault: vi.fn(),
      } as unknown as WheelEvent);
    });
    const deepInRatio = deep.getState().views[0].zoom / (32 * FRACTAL_CONFIGS['0'].zoom);
    expect(deepInRatio).toBeLessThan(defaultRatio);

    // 2. Zoom-out applies 1.35x recovery boost over symmetric zoom-in
    const beforeOut = deep.getState().views[0].zoom;
    currentTime += 50;
    act(() => {
      deep.hook.result.current.handleWheel({
        deltaY: 200,
        preventDefault: vi.fn(),
      } as unknown as WheelEvent);
    });
    const deepOutDropRatio = beforeOut / deep.getState().views[0].zoom;
    expect(deepOutDropRatio).toBeGreaterThan(deepInRatio);

    // 3. Bounds clamping [0.0001, 1000.0] and 200ms idle reset
    const ceiling = setupHook(990);
    act(() => {
      ceiling.hook.result.current.handleWheel({
        deltaY: -5000,
        preventDefault: vi.fn(),
      } as unknown as WheelEvent);
    });
    expect(ceiling.getState().views[0].zoom).toBeLessThanOrEqual(1000.0);
    expect(ceiling.getState().isInteracting).toBe(true);
    expect(ceiling.getState().interactionType).toBe(2);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(ceiling.getState().isInteracting).toBe(false);
    expect(ceiling.getState().interactionType).toBe(0);
  });

  it('handles mouse orbit, inverted-up horizontal direction, Shift+drag pan, right-click pan, and middle-click guard', () => {
    const ctx = setupHook(1.2);

    // Middle click ignored
    act(() => {
      ctx.hook.result.current.handleMouseDown({ button: 1, clientX: 100, clientY: 100 } as unknown as ReactMouseEvent);
    });
    expect(ctx.getState().isInteracting).toBe(false);

    // Left-click orbit rotation
    act(() => {
      ctx.hook.result.current.handleMouseDown({ button: 0, clientX: 100, clientY: 100 } as unknown as ReactMouseEvent);
    });
    ctx.hook.rerender({ interacting: true });
    currentTime += 30;
    act(() => {
      ctx.hook.result.current.handleMouseMove({
        clientX: 150,
        clientY: 120,
        shiftKey: false,
        buttons: 1,
      } as unknown as ReactMouseEvent);
    });
    const normalRot = ctx.getState().views[0].rotation.clone();
    expect(normalRot.equals(new THREE.Quaternion())).toBe(false);
    expect(ctx.getState().views[0].offset.length()).toBe(0);

    // Shift + drag pans offset without changing rotation
    currentTime += 30;
    act(() => {
      ctx.hook.result.current.handleMouseMove({
        clientX: 190,
        clientY: 160,
        shiftKey: true,
        buttons: 1,
      } as unknown as ReactMouseEvent);
    });
    expect(ctx.getState().views[0].offset.length()).toBeGreaterThan(0);
    expect(ctx.getState().views[0].rotation.equals(normalRot)).toBe(true);

    act(() => {
      ctx.hook.result.current.handleMouseUp();
    });
    ctx.hook.rerender({ interacting: false });
    expect(ctx.getState().isInteracting).toBe(false);

    // Right-click (button 2) drag pans cleanly
    const offsetBeforeRightDrag = ctx.getState().views[0].offset.clone();
    act(() => {
      ctx.hook.result.current.handleMouseDown({ button: 2, clientX: 200, clientY: 200 } as unknown as ReactMouseEvent);
    });
    ctx.hook.rerender({ interacting: true });
    currentTime += 30;
    act(() => {
      ctx.hook.result.current.handleMouseMove({
        clientX: 240,
        clientY: 230,
        shiftKey: false,
        buttons: 2,
      } as unknown as ReactMouseEvent);
    });
    expect(ctx.getState().views[0].offset.distanceTo(offsetBeforeRightDrag)).toBeGreaterThan(0);

    // Inverted camera (rotated 180 deg around X -> upVector.y < 0) reverses yaw sign cleanly
    act(() => {
      ctx.hook.result.current.handleMouseUp();
    });
    ctx.hook.rerender({ interacting: false });
    const upsideDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    ctx.setRotation(upsideDown.clone());
    act(() => {
      ctx.hook.result.current.handleMouseDown({ button: 0, clientX: 100, clientY: 100 } as unknown as ReactMouseEvent);
    });
    ctx.hook.rerender({ interacting: true });
    currentTime += 30;
    act(() => {
      ctx.hook.result.current.handleMouseMove({
        clientX: 140,
        clientY: 100,
        shiftKey: false,
        buttons: 1,
      } as unknown as ReactMouseEvent);
    });
    expect(ctx.getState().views[0].rotation.equals(upsideDown)).toBe(false);
  });

  it('disambiguates 2-finger pinch zoom vs. 2-finger pan gestures cleanly', () => {
    // 1. Pinch zoom (> 15px spread)
    const pinchCtx = setupHook(2.0);
    act(() => {
      pinchCtx.hook.result.current.handleTouchStart({
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 },
        ],
      } as unknown as ReactTouchEvent);
    });
    currentTime += 30;
    act(() => {
      pinchCtx.hook.result.current.handleTouchMove({
        touches: [
          { clientX: 70, clientY: 100 },
          { clientX: 230, clientY: 100 },
        ],
      } as unknown as ReactTouchEvent);
    });
    expect(pinchCtx.getState().views[0].zoom).toBeGreaterThan(2.0);
    expect(pinchCtx.getState().views[0].offset.length()).toBe(0);

    // 2. Parallel 2-finger drag (> 10px pan, constant finger distance)
    const panCtx = setupHook(2.0);
    act(() => {
      panCtx.hook.result.current.handleTouchStart({
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 },
        ],
      } as unknown as ReactTouchEvent);
    });
    currentTime += 30;
    act(() => {
      panCtx.hook.result.current.handleTouchMove({
        touches: [
          { clientX: 140, clientY: 120 },
          { clientX: 240, clientY: 120 },
        ],
      } as unknown as ReactTouchEvent);
    });
    expect(panCtx.getState().views[0].zoom).toBe(2.0);
    expect(panCtx.getState().views[0].offset.length()).toBeGreaterThan(0);

    act(() => {
      panCtx.hook.result.current.handleTouchEnd({ touches: [] } as unknown as ReactTouchEvent);
    });
    expect(panCtx.getState().isInteracting).toBe(false);
  });
});
