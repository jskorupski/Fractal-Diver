/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { renderFractal } from './fractalEngine';

/**
 * Lightweight WGSL-to-JS CPU transpiler and vector/matrix math runtime for unit-testing
 * pure mathematical WGSL shader functions directly from Three.js TSL `wgslFn` nodes.
 */
class Vec extends Array<number> {
  get x() { return this[0]; } set x(v: number) { this[0] = v; }
  get y() { return this[1]; } set y(v: number) { this[1] = v; }
  get z() { return this[2]; } set z(v: number) { this[2] = v; }
  get w() { return this[3]; } set w(v: number) { this[3] = v; }
}

function compileWGSLModule(wgslSource: string) {
  const makeVec = (n: number, args: any[]): Vec => {
    const flat: number[] = [];
    for (const a of args) {
      if (Array.isArray(a)) flat.push(...a);
      else flat.push(Number(a));
    }
    if (flat.length === 1) return Vec.from({ length: n }, () => flat[0]) as Vec;
    return Vec.from(flat.slice(0, n)) as Vec;
  };
  const vec2 = (...a: any[]) => makeVec(2, a);
  const vec3 = (...a: any[]) => makeVec(3, a);
  const vec4 = (...a: any[]) => makeVec(4, a);
  const mat3x3 = (...a: any[]) => {
    const m: any = a.length === 1 && Array.isArray(a[0]) ? [...a[0]] : [...a];
    m.isMat3 = true;
    return m;
  };

  const mapOp = (a: any, b: any, fn: (x: number, y: number) => number): any => {
    if (typeof a === 'number' && typeof b === 'number') return fn(a, b);
    if (Array.isArray(a) && Array.isArray(b)) return Vec.from(a.map((v, i) => fn(v, b[i])));
    if (Array.isArray(a)) return Vec.from(a.map((v) => fn(v, b)));
    return Vec.from(b.map((v: number) => fn(a, v)));
  };
  const _add = (a: any, b: any) => mapOp(a, b, (x, y) => x + y);
  const _sub = (a: any, b: any) => mapOp(a, b, (x, y) => x - y);
  const _div = (a: any, b: any) => mapOp(a, b, (x, y) => x / y);
  const _mul = (a: any, b: any) => {
    if (a && a.isMat3 && Array.isArray(b)) {
      return vec3(
        a[0] * b[0] + a[3] * b[1] + a[6] * b[2],
        a[1] * b[0] + a[4] * b[1] + a[7] * b[2],
        a[2] * b[0] + a[5] * b[1] + a[8] * b[2]
      );
    }
    return mapOp(a, b, (x, y) => x * y);
  };
  const _neg = (a: any) => (Array.isArray(a) ? Vec.from(a.map((v) => -v)) : -a);
  const map1 = (a: any, fn: (x: number) => number) => (Array.isArray(a) ? Vec.from(a.map(fn)) : fn(a));

  const f32 = (x: any) => Number(x);
  const i32 = (x: any) => Math.trunc(Number(x));
  const sin = (x: any) => map1(x, Math.sin);
  const cos = (x: any) => map1(x, Math.cos);
  const acos = (x: any) => map1(x, Math.acos);
  const atan2 = (y: any, x: any) => mapOp(y, x, Math.atan2);
  const pow = (x: any, y: any) => mapOp(x, y, Math.pow);
  const log = (x: any) => map1(x, Math.log);
  const log2 = (x: any) => map1(x, Math.log2);
  const exp = (x: any) => map1(x, Math.exp);
  const sqrt = (x: any) => map1(x, Math.sqrt);
  const abs = (x: any) => map1(x, Math.abs);
  const round = (x: any) => map1(x, Math.round);
  const fract = (x: any) => map1(x, (v) => v - Math.floor(v));
  const min = (a: any, b: any) => mapOp(a, b, Math.min);
  const max = (a: any, b: any) => mapOp(a, b, Math.max);
  const clamp = (x: any, lo: any, hi: any) => min(max(x, lo), hi);
  const mix = (a: any, b: any, t: any) => _add(a, _mul(_sub(b, a), t));
  const smoothstep = (e0: any, e1: any, x: any) => {
    const t = clamp(_div(_sub(x, e0), _sub(e1, e0)), 0.0, 1.0);
    return _mul(t, _mul(t, _sub(3.0, _mul(2.0, t))));
  };
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const length = (a: number[]) => Math.hypot(...a);
  const normalize = (a: number[]) => {
    const l = length(a) || 1;
    return Vec.from(a.map((v) => v / l));
  };
  const select = (fVal: any, tVal: any, cond: boolean) => (cond ? tVal : fVal);

  // Pratt parser for WGSL expressions -> JS helper calls (_add, _sub, _mul, _div, _neg)
  const transpileExpr = (exprStr: string): string => {
    const tokens: { type: string; val: string }[] = [];
    let i = 0;
    while (i < exprStr.length) {
      const s = exprStr.slice(i);
      let m: RegExpMatchArray | null;
      if ((m = s.match(/^\s+/))) { i += m[0].length; continue; }
      if ((m = s.match(/^(?:vec[234]|mat3x3)\s*<\s*f32\s*>/))) {
        tokens.push({ type: 'ident', val: m[0].replace(/\s*<\s*f32\s*>/, '') });
        i += m[0].length;
        continue;
      }
      if ((m = s.match(/^[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?/i))) {
        tokens.push({ type: 'num', val: m[0] });
        i += m[0].length;
        continue;
      }
      if ((m = s.match(/^[a-zA-Z_][a-zA-Z0-9_]*/))) {
        tokens.push({ type: 'ident', val: m[0] });
        i += m[0].length;
        continue;
      }
      if ((m = s.match(/^(?:==|!=|<=|>=|&&|\|\|)/))) {
        tokens.push({ type: 'op', val: m[0] });
        i += m[0].length;
        continue;
      }
      if ((m = s.match(/^[+\-*/<>(),.!]/))) {
        tokens.push({ type: m[0], val: m[0] });
        i += 1;
        continue;
      }
      throw new Error(`Unexpected token in WGSL expression: ${s.slice(0, 20)}`);
    }

    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const prec: Record<string, number> = {
      '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6,
    };

    const parsePrimary = (): string => {
      const t = next();
      let node: string;
      if (t.type === '-') node = `_neg(${parseBP(7)})`;
      else if (t.type === '!') node = `(!${parseBP(7)})`;
      else if (t.type === '+') node = parseBP(7);
      else if (t.type === '(') { node = `(${parseBP(0)})`; next(); }
      else node = t.val;

      while (peek() && (peek().type === '(' || peek().type === '.')) {
        const p = next();
        if (p.type === '(') {
          const args: string[] = [];
          if (peek() && peek().type !== ')') {
            while (true) {
              args.push(parseBP(0));
              if (peek() && peek().type === ',') next();
              else break;
            }
          }
          next();
          node = `${node}(${args.join(', ')})`;
        } else if (p.type === '.') {
          node = `${node}.${next().val}`;
        }
      }
      return node;
    };

    const parseBP = (minBP: number): string => {
      let left = parsePrimary();
      while (peek()) {
        const op = peek().val;
        const bp = prec[op];
        if (!bp || bp <= minBP) break;
        next();
        const right = parseBP(bp);
        if (op === '+') left = `_add(${left}, ${right})`;
        else if (op === '-') left = `_sub(${left}, ${right})`;
        else if (op === '*') left = `_mul(${left}, ${right})`;
        else if (op === '/') left = `_div(${left}, ${right})`;
        else left = `(${left} ${op} ${right})`;
      }
      return left;
    };

    return parseBP(0);
  };

  let code = wgslSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  code = code.replace(/fn\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*->\s*[a-zA-Z0-9_<>]+\s*\{/g, (_, name, args) => {
    const paramNames = args.split(',').map((a: string) => a.trim().split(':')[0].trim()).filter(Boolean);
    return `function ${name}(${paramNames.join(', ')}) {`;
  });
  code = code.replace(
    /for\s*\(\s*var\s+([a-zA-Z0-9_]+)\s*=\s*([^;]+);\s*([^;]+);\s*([a-zA-Z0-9_]+)\s*=\s*([^)]+)\)/g,
    (_, v, init, cond, v2, step) => `for (let ${v} = ${transpileExpr(init)}; ${transpileExpr(cond)}; ${v2} = ${transpileExpr(step)})`
  );

  let out = '';
  let idx = 0;
  while (idx < code.length) {
    const ifMatch = code.slice(idx).match(/^(?:\belse\s+)?\bif\s*\(/);
    if (ifMatch) {
      out += ifMatch[0];
      idx += ifMatch[0].length;
      let depth = 1;
      const start = idx;
      while (idx < code.length && depth > 0) {
        if (code[idx] === '(') depth++;
        else if (code[idx] === ')') depth--;
        idx++;
      }
      out += `${transpileExpr(code.slice(start, idx - 1))})`;
      continue;
    }
    out += code[idx++];
  }

  code = out.replace(/(?:^|(?<=[{};]))\s*(?!for\b|if\b|else\b|function\b)([^;{}]+);/g, (full, stmt) => {
    const s = stmt.trim();
    if (!s || s === 'break' || s === 'continue') return full;
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(?:let|var)\s+([a-zA-Z0-9_]+)(?:\s*:\s*[a-zA-Z0-9_<>]+)?\s*=\s*([\s\S]+)$/))) {
      return `\nlet ${m[1]} = ${transpileExpr(m[2])};`;
    }
    if ((m = s.match(/^return\s+([\s\S]+)$/))) {
      return `\nreturn ${transpileExpr(m[1])};`;
    }
    if ((m = s.match(/^([a-zA-Z0-9_.]+)\s*(\+=|-=|\*=|\/=|=)\s*([\s\S]+)$/))) {
      const [, lhs, op, rhs] = m;
      const tRhs = transpileExpr(rhs);
      if (op === '=') return `\n${lhs} = ${tRhs};`;
      const fnMap: Record<string, string> = { '+=': '_add', '-=': '_sub', '*=': '_mul', '/=': '_div' };
      return `\n${lhs} = ${fnMap[op]}(${lhs}, ${tRhs});`;
    }
    return full;
  });

  const fullBody = `${code}\nreturn { renderFractal, getFractalData, getMandelbulbData, getMengerSpongeData, getJuliaData, getSierpinskiData, getMandelboxData, getApollonianData, vec2, vec3, vec4, mat3x3 };`;
  return new Function(
    'vec2', 'vec3', 'vec4', 'mat3x3', '_add', '_sub', '_mul', '_div', '_neg',
    'f32', 'i32', 'sin', 'cos', 'acos', 'atan2', 'pow', 'log', 'log2', 'exp', 'sqrt', 'abs', 'round', 'fract',
    'min', 'max', 'clamp', 'mix', 'smoothstep', 'dot', 'length', 'normalize', 'select',
    fullBody
  )(
    vec2, vec3, vec4, mat3x3, _add, _sub, _mul, _div, _neg,
    f32, i32, sin, cos, acos, atan2, pow, log, log2, exp, sqrt, abs, round, fract,
    min, max, clamp, mix, smoothstep, dot, length, normalize, select
  );
}

