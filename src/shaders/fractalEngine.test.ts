import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renderFractal } from './fractalEngine';

describe('Fractal Engine Shader', () => {
  it('should be defined as a TSL function', () => {
    expect(renderFractal).toBeDefined();
    expect(typeof renderFractal).toBe('function');
  });

  it('enforces no-clip camera ray setup, f32 derivative overflow guards, signed interior distance, and zoom-normalized fog', () => {
    const shaderSource = fs.readFileSync(path.resolve(__dirname, './fractalEngine.ts'), 'utf8');

    // 1. Pure no-clip camera ray setup without geometry avoidance pistoning, plus near-clipping window
    expect(shaderSource).toContain('let rayOrigin = uniformRotation * vec3<f32>(0.0, 0.0, -5.0) + uniformOffset;');
    expect(shaderSource).toContain('let globalPoint = (currentPoint - uniformOffset) / uniformZoom + uniformOffset;');
    expect(shaderSource).toContain('let dist = select(abs(signedDist), signedDist, uniformSlicerEnabled > 0.5);');
    expect(shaderSource).toContain('if (totalDist < 0.55 && uniformSlicerEnabled < 0.5)');

    // 2. f32 derivative overflow break, bounded interior log(safeR) distance, and exterior bounding sphere guard
    expect(shaderSource).toContain('if (i >= iterations || radius > 4.0 || derivative > 1e15) { break; }');
    expect(shaderSource).toContain('let safeR = select(radius, max(0.25, radius), radius < 1.0);');
    expect(shaderSource).toContain('let boundedDist = select(rawDist, min(rawDist, pLen - 1.2), pLen > 1.35);');
    expect(shaderSource).not.toContain('max(1.0001, radius)');
    expect(shaderSource).not.toContain('dot(relPoint, relPoint) > 36.0');

    // 3. Double-sided normal orientation for interior surfaces & zoom-normalized depth fog
    expect(shaderSource).toContain('let orientedNormal = select(unitNormal, -unitNormal, dot(unitNormal, rayDirection) > 0.0);');
    expect(shaderSource).toContain('let fogDist = totalDist / max(1.0, pow(uniformZoom, 0.8));');
  });
});
