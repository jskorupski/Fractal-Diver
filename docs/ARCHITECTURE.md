# Fractal Diver — System Architecture

This document details the runtime data flow, coordinate transforms, WGSL raymarching pipeline, closed-loop adaptive quality controller, and testing architecture of **Fractal Diver**.

---

## 1. High-Level System Topology

```mermaid
flowchart TD
  UI["User Input & HUD Controls\n(useFractalInteraction, ParameterPanel,\nSlicerPanel, FractalSelector, DebugPanel)"] --> App["src/App.tsx\nPer-fractal view state, zoom-LOD iter boost,\ngetDprBounds, settleTimeRef, quality lock"]
  App -->|camera, params, slicer, resScale, steps, eps, iters| Canvas["src/components/FractalCanvas.tsx\nWebGPURenderer + R3F demand loop\ncalculateTargetDpr (src/utils/dpr.ts), ResizeObserver"]
  Canvas -->|uniforms + full-screen quad| Shader["src/shaders/fractalEngine.ts\nTSL wgslFn -> WGSL raymarcher\n6 DEs + normals + AO + ACES"]
  Canvas -->|"onFrameTime(min(delta, 1.0), isStillSmoothing)"| Pulse["App.tsx handleFrameTime()\nFPS meter + settle progression\nquality lock"]
  Pulse -->|EMA error & deadband| Adapt["src/hooks/usePerformanceAdaptation.ts\n30 FPS interactive / 5 FPS settled\n4-tier cascade (DPR -> steps -> eps -> iters)"]
  Adapt -->|resScale, steps, eps & iters| App
  App -->|snapshot on click| Export["src/utils/screenshot.ts\nOffscreen WebGPURenderer <= 3840px\nSRGBColorSpace + ACESFilmicToneMapping"]
```

---

## 2. Coordinate Spaces & Raymarching Pipeline (`src/shaders/fractalEngine.ts`)

### Camera & Fractal Space Transform
1. **Screen Coordinates**: Pixel UVs `vUv` in `[0, 1]^2` are centered and aspect-corrected:
   $$\text{uvCoords} = (\text{vUv} - 0.5) \cdot \left(\frac{W}{H}, 1\right)$$
2. **World-Space No-Clip Rig**:
   - `rayOrigin = uniformRotation * vec3(0.0, 0.0, -5.0) + uniformOffset`
   - `rayDirection = uniformRotation * normalize(vec3(uvCoords, 1.5))`
   Because the orbit radius is `5.0`, the pivot at `totalDist = 5.0` sits directly on `uniformOffset`. No geometry-avoidance probe alters `rayOrigin`, eliminating camera pistoning during rotation.
3. **Global Fractal Space**: Each march sample `currentPoint = rayOrigin + rayDirection * totalDist` transforms into fractal space around `uniformOffset`:
   $$\text{globalPoint} = \frac{\text{currentPoint} - \text{uniformOffset}}{\text{uniformZoom}} + \text{uniformOffset}$$
   World-space distance is recovered via `signedDist = data.x * uniformZoom`.

### Near-Clipping Window & Hollow-Shell Interior Diving
- **Near-Clip Window**: Rays start at `totalDist = 0.40`. When the CSG slicer is disabled (`uniformSlicerEnabled < 0.5`), surface hits closer than `totalDist < 0.55` advance forward (`+max(0.05, dist)`) instead of terminating, creating an unobstructed window right in front of the lens as you dive inside a fractal.
- **Hollow-Shell Marching**: When unsliced, the loop marches with `dist = abs(signedDist)` and triggers secant root interpolation whenever `prevSigned * signedDist < 0.0` (with `abs(prevSigned) < 0.2 * uniformZoom`). Combined with `safeR = select(radius, max(0.25, radius), radius < 1.0)` in Mandelbulb and Julia, rays cross solid interiors in ~10–40 steps rather than stalling.
- **Sub-Pixel Cone Clamping**:
  - `pixelScale = 1.0 / max(300.0, resolution.y * 1.5)`
  - `effectiveEpsilon = max(pixelScale * 0.35, mix(uniformInteractiveEpsilon, uniformSettledEpsilon, uniformSettleTime))`
  - `threshold = max(0.0000005, effectiveEpsilon * totalDist)`
  Bounding epsilon by the pixel's angular footprint prevents wasting steps resolving sub-pixel fractal dust.

