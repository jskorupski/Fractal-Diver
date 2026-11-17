---
name: wgsl-fractal-authoring
description: >-
  Author, modify, and debug WGSL 3D fractal distance estimators, raymarching loops, surface normals,
  lighting, CSG slicing, and CPU WGSL unit tests in Fractal Diver. Use when adding a new fractal type,
  changing src/shaders/fractalEngine.ts, tuning fractal parameters in src/constants/fractals.ts, or
  diagnosing rendering artifacts such as clipping, overshooting, blackouts, or GPU slowdowns.
---

# WGSL Fractal Authoring & Shader Debugging

Follow this workflow whenever modifying `src/shaders/fractalEngine.ts`, adding a new fractal type, adjusting distance estimator formulas, or investigating visual/performance shader regressions.

For exact formulas, thresholds, and root-cause analyses of past shader fixes, read [references/raymarching-math-and-invariants.md](./references/raymarching-math-and-invariants.md).

---

## 1. 7-File Checklist for Adding or Modifying a Fractal

1. **[`src/shaders/fractalEngine.ts`](../../../src/shaders/fractalEngine.ts)**:
   - Implement `fn get<Name>Data(...) -> vec2<f32>` returning `vec2<f32>(distance, orbitTrapFactor)` with `orbitTrapFactor` normalized to `[0.0, 1.0]`.
   - Wire `else if (fractalType == N)` inside `getFractalData`. Remember `params` packs `(qualityOffset, param1, param2, param3)` -> `params.y` is `param1`, `params.z` is `param2`, `params.w` is `param3`.
2. **[`src/constants/fractals.ts`](../../../src/constants/fractals.ts)**:
   - Add `"N"` to `FRACTAL_NAMES` and `FRACTAL_CONFIGS`.
   - Calibrate `zoom`, `offset`, `rotation`, `min/default/max` interactive & settled iterations/epsilons (keeping `maxInteractiveEpsilon` pixel-bounded at `0.0015–0.002`), `minInteractiveSteps` / `interactiveSteps` / `settledSteps`, `panSensitivityMultiplier` / `rotSensitivityMultiplier`, `parameters`, and `slicer`.
3. **[`src/components/ParameterControls.tsx`](../../../src/components/ParameterControls.tsx)**:
   - Update dynamic slider labels (`param1` Power/Scale, `param2`, `param3`), `min`/`max`/`step` bounds, and visibility guards for `fractalType === N`.
4. **[`src/App.tsx`](../../../src/App.tsx)**:
   - Inspect `maxZoomIterBoost` (currently `fractalType === 0 ? 6 : 16`). If the new DE has steep exponential derivative growth like Mandelbulb's $8^k$, cap `maxZoomIterBoost` to prevent `f32` overflow on deep zoom.
5. **[`src/shaders/fractalEngine.test.ts`](../../../src/shaders/fractalEngine.test.ts)**:
   - Export any new WGSL function in `compileWGSLModule`'s return object and add CPU unit tests checking exterior distance, interior/cavity sign behavior, far-field bounding, and `renderFractal` pixel output.
6. **[`src/constants/fractals.test.ts`](../../../src/constants/fractals.test.ts)**:
   - Verify all `FRACTAL_NAMES` / `FRACTAL_CONFIGS` bounds assertions pass (or expand if adding schema fields).
7. **[`README.md`](../../../README.md) & [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)**:
   - Update the feature list and Fractal Catalog parameter matrix.

---

## 2. Mandatory Distance Estimator Safety Rules

Every DE and raymarching edit **must** preserve these invariants:

