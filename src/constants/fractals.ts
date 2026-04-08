import * as THREE from 'three';

/**
 * Human-readable names for each fractal type.
 * Used for UI display in the selection menu.
 */
export const FRACTAL_NAMES: Record<string, string> = {
  "0": "Mandelbulb",
  "1": "Menger Sponge",
  "2": "Julia Set",
  "3": "Sierpinski Tetrahedron",
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
  minInteractiveIterationsLowEnd: number;
  maxInteractiveIterations: number;
  minSettledIterations: number;
  minSettledIterationsLowEnd: number;
  maxSettledIterations: number;
  panSensitivityMultiplier: number;
  rotSensitivityMultiplier: number;
  parameters: {
    qualityOffset: number;
    qualityStep: number;
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
    minInteractiveIterations: 4,
    minInteractiveIterationsLowEnd: 2,
    maxInteractiveIterations: 32,
    minSettledIterations: 16,
    minSettledIterationsLowEnd: 8,
    maxSettledIterations: 128,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { qualityOffset: 0, qualityStep: 4, param1: 8.0, param2: 0, param3: 0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "1": { // Menger Sponge
    zoom: 1.0, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.5, 0.5, 0),
    minInteractiveIterations: 3,
    minInteractiveIterationsLowEnd: 2,
    maxInteractiveIterations: 8,
    minSettledIterations: 8,
    minSettledIterationsLowEnd: 4,
    maxSettledIterations: 24,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { qualityOffset: 0, qualityStep: 1, param1: 5.0, param2: 0, param3: 0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "2": { // Julia Set
    zoom: 1.2, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0, 0, 0),
    minInteractiveIterations: 32,
    minInteractiveIterationsLowEnd: 16,
    maxInteractiveIterations: 128,
    minSettledIterations: 128,
    minSettledIterationsLowEnd: 64,
    maxSettledIterations: 512,
    panSensitivityMultiplier: 2.08,
    rotSensitivityMultiplier: 2.0,
    parameters: { qualityOffset: 0, qualityStep: 16, param1: 0, param2: -0.8, param3: 0.156 },
    slicer: { enabled: true, offset: 0, axis: 2 }
  },
  "3": { // Sierpinski Tetrahedron
    zoom: 1.0, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.4, 0.8, 0),
    minInteractiveIterations: 10,
    minInteractiveIterationsLowEnd: 5,
    maxInteractiveIterations: 40,
    minSettledIterations: 40,
    minSettledIterationsLowEnd: 20,
    maxSettledIterations: 160,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { qualityOffset: 0, qualityStep: 8, param1: 2.0, param2: 0, param3: 0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "4": { // Mandelbox
    zoom: 0.15, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.2, 0.4, 0),
    minInteractiveIterations: 6,
    minInteractiveIterationsLowEnd: 3,
    maxInteractiveIterations: 24,
    minSettledIterations: 24,
    minSettledIterationsLowEnd: 12,
    maxSettledIterations: 64,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { qualityOffset: 0, qualityStep: 4, param1: 2.0, param2: 0.135, param3: 1.0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "5": { // Apollonian
    zoom: 1.5, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.5, 0.5, 0.5),
    minInteractiveIterations: 3,
    minInteractiveIterationsLowEnd: 2,
    maxInteractiveIterations: 10,
    minSettledIterations: 10,
    minSettledIterationsLowEnd: 5,
    maxSettledIterations: 40,
    panSensitivityMultiplier: 1.0,
    rotSensitivityMultiplier: 1.0,
    parameters: { qualityOffset: 0, qualityStep: 2, param1: 1.0, param2: 0, param3: 0 },
    slicer: { enabled: true, offset: 0, axis: 2 }
  }
};