describe('Fractal Engine WGSL Shader Unit Tests', () => {
  let shader: ReturnType<typeof compileWGSLModule>;

  beforeAll(() => {
    const wgslCode = (renderFractal as any).functionNode.code as string;
    expect(wgslCode).toBeTruthy();
    shader = compileWGSLModule(wgslCode);
  });

  it('exports a valid TSL wgslFn node', () => {
    expect(renderFractal).toBeDefined();
    expect(typeof renderFractal).toBe('function');
  });

  describe('getMandelbulbData (Triplex Distance Estimator)', () => {
    it('returns positive distance outside the Mandelbulb and finite values at the exact origin', () => {
      const { vec3, getMandelbulbData } = shader;
      const ext = getMandelbulbData(vec3(0, 0, -2.0), 8.0, 12);
      expect(ext.x).toBeGreaterThan(0.2);
      expect(ext.y).toBeGreaterThanOrEqual(0);
      expect(ext.y).toBeLessThanOrEqual(1);

      // Origin (0,0,0) guard: safeRadius prevents 0/0 NaN in acos(z.z / safeRadius)
      const origin = getMandelbulbData(vec3(0, 0, 0), 8.0, 12);
      expect(Number.isFinite(origin.x)).toBe(true);
      expect(Number.isFinite(origin.y)).toBe(true);
    });

    it('returns a substantial negative signed distance inside the bulb to prevent 800-step interior GPU freezes', () => {
      const { vec3, getMandelbulbData } = shader;
      const interior = getMandelbulbData(vec3(0, 0, -0.5), 8.0, 16);
      // Must be negative and large enough in magnitude (|d| > 0.02) so hollow-shell raymarching crosses the interior in ~15 steps
      expect(interior.x).toBeLessThan(-0.02);
    });

    it('bounds far exterior distances by the bounding sphere so zoomed-out rays never overshoot the front surface', () => {
      const { vec3, getMandelbulbData } = shader;
      // At z = -13.14 (zoom = 0.35), unguarded 0.4 * r * ln(r) would return 13.54 and overshoot z = -1.1 into z = +0.4
      const far = getMandelbulbData(vec3(0, 0, -13.14), 8.0, 12);
      expect(far.x).toBeLessThanOrEqual(13.14 - 1.2 + 1e-5);
      expect(far.x).toBeGreaterThan(10.0);
    });
  });

  describe('getMengerSpongeData, getJuliaData, getSierpinskiData, getMandelboxData, getApollonianData', () => {
    it('evaluates Menger Sponge exterior, solid wall interior, and central cross-channel cavity accurately', () => {
      const { vec3, getMengerSpongeData } = shader;
      const outside = getMengerSpongeData(vec3(0, 0, -2.5), 3.0, 4);
      expect(outside.x).toBeCloseTo(1.5, 4);

      // Cross-channel cavity at (1/3, 1/3, 0) is carved out -> positive distance (~1/3)
      const channelHole = getMengerSpongeData(vec3(1 / 3, 1 / 3, 0), 3.0, 1);
      expect(channelHole.x).toBeCloseTo(1 / 3, 4);

      // Solid corner frame (0.8, 0.8, 0.8) at 1 iteration is inside the solid bar -> negative distance
      const solidCorner = getMengerSpongeData(vec3(0.8, 0.8, 0.8), 3.0, 1);
      expect(solidCorner.x).toBeLessThan(0);
    });

    it('bounds Julia Set exterior distances and prevents interior derivative underflow', () => {
      const { vec3, getJuliaData } = shader;
      const farJulia = getJuliaData(vec3(0, 0, -15.0), vec3(-0.4, 0.6, 0.1), 16);
      expect(farJulia.x).toBeLessThanOrEqual(15.0 - 1.8 + 1e-5);

      const interiorJulia = getJuliaData(vec3(0, 0, 0), vec3(0, 0, 0), 40);
      expect(Number.isFinite(interiorJulia.x)).toBe(true);
      expect(interiorJulia.x).toBeLessThan(-0.01);
    });

    it('evaluates Sierpinski, Mandelbox, and infinite Apollonian distance estimators without spherical clipping', () => {
      const { vec3, getSierpinskiData, getMandelboxData, getApollonianData } = shader;
      const sierp = getSierpinskiData(vec3(0.5, 0.5, 0.5), 2.0, 8);
      expect(sierp.x).toBeGreaterThanOrEqual(0);
      expect(sierp.y).toBeGreaterThanOrEqual(0);
      expect(sierp.y).toBeLessThanOrEqual(1);

      const mbox = getMandelboxData(vec3(1.5, 0.5, -0.5), 2.0, 0.5, 1.0, 10);
      expect(mbox.x).toBeGreaterThan(0);
      expect(Number.isFinite(mbox.x)).toBe(true);

      // Apollonian is periodic across all of R^3; verify it evaluates cleanly far beyond radius 6.0
      const apollonianFar = getApollonianData(vec3(12.3, 0.2, -14.7), 1.5, 8);
      expect(apollonianFar.x).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(apollonianFar.x)).toBe(true);
    });
  });

  describe('getFractalData Dispatcher & CSG Slicer', () => {
    it('dispatches all 6 fractal types and applies X/Y/Z half-space CSG slicing', () => {
      const { vec3, vec4, getFractalData } = shader;
      const params = vec4(0, 8.0, 0.5, 1.0);

      for (let type = 0; type <= 5; type++) {
        const res = getFractalData(vec3(0.2, 0.3, -1.5), type, params, 1.0, 0.0, 0.0, 0.0, 0, 0, 8.0, 12.0, 0.0);
        expect(Number.isFinite(res.x)).toBe(true);
        expect(Number.isFinite(res.y)).toBe(true);
      }

      // CSG slicer enabled on X, Y, Z axes clips points on the negative side of planeDist
      const unsliced = getFractalData(vec3(-0.5, -0.5, -0.5), 0, params, 1.0, 0.0, 0.0, 0.0, 0, 0, 8.0, 12.0, 0.0);
      for (const axis of [0, 1, 2]) {
        const sliced = getFractalData(vec3(-0.5, -0.5, -0.5), 0, params, 1.0, 0.0, 1.0, 0.25, axis, 0, 8.0, 12.0, 0.0);
        expect(sliced.x).toBeGreaterThanOrEqual(0.75);
        expect(sliced.x).toBeGreaterThan(unsliced.x);
      }
    });
  });

  describe('renderFractal End-to-End Raymarching & Shading', () => {
    const renderPixel = (opts: {
      uv?: [number, number];
      type?: number;
      zoom?: number;
      settleTime?: number;
      slicerEnabled?: number;
      params?: [number, number, number, number];
    }) => {
      const { vec2, vec3, vec4, mat3x3, renderFractal: runShader } = shader;
      const idMat = mat3x3(1, 0, 0, 0, 1, 0, 0, 0, 1);
      return runShader(
        vec2(...(opts.uv ?? [0.5, 0.5])),
        vec2(800, 600),
        opts.type ?? 0,
        opts.zoom ?? 1.0,
        vec3(0, 0, 0),
        idMat,
        0.0,
        0,
        8.0,
        12.0,
        opts.settleTime ?? 1.0,
        80.0,
        250.0,
        0.001,
        0.0002,
        opts.slicerEnabled ?? 0.0,
        0.0,
        0,
        vec4(...(opts.params ?? [0, 8.0, 0.5, 1.0])),
        vec3(0.7, 0.3, 0.9),
        vec3(1.0, 0.8, 0.4)
      );
    };

    it('renders valid lit RGBA pixels at zoomed-out (0.35x), default (1.0x), and deep no-clip dive (15x) magnifications', () => {
      for (const zoom of [0.35, 1.0, 15.0]) {
        const rgba = renderPixel({ type: 0, zoom, params: [0, 8.0, 0, 0] });
        expect(rgba.w).toBe(1.0);
        // Must hit the fractal and produce lit, non-black ACES-tonemapped color in (0, 1]
        const luminance = rgba.x + rgba.y + rgba.z;
        expect(luminance).toBeGreaterThan(0.05);
        expect(rgba.x).toBeLessThanOrEqual(1.0);
        expect(rgba.y).toBeLessThanOrEqual(1.0);
        expect(rgba.z).toBeLessThanOrEqual(1.0);
      }

      // Corner sky ray at zoom=0.5 misses the bounded Mandelbulb and returns black background [0, 0, 0, 1]
      const sky = renderPixel({ uv: [0.02, 0.02], type: 0, zoom: 0.5, params: [0, 8.0, 0, 0] });
      expect(sky).toEqual([0, 0, 0, 1]);
    });

    it('renders off-center Apollonian Gasket rays without spherical cutoff artifacts', () => {
      const rgba = renderPixel({ uv: [0.25, 0.5], type: 5, zoom: 0.7, params: [0, 1.45, 0, 0] });
      expect(rgba.w).toBe(1.0);
      expect(rgba.x + rgba.y + rgba.z).toBeGreaterThan(0.01);
    });
  });
});
