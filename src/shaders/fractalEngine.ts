import { wgslFn } from 'three/tsl';

/**
 * Fractal Engine WGSL implementation.
 * This file contains the core raymarching logic and distance estimation functions
 * for various 3D fractals.
 * 
 * Improved with descriptive variable names and comprehensive comments as requested.
 */
export const fractalEngine = wgslFn(`
  fn fractalRender(
    vUv: vec2<f32>,
    uRes: vec2<f32>,
    uType: i32,
    uZoom: f32,
    uOff: vec3<f32>,
    uRot: mat3x3<f32>,
    uInteracting: f32,
    uInteractionType: i32,
    uAdaptiveIterations: f32,        // Dynamically adjusted max iterations during interaction
    uAdaptiveSettledIterations: f32, // Dynamically adjusted max iterations when settled
    uSettleTime: f32,                // 0.0 to 1.0 transition from interactive to settled
    uSlicerEnabled: f32,
    uSlicerOffset: f32,
    uSlicerAxis: i32,
    uParams: vec4<f32>
  ) -> vec4<f32> {
    // Aspect ratio correction
    var resolution = uRes;
    if (resolution.y <= 0.0) { resolution.y = 1.0; }
    let uvCoords = (vUv - 0.5) * vec2<f32>(resolution.x / resolution.y, 1.0);
    
    // Level of Detail calculation
    let zoomLOD = log2(max(1.0, uZoom));
    let lodFactor = clamp(zoomLOD / 10.0, 0.0, 1.0);
    
    // Ray setup
    let rayOrigin = uRot * vec3<f32>(0.0, 0.0, -5.0) + uOff;
    let rayDirection = uRot * normalize(vec3<f32>(uvCoords, 1.5));
    
    var totalDist = 0.1;
    var stepCount = 0;
    var isHit = false;
    
    // Dynamic raymarching steps
    // We scale the number of raymarching steps based on whether we are settled or interacting.
    // When settled, we also increase steps at higher zoom levels (lodFactor).
    let maxSteps = i32(mix(64.0, mix(128.0, 768.0, lodFactor), uSettleTime));
    
    // --- Raymarching Loop ---
    for (var i = 0; i < 768; i = i + 1) {
      if (i >= maxSteps) { break; }
      
      let currentPoint = rayOrigin + rayDirection * totalDist;
      
      // Dynamic precision threshold
      // User requested more conservative threshold when settled to reduce graininess
      let threshold = max(0.0000001, mix(0.0002, 0.000010, uSettleTime) * totalDist / uZoom);
      
      // Transform to global fractal space
      let globalPoint = currentPoint / uZoom;
      
      // Sample distance
      let data = getFractalData(
        globalPoint, 
        uType, 
        uParams, 
        uSettleTime, 
        zoomLOD, 
        uSlicerEnabled, 
        uSlicerOffset, 
        uSlicerAxis,
        uInteractionType,
        uAdaptiveIterations,
        uAdaptiveSettledIterations
      );
      let dist = data.x * uZoom;
      
      if (dist < threshold) {
        isHit = true;
        break;
      }
      
      totalDist = totalDist + max(threshold * 0.25, dist);
      stepCount = i;
      
      // Escape distance
      if (totalDist > mix(10.0, 20.0, uSettleTime)) { break; }
    }
    
    // --- Shading ---
    if (isHit) {
      let hitPoint = rayOrigin + rayDirection * totalDist;
      
      // Dynamic precision threshold for normal calculation
      let threshold = max(0.0000001, mix(0.0002, 0.000010, uSettleTime) * totalDist / uZoom);
      let epsilon = max(0.0000001, threshold * 0.5);
      
      // Normal calculation via finite difference
      let pG = hitPoint / uZoom;
      let hitData = getFractalData(pG, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType, uAdaptiveIterations, uAdaptiveSettledIterations);
      let dC = hitData.x;
      
      let pX = (hitPoint + vec3<f32>(epsilon, 0.0, 0.0)) / uZoom;
      let dX = getFractalData(pX, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType, uAdaptiveIterations, uAdaptiveSettledIterations).x;
      
      let pY = (hitPoint + vec3<f32>(0.0, epsilon, 0.0)) / uZoom;
      let dY = getFractalData(pY, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType, uAdaptiveIterations, uAdaptiveSettledIterations).x;
      
      let pZ = (hitPoint + vec3<f32>(0.0, 0.0, epsilon)) / uZoom;
      let dZ = getFractalData(pZ, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType, uAdaptiveIterations, uAdaptiveSettledIterations).x;
      
      let normal = normalize(vec3<f32>(dX, dY, dZ) - dC);
      
      // Lighting components
      let ambientOcclusion = 1.0 - f32(stepCount) / f32(maxSteps);
      let lightDir = normalize(vec3<f32>(1.0, 1.0, -1.0));
      let diffuse = max(0.0, dot(normal, lightDir)) * 0.6 + 0.4;
      let rim = pow(1.0 - max(0.0, dot(normal, -rayDirection)), 4.0);
      
      // Color selection with subtle palettes
      var baseColor = vec3<f32>(0.4, 0.6, 1.0); // Default Blue
      var accentColor = vec3<f32>(0.2, 0.4, 0.8);
      
      if (uType == 0) { 
        baseColor = vec3<f32>(1.0, 0.6, 0.3); // Gold/Orange
        accentColor = vec3<f32>(0.8, 0.2, 0.1);
      } else if (uType == 1) { 
        baseColor = vec3<f32>(0.7, 0.7, 0.7); // Silver
        accentColor = vec3<f32>(0.4, 0.5, 0.6);
      } else if (uType == 2) { 
        baseColor = vec3<f32>(0.6, 0.3, 0.9); // Purple
        accentColor = vec3<f32>(0.2, 0.1, 0.4);
      } else if (uType == 3) { 
        baseColor = vec3<f32>(1.0, 0.4, 0.4); // Red
        accentColor = vec3<f32>(0.6, 0.1, 0.1);
      } else if (uType == 4) { 
        baseColor = vec3<f32>(0.3, 0.8, 0.6); // Emerald
        accentColor = vec3<f32>(0.1, 0.3, 0.2);
      } else if (uType == 5) { 
        baseColor = vec3<f32>(0.9, 0.8, 0.4); // Sand
        accentColor = vec3<f32>(0.5, 0.3, 0.1);
      }
      
      // Apply stronger color variation based on orbit trap data
      // Using a non-linear mapping (pow) to make the transitions more dramatic
      let colorFactor = clamp(hitData.y, 0.0, 1.0);
      let boostedFactor = pow(colorFactor, 0.5); // Boost mid-tones
      baseColor = mix(baseColor, accentColor, boostedFactor * 0.6);
      
      // Position-based color variation (very subtle)
      let variation = fract(hitPoint / uZoom * 0.2 + 0.5);
      baseColor = mix(baseColor, variation, 0.08);
      
      let finalColor = (baseColor * diffuse + rim * 0.4) * ambientOcclusion;
      
      // Depth fog - adjusted for better brightness at a distance
      // We use a softer exponent and a small constant boost
      let fogFactor = exp(-0.25 * totalDist) + 0.05;
      return vec4<f32>(finalColor * fogFactor, 1.0);
    }
    
    // Background
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  // --- Distance Estimation Functions ---
  
  /**
   * Mandelbulb Distance Estimator
   * Returns vec2(distance, colorFactor)
   */
  fn getMandelbulbData(point: vec3<f32>, power: f32, iterations: i32) -> vec2<f32> {
    var z = point;
    var derivative = 1.0;
    var radius = 0.0;
    var orbitTrap = 1e10;
    
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations) { break; }
      
      radius = length(z);
      orbitTrap = min(orbitTrap, dot(z, z));
      if (radius > 4.0) { break; }
      
      // Convert to spherical coordinates
      let theta = acos(z.z / radius);
      let phi = atan2(z.y, z.x);
      
      // Calculate derivative for distance estimation
      derivative = pow(radius, power - 1.0) * power * derivative + 1.0;
      
      // Raise radius to the power and multiply by the spherical components
      let zr = pow(radius, power);
      z = zr * vec3<f32>(
        sin(theta * power) * cos(phi * power), 
        sin(phi * power) * sin(theta * power), 
        cos(theta * power)
      ) + point;
    }
    
    return vec2<f32>(0.5 * log(radius) * radius / derivative, clamp(orbitTrap / 16.0, 0.0, 1.0));
  }

  /**
   * Menger Sponge Distance Estimator
   * Returns vec2(distance, colorFactor)
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
        orbitTrap = f32(i) / f32(iterations);
      }
    }
    return vec2<f32>(d, orbitTrap);
  }

  /**
   * Julia Set Distance Estimator
   * Returns vec2(distance, colorFactor)
   */
  fn getJuliaData(point: vec3<f32>, constant: vec3<f32>, iterations: i32) -> vec2<f32> {
    var z = point;
    var derivative = 1.0;
    var orbitTrap = 1e10;
    
    for (var i = 0; i < 128; i = i + 1) {
      if (i >= iterations) { break; }
      
      // Calculate the derivative for distance estimation: d(z^2 + c)/dz = 2z
      derivative = 2.0 * length(z) * derivative;
      
      // Apply the Julia iteration: z = z^2 + c
      // This is a 3D extension of the complex Julia set.
      z = vec3<f32>(
        z.x * z.x - z.y * z.y - z.z * z.z, 
        2.0 * z.x * z.y, 
        2.0 * z.x * z.z
      ) + constant;
      
      orbitTrap = min(orbitTrap, dot(z, z));
      if (length(z) > 4.0) { break; }
    }
    // Distance estimation formula: 0.5 * |z| * log(|z|) / |z'|
    return vec2<f32>(0.5 * length(z) * log(length(z)) / derivative, clamp(orbitTrap / 16.0, 0.0, 1.0));
  }

  /**
   * Sierpinski Tetrahedron Distance Estimator
   * Returns vec2(distance, colorFactor)
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
    return vec2<f32>(length(z) * pow(scale, -f32(iterations)), folds / (3.0 * f32(iterations)));
  }

  /**
   * Mandelbox Distance Estimator
   * Returns vec2(distance, colorFactor)
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
    return vec2<f32>(length(z) / scaleFactor, clamp(orbitTrap, 0.0, 1.0));
  }

  /**
   * Apollonian Gasket Distance Estimator
   * Returns vec2(distance, colorFactor)
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
    return vec2<f32>(0.25 * abs(z.y) / scaleFactor, clamp(orbitTrap, 0.0, 1.0));
  }

  /**
   * Master Distance and Data Estimator
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
    uAdaptiveSettledIterations: f32
  ) -> vec2<f32> {
    var data: vec2<f32> = vec2<f32>(10.0, 0.0);
    
    if (fractalType == 0) {
      let settledLimit = uAdaptiveSettledIterations + zoomLOD * 0.5;
      let iter = i32(mix(uAdaptiveIterations, settledLimit, settleTime));
      data = getMandelbulbData(point, params.y, iter);
    } else if (fractalType == 1) {
      let settledLimit = uAdaptiveSettledIterations + zoomLOD * 0.3;
      let iter = i32(mix(uAdaptiveIterations, settledLimit, settleTime));
      data = getMengerSpongeData(point, params.y, iter);
    } else if (fractalType == 2) {
      let settledLimit = uAdaptiveSettledIterations + zoomLOD * 0.8;
      let iter = i32(mix(uAdaptiveIterations, settledLimit, settleTime));
      data = getJuliaData(point, vec3<f32>(params.z, params.w, 0.1), iter);
    } else if (fractalType == 3) {
      let settledLimit = uAdaptiveSettledIterations + zoomLOD;
      let iter = i32(mix(uAdaptiveIterations, settledLimit, settleTime));
      data = getSierpinskiData(point, params.y, iter);
    } else if (fractalType == 4) {
      let settledLimit = uAdaptiveSettledIterations + zoomLOD * 0.4;
      let iter = i32(mix(uAdaptiveIterations, settledLimit, settleTime));
      data = getMandelboxData(point, params.y, params.z, params.w, iter);
    } else if (fractalType == 5) {
      let settledLimit = uAdaptiveSettledIterations + zoomLOD * 0.5;
      let iter = i32(mix(uAdaptiveIterations, settledLimit, settleTime));
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
