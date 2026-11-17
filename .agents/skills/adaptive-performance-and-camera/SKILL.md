---
name: adaptive-performance-and-camera
description: >-
  Tune and debug Fractal Diver's closed-loop adaptive performance controller, progressive settling,
  demand-driven React Three Fiber WebGPU lifecycle, camera navigation physics, DebugPanel overrides,
  and 4K wallpaper export. Use when modifying usePerformanceAdaptation.ts, useFractalInteraction.ts,
  FractalCanvas.tsx, App.tsx frame-timing/locking logic, or screenshot.ts.
---

# Adaptive Performance, R3F Lifecycle & Camera Physics

Use this runbook when adjusting performance tuning knobs, debugging frame-rate or resize behavior, modifying camera controls, or updating the wallpaper capture pipeline.

For state transitions, exact EMA weights, and mathematical formulas, see [references/state-and-control-loop.md](./references/state-and-control-loop.md).

---

## 1. Closed-Loop Quality Adaptation (`usePerformanceAdaptation.ts` & `App.tsx`)

1. **Dual-Regime Targets & Load-Shedding Split**:
   - **Interactive (`activeInteracting = isInteracting || isDragging`)**: Targets **30 FPS (`33.3ms`)** and weights adjustment toward raymarching epsilon (`multiplier^0.65`) over iterations (`multiplier^0.35`) so deep-zoom 3D silhouettes don't melt while dragging.
   - **Settled (`!activeInteracting`)**: Targets **5 FPS (`200ms`)** progressive refinement using symmetric `sqrt(multiplier)` splits. Immediately inherits `interactiveEpsilon` and `interactiveIterations` on release so the first idle frame never spikes GPU frame time.
2. **Tuning Per-Fractal Bounds (`src/constants/fractals.ts`)**:
   - Calibrate `min/default/max` bounds separately for interactive and settled modes.
   - Keep Mandelbulb's zoom iteration boost strictly capped (`maxZoomIterBoost = fractalType === 0 ? 6 : 16` in [`src/App.tsx`](../../../src/App.tsx)) so $8^k$ derivative growth cannot overflow single-precision `f32`.
3. **Settled Quality Lock (`isSettledQualityLocked`)**:
   - [`src/App.tsx`](../../../src/App.tsx) locks quality and stops calling `invalidate()` once `!activeInteracting && (updated === false || delta >= 0.2) && settleTimeRef.current >= 1.0 && !isActuallyMoving`.
   - Any action that invalidates visuals (interaction start, parameter/slicer update, fractal change, significant window resize > 5px, or manual DebugPanel edit) **must** reset or update `isSettledQualityLocked` appropriately. Notice [`DebugPanel`](../../../src/components/DebugPanel.tsx) edits intentionally lock settled quality (`setIsSettledQualityLocked(true)`) so automatic adaptation doesn't immediately overwrite manual overrides.

---

## 2. R3F & `WebGPURenderer` Lifecycle (`FractalCanvas.tsx`)

Preserve every lifecycle guard inside [`src/components/FractalCanvas.tsx`](../../../src/components/FractalCanvas.tsx):

- **Responsive Resize**: R3F's `setSize` writes inline pixel dimensions directly onto `<canvas>`, pinning `canvas.clientWidth`. Always read dimensions from `containerRef.current` (driven by both `window.addEventListener('resize', ...)` and a `ResizeObserver` on `containerRef.current`), then call `rendererRef.current.setSize(width, height, true)` followed by `root.configure(...)`.
- **Stable `dpr: 1` & `CAMERA_CONFIG`**: Pass module-level `CAMERA_CONFIG = { position: [0, 0, 1], fov: 50 }` and `dpr: 1` on both initial `createRoot` setup and every `handleResize`. Omitting them causes R3F to reset the camera frustum or revert to Retina `dpr = 2` (4x pixel raymarching load).
- **Never Drop Slow Frames**: Always report frame time via `onFrameTime(Math.min(delta, 1.0), isStillSmoothing)`. Filtering out `delta >= 0.5` starves the adaptation controller during GPU stalls and blocks `settleTimeRef` from reaching `1.0` to lock.
- **WebGPU `device.lost` & Shader HMR**: Keep `device.lost` auto-retry (`retryCount` bump) intact, and keep `[uniforms, renderFractal]` as the `useMemo` dependency array for `MeshBasicNodeMaterial` so shader edits recompile under Vite HMR.
- **Suppress Context Menu**: Keep `onContextMenu={(e) => e.preventDefault()}` on `<canvas>` so right-click panning works cleanly.

---

## 3. Camera Navigation Physics (`useFractalInteraction.ts`)

Inside [`src/hooks/useFractalInteraction.ts`](../../../src/hooks/useFractalInteraction.ts):

- **Rotation**: 1-finger drag and primary mouse drag call `calculateRotation`, flipping horizontal yaw direction when the transformed up vector (`(0,1,0).applyQuaternion(currentRotation)`) has `y < 0` to keep orbit intuitive upside-down.
- **Panning**: Supports `Shift` + left-drag, right-click + drag (`isRightClickPanRef` / `(e.buttons & 2) !== 0`), and 2-finger drag (disambiguated against pinch via `PINCH_THRESHOLD = 15`, `PAN_THRESHOLD = 10`). World-space sensitivity scales inversely with zoom (`defaultConfig.zoom / current.zoom`).
- **Progressive Zoom Deceleration (`getZoomDamping`) & Rotation Scaling (`getRotationScale`)**:
  - Zoom-in slows logarithmically as magnification deepens (`1 / (1 + 0.35 * max(0, log2(zoom / defaultZoom)))`), while zoom-out gets a `min(1.0, damping * 1.35)` recovery boost.
  - Camera transforms smooth inside `FractalMesh` via frame-rate independent exponential damping (`1 - Math.exp(-12 * delta)`).
- **Throttle**: Mouse/touch/wheel state updates are throttled at `~60 Hz` (`16ms`) with `wheelTimeoutRef` ending wheel interaction after `200ms`.

---

## 4. Wallpaper Export (`screenshot.ts`)

[`takeWallpaperScreenshot`](../../../src/utils/screenshot.ts) creates an isolated offscreen `WebGPURenderer`:

- Explicitly configure `renderer.outputColorSpace = THREE.SRGBColorSpace` and `renderer.toneMapping = THREE.ACESFilmicToneMapping` to match R3F's default color pipeline; without this, exports render flat (`NoToneMapping`).
- Cap max render dimension at `3840px` (2x supersampling only when `devicePixelRatio < 2`), downsample via a high-smoothing 2D canvas, export `image/jpeg` at `0.95` quality, and immediately dispose geometry, material, scene references, and renderer.

---

## 5. Verification

After any changes to performance adaptation, canvas lifecycle, camera interaction, or screenshot logic, run:
```bash
npm run lint && npx vitest run --coverage
```
Confirm all tests in `usePerformanceAdaptation.test.ts`, `FractalCanvas.test.tsx`, `screenshot.test.ts`, and `App.test.tsx` pass.
