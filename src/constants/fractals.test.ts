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
      expect(config.parameters.iterations).toBeGreaterThan(0);
      expect(Array.isArray(config.offset)).toBe(true);
      expect(config.offset.length).toBe(3);
      expect(config.rotation).toBeDefined();
      
      // Adaptive iteration bounds
      expect(config.minInteractiveIterations).toBeGreaterThan(0);
      expect(config.maxInteractiveIterations).toBeGreaterThan(config.minInteractiveIterations);
      expect(config.minSettledIterations).toBeGreaterThan(0);
      expect(config.maxSettledIterations).toBeGreaterThan(config.minSettledIterations);
      
      // Slicer config
      expect(config.slicer).toBeDefined();
      expect(typeof config.slicer.enabled).toBe('boolean');
    });
  });
});
