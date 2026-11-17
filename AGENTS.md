# AGENTS.md — Fractal Diver Workspace Guide

This file defines repository conventions, architectural invariants, and verification workflows for **Fractal Diver**, a real-time 3D fractal explorer built with **WebGPU**, **Three.js Shading Language (TSL / WGSL)**, **React Three Fiber**, and **React 19**.

---

## 1. Tech Stack & Runtime Architecture

- **UI & State**: React 19 + TypeScript (`~5.8`) + Vite 8 + Tailwind CSS v4 (`@tailwindcss/vite`).
- **Rendering Engine**: `three` (`three/webgpu` `WebGPURenderer` & `MeshBasicNodeMaterial`, `three/tsl` `wgslFn`) orchestrated by `@react-three/fiber` (`createRoot` with `frameloop: 'demand'`).
- **Testing**: Vitest 4 (`happy-dom`, `@testing-library/react`, `@vitest/coverage-v8`), including an in-memory CPU WGSL-to-JS transpiler in `src/shaders/fractalEngine.test.ts`.
- **Deployment**: Cloudflare Workers static SPA assets (`wrangler.jsonc`).

---

## 2. Repository Map

| Path | Responsibility |
| :--- | :--- |
| `src/App.tsx` | Top-level per-fractal view state (`fractalViews`), zoom-LOD iteration boosts (`maxZoomIterBoost`), `handleFrameTime` pulse, `settleTimeRef` transition, `isSettledQualityLocked` idle sleep lock, wallpaper trigger, debug overrides. |
| `src/shaders/fractalEngine.ts` | Pure WGSL raymarcher (`renderFractal`), 6 fractal Distance Estimators (`get*Data`), dispatcher + CSG half-space slicer (`getFractalData`), 4-tap tetrahedral normals, hybrid AO, studio lighting, ACES tonemapping, zoom-normalized fog. |
| `src/shaders/fractalEngine.test.ts` | Pratt-parser WGSL-to-JS CPU transpiler (`compileWGSLModule`) and unit tests executing live `(renderFractal as any).functionNode.code`. |
| `src/constants/fractals.ts` | `FRACTAL_NAMES` and `FRACTAL_CONFIGS` (`"0"`..`"5"`): initial camera views, adaptive iteration/step/epsilon bounds, sensitivity multipliers, shader parameters, slicer defaults. |
| `src/components/FractalCanvas.tsx` | `WebGPURenderer` + R3F `createRoot` (`frameloop: 'demand'`, `dpr: 1`), `device.lost` recovery, `ResizeObserver` on `containerRef`, exponential camera damping (`1 - exp(-12 * delta)`), and TSL uniform binding. |
| `src/hooks/usePerformanceAdaptation.ts` | Asymmetric EMA frame-time controller: 30 FPS interactive target vs. 5 FPS settled progressive refinement, 15% deadband, 15 Hz React update throttle. |
| `src/hooks/useFractalInteraction.ts` | Mouse, wheel, and touch handlers: orbit drag, right-click & `Shift`+drag pan, 2-finger pinch/pan disambiguation, logarithmic zoom deceleration (`getZoomDamping`), deep-zoom rotation scaling (`getRotationScale`). |
| `src/utils/screenshot.ts` | Offscreen `WebGPURenderer` wallpaper capture: 2x supersampling on DPR < 2, capped at `3840px` (4K), `SRGBColorSpace` + `ACESFilmicToneMapping`, bicubic 2D canvas downsample to JPEG. |
| `src/components/ParameterControls.tsx` | Dynamic sliders for `param1`/`param2`/`param3` and primary/accent color pickers. |
| `src/components/SlicerControls.tsx` | X/Y/Z axis selector and offset slider (`[-2, 2]`) for CSG half-space slicing. |
| `src/components/DebugPanel.tsx` | 2 Hz telemetry overlay and settled-mode overrides for iterations, steps, and epsilon. |
| `src/components/FractalSelector.tsx` | Fractal dropdown selector and Reset View button. |
| `src/components/InteractionInstructions.tsx` | Fade-on-drag HUD control hints. |

---

## 3. Critical Engineering Invariants (Do Not Regress)