- **Pure No-Clip Camera**: Never modify `rayOrigin` with forward collision probing or standoff offsets; that introduces inward/outward camera pistoning during orbit rotation. No-clip diving uses the fixed near window (`totalDist = 0.40`, pass-through `< 0.55` when `uniformSlicerEnabled < 0.5`).
- **Hollow-Shell Interior & `safeR` Floor**: When `uniformSlicerEnabled < 0.5`, `renderFractal` marches `abs(signedDist)` with secant zero-crossing interpolation (`prevSigned * signedDist < 0.0 && abs(prevSigned) < 0.2 * uniformZoom`) and flips normals toward the camera (`orientedNormal`). Signed polynomial DEs (`getMandelbulbData`, `getJuliaData`) **must** keep `let safeR = select(radius, max(0.25, radius), radius < 1.0);` — **never** `max(1.0001, radius)`, which traps rays in `~0.00004` positive steps inside solids and hangs the GPU.
- **Exterior Bounding-Sphere Clamp**: Hubbard-Douady DEs (`0.5 * r * log(r) / dz`) grow as $O(r \ln r)$ when early bailout fires at iteration `0` (`derivative = 1.0`). Always bound exterior distance by a enclosing sphere (`min(rawDist, pLen - 1.2)` for Mandelbulb `pLen > 1.35`; `min(rawDist, pLen - 1.8)` for Julia `pLen > 2.0`) so zoomed-out rays (`zoom < 0.6`) never step clear through the front surface.
- **No Fixed Spherical Raymarch Escape**: Do **not** break the raymarch loop with `dot(relPoint, relPoint) > C`. Infinite lattice fractals (`Apollonian`, `type 5`) and large boxes (`Mandelbox`, `type 4`, spanning `[-6, 6]^3`) will be clipped into spheres. Use only the zoom-scaled far escape (`totalDist > mix(50.0, 100.0, uniformSettleTime) * max(1.0, uniformZoom)`).
- **`f32` Overflow & `0/0` Origin Guards**: Break power loops when `radius > 4.0 || derivative > 1e15`, guard `acos(clamp(z.z / max(1e-10, radius), -1.0, 1.0))` against zero-vector `NaN`, and guard `dot(rawNormal, rawNormal) > 1e-20`.
- **WGSL `select` Argument Order**: In WGSL, `select(falseValue, trueValue, condition)` returns `falseValue` first and `trueValue` second — the reverse of C/JS ternary `condition ? trueValue : falseValue`.

---

## 3. CPU WGSL Transpiler Compatibility (`compileWGSLModule`)

[`src/shaders/fractalEngine.test.ts`](../../../src/shaders/fractalEngine.test.ts) compiles the raw WGSL source directly onto a JS `Vec`/`mat3x3` math runtime. Keep shader code within the subset supported by `compileWGSLModule`, or extend its runtime helpers when adding new WGSL features:

- **Supported types & constructors**: `f32`, `i32`, `vec2<f32>`, `vec3<f32>`, `vec4<f32>`, `mat3x3<f32>`, component `.x/.y/.z/.w` reads and writes.
- **Supported intrinsics**: `sin`, `cos`, `acos`, `atan2`, `pow`, `log`, `log2`, `exp`, `sqrt`, `abs`, `round`, `fract`, `min`, `max`, `clamp`, `mix`, `smoothstep`, `dot`, `length`, `normalize`, `select`.
- **When adding a new WGSL intrinsic or multi-component swizzle** (e.g., `floor`, `cross`, `reflect`, `.xy`): add the corresponding math helper to **both** `compileWGSLModule` in [`src/shaders/fractalEngine.test.ts`](../../../src/shaders/fractalEngine.test.ts) and [scripts/probe-raymarch.mjs](./scripts/probe-raymarch.mjs).

---

## 4. Verification Workflow

After editing [`src/shaders/fractalEngine.ts`](../../../src/shaders/fractalEngine.ts) or [`src/constants/fractals.ts`](../../../src/constants/fractals.ts), run:

1. **CPU Raymarch & DE Diagnostic Probe**:
   ```bash
   node .agents/skills/wgsl-fractal-authoring/scripts/probe-raymarch.mjs
   ```
   Optionally filter by fractal or zoom levels:
   ```bash
   node .agents/skills/wgsl-fractal-authoring/scripts/probe-raymarch.mjs --type 0 --zoom 0.25,0.35,1,4.5,15,50
   ```
2. **Type Check & Full Unit Test Suite**:
   ```bash
   npm run lint && npm test
   ```
Confirm `probe-raymarch.mjs` exits `0` with no `NaN`/`Infinity`/unexpected blackouts and all 80+ Vitest specs pass.
