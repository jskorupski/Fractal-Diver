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
    uOff: vec2<f32>,
    uRot: mat3x3<f32>,
    uInteracting: f32,
    uInteractionType: i32,
    uSettleTime: f32,
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
    let rayOrigin = uRot * vec3<f32>(0.0, 0.0, -5.0);
    let rayDirection = uRot * normalize(vec3<f32>(uvCoords, 1.5));
    
    var totalDist = 0.1;
    var stepCount = 0;
    var isHit = false;
    
    // Dynamic raymarching steps
    let maxSteps = i32(mix(64.0, mix(128.0, 768.0, lodFactor), uSettleTime));
    
    // --- Raymarching Loop ---
    for (var i = 0; i < 768; i = i + 1) {
      if (i >= maxSteps) { break; }
      
      let currentPoint = rayOrigin + rayDirection * totalDist;
      
      // Dynamic precision threshold
      let threshold = max(0.0000001, mix(0.0002, 0.000005, uSettleTime) * totalDist / uZoom);
      
      // Transform to global fractal space
      let globalPoint = currentPoint / uZoom + vec3<f32>(uOff, 0.0);
      
      // Sample distance
      let dist = getFractalDistance(
        globalPoint, 
        uType, 
        uParams, 
        uSettleTime, 
        zoomLOD, 
        uSlicerEnabled, 
        uSlicerOffset, 
        uSlicerAxis,
        uInteractionType
      ) * uZoom;
      
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
      let epsilon = 0.0005;
      
      // Normal calculation via finite difference
      let pG = hitPoint / uZoom + vec3<f32>(uOff, 0.0);
      let dC = getFractalDistance(pG, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType);
      
      let pX = (hitPoint + vec3<f32>(epsilon, 0.0, 0.0)) / uZoom + vec3<f32>(uOff, 0.0);
      let dX = getFractalDistance(pX, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType);
      
      let pY = (hitPoint + vec3<f32>(0.0, epsilon, 0.0)) / uZoom + vec3<f32>(uOff, 0.0);
      let dY = getFractalDistance(pY, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType);
      
      let pZ = (hitPoint + vec3<f32>(0.0, 0.0, epsilon)) / uZoom + vec3<f32>(uOff, 0.0);
      let dZ = getFractalDistance(pZ, uType, uParams, uSettleTime, zoomLOD, uSlicerEnabled, uSlicerOffset, uSlicerAxis, uInteractionType);
      
      let normal = normalize(vec3<f32>(dX, dY, dZ) - dC);
      
      // Lighting components
      let ambientOcclusion = 1.0 - f32(stepCount) / f32(maxSteps);
      let lightDir = normalize(vec3<f32>(1.0, 1.0, -1.0));
      let diffuse = max(0.0, dot(normal, lightDir)) * 0.7 + 0.3;
      let rim = pow(1.0 - max(0.0, dot(normal, -rayDirection)), 4.0);
      
      // Color selection
      var baseColor = vec3<f32>(0.4, 0.6, 1.0);
      if (uType == 0) { baseColor = vec3<f32>(1.0, 0.6, 0.3); }
      else if (uType == 1) { baseColor = vec3<f32>(0.7, 0.7, 0.7); }
      else if (uType == 3) { baseColor = vec3<f32>(1.0, 0.4, 0.4); }
      
      // Position-based color variation
      let variation = fract(hitPoint / uZoom * 0.5 + 0.5);
      baseColor = mix(baseColor, variation, 0.15);
      
      let finalColor = (baseColor * diffuse + rim * 0.4) * ambientOcclusion;
      
      // Depth fog
      let fogFactor = exp(-0.45 * totalDist);
      return vec4<f32>(finalColor * fogFactor, 1.0);
    }
    
    // Background
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  // --- Distance Estimation Functions ---

  /**
   * Mandelbulb Distance Estimator
   */
  fn getMandelbulbDistance(point: vec3<f32>, power: f32, iterations: i32) -> f32 {
    var z = point;
    var derivative = 1.0;
    var radius = 0.0;
    
    for (var i = 0; i < 64; i = i + 1) {
      if (i >= iterations) { break; }
      
      radius = length(z);
      if (radius > 4.0) { break; }
      
      let theta = acos(z.z / radius);
      let phi = atan2(z.y, z.x);
      
      derivative = pow(radius, power - 1.0) * power * derivative + 1.0;
      
      let zr = pow(radius, power);
      z = zr * vec3<f32>(
        sin(theta * power) * cos(phi * power), 
        sin(phi * power) * sin(theta * power), 
        cos(theta * power)
      ) + point;
    }
    
    return 0.5 * log(radius) * radius / derivative;
  }

  /**
   * Menger Sponge Distance Estimator
   */
  fn getMengerSpongeDistance(point: vec3<f32>, scale: f32, iterations: i32) -> f32 {
    var z = point;
    var dist = max(abs(z.x), max(abs(z.y), abs(z.z))) - 1.0;
    var currentScale = 1.0;
    
    for (var i = 0; i < 64; i = i + 1) {
      if (i >= iterations) { break; }
      
      let folded = 2.0 * fract((z * currentScale + 1.0) * 0.5) - 1.0;
      currentScale = currentScale * scale;
      
      let r = abs(1.0 - scale * abs(folded));
      let holeDist = (1.0 - min(max(r.x, r.y), min(max(r.x, r.z), max(r.y, r.z)))) / currentScale;
      dist = max(dist, holeDist);
      
      if (dist > 0.5 / currentScale) { break; }
    }
    return dist;
  }

  /**
   * Julia Set (3D Quaternion-like) Distance Estimator
   */
  fn getJuliaDistance(point: vec3<f32>, constant: vec3<f32>, iterations: i32) -> f32 {
    var z = point;
    var derivative = 1.0;
    
    for (var i = 0; i < 64; i = i + 1) {
      if (i >= iterations) { break; }
      
      derivative = 2.0 * length(z) * derivative;
      z = vec3<f32>(
        z.x * z.x - z.y * z.y - z.z * z.z, 
        2.0 * z.x * z.y, 
        2.0 * z.x * z.z
      ) + constant;
      
      if (length(z) > 4.0) { break; }
    }
    return 0.5 * length(z) * log(length(z)) / derivative;
  }

  /**
   * Sierpinski Tetrahedron Distance Estimator
   */
  fn getSierpinskiDistance(point: vec3<f32>, scale: f32, iterations: i32) -> f32 {
    var z = point;
    for (var i = 0; i < 64; i = i + 1) {
      if (i >= iterations) { break; }
      
      if (z.x + z.y < 0.0) { z = vec3<f32>(-z.y, -z.x, z.z); }
      if (z.x + z.z < 0.0) { z = vec3<f32>(-z.z, z.y, -z.x); }
      if (z.y + z.z < 0.0) { z = vec3<f32>(z.x, -z.z, -z.y); }
      
      z = z * scale - vec3<f32>(1.0) * (scale - 1.0);
    }
    return length(z) * pow(scale, -f32(iterations));
  }

  /**
   * Mandelbox Distance Estimator
   */
  fn getMandelboxDistance(point: vec3<f32>, scale: f32, minRadius: f32, fixedRadius: f32, iterations: i32) -> f32 {
    var z = point;
    var scaleFactor = 1.0;
    
    for (var i = 0; i < 64; i = i + 1) {
      if (i >= iterations) { break; }
      
      z = clamp(z, vec3<f32>(-1.0), vec3<f32>(1.0)) * 2.0 - z;
      
      let r2 = dot(z, z);
      if (r2 < minRadius * minRadius) {
        let k = (fixedRadius * fixedRadius) / (minRadius * minRadius);
        z = z * k;
        scaleFactor = scaleFactor * k;
      } else if (r2 < fixedRadius * fixedRadius) {
        let k = (fixedRadius * fixedRadius) / r2;
        z = z * k;
        scaleFactor = scaleFactor * k;
      }
      
      z = z * scale + point;
      scaleFactor = scaleFactor * abs(scale) + 1.0;
    }
    return length(z) / scaleFactor;
  }

  /**
   * Apollonian Gasket Distance Estimator
   */
  fn getApollonianDistance(point: vec3<f32>, scale: f32, iterations: i32) -> f32 {
    var z = point;
    var scaleFactor = 1.0;
    
    for (var i = 0; i < 64; i = i + 1) {
      if (i >= iterations) { break; }
      
      z = -1.0 + 2.0 * fract(0.5 * z + 0.5);
      let r2 = dot(z, z);
      let k = scale / r2;
      z = z * k;
      scaleFactor = scaleFactor * k;
    }
    return 0.25 * abs(z.y) / scaleFactor;
  }

  /**
   * Master Distance Estimator
   */
  fn getFractalDistance(
    point: vec3<f32>,
    fractalType: i32,
    params: vec4<f32>,
    settleTime: f32,
    zoomLOD: f32,
    slicerEnabled: f32,
    slicerOffset: f32,
    slicerAxis: i32,
    uInteractionType: i32
  ) -> f32 {
    var dist: f32 = 10.0;
    let maxIterations = i32(params.x);
    
    // Determine base interactive iterations based on interaction type
    // 0: none, 1: pan/rotate, 2: zoom
    
    if (fractalType == 0) {
      let interactiveLimit = 12.0; // Increased from 4.0
      let settledLimit = f32(maxIterations) + zoomLOD * 0.5;
      var baseIter = interactiveLimit;
      if (uInteractionType == 2) { baseIter = mix(interactiveLimit, settledLimit, 0.4); }
      let iter = i32(mix(baseIter, settledLimit, settleTime));
      dist = getMandelbulbDistance(point, params.y, iter);
    } else if (fractalType == 1) {
      let interactiveLimit = 4.0;
      let settledLimit = f32(maxIterations) + zoomLOD * 0.3;
      var baseIter = interactiveLimit;
      if (uInteractionType == 2) { baseIter = mix(interactiveLimit, settledLimit, 0.4); }
      let iter = i32(mix(baseIter, settledLimit, settleTime));
      dist = getMengerSpongeDistance(point, params.y, iter);
    } else if (fractalType == 2) {
      let interactiveLimit = 48.0;
      let settledLimit = f32(maxIterations) + zoomLOD * 0.8;
      var baseIter = interactiveLimit;
      if (uInteractionType == 2) { baseIter = mix(interactiveLimit, settledLimit, 0.4); }
      let iter = i32(mix(baseIter, settledLimit, settleTime));
      dist = getJuliaDistance(point, vec3<f32>(params.z, params.w, 0.1), iter);
    } else if (fractalType == 3) {
      let interactiveLimit = 14.0;
      let settledLimit = f32(maxIterations) + zoomLOD;
      var baseIter = interactiveLimit;
      if (uInteractionType == 2) { baseIter = mix(interactiveLimit, settledLimit, 0.4); }
      let iter = i32(mix(baseIter, settledLimit, settleTime));
      dist = getSierpinskiDistance(point, params.y, iter);
    } else if (fractalType == 4) {
      let interactiveLimit = 8.0;
      let settledLimit = f32(maxIterations) + zoomLOD * 0.4;
      var baseIter = interactiveLimit;
      if (uInteractionType == 2) { baseIter = mix(interactiveLimit, settledLimit, 0.4); }
      let iter = i32(mix(baseIter, settledLimit, settleTime));
      dist = getMandelboxDistance(point, params.y, params.z, params.w, iter);
    } else if (fractalType == 5) {
      let interactiveLimit = 4.0;
      let settledLimit = f32(maxIterations) + zoomLOD * 0.5;
      var baseIter = interactiveLimit;
      if (uInteractionType == 2) { baseIter = mix(interactiveLimit, settledLimit, 0.4); }
      let iter = i32(mix(baseIter, settledLimit, settleTime));
      dist = getApollonianDistance(point, params.y, iter);
    }

    if (slicerEnabled > 0.5) {
      var planeDist = 0.0;
      if (slicerAxis == 0) { planeDist = point.x - slicerOffset; }
      else if (slicerAxis == 1) { planeDist = point.y - slicerOffset; }
      else if (slicerAxis == 2) { planeDist = point.z - slicerOffset; }
      dist = max(dist, -planeDist);
    }
    
    return dist;
  }
`);
