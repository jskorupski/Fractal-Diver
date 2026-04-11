import { describe, it, expect } from 'vitest';
import { renderFractal } from './fractalEngine';

describe('Fractal Engine Shader', () => {
  it('should be defined as a TSL function', () => {
    expect(renderFractal).toBeDefined();
    expect(typeof renderFractal).toBe('function');
  });
});
