# Raymarching Math & Shader Invariants Reference

Technical reference for [`src/shaders/fractalEngine.ts`](../../../../src/shaders/fractalEngine.ts).

---

## 1. Camera-Relative Space & Pivot Alignment

```wgsl
let uvCoords = (vUv - 0.5) * vec2<f32>(resolution.x / resolution.y, 1.0);
let rayOrigin = uniformRotation * vec3<f32>(0.0, 0.0, -5.0) + uniformOffset;
let rayDirection = uniformRotation * normalize(vec3<f32>(uvCoords, 1.5));
```

- At `totalDist = 5.0` along the center ray (`uvCoords = (0, 0)`), `currentPoint == uniformOffset`, placing the fractal origin (or panned target `uniformOffset`) directly at the orbital pivot.
- Transforming into fractal space keeps `uniformOffset` fixed under zoom:
  ```wgsl
  let globalPoint = (currentPoint - uniformOffset) / uniformZoom + uniformOffset;
  ```
- World-space distance is recovered as `signedDist = data.x * uniformZoom`.

---

## 2. Near-Clipping Window & Hollow-Shell Interior Math

### Why `safeR = max(1.0001, radius)` Failed at Deep Zoom
For points inside the Mandelbulb (`0 < radius < 1.0`), $\ln(\text{radius}) < 0$. Clamping `safeR = max(1.0001, radius)` forced $\ln(\text{safeR}) \approx +10^{-4} > 0$, making `dist = +0.00004 * uniformZoom`. Rays marching inside the bulb stayed in the exterior positive branch, taking `~0.00004` micro-steps per iteration until hitting the 800-step budget, stalling the GPU, and exiting with `isHit = false` (black screen).

### Current Solution (`renderFractal` + `getMandelbulbData` / `getJuliaData`)
1. **Interior DE Floor**:
   - Mandelbulb: `safeR = select(radius, max(0.25, radius), radius < 1.0); factor = select(0.8, 0.3, radius < 1.0);`
   - Julia Set: `safeR = select(radius, max(0.25, radius), radius < 1.0); factor = select(0.5, 0.2, radius < 1.0);`
   When `radius < 1.0`, `log(safeR)` stays strongly negative (`<= log(0.999)` inside near the boundary down to `log(0.25) = -1.386`), yielding clean negative steps so interior regions traverse in ~10–40 iterations.
2. **Hollow-Shell Stepping & Near Window**:
   - Starts at `totalDist = 0.40`.
   - When `uniformSlicerEnabled < 0.5`, marches with `dist = abs(signedDist)`.
   - Inside the near-clipping window (`totalDist < 0.55`), threshold hits advance forward (`totalDist += max(0.05, dist)`) instead of terminating, cleanly hiding close-up geometry right against the lens.
   - Outside the near window (`totalDist >= 0.55`), any sign change between consecutive steps (`prevSigned * signedDist < 0.0 && abs(prevSigned) < 0.2 * uniformZoom`) refines the zero-crossing via secant interpolation:
     ```wgsl
     let tFrac = abs(prevSigned) / (abs(prevSigned) + abs(signedDist) + 1e-10);
     totalDist = prevDist + (totalDist - prevDist) * tFrac;
     ```

---

## 3. Exterior Bounding-Sphere Clamp ($O(r \ln r)$ Overshoot Fix)

When a ray starts far outside the fractal (`uniformZoom < 0.6`), `globalPoint` has `pLen > 4.0`. Because `getMandelbulbData` and `getJuliaData` exit immediately when `radius > 4.0` (with `derivative = 1.0`), the Hubbard-Douady DE evaluates to:
$$d(r) = 0.4 \cdot r \ln r$$
At $r = 13.1$, $0.4 \cdot 13.1 \ln(13.1) \approx 13.54 > r - 1.1$, causing step `0` to jump past the front hemisphere of the fractal into the back interior. Clamping the exterior DE fixes this cleanly:
- **Mandelbulb**: `select(rawDist, min(rawDist, pLen - 1.2), pLen > 1.35)`
- **Julia Set**: `select(rawDist, min(rawDist, pLen - 1.8), pLen > 2.0)`

---

## 4. Sub-Pixel Cone, Tetrahedral Normals, & Hybrid AO

- **Pixel Cone Floor**:
  ```wgsl
  let pixelScale = 1.0 / max(300.0, resolution.y * 1.5);
  let effectiveEpsilon = max(pixelScale * 0.35, mix(uniformInteractiveEpsilon, uniformSettledEpsilon, uniformSettleTime));
  let threshold = max(0.0000005, effectiveEpsilon * totalDist);
  ```
- **IQ 4-Tap Tetrahedral Normal**:
  Uses directions `(1,-1,-1)`, `(-1,-1,1)`, `(-1,1,-1)`, `(1,1,1)` sampled at `normalEpsilon = max(0.000005, max(threshold * 2.5, pixelScale * totalDist * 0.75) / uniformZoom)`.
  Because no-clip hollow shells can hit interior faces (`dot(unitNormal, rayDirection) > 0`), `orientedNormal` flips toward the camera:
  ```wgsl
  let orientedNormal = select(unitNormal, -unitNormal, dot(unitNormal, rayDirection) > 0.0);
  let normal = select(vec3<f32>(0.0, 0.0, -1.0), orientedNormal, dot(rawNormal, rawNormal) > 1e-20);
  ```
- **Hybrid AO**:
  - `distAO`: 1–3 samples along `normal` (`aoSteps = stepCount > 250 ? 1 : (stepCount > 120 ? 2 : 3)`), disabled during active interaction (`uniformInteracting < 0.5 && uniformSettleTime > 0.01`).
  - `stepAO`: `mix(0.15, 1.0, exp(-f32(stepCount) * 0.012))`.
- **Zoom-Normalized Depth Fog**:
  ```wgsl
  let fogDist = totalDist / max(1.0, pow(uniformZoom, 0.8));
  let fogFactor = exp(-max(0.0, fogDist - 5.5) * 0.25);
  ```
  Sublinear exponent `0.8` keeps deep-zoom canyons bright even as `totalDist` scales up to `~0.65 * uniformZoom`.
