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
 * Defines the initial view parameters and fractal-specific calculation parameters.
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
  };
  slicer: {
    enabled: boolean;
    offset: number;
    axis: number;
  };
}

/**
 * Default view configurations for each fractal type.
 * These values are applied when a fractal is first selected or reset.
 */
export const FRACTAL_CONFIGS: Record<string, FractalConfig> = {
  "0": { // Mandelbulb
    zoom: 1.2, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0, 0, 0),
    minInteractiveIterations: 12,
    defaultInteractiveIterations: 16,
    maxInteractiveIterations: 48,
    minSettledIterations: 20,
    defaultSettledIterations: 32,
    maxSettledIterations: 200,
    interactiveSteps: 120,
    settledSteps: 800,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0005,
    maxInteractiveEpsilon: 0.008,
    minSettledEpsilon: 0.000005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.003,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 8.0, param2: 0, param3: 0 },
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
    defaultSettledIterations: 16,
    maxSettledIterations: 64,
    interactiveSteps: 120,
    settledSteps: 800,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0005,
    maxInteractiveEpsilon: 0.005,
    minSettledEpsilon: 0.000005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.002,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 3.3, param2: 0, param3: 0 },
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
    maxSettledIterations: 250,
    interactiveSteps: 80,
    settledSteps: 600,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.0005,
    maxInteractiveEpsilon: 0.002,
    minSettledEpsilon: 0.000005,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.002,
    panSensitivityMultiplier: 2.08,
    rotSensitivityMultiplier: 2.0,
    parameters: { param1: 0, param2: -0.8, param3: 0.156 },
    slicer: { enabled: true, offset: 0, axis: 2 }
  },
  "3": { // Sierpinski Tetrahedron
    zoom: 1.0, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.4, 0.8, 0),
    minInteractiveIterations: 8,
    defaultInteractiveIterations: 12,
    maxInteractiveIterations: 30,
    minSettledIterations: 15,
    defaultSettledIterations: 30,
    maxSettledIterations: 60,
    interactiveSteps: 60,
    settledSteps: 400,
    minInteractiveEpsilon: 0.0001,
    defaultInteractiveEpsilon: 0.001,
    maxInteractiveEpsilon: 0.005,
    minSettledEpsilon: 0.00001,
    defaultSettledEpsilon: 0.0001,
    maxSettledEpsilon: 0.005,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 1.75, param2: 0, param3: 0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "4": { // Mandelbox
    zoom: 0.15, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.2, 0.4, 0),
    minInteractiveIterations: 12,
    defaultInteractiveIterations: 16,
    maxInteractiveIterations: 48,
    minSettledIterations: 20,
    defaultSettledIterations: 32,
    maxSettledIterations: 200,
    interactiveSteps: 120,
    settledSteps: 800,
    minInteractiveEpsilon: 0.00005,
    defaultInteractiveEpsilon: 0.0002,
    maxInteractiveEpsilon: 0.0015,
    minSettledEpsilon: 0.000002,
    defaultSettledEpsilon: 0.00005,
    maxSettledEpsilon: 0.0008,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 2.0, param2: 0.135, param3: 1.0 },
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
    defaultSettledIterations: 16,
    maxSettledIterations: 48,
    interactiveSteps: 60,
    settledSteps: 300,
    minInteractiveEpsilon: 0.0005,
    defaultInteractiveEpsilon: 0.002,
    maxInteractiveEpsilon: 0.008,
    minSettledEpsilon: 0.00001,
    defaultSettledEpsilon: 0.0005,
    maxSettledEpsilon: 0.008,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { param1: 1.0, param2: 0, param3: 0 },
    slicer: { enabled: true, offset: 0, axis: 2 }
  }
};