### Normals, Lighting, & Post-Processing
- **4-Tap Tetrahedral Gradient**: Evaluates 4 SDF offsets `k1..k4` at fractal-space kernel `normalEpsilon = max(0.000005, max(threshold * 2.5, pixelScale * totalDist * 0.75) / uniformZoom)`. When diving inside hollow shells, `orientedNormal` flips the unit normal toward `-rayDirection` so inner walls shade accurately.
- **Hybrid AO**: Blends 1–3 distance-AO taps (`distAO`, dynamically reduced when `stepCount > 120` or `> 250`, active when `uniformInteracting < 0.5 && uniformSettleTime > 0.01`) with crevasse `stepAO = mix(0.15, 1.0, exp(-f32(stepCount) * 0.012))`.
- **Lighting & Color**: Camera-attached key light `(0.8, 1.2, -0.8)` and fill light `(-0.6, -0.2, -0.5)` (`diffuse <= 1.0`), Blinn-Phong specular (`pow(NdotH, 32) * 0.12`), Fresnel rim (`0.15 * (1 - NdotV)^4`), orbit-trap palette mixing (`uniformBaseColor` -> `uniformAccentColor` + `6%` smooth cosine spatial variation), ACES Filmic tonemapping, and zoom-normalized depth fog (`fogDist = totalDist / max(1.0, pow(uniformZoom, 0.8))`).

---

## 3. Fractal Catalog & Parameter Mapping (`src/constants/fractals.ts`)

`uniformParameters` packs `(qualityOffset, param1, param2, param3)` into `(x, y, z, w)`:

| ID | Fractal | WGSL Function | DE Type | `param1` (`y`) | `param2` (`z`) | `param3` (`w`) | Default Zoom | Slicer Default | Int Steps (`min`–`default`) | `maxInteractiveEpsilon` | Settled Iters (`+zoom cap`) |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :-: | :-: | :-: | :--- |
| `0` | **Mandelbulb** | `getMandelbulbData` | Triplex analytic (signed) | Power (`8.0`) | — | — | `1.2` | Off | `64–120` | `0.0015` | `8–14` (`+6` zoom cap) |
| `1` | **Menger Sponge** | `getMengerSpongeData` | Recursive box fold (signed) | Scale (`3.48`) | — | — | `1.0` | Off | `64–120` | `0.0015` | `8–20` (`+16` zoom cap) |
| `2` | **Julia Set** | `getJuliaData` | 3D hypercomplex quadratic (signed) | — | C Real (`-0.8`) | C Imag (`0.156`) | `1.2` | On (Z=0) | `48–80` | `0.0015` | `24–96` (`+16` zoom cap) |
| `3` | **Sierpinski** | `getSierpinskiData` | Tetrahedral KIFS (unsigned) | Scale (`1.75`) | — | — | `1.0` | Off | `40–60` | `0.0018` | `12–28` (`+16` zoom cap) |
| `4` | **Mandelbox** | `getMandelboxData` | Box + sphere fold (unsigned) | Scale (`2.0`) | Min Radius (`0.135`) | Fixed Radius (`1.0`) | `0.15` | Off | `56–100` | `0.0015` | `24–64` (`+16` zoom cap) |
| `5` | **Apollonian** | `getApollonianData` | Periodic Kleinian inversion (unsigned) | Scale (`1.0`) | — | — | `1.5` | On (Z=0) | `40–60` | `0.002` | `8–24` (`+16` zoom cap) |

---

## 4. 4-Tier Adaptive Performance & Demand-Loop Lifecycle

