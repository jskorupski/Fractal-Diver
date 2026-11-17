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
| `src/App.tsx` | Top-level per-fractal view state (`fractalViews`), zoom-LOD iteration boosts (`maxZoomIterBoost`), `getDprBounds` viewport DPR bounds fed into `usePerformanceAdaptation`, `handleFrameTime` pulse, `settleTimeRef` transition, `isSettledQualityLocked` idle sleep lock, wallpaper trigger, debug overrides (`overrideKnobs`). |
| `src/shaders/fractalEngine.ts` | Pure WGSL raymarcher (`renderFractal`), 6 fractal Distance Estimators (`get*Data`), dispatcher + CSG half-space slicer (`getFractalData`), 4-tap tetrahedral normals, hybrid AO, studio lighting, ACES tonemapping, zoom-normalized fog. |
| `src/shaders/fractalEngine.test.ts` | Pratt-parser WGSL-to-JS CPU transpiler (`compileWGSLModule`) and unit tests executing live `(renderFractal as any).functionNode.code`. |
| `src/constants/fractals.ts` | `FRACTAL_NAMES` and `FRACTAL_CONFIGS` (`"0"`..`"5"`): initial camera views, adaptive iteration, step (`minInteractiveSteps`, `interactiveSteps`, `settledSteps`), and epsilon (`maxInteractiveEpsilon` capped at `0.0015–0.002`) bounds, sensitivity multipliers, shader parameters, slicer defaults. |
| `src/utils/dpr.ts` | Pure DPR and pixel-budget helpers (`getDprBounds`, `calculateTargetDpr`) plus budget/DPR constants; kept separate from `FractalCanvas.tsx` (which re-exports them) so `App.tsx` can import `getDprBounds` without breaking `App.test.tsx`'s `FractalCanvas` mock. |
| `src/components/FractalCanvas.tsx` | `WebGPURenderer` + R3F `createRoot` (`frameloop: 'demand'`), re-exports DPR helpers from `src/utils/dpr.ts`, applies 4-tier `0.25x`-quantized DPR (up to `1.5x` interactive / `2.25x` settled on high-DPI mobile, `0.75x` interactive floor on large `>= 750k` CSS-pixel viewports), `device.lost` recovery, `ResizeObserver` on `containerRef`, exponential camera damping (`1 - exp(-12 * delta)`), and physical-pixel TSL uniform binding. |
| `src/hooks/usePerformanceAdaptation.ts` | Asymmetric EMA frame-time controller (30 FPS interactive / 5 FPS settled, 15% deadband, 15 Hz React throttle) implementing the strict 4-tier non-destructive cascade (DPR scale -> `interactiveSteps` -> `interactiveEpsilon` -> emergency `interactiveIterations`), reverse-order recovery, and `overrideKnobs`. |
| `src/hooks/useFractalInteraction.ts` | Mouse, wheel, and touch handlers: orbit drag, right-click & `Shift`+drag pan, 2-finger pinch/pan disambiguation, logarithmic zoom deceleration (`getZoomDamping`), deep-zoom rotation scaling (`getRotationScale`). |
| `src/utils/screenshot.ts` | Offscreen `WebGPURenderer` wallpaper capture: 2x supersampling on DPR < 2, capped at `3840px` (4K), `SRGBColorSpace` + `ACESFilmicToneMapping`, bicubic 2D canvas downsample to JPEG. |
| `src/components/ParameterControls.tsx` | Dynamic sliders for `param1`/`param2`/`param3` and primary/accent color pickers. |
| `src/components/SlicerControls.tsx` | X/Y/Z axis selector and offset slider (`[-2, 2]`) for CSG half-space slicing. |
| `src/components/DebugPanel.tsx` | 2 Hz telemetry overlay (`FPS`, live `DPR`, `Settle`, frame spinner) and settled-mode overrides for epsilon, iterations, and steps (routed via `usePerformanceAdaptation.overrideKnobs`). |
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
8. **R3F Resize, Adaptive 4-Tier DPR, Slow Frames & Shader HMR**: In `src/components/FractalCanvas.tsx` and `src/utils/dpr.ts`:
   - Measure `containerRef.current` (not `canvas.clientWidth`, which R3F overwrites with inline pixel styles) via both `window` resize and `ResizeObserver`.
   - Compute DPR via `getDprBounds` / `calculateTargetDpr` (`src/utils/dpr.ts`, re-exported by `FractalCanvas.tsx`), scaling by `interactiveResolutionScale` / `settledResolutionScale` quantized to `0.25x` steps (up to `1.5x` within `1.1M` px interactive / `2.25x` within `2.2M` px after `150ms` idle settle on high-DPI mobile, and down to a `0.75x` interactive floor on large `>= 750k` CSS-pixel tablet/desktop viewports), pass `dpr` and module-stable `CAMERA_CONFIG` on every `root.configure(...)` call, and bind `uniformResolution` in physical pixels (`size * activeDpr`).
   - Keep `src/App.tsx` importing `getDprBounds` from `src/utils/dpr.ts` (never `FractalCanvas.tsx`) so `App.test.tsx`'s `FractalCanvas` mock does not break.
   - Report all frame deltas with `Math.min(delta, 1.0)` — never drop `delta >= 0.5s` frames.
   - Keep `[uniforms, renderFractal]` in the `MeshBasicNodeMaterial` `useMemo` dependencies for HMR shader recompilation.
9. **Wallpaper Tone Mapping Parity**: Standalone `WebGPURenderer` instances (such as `src/utils/screenshot.ts`) do not inherit R3F defaults and **must** explicitly set `renderer.outputColorSpace = THREE.SRGBColorSpace` and `renderer.toneMapping = THREE.ACESFilmicToneMapping`.
10. **4-Tier Non-Destructive Adaptive Performance Cascade**: Under 30 FPS (`33.3ms`) interactive lag, `usePerformanceAdaptation.ts` must shed load strictly in order: (1) `interactiveResolutionScale` -> DPR (`0.25x` steps), (2) grazing-ray `interactiveSteps` (`[config.minInteractiveSteps, config.interactiveSteps]`), (3) pixel-bounded `interactiveEpsilon` (`maxInteractiveEpsilon` capped at `0.0015–0.002` to prevent melted-clay tendril bloat), and (4) `interactiveIterations` **only** as an emergency floor after Tiers 1–3 are exhausted (otherwise locked at `defaultInteractiveIterations` + zoom-LOD boost). Fast interactive frames must recover strictly in reverse order (`interactiveIterations -> defaultInteractiveIterations` -> `interactiveEpsilon -> defaultInteractiveEpsilon` -> `interactiveSteps -> config.interactiveSteps` -> `interactiveResolutionScale -> 1.0`, applying sub-pixel `minInteractiveEpsilon` polish only once Tiers 1–2 are back at full defaults). In 5 FPS (`200ms`) settled mode, reset `settledResolutionScale = 1.0` on input release and under severe lag (`multiplier > 2.5`) shed `settledResolutionScale` toward `minSettledScale` before backing off `settledEpsilon`/`settledIterations` toward the interactive floor.

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
