import { describe, it, expect } from 'vitest';
import { fractalEngine } from './fractalEngine';

describe('Fractal Engine Shader', () => {
  it('should be defined as a TSL function', () => {
    expect(fractalEngine).toBeDefined();
    expect(typeof fractalEngine).toBe('function');
  });
});
