/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { wgslFn } from 'three/tsl';

/**
 * Core WebGPU Shading Language (WGSL) raymarching engine compiled via Three.js TSL.
 *
 * Architecture Overview:
 * 1. Primary Raymarching (`renderFractal`):
 *    - Casts camera-relative rays through a screen-space quad with a near-clipping window (`totalDist < 0.55`)
 *      so close-up geometry right in front of the lens disappears cleanly when diving into a fractal.
 *    - Treats signed fractal interiors as hollow shells (`abs(signedDist)`) when no-clip diving
 *      (`uniformSlicerEnabled < 0.5`), combined with secant zero-crossing refinement so rays can traverse
 *      interior cavities in ~10-40 steps without GPU hangs or surface overshoot.
 *    - Bounds the surface hit threshold (`effectiveEpsilon * totalDist`) by the angular footprint
 *      of a screen pixel (`pixelScale`) to prevent marching into sub-pixel fractal needles.
 *    - Smoothly interpolates step budgets, epsilon thresholds, and fractal iterations between
 *      interactive (30 FPS target) and settled (5 FPS progressive refinement) states via `uniformSettleTime`.
 * 2. Surface Normals & Lighting:
 *    - Evaluates surface gradients in fractal space using Inigo Quilez's 4-tap tetrahedral
 *      central-difference stencil filtered across the pixel footprint, with double-sided normal
 *      orientation (`orientedNormal`) so interior walls are accurately lit when diving inside.
 *    - Combines fractal-space multi-sample Ambient Occlusion (`distAO`) with crevasse step-count
 *      occlusion (`stepAO`), a camera-attached key/fill lighting rig, Blinn-Phong specular highlights,
 *      Fresnel rim lighting, orbit-trap palette blending, and ACES filmic tonemapping.
 * 3. Distance Estimators (`get*Data`):
 *    - Analytic and IFS distance estimators for Mandelbulb, Menger Sponge, 3D Julia Set,
 *      Sierpinski Tetrahedron, Mandelbox, and Apollonian Gasket, with exterior bounding-sphere
 *      clamping (preventing zoomed-out Hubbard-Douady $O(r \ln r)$ overshoot), single-precision `f32`
 *      derivative overflow guards (`derivative > 1e15`), and optional CSG half-space slicing.
 */
