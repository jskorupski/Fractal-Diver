import { describe, it, expect } from 'vitest';
import { FRACTAL_CONFIGS, FRACTAL_NAMES } from './fractals';

describe('Fractal Constants', () => {
  it('should have names for all defined configurations', () => {
    const configKeys = Object.keys(FRACTAL_CONFIGS);
    const nameKeys = Object.keys(FRACTAL_NAMES);
    
    expect(configKeys.length).toBeGreaterThan(0);
    expect(nameKeys.length).toBe(configKeys.length);
    
    configKeys.forEach(key => {
      expect(FRACTAL_NAMES[key]).toBeDefined();
    });
  });

  it('should have valid initial parameters for each fractal', () => {
    Object.values(FRACTAL_CONFIGS).forEach(config => {
      expect(config.zoom).toBeGreaterThan(0);
      expect(typeof config.parameters.param1).toBe('number');
      expect(typeof config.parameters.param2).toBe('number');
      expect(typeof config.parameters.param3).toBe('number');
      expect(Array.isArray(config.offset)).toBe(true);
      expect(config.offset.length).toBe(3);
      expect(config.rotation).toBeDefined();
      
      // Adaptive iteration bounds
      expect(config.minInteractiveIterations).toBeGreaterThan(0);
      expect(config.defaultInteractiveIterations).toBeGreaterThanOrEqual(config.minInteractiveIterations);
      expect(config.maxInteractiveIterations).toBeGreaterThanOrEqual(config.defaultInteractiveIterations);
      expect(config.minSettledIterations).toBeGreaterThan(0);
      expect(config.defaultSettledIterations).toBeGreaterThanOrEqual(config.minSettledIterations);
      expect(config.maxSettledIterations).toBeGreaterThanOrEqual(config.defaultSettledIterations);
      
      // Epsilon bounds
      expect(config.minInteractiveEpsilon).toBeGreaterThan(0);
      expect(config.defaultInteractiveEpsilon).toBeGreaterThanOrEqual(config.minInteractiveEpsilon);
      expect(config.maxInteractiveEpsilon).toBeGreaterThanOrEqual(config.defaultInteractiveEpsilon);
      expect(config.minSettledEpsilon).toBeGreaterThan(0);
      expect(config.defaultSettledEpsilon).toBeGreaterThanOrEqual(config.minSettledEpsilon);
      expect(config.maxSettledEpsilon).toBeGreaterThanOrEqual(config.defaultSettledEpsilon);
      
      // Slicer config
      expect(config.slicer).toBeDefined();
      expect(typeof config.slicer.enabled).toBe('boolean');
    });
  });
});