1. **Pure No-Clip Camera & Near Window**: Keep `rayOrigin = uniformRotation * vec3<f32>(0.0, 0.0, -5.0) + uniformOffset` with **zero** geometry-avoidance camera pushback (which causes inward/outward pistoning while orbiting). Near-lens geometry clips cleanly via `totalDist = 0.40` and pass-through within `totalDist < 0.55` when `uniformSlicerEnabled < 0.5`.
2. **Hollow-Shell Interior Marching & Interior `safeR` Floor**: When `uniformSlicerEnabled < 0.5`, march using `abs(signedDist)` with secant zero-crossing refinement (`prevSigned * signedDist < 0.0 && abs(prevSigned) < 0.2 * uniformZoom`). Signed polynomial DEs (`getMandelbulbData`, `getJuliaData`) must clamp interior radius via `select(radius, max(0.25, radius), radius < 1.0)` — **never** `max(1.0001, radius)`, which yields `~0.00004` positive steps inside the fractal, triggering 800-step GPU stalls and blackouts.
3. **Exterior Bounding-Sphere Guard**: Hubbard-Douady DEs (`0.5 * r * log(r) / dz`) grow as $O(r \ln r)$ when early bailout (`radius > 4.0`) exits on iteration `0` (`derivative = 1.0`). Always clamp far exterior distances (`min(rawDist, pLen - 1.2)` for Mandelbulb `pLen > 1.35`; `min(rawDist, pLen - 1.8)` for Julia `pLen > 2.0`) so zoomed-out rays (`zoom < 0.6`) never overshoot the front surface into the interior.
4. **No Fixed Spherical Raymarch Escape**: Never add a fixed-radius escape like `dot(relPoint, relPoint) > C`. Apollonian (`type 5`) is an infinite periodic lattice in $\mathbb{R}^3$ and Mandelbox (`type 4`, `scale = 2.0`) spans `[-6, 6]^3` (corner radius `~10.4`). Escape only via zoom-scaled far distance: `totalDist > mix(50.0, 100.0, uniformSettleTime) * max(1.0, uniformZoom)`.
5. **`f32` Derivative Overflow & Iteration Ceiling**: Power loops (`getMandelbulbData`, `getJuliaData`) must break on `derivative > 1e15`, and `src/App.tsx` must keep Mandelbulb's zoom LOD boost capped (`maxZoomIterBoost = fractalType === 0 ? 6 : 16`) so $8^k$ derivatives stay within single-precision `f32` limits.
6. **Uniform Parameter Packing**: `uniformParameters` is `(qualityOffset, param1, param2, param3)`. In WGSL, `params.x` = `qualityOffset`, `params.y` = `param1`, `params.z` = `param2`, `params.w` = `param3`.
7. **WGSL `select` Order & CPU Test Transpiler**: WGSL `select(falseVal, trueVal, cond)` takes the **false** branch first. `src/shaders/fractalEngine.test.ts` transpiles and runs `(renderFractal as any).functionNode.code` directly on CPU; any new WGSL intrinsics or syntax (e.g., `floor`, `cross`, multi-char swizzles) must be added to `compileWGSLModule` in `src/shaders/fractalEngine.test.ts`.
8. **R3F Resize, `dpr: 1`, Slow Frames & Shader HMR**: In `src/components/FractalCanvas.tsx`:
   - Measure `containerRef.current` (not `canvas.clientWidth`, which R3F overwrites with inline pixel styles) via both `window` resize and `ResizeObserver`.
   - Pass `dpr: 1` and module-stable `CAMERA_CONFIG` on every `root.configure(...)` call (prevents 4x Retina fragment explosion and frustum resets).
   - Report all frame deltas with `Math.min(delta, 1.0)` — never drop `delta >= 0.5s` frames.
   - Keep `[uniforms, renderFractal]` in the `MeshBasicNodeMaterial` `useMemo` dependencies for HMR shader recompilation.
9. **Wallpaper Tone Mapping Parity**: Standalone `WebGPURenderer` instances (such as `src/utils/screenshot.ts`) do not inherit R3F defaults and **must** explicitly set `renderer.outputColorSpace = THREE.SRGBColorSpace` and `renderer.toneMapping = THREE.ACESFilmicToneMapping`.

---

## 4. Development & Verification Commands

- `npm run lint` — TypeScript check (`tsc --noEmit`).
- `npm test` — Run all Vitest unit and WGSL CPU shader tests (`vitest run`).
- `npx vitest run --coverage` — Run unit tests with V8 coverage report.
- `npm run dev` — Start local Vite dev server (`0.0.0.0:3000`; note WebGPU requires `localhost` or HTTPS).
- `npm run build` / `npm run preview` / `npm run deploy` — Production bundle and Cloudflare Workers SPA deployment.

---

## 5. Architecture Docs & Specialized Workspace Skills

- **System Architecture & Math Overview**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Workspace Skills** (under `.agents/skills/`, loaded on demand):
  - `wgsl-fractal-authoring` — Adding/editing WGSL fractal DEs, raymarching, lighting, CSG slicing, CPU WGSL transpiler tests, and `probe-raymarch.mjs`.
  - `adaptive-performance-and-camera` — Tuning EMA adaptation, `frameloop: 'demand'`, R3F/WebGPU lifecycle, deep-zoom camera physics, and 4K wallpaper capture.
  - `lan-webgpu-preview-and-deploy` — Ephemeral HTTPS LAN preview for WebGPU on external laptops/mobile devices, pre-release checks, and Cloudflare Workers deploy.