1. **Interactive Mode (`activeInteracting = isInteracting || isDragging`, 30 FPS / `33.3ms` EMA target)**:
   - `settleTimeRef.current = 0`.
   - `usePerformanceAdaptation` tracks frame time via an asymmetric EMA (window `30` when improving, `~10` when lagging, instant `alpha = 0.9` if `delta > 1.5 * avg && delta > 0.1s`, `15%` deadband, `15 Hz` React update throttle).
   - **Strict 4-Tier Non-Destructive Degradation Priority** (with multiplicative spillover if a tier hits its floor/ceiling):
     1. **Tier 1 — Dynamic Resolution Scaling (`interactiveResolutionScale` -> `DPR`)**: Bounded by pure helpers `getDprBounds` / `calculateTargetDpr` in `src/utils/dpr.ts` (re-exported by `FractalCanvas.tsx`, kept separate so `App.tsx` imports `getDprBounds` without breaking `App.test.tsx`'s `FractalCanvas` mock). Drops internal DPR first (`1.5x -> 1.25x -> 1.0x` on high-DPI mobile; down to `0.75x` interactive floor on large `>= 750k` CSS-pixel tablet/desktop viewports), quantized to `0.25x` steps to avoid WebGPU swapchain thrashing — giving quadratic $O(\text{DPR}^2)$ savings with zero fractal shape change.
     2. **Tier 2 — Grazing-Ray Step Cap (`interactiveSteps`)**: Adapts dynamically within `[config.minInteractiveSteps, config.interactiveSteps]` so runaway silhouette grazing rays and deep dark crevices bail early while front-facing surfaces stay crisp.
     3. **Tier 3 — Pixel-Bounded Surface Threshold (`interactiveEpsilon`)**: `maxInteractiveEpsilon` is tightened to `0.0015–0.002` across `FRACTAL_CONFIGS` (~1.5–2px cone max instead of `0.004–0.008`) so thin tendrils never bloat into "melted clay" blobs.
     4. **Tier 4 — Emergency Survival Floor (`interactiveIterations`)**: Remains **locked** at `defaultInteractiveIterations` (+ zoom-LOD boost in `App.tsx`) during normal interaction so 3D topology and orbit-trap colors never pop mid-drag; only drops toward `minInteractiveIterations` if Tiers 1–3 are exhausted and FPS is still lagging.
   - **Exact Reverse-Order Recovery (on fast frames)**: Restores `interactiveIterations -> defaultInteractiveIterations` (never exceeds default automatically) -> `interactiveEpsilon -> defaultInteractiveEpsilon` -> `interactiveSteps -> config.interactiveSteps` -> `interactiveResolutionScale -> 1.0`, and only applies sub-pixel polish (`interactiveEpsilon -> minInteractiveEpsilon`) once Tiers 1 and 2 are back at full defaults.
2. **Settling & Progressive Refinement (5 FPS / `200ms` EMA target)**:
   - On input release, `settledEpsilon` and `settledIterations` inherit `interactiveEpsilon` and `interactiveIterations` cleanly and `settledResolutionScale` resets to `1.0` (while `FractalCanvas` triggers the `150ms` settled DPR step-up up to `2.25x` within the `2.2M` pixel budget).
   - `settleTimeRef` ramps toward `1.0` (`+delta * 2.5`), smoothly blending interactive and settled shader uniforms while `FractalMesh` damps `smoothedZoom`, `smoothedOffset`, and `smoothedRotation` toward targets with `1 - exp(-12 * delta)`.
   - Fast frames refine `settledEpsilon` and `settledIterations` via symmetric `sqrt(multiplier)`. Under severe settled lag (`multiplier > 2.5`), `usePerformanceAdaptation` sheds `settledResolutionScale` toward `minSettledScale` first before backing off `settledEpsilon` and `settledIterations` down to the interactive floor.
3. **Idle Lock (`isSettledQualityLocked`) & Telemetry (`DebugPanel.tsx`)**:
   - Once `!activeInteracting`, `settleTime >= 1.0`, `!isActuallyMoving`, and either `onFrameTime(...) === false` (converged / ceiling hit) or `delta >= 0.2s` (5 FPS budget reached), `App.tsx` sets `isSettledQualityLocked = true` and stops calling `invalidate()` — dropping GPU utilization to **0%** until input, resize, or parameter changes occur.
   - `DebugPanel.tsx` displays live `DPR` (`{values.dpr.toFixed(2)}x`) alongside `FPS`, `Settle`, `Epsilon`, `Iterations`, and `Steps`, and routes `interactiveSteps` / `settledSteps` overrides directly through `usePerformanceAdaptation.overrideKnobs`.

---

## 5. Verification Strategy

- **Unit & Integration Tests (`npm test`)**: Runs Vitest 4 under `happy-dom` covering utilities, DPR budgeting (`src/utils/dpr.ts`), constants, 4-tier performance adaptation math, camera interaction physics, R3F canvas resize/adaptive-DPR/device-loss handling, UI controls (`DebugPanel`), ACES wallpaper export, and full app state.
- **Zero-Drift CPU WGSL Testing (`src/shaders/fractalEngine.test.ts`)**: Extracts live `(renderFractal as any).functionNode.code` directly from Three.js TSL, transpiles WGSL expressions via a Pratt parser (`compileWGSLModule`) onto a JS `Vec`/`mat3x3` math runtime, and executes `get*Data`, `getFractalData`, and `renderFractal` on CPU in ~50 ms.
