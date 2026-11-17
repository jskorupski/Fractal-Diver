/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Human-readable names for each fractal type.
 * Used for UI display in the selection menu.
 */
export const FRACTAL_NAMES: Record<string, string> = {
  "0": "Mandelbulb",
  "1": "Menger Sponge",
  "2": "Julia Set",
  "3": "Sierpinski",
  "4": "Mandelbox",
  "5": "Apollonian"
};

/**
 * Interface for fractal configuration.
 * Defines the initial camera state, adaptive performance bounds (iterations, raymarch steps,
 * and surface epsilon thresholds), interaction sensitivities, and default shader parameters.
 */
export interface FractalConfig {
  zoom: number;
  offset: [number, number, number];
  rotation: THREE.Euler;
  minInteractiveIterations: number;
  defaultInteractiveIterations: number;
  maxInteractiveIterations: number;
  minSettledIterations: number;
  defaultSettledIterations: number;
  maxSettledIterations: number;
  minInteractiveSteps: number;
  interactiveSteps: number;
  settledSteps: number;
  minInteractiveEpsilon: number;
  defaultInteractiveEpsilon: number;
  maxInteractiveEpsilon: number;
  minSettledEpsilon: number;
  defaultSettledEpsilon: number;
  maxSettledEpsilon: number;
  panSensitivityMultiplier: number;
  rotSensitivityMultiplier: number;
  parameters: {
    param1: number;
    param2: number;
    param3: number;
    baseColor?: string;
    accentColor?: string;
  };
  slicer: {
    enabled: boolean;
    offset: number;
    axis: number;
  };
}

/**
 * Default view and adaptive quality configurations for each fractal type.
 * Note: Mandelbulb ("0") iteration bounds are specifically calibrated to its 8^k running
 * derivative growth rate so it remains within single-precision (f32) numerical limits.
 */
export const FRACTAL_CONFIGS: Record<string, FractalConfig> = {
  "0": { // Mandelbulb
    zoom: 1.2, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0, 0, 0),
    minInteractiveIterations: 6,
    defaultInteractiveIterations: 8,
    maxInteractiveIterations: 12,
    minSettledIterations: 8,
    defaultSettledIterations: 10,
    maxSettledIterations: 14,
    minInteractiveSteps: 64,
    interactiveSteps: 120,
    settledSteps: 800,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0005,
    maxInteractiveEpsilon: 0.0015,
    minSettledEpsilon: 0.00005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.0015,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 8.0, param2: 0, param3: 0, baseColor: "#cba17c", accentColor: "#b37229" },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "1": { // Menger Sponge
    zoom: 1.0, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.5, 0.5, 0),
    minInteractiveIterations: 4,
    defaultInteractiveIterations: 8,
    maxInteractiveIterations: 16,
    minSettledIterations: 8,
    defaultSettledIterations: 14,
    maxSettledIterations: 20,
    minInteractiveSteps: 64,
    interactiveSteps: 120,
    settledSteps: 800,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0005,
    maxInteractiveEpsilon: 0.0015,
    minSettledEpsilon: 0.00005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.0015,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 3.48, param2: 0, param3: 0, baseColor: "#598e91", accentColor: "#1a7bbc" },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "2": { // Julia Set
    zoom: 1.2, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0, 0, 0),
    minInteractiveIterations: 24,
    defaultInteractiveIterations: 32,
    maxInteractiveIterations: 80,
    minSettledIterations: 24,
    defaultSettledIterations: 64,
    maxSettledIterations: 96,
    minInteractiveSteps: 48,
    interactiveSteps: 80,
    settledSteps: 600,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0005,
    maxInteractiveEpsilon: 0.0015,
    minSettledEpsilon: 0.00005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.0015,
    panSensitivityMultiplier: 2.08,
    rotSensitivityMultiplier: 2.0,
    parameters: { param1: 0, param2: -0.8, param3: 0.156, baseColor: "#c27ae1", accentColor: "#1c0c22" },
    slicer: { enabled: true, offset: 0, axis: 2 }
  },
  "3": { // Sierpinski Tetrahedron
    zoom: 1.0, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.4, 0.8, 0),
    minInteractiveIterations: 8,
    defaultInteractiveIterations: 12,
    maxInteractiveIterations: 30,
    minSettledIterations: 12,
    defaultSettledIterations: 20,
    maxSettledIterations: 28,
    minInteractiveSteps: 40,
    interactiveSteps: 60,
    settledSteps: 400,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0006,
    maxInteractiveEpsilon: 0.0018,
    minSettledEpsilon: 0.00005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.0018,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 1.75, param2: 0, param3: 0, baseColor: "#41d2b5", accentColor: "#01231c" },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "4": { // Mandelbox
    zoom: 0.15, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.2, 0.4, 0),
    minInteractiveIterations: 16,
    defaultInteractiveIterations: 24,
    maxInteractiveIterations: 48,
    minSettledIterations: 24,
    defaultSettledIterations: 36,
    maxSettledIterations: 64,
    minInteractiveSteps: 56,
    interactiveSteps: 100,
    settledSteps: 600,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0005,
    maxInteractiveEpsilon: 0.0015,
    minSettledEpsilon: 0.00005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.001,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 2.0, param2: 0.135, param3: 1.0, baseColor: "#e4d1e6", accentColor: "#d987c7" },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "5": { // Apollonian
    zoom: 1.5, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.5, 0.5, 0.5),
    minInteractiveIterations: 4,
    defaultInteractiveIterations: 8,
    maxInteractiveIterations: 24,
    minSettledIterations: 8,
    defaultSettledIterations: 14,
    maxSettledIterations: 24,
    minInteractiveSteps: 40,
    interactiveSteps: 60,
    settledSteps: 300,
    minInteractiveEpsilon: 0.0003,
    defaultInteractiveEpsilon: 0.0008,
    maxInteractiveEpsilon: 0.002,
    minSettledEpsilon: 0.00005,
    defaultSettledEpsilon: 0.0003,
    maxSettledEpsilon: 0.002,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 1.0, param2: 0, param3: 0, baseColor: "#c7b2a3", accentColor: "#f99858" },
    slicer: { enabled: true, offset: 0, axis: 2 }
  }
};