export const renderFractal = wgslFn(`
  fn renderFractal(
    vUv: vec2<f32>,
    uniformResolution: vec2<f32>,
    uniformType: i32,
    uniformZoom: f32,
    uniformOffset: vec3<f32>,
    uniformRotation: mat3x3<f32>,
    uniformInteracting: f32,
    uniformInteractionType: i32,
    uniformAdaptiveIterations: f32,
    uniformAdaptiveSettledIterations: f32,
    uniformSettleTime: f32,
    uniformInteractiveSteps: f32,
    uniformSettledSteps: f32,
    uniformInteractiveEpsilon: f32,
    uniformSettledEpsilon: f32,
    uniformSlicerEnabled: f32,
    uniformSlicerOffset: f32,
    uniformSlicerAxis: i32,
    uniformParameters: vec4<f32>,
    uniformBaseColor: vec3<f32>,
    uniformAccentColor: vec3<f32>
  ) -> vec4<f32> {
    // Aspect ratio correction
    var resolution = uniformResolution;
    if (resolution.y <= 0.0) { resolution.y = 1.0; }
    let uvCoords = (vUv - 0.5) * vec2<f32>(resolution.x / resolution.y, 1.0);
    
    // Level of Detail calculation
    let zoomLOD = log2(max(1.0, uniformZoom));
    let lodFactor = clamp(zoomLOD / 10.0, 0.0, 1.0);
    
    // Ray setup (no-clip camera with near-clipping window so close-up geometry disappears when diving inside)
    let rayOrigin = uniformRotation * vec3<f32>(0.0, 0.0, -5.0) + uniformOffset;
    let rayDirection = uniformRotation * normalize(vec3<f32>(uvCoords, 1.5));
    
    var totalDist = 0.40;
    var prevDist = 0.40;
    var prevSigned = 0.0;
    var hasPrev = false;
    var stepCount = 0;
    var isHit = false;
    var hitOrbitTrap = 0.0;
    
    // Dynamic raymarching steps
    // Scale between interactiveSteps and settledSteps based on settleTime.
    let settledTargetSteps = min(800.0, uniformSettledSteps);
    let baseSteps = mix(uniformInteractiveSteps, settledTargetSteps, uniformSettleTime);
    let maxSteps = i32(baseSteps);
    
    // Screen-space pixel cone scale (1 pixel angular width at unit distance)
    // Prevents marching into sub-pixel fractal needles that alias into salt-and-pepper noise.
    let pixelScale = 1.0 / max(300.0, resolution.y * 1.5);
    let effectiveEpsilon = max(pixelScale * 0.35, mix(uniformInteractiveEpsilon, uniformSettledEpsilon, uniformSettleTime));
    
    // --- Raymarching Loop ---
    for (var i = 0; i < 1024; i = i + 1) {
      if (i >= maxSteps) { break; }
      
      let currentPoint = rayOrigin + rayDirection * totalDist;
      
      // Dynamic precision threshold bounded by sub-pixel cone radius
      let threshold = max(0.0000005, effectiveEpsilon * totalDist);
      
      // Transform to global fractal space
      let globalPoint = (currentPoint - uniformOffset) / uniformZoom + uniformOffset;
      
      // Sample signed distance
      let data = getFractalData(
        globalPoint, 
        uniformType, 
        uniformParameters, 
        uniformSettleTime, 
        zoomLOD, 
        uniformSlicerEnabled, 
        uniformSlicerOffset, 
        uniformSlicerAxis,
        uniformInteractionType,
        uniformAdaptiveIterations,
        uniformAdaptiveSettledIterations,
        uniformInteracting
      );
      let signedDist = data.x * uniformZoom;
      // When no-clip diving (slicer disabled), march using abs(signedDist) so solid interiors act as hollow shells
      let dist = select(abs(signedDist), signedDist, uniformSlicerEnabled > 0.5);
      
      // Detect exact zero-isosurface crossing between steps via secant interpolation
      if (totalDist >= 0.55 && hasPrev && prevSigned * signedDist < 0.0 && abs(prevSigned) < 0.2 * uniformZoom) {
        let tFrac = abs(prevSigned) / (abs(prevSigned) + abs(signedDist) + 1e-10);
        totalDist = prevDist + (totalDist - prevDist) * tFrac;
        isHit = true;
        hitOrbitTrap = data.y;
        break;
      }
      
      if (dist < threshold) {
        // Near-clipping window: make geometry right in front of the lens disappear so the camera can dive inside
        if (totalDist < 0.55 && uniformSlicerEnabled < 0.5) {
          totalDist = totalDist + max(0.05, dist);
          hasPrev = false;
          stepCount = i + 1;
          continue;
        }
        isHit = true;
        hitOrbitTrap = data.y;
        break;
      }
      
      prevDist = totalDist;
      prevSigned = signedDist;
      hasPrev = true;
      totalDist = totalDist + max(threshold * 0.25, dist);
      stepCount = i + 1;
      
      // Escape when ray exceeds zoom-scaled max view distance
      if (totalDist > mix(50.0, 100.0, uniformSettleTime) * max(1.0, uniformZoom)) { break; }
    }
    
    // --- Shading ---
    if (isHit) {
      let hitPoint = rayOrigin + rayDirection * totalDist;
      let pG = (hitPoint - uniformOffset) / uniformZoom + uniformOffset;
      
      // Dynamic precision threshold for normal calculation in fractal space.
      // Using Inigo Quilez's 4-tap tetrahedral central difference filtered across the pixel footprint
      // avoids directional bias, eliminates sub-pixel normal aliasing (graininess), and saves a 5th SDF call.
      let threshold = max(0.0000005, effectiveEpsilon * totalDist);
      let pixelFootprint = pixelScale * totalDist;
      let normalEpsilon = max(0.000005, max(threshold * 2.5, pixelFootprint * 0.75) / uniformZoom);
      
      let k1 = vec3<f32>( 1.0, -1.0, -1.0);
      let k2 = vec3<f32>(-1.0, -1.0,  1.0);
      let k3 = vec3<f32>(-1.0,  1.0, -1.0);
      let k4 = vec3<f32>( 1.0,  1.0,  1.0);
      
      let d1 = getFractalData(pG + k1 * normalEpsilon, uniformType, uniformParameters, uniformSettleTime, zoomLOD, uniformSlicerEnabled, uniformSlicerOffset, uniformSlicerAxis, uniformInteractionType, uniformAdaptiveIterations, uniformAdaptiveSettledIterations, uniformInteracting).x;
      let d2 = getFractalData(pG + k2 * normalEpsilon, uniformType, uniformParameters, uniformSettleTime, zoomLOD, uniformSlicerEnabled, uniformSlicerOffset, uniformSlicerAxis, uniformInteractionType, uniformAdaptiveIterations, uniformAdaptiveSettledIterations, uniformInteracting).x;
      let d3 = getFractalData(pG + k3 * normalEpsilon, uniformType, uniformParameters, uniformSettleTime, zoomLOD, uniformSlicerEnabled, uniformSlicerOffset, uniformSlicerAxis, uniformInteractionType, uniformAdaptiveIterations, uniformAdaptiveSettledIterations, uniformInteracting).x;
      let d4 = getFractalData(pG + k4 * normalEpsilon, uniformType, uniformParameters, uniformSettleTime, zoomLOD, uniformSlicerEnabled, uniformSlicerOffset, uniformSlicerAxis, uniformInteractionType, uniformAdaptiveIterations, uniformAdaptiveSettledIterations, uniformInteracting).x;
      
      let rawNormal = k1 * d1 + k2 * d2 + k3 * d3 + k4 * d4;
      let unitNormal = normalize(rawNormal);
      // Orient normal toward the incoming camera ray so interior surfaces are properly lit when diving inside
      let orientedNormal = select(unitNormal, -unitNormal, dot(unitNormal, rayDirection) > 0.0);
      let normal = select(vec3<f32>(0.0, 0.0, -1.0), orientedNormal, dot(rawNormal, rawNormal) > 1e-20);
      
      // Lighting components
      // 1. Distance-based Ambient Occlusion (IQ's method) evaluated in fractal space and scaled by zoom & distance.
      var distAO = 1.0;
      if (uniformInteracting < 0.5 && uniformSettleTime > 0.01) {
        var occ = 0.0;
        var sca = 1.0;
        
        // Dynamically reduce AO complexity if the raymarch was already very expensive
        var aoSteps = 3;
        if (stepCount > 250) { aoSteps = 1; }
        else if (stepCount > 120) { aoSteps = 2; }
        
        let distanceScale = max(0.05, totalDist / 5.0);
        for (var i = 0; i < 3; i = i + 1) {
          if (i >= aoSteps) { break; }
          let hrWorld = (0.015 + 0.03 * f32(i)) * distanceScale;
          let hrFractal = hrWorld / uniformZoom;
          let aopos = pG + normal * hrFractal;
          let ddFractal = abs(getFractalData(aopos, uniformType, uniformParameters, uniformSettleTime, zoomLOD, uniformSlicerEnabled, uniformSlicerOffset, uniformSlicerAxis, uniformInteractionType, uniformAdaptiveIterations, uniformAdaptiveSettledIterations, uniformInteracting).x);
          let ddWorld = ddFractal * uniformZoom;
          occ += max(0.0, hrWorld - ddWorld) * sca;
          sca *= 0.7; // falloff
        }
        let targetAO = clamp(1.0 - 2.5 * (occ / distanceScale), 0.0, 1.0);
        distAO = mix(1.0, targetAO, uniformSettleTime);
      }
      
      // 2. Step-count AO: High step counts (deep in crevasses) result in darker colors.
      let stepAO = mix(0.15, 1.0, exp(-f32(stepCount) * 0.012));
      
      let ambientOcclusion = distAO * stepAO;
      
      // Camera-relative lighting rig so fractal detail stays well-lit from every 360-degree orbit angle
      let mainLightDir = uniformRotation * normalize(vec3<f32>(0.8, 1.2, -0.8));
      let mainDiffuse = max(0.0, dot(normal, mainLightDir));
      
      // Secondary fill light illuminates the shadowed areas to show ridge details
      let fillLightDir = uniformRotation * normalize(vec3<f32>(-0.6, -0.2, -0.5));
      let fillDiffuse = max(0.0, dot(normal, fillLightDir));
      
      let diffuse = mainDiffuse * 0.65 + fillDiffuse * 0.22 + 0.13; // Max 1.0 total
      
      // Specular Highlight makes ridges catch the light and look sharper
      let halfVector = normalize(mainLightDir - rayDirection);
      let specular = pow(max(0.0, dot(normal, halfVector)), 32.0) * 0.12;
      
      // Rim Lighting: Adds a subtle glow at the edges of the fractal for better depth perception.
      let rim = pow(1.0 - max(0.0, dot(normal, -rayDirection)), 4.0);
      
      var baseColor = uniformBaseColor;
      var accentColor = uniformAccentColor;
      
      // Orbit Trap Coloring: Uses the auxiliary data from distance estimation (e.g. min radius reached)
      // to mix the accent color into the base color.
      let colorFactor = clamp(hitOrbitTrap, 0.0, 1.0);
      let boostedFactor = smoothstep(0.0, 1.0, colorFactor);
      baseColor = mix(baseColor, accentColor, boostedFactor);
      
      // Smooth cosine position-based color variation (avoids fract() sawtooth grid seams)
      let variation = 0.5 + 0.5 * cos(pG * 1.25);
      baseColor = mix(baseColor, variation, 0.06);
      
      let rawColor = (baseColor * diffuse + vec3<f32>(specular) + vec3<f32>(rim * 0.15)) * ambientOcclusion;
      
      // ACES Filmic Tonemapping for cinematic contrast and highlight preservation
      let a = 2.51;
      let b = 0.03;
      let c = 2.43;
      let d = 0.59;
      let e = 0.14;
      let mappedColor = (rawColor * (a * rawColor + b)) / (rawColor * (c * rawColor + d) + e);
      let finalColor = clamp(mappedColor, vec3<f32>(0.0), vec3<f32>(1.0));
      
      // Depth fog normalized by zoom so deep-zoom canyon walls do not fade to black
      let fogDist = totalDist / max(1.0, pow(uniformZoom, 0.8));
      let fogFactor = exp(-max(0.0, fogDist - 5.5) * 0.25);
      return vec4<f32>(finalColor * fogFactor, 1.0);
    }
    
    // Background
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  // --- Distance Estimation Functions ---
  
  /**
   * Mandelbulb Distance Estimator (Triplex Algebra).
   * Evaluates z_{n+1} = z_n^p + c in spherical coordinates alongside its scalar running derivative.
   * Synchronizes radius and derivative updates at the end of each iteration and applies a 0.8
   * step relaxation factor to compensate for non-conformal triplex distortion.
   * Returns vec2(signedDistance, orbitTrapFactor).
   */
  fn getMandelbulbData(point: vec3<f32>, power: f32, iterations: i32) -> vec2<f32> {
    var z = point;
    var derivative = 1.0;
    var radius = length(z);
    var orbitTrap = dot(z, z);
    
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations || radius > 4.0 || derivative > 1e15) { break; }
      
      // Convert to spherical coordinates (clamped to prevent acos NaN at origin or f32 drift)
      let safeRadius = max(1e-10, radius);
      let theta = acos(clamp(z.z / safeRadius, -1.0, 1.0));
      let phi = atan2(z.y, z.x);
      
      // Calculate derivative for distance estimation: dz_{n+1} = p * r^(p-1) * dz_n + 1
      derivative = pow(safeRadius, power - 1.0) * power * derivative + 1.0;
      
      // Raise radius to the power and multiply by the spherical components
      let zr = pow(safeRadius, power);
      z = zr * vec3<f32>(
        sin(theta * power) * cos(phi * power), 
        sin(phi * power) * sin(theta * power), 
        cos(theta * power)
      ) + point;
      
      radius = length(z);
      orbitTrap = min(orbitTrap, dot(z, z));
    }
    
    let safeR = select(radius, max(0.25, radius), radius < 1.0);
    let factor = select(0.8, 0.3, radius < 1.0);
    let rawDist = 0.5 * log(safeR) * safeR / max(1e-10, derivative) * factor;
    let pLen = length(point);
    // Bound exterior step by outer bounding sphere so zoomed-out rays (pLen > 4.0) never overshoot the front surface
    let boundedDist = select(rawDist, min(rawDist, pLen - 1.2), pLen > 1.35);
    return vec2<f32>(boundedDist, clamp(sqrt(orbitTrap) / 2.0, 0.0, 1.0));
  }

  /**
   * Menger Sponge Distance Estimator (Iterated Function System).
   * Subtracts recursive orthogonal cross-channels from a unit cube via modular space folding.
   * Returns vec2(signedDistance, structuralDepthTrap).
   */
  fn getMengerSpongeData(point: vec3<f32>, scale: f32, iterations: i32) -> vec2<f32> {
    var z = point;
    // Base box
    var d = max(abs(z.x), max(abs(z.y), abs(z.z))) - 1.0;
    var s = 1.0;
    var orbitTrap = 1.0;
    
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations) { break; }
      
      // Recursive folding and scaling. 
      // We use fract to repeat the space and abs to mirror it, creating the recursive holes.
      let a = abs(1.0 - scale * abs(fract((z * s + 1.0) * 0.5) * 2.0 - 1.0));
      s *= scale;
      
      // Calculate distance to the three orthogonal "cross" shapes that form the sponge holes.
      let da = max(a.x, a.y);
      let db = max(a.y, a.z);
      let dc = max(a.z, a.x);
      let c = (1.0 - min(da, min(db, dc))) / s;
      
      // The distance to the sponge is the maximum of the base box and the recursive holes.
      if (c > d) {
        d = c;
        // Enhance trap with positional structural depth
        orbitTrap = (f32(i) + (da + db + dc) * 0.1) / f32(max(1, iterations));
      }
    }
    return vec2<f32>(d, orbitTrap);
  }

  /**
   * 3D Julia Set Distance Estimator.
   * Iterates a 3D hypercomplex quadratic map z_{n+1} = z_n^2 + c with a fixed constant c.
   * Clamps both the running derivative and final radius to prevent interior f32 underflow or log(0) NaNs.
   * Returns vec2(signedDistance, orbitTrapFactor).
   */
  fn getJuliaData(point: vec3<f32>, constant: vec3<f32>, iterations: i32) -> vec2<f32> {
    var z = point;
    var derivative = 1.0;
    var orbitTrap = dot(z, z);
    var radius = length(z);
    
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations || radius > 4.0 || derivative > 1e15) { break; }
      
      // Calculate the derivative for distance estimation: d(z^2 + c)/dz = 2z
      derivative = max(1e-20, 2.0 * radius * derivative);
      
      // Apply the Julia iteration: z = z^2 + c
      // This is a 3D extension of the complex Julia set.
      z = vec3<f32>(
        z.x * z.x - z.y * z.y - z.z * z.z, 
        2.0 * z.x * z.y, 
        2.0 * z.x * z.z
      ) + constant;
      
      orbitTrap = min(orbitTrap, dot(z, z));
      radius = length(z);
    }
    // Distance estimation formula: 0.5 * |z| * log(|z|) / |z'|
    let safeR = select(radius, max(0.25, radius), radius < 1.0);
    let factor = select(0.5, 0.2, radius < 1.0);
    let rawDist = factor * safeR * log(safeR) / max(1e-10, derivative);
    let pLen = length(point);
    let boundedDist = select(rawDist, min(rawDist, pLen - 1.8), pLen > 2.0);
    return vec2<f32>(boundedDist, clamp(sqrt(orbitTrap) / 2.0, 0.0, 1.0));
  }

  /**
   * Sierpinski Tetrahedron Distance Estimator (KIFS).
   * Folds space across three symmetry planes of a regular tetrahedron and applies uniform homothety.
   * Returns vec2(signedDistance, foldDensityTrap).
   */
  fn getSierpinskiData(point: vec3<f32>, scale: f32, iterations: i32) -> vec2<f32> {
    var z = point;
    var folds = 0.0;
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations) { break; }
      
      if (z.x + z.y < 0.0) { z = vec3<f32>(-z.y, -z.x, z.z); folds += 1.0; }
      if (z.x + z.z < 0.0) { z = vec3<f32>(-z.z, z.y, -z.x); folds += 1.0; }
      if (z.y + z.z < 0.0) { z = vec3<f32>(z.x, -z.z, -z.y); folds += 1.0; }
      
      z = z * scale - vec3<f32>(1.0) * (scale - 1.0);
    }
    return vec2<f32>(length(z) * pow(scale, -f32(iterations)), clamp(folds / (1.5 * f32(iterations)), 0.0, 1.0));
  }

  /**
   * Mandelbox Distance Estimator (Tom Lowe's Box + Sphere Fold).
   * Alternates cubic box reflections in [-1, 1]^3 with spherical inversion between minRadius and fixedRadius.
   * Returns vec2(signedDistance, orbitTrapFactor).
   */
  fn getMandelboxData(point: vec3<f32>, scale: f32, minRadius: f32, fixedRadius: f32, iterations: i32) -> vec2<f32> {
    var z = point;
    var scaleFactor = 1.0;
    var orbitTrap = 1e10;
    
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations) { break; }
      
      // Box Fold: Reflects points outside the [-1, 1] box back inside.
      z = clamp(z, vec3<f32>(-1.0), vec3<f32>(1.0)) * 2.0 - z;
      
      // Sphere Fold: Inverts points within a certain radius.
      let r2 = dot(z, z);
      if (r2 < minRadius * minRadius) {
        // Linear scaling for points very close to the origin to avoid division by zero.
        let k = (fixedRadius * fixedRadius) / (minRadius * minRadius);
        z = z * k;
        scaleFactor = scaleFactor * k;
      } else if (r2 < fixedRadius * fixedRadius) {
        // Standard spherical inversion.
        let k = (fixedRadius * fixedRadius) / r2;
        z = z * k;
        scaleFactor = scaleFactor * k;
      }
      
      // Scale and translate back to the original point.
      z = z * scale + point;
      scaleFactor = scaleFactor * abs(scale) + 1.0;
      
      orbitTrap = min(orbitTrap, r2);
      
      if (dot(z, z) > 1e8) { break; }
    }
    return vec2<f32>(length(z) / scaleFactor, clamp(sqrt(orbitTrap) * 2.0, 0.0, 1.0));
  }

  /**
   * Apollonian Gasket Distance Estimator.
   * Combines periodic domain wrapping with Kleinian spherical inversion to generate foam-like sphere packings.
   * Returns vec2(signedDistance, orbitTrapFactor).
   */
  fn getApollonianData(point: vec3<f32>, scale: f32, iterations: i32) -> vec2<f32> {
    var z = point;
    var scaleFactor = 1.0;
    var orbitTrap = 1e10;
    
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations) { break; }
      
      z = -1.0 + 2.0 * fract(0.5 * z + 0.5);
      let r2 = dot(z, z);
      let k = scale / r2;
      z = z * k;
      scaleFactor = scaleFactor * k;
      orbitTrap = min(orbitTrap, r2);
    }
    return vec2<f32>(0.25 * abs(z.y) / scaleFactor, clamp(sqrt(orbitTrap) * 1.5, 0.0, 1.0));
  }

  /**
   * Master Fractal Dispatcher & CSG Slicer.
   * Interpolates iteration counts between interactive and settled targets, dispatches to the selected
   * fractal's Distance Estimator, and applies optional Constructive Solid Geometry (CSG) half-space slicing.
   */
  fn getFractalData(
    point: vec3<f32>,
    fractalType: i32,
    params: vec4<f32>,
    settleTime: f32,
    zoomLOD: f32,
    slicerEnabled: f32,
    slicerOffset: f32,
    slicerAxis: i32,
    uInteractionType: i32,
    uAdaptiveIterations: f32,
    uAdaptiveSettledIterations: f32,
    uInteracting: f32
  ) -> vec2<f32> {
    var data: vec2<f32> = vec2<f32>(10.0, 0.0);
    
    // Smoothly transition iterations from interactive to settled based on settleTime.
    // Zoom-based iteration boosts are computed cleanly in App.tsx and passed in uAdaptiveIterations / uAdaptiveSettledIterations.
    let effectiveSettle = select(settleTime, 0.0, uInteracting > 0.5);
    let iter = max(1, i32(round(mix(uAdaptiveIterations, uAdaptiveSettledIterations, effectiveSettle))));
    
    if (fractalType == 0) {
      data = getMandelbulbData(point, params.y, iter);
    } else if (fractalType == 1) {
      data = getMengerSpongeData(point, params.y, iter);
    } else if (fractalType == 2) {
      data = getJuliaData(point, vec3<f32>(params.z, params.w, 0.1), iter);
    } else if (fractalType == 3) {
      data = getSierpinskiData(point, params.y, iter);
    } else if (fractalType == 4) {
      data = getMandelboxData(point, params.y, params.z, params.w, iter);
    } else if (fractalType == 5) {
      data = getApollonianData(point, params.y, iter);
    }

    if (slicerEnabled > 0.5) {
      var planeDist = 0.0;
      if (slicerAxis == 0) { planeDist = point.x - slicerOffset; }
      else if (slicerAxis == 1) { planeDist = point.y - slicerOffset; }
      else if (slicerAxis == 2) { planeDist = point.z - slicerOffset; }
      data.x = max(data.x, -planeDist);
    }
    
    return data;
  }
`);
