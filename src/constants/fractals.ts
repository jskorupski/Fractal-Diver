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
  maxInteractiveIterations: number;
  minSettledIterations: number;
  maxSettledIterations: number;
  parameters: {
    iterations: number;
    p1: number; // Generic parameter 1 (e.g. Power, Scale)
    p2: number; // Generic parameter 2 (e.g. Julia C real, MinRadius)
    p3: number; // Generic parameter 3 (e.g. Julia C imag, FixedRadius)
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
    minInteractiveIterations: 8,
    maxInteractiveIterations: 32,
    minSettledIterations: 32,
    maxSettledIterations: 128,
    parameters: { iterations: 48, p1: 8.0, p2: 0, p3: 0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "1": { // Menger Sponge
    zoom: 1.0, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.5, 0.5, 0),
    minInteractiveIterations: 3,
    maxInteractiveIterations: 8,
    minSettledIterations: 8,
    maxSettledIterations: 24,
    parameters: { iterations: 6, p1: 5.0, p2: 0, p3: 0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "2": { // Julia Set
    zoom: 1.2, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0, 0, 0),
    minInteractiveIterations: 32,
    maxInteractiveIterations: 128,
    minSettledIterations: 128,
    maxSettledIterations: 512,
    parameters: { iterations: 128, p1: 0, p2: -0.8, p3: 0.156 },
    slicer: { enabled: true, offset: 0, axis: 2 }
  },
  "3": { // Sierpinski Tetrahedron
    zoom: 1.0, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.4, 0.8, 0),
    minInteractiveIterations: 10,
    maxInteractiveIterations: 40,
    minSettledIterations: 40,
    maxSettledIterations: 160,
    parameters: { iterations: 40, p1: 2.0, p2: 0, p3: 0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "4": { // Mandelbox
    zoom: 0.15, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.2, 0.4, 0),
    minInteractiveIterations: 6,
    maxInteractiveIterations: 24,
    minSettledIterations: 24,
    maxSettledIterations: 96,
    parameters: { iterations: 32, p1: 2.0, p2: 0.135, p3: 1.0 },
    slicer: { enabled: false, offset: 0, axis: 2 }
  },
  "5": { // Apollonian
    zoom: 1.5, 
    offset: [0, 0, 0], 
    rotation: new THREE.Euler(0.5, 0.5, 0.5),
    minInteractiveIterations: 3,
    maxInteractiveIterations: 10,
    minSettledIterations: 10,
    maxSettledIterations: 40,
    parameters: { iterations: 10, p1: 1.0, p2: 0, p3: 0 },
    slicer: { enabled: true, offset: 0, axis: 2 }
  }
};
