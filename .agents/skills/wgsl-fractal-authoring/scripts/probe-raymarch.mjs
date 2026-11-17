#!/usr/bin/env node
/**
 * Diagnostic CPU probe for Fractal Diver's WGSL shader.
 *
 * Extracts the live WGSL shader source from `src/shaders/fractalEngine.ts`, transpiles it
 * into executable JS math functions (zero browser/GPU dependencies), checks Distance Estimator
 * invariants, and evaluates `renderFractal` across fractal types and zoom levels.
 *
 * Usage:
 *   node .agents/skills/wgsl-fractal-authoring/scripts/probe-raymarch.mjs
 *   node .agents/skills/wgsl-fractal-authoring/scripts/probe-raymarch.mjs --type 0 --zoom 0.35,1,4.5,15
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const shaderPath = path.join(repoRoot, 'src/shaders/fractalEngine.ts');

// Default views matching src/constants/fractals.ts (Euler XYZ radians -> rotation, params, slicer)
const FRACTALS = [
  { id: 0, name: 'Mandelbulb', zoom: 1.2, rot: [0, 0, 0], params: [0, 8.0, 0, 0], iters: [8, 10], steps: [120, 800], eps: [0.0005, 0.0001], slicer: [0, 0, 2], base: [0.80, 0.63, 0.49], accent: [0.70, 0.45, 0.16] },
  { id: 1, name: 'Menger Sponge', zoom: 1.0, rot: [0.5, 0.5, 0], params: [0, 3.48, 0, 0], iters: [8, 16], steps: [120, 800], eps: [0.0005, 0.0001], slicer: [0, 0, 2], base: [0.35, 0.56, 0.57], accent: [0.10, 0.49, 0.74] },
  { id: 2, name: 'Julia Set', zoom: 1.2, rot: [0, 0, 0], params: [0, 0, -0.8, 0.156], iters: [32, 64], steps: [80, 600], eps: [0.0005, 0.0001], slicer: [1, 0, 2], base: [0.76, 0.48, 0.88], accent: [0.11, 0.05, 0.13] },
  { id: 3, name: 'Sierpinski', zoom: 1.0, rot: [0.4, 0.8, 0], params: [0, 1.75, 0, 0], iters: [12, 30], steps: [60, 400], eps: [0.001, 0.0001], slicer: [0, 0, 2], base: [0.25, 0.82, 0.71], accent: [0.00, 0.14, 0.11] },
  { id: 4, name: 'Mandelbox', zoom: 0.15, rot: [0.2, 0.4, 0], params: [0, 2.0, 0.135, 1.0], iters: [24, 48], steps: [100, 600], eps: [0.0005, 0.0001], slicer: [0, 0, 2], base: [0.89, 0.82, 0.90], accent: [0.85, 0.53, 0.78] },
  { id: 5, name: 'Apollonian', zoom: 1.5, rot: [0.5, 0.5, 0.5], params: [0, 1.0, 0, 0], iters: [8, 16], steps: [60, 300], eps: [0.002, 0.0005], slicer: [1, 0, 2], base: [0.78, 0.70, 0.64], accent: [0.98, 0.60, 0.35] },
];

function extractWGSL(tsSource) {
  const match = tsSource.match(/export const renderFractal = wgslFn\(`([\s\S]*?)`\);/);
  if (!match) throw new Error('Could not locate renderFractal = wgslFn(`...`) in src/shaders/fractalEngine.ts');
  return match[1];
}

class Vec extends Array {
  get x() { return this[0]; } set x(v) { this[0] = v; }
  get y() { return this[1]; } set y(v) { this[1] = v; }
  get z() { return this[2]; } set z(v) { this[2] = v; }
  get w() { return this[3]; } set w(v) { this[3] = v; }
}

function compileWGSLModule(wgslSource) {
  const makeVec = (n, args) => {
    const flat = [];
    for (const a of args) {
      if (Array.isArray(a)) flat.push(...a);
      else flat.push(Number(a));
    }
    if (flat.length === 1) return Vec.from({ length: n }, () => flat[0]);
    return Vec.from(flat.slice(0, n));
  };
  const vec2 = (...a) => makeVec(2, a);
  const vec3 = (...a) => makeVec(3, a);
  const vec4 = (...a) => makeVec(4, a);
  const mat3x3 = (...a) => {
    const m = a.length === 1 && Array.isArray(a[0]) ? [...a[0]] : [...a];
    m.isMat3 = true;
    return m;
  };
  const mapOp = (a, b, fn) => {
    if (typeof a === 'number' && typeof b === 'number') return fn(a, b);
    if (Array.isArray(a) && Array.isArray(b)) return Vec.from(a.map((v, i) => fn(v, b[i])));
    if (Array.isArray(a)) return Vec.from(a.map((v) => fn(v, b)));
    return Vec.from(b.map((v) => fn(a, v)));
  };
  const _add = (a, b) => mapOp(a, b, (x, y) => x + y);
  const _sub = (a, b) => mapOp(a, b, (x, y) => x - y);
  const _div = (a, b) => mapOp(a, b, (x, y) => x / y);
  const _mul = (a, b) => {
    if (a && a.isMat3 && Array.isArray(b)) {
      return vec3(
        a[0] * b[0] + a[3] * b[1] + a[6] * b[2],
        a[1] * b[0] + a[4] * b[1] + a[7] * b[2],
        a[2] * b[0] + a[5] * b[1] + a[8] * b[2]
      );
    }
    return mapOp(a, b, (x, y) => x * y);
  };
  const _neg = (a) => (Array.isArray(a) ? Vec.from(a.map((v) => -v)) : -a);
  const map1 = (a, fn) => (Array.isArray(a) ? Vec.from(a.map(fn)) : fn(a));

  const f32 = (x) => Number(x);
  const i32 = (x) => Math.trunc(Number(x));
  const sin = (x) => map1(x, Math.sin);
  const cos = (x) => map1(x, Math.cos);
  const acos = (x) => map1(x, Math.acos);
  const atan2 = (y, x) => mapOp(y, x, Math.atan2);
  const pow = (x, y) => mapOp(x, y, Math.pow);
  const log = (x) => map1(x, Math.log);
  const log2 = (x) => map1(x, Math.log2);
  const exp = (x) => map1(x, Math.exp);
  const sqrt = (x) => map1(x, Math.sqrt);
  const abs = (x) => map1(x, Math.abs);
  const round = (x) => map1(x, Math.round);
  const fract = (x) => map1(x, (v) => v - Math.floor(v));
  const min = (a, b) => mapOp(a, b, Math.min);
  const max = (a, b) => mapOp(a, b, Math.max);
  const clamp = (x, lo, hi) => min(max(x, lo), hi);
  const mix = (a, b, t) => _add(a, _mul(_sub(b, a), t));
  const smoothstep = (e0, e1, x) => {
    const t = clamp(_div(_sub(x, e0), _sub(e1, e0)), 0.0, 1.0);
    return _mul(t, _mul(t, _sub(3.0, _mul(2.0, t))));
  };
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const length = (a) => Math.hypot(...a);
  const normalize = (a) => {
    const l = length(a) || 1;
    return Vec.from(a.map((v) => v / l));
  };
  const select = (fVal, tVal, cond) => (cond ? tVal : fVal);

  const transpileExpr = (exprStr) => {
    const tokens = [];
    let i = 0;
    while (i < exprStr.length) {
      const s = exprStr.slice(i);
      let m;
      if ((m = s.match(/^\s+/))) { i += m[0].length; continue; }
      if ((m = s.match(/^(?:vec[234]|mat3x3)\s*<\s*f32\s*>/))) {
        tokens.push({ type: 'ident', val: m[0].replace(/\s*<\s*f32\s*>/, '') });
        i += m[0].length; continue;
      }
      if ((m = s.match(/^[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?/i))) {
        tokens.push({ type: 'num', val: m[0] });
        i += m[0].length; continue;
      }
      if ((m = s.match(/^[a-zA-Z_][a-zA-Z0-9_]*/))) {
        tokens.push({ type: 'ident', val: m[0] });
        i += m[0].length; continue;
      }
      if ((m = s.match(/^(?:==|!=|<=|>=|&&|\|\|)/))) {
        tokens.push({ type: 'op', val: m[0] });
        i += m[0].length; continue;
      }
      if ((m = s.match(/^[+\-*/<>(),.!]/))) {
        tokens.push({ type: m[0], val: m[0] });
        i += 1; continue;
      }
      throw new Error(`Unexpected token in WGSL expression: ${s.slice(0, 20)}`);
    }

    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const prec = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6 };

    const parsePrimary = () => {
      const t = next();
      let node;
      if (t.type === '-') node = `_neg(${parseBP(7)})`;
      else if (t.type === '!') node = `(!${parseBP(7)})`;
      else if (t.type === '+') node = parseBP(7);
      else if (t.type === '(') { node = `(${parseBP(0)})`; next(); }
      else node = t.val;

      while (peek() && (peek().type === '(' || peek().type === '.')) {
        const p = next();
        if (p.type === '(') {
          const args = [];
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

    const parseBP = (minBP) => {
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
    const paramNames = args.split(',').map((a) => a.trim().split(':')[0].trim()).filter(Boolean);
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
    let m;
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
      const fnMap = { '+=': '_add', '-=': '_sub', '*=': '_mul', '/=': '_div' };
      return `\n${lhs} = ${fnMap[op]}(${lhs}, ${tRhs});`;
    }
    return full;
  });

  const fullBody = `${code}\nreturn { renderFractal, getFractalData, getMandelbulbData, vec2, vec3, vec4, mat3x3 };`;
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

// Column-major 3x3 rotation matrix from Three.js default Euler 'XYZ'
function eulerXYZToMat3ColMajor(rx, ry, rz) {
  const a = Math.cos(rx), b = Math.sin(rx);
  const c = Math.cos(ry), d = Math.sin(ry);
  const e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  // Column-major elements [col0.x, col0.y, col0.z, col1.x, ...] matching THREE.Matrix3.setFromMatrix4
  return [
    c * e,            af + be * d,  bf - ae * d,
    -c * f,           ae - bf * d,  be + af * d,
    d,                -b * c,       a * c,
  ];
}

function parseArgs(argv) {
  let typeFilter = null;
  let zooms = [0.35, 1.0, 4.5, 15.0];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--type' && argv[i + 1] !== undefined) {
      typeFilter = Number(argv[++i]);
    } else if (argv[i] === '--zoom' && argv[i + 1] !== undefined) {
      zooms = argv[++i].split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
    }
  }
  return { typeFilter, zooms };
}

function main() {
  const { typeFilter, zooms } = parseArgs(process.argv.slice(2));
  const tsSource = fs.readFileSync(shaderPath, 'utf8');
  const wgsl = extractWGSL(tsSource);
  const shader = compileWGSLModule(wgsl);
  const { vec2, vec3, vec4, mat3x3, renderFractal, getFractalData, getMandelbulbData } = shader;

  let failures = 0;
  const check = (cond, msg) => {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    }
  };

  // DE safety invariants on Mandelbulb
  const mbOrigin = getMandelbulbData(vec3(0, 0, 0), 8.0, 12);
  const mbInterior = getMandelbulbData(vec3(0, 0, -0.5), 8.0, 16);
  const mbFar = getMandelbulbData(vec3(0, 0, -13.14), 8.0, 12);
  check(Number.isFinite(mbOrigin.x) && Number.isFinite(mbOrigin.y), `Mandelbulb origin NaN/Inf: ${mbOrigin}`);
  check(mbInterior.x < -0.02, `Mandelbulb interior d >= -0.02 (${mbInterior.x}) risks GPU stall`);
  check(mbFar.x <= 13.14 - 1.2 + 1e-5, `Mandelbulb far-exterior overshoot (${mbFar.x})`);

  const targets = typeFilter === null ? FRACTALS : FRACTALS.filter((f) => f.id === typeFilter);
  if (targets.length === 0) {
    console.error(`No fractal matched --type ${typeFilter}`);
    process.exit(1);
  }

  console.log('Fractal WGSL CPU Probe (settled quality @ 800x600)');
  console.log('-------------------------------------------------------------------');

  for (const f of targets) {
    const rotMat = mat3x3(...eulerXYZToMat3ColMajor(...f.rot));
    const paramsVec = vec4(...f.params);

    // Check DE origin & far point finiteness
    const deTest = getFractalData(vec3(0.2, -0.3, -1.5), f.id, paramsVec, 1.0, 0.0, f.slicer[0], f.slicer[1], f.slicer[2], 0, f.iters[0], f.iters[1], 0.0);
    check(Number.isFinite(deTest.x) && Number.isFinite(deTest.y), `${f.name} DE produced non-finite value`);

    const zoomList = zooms.includes(f.zoom) ? zooms : [f.zoom, ...zooms];
    for (const z of zoomList) {
      const sampleUVs = [[0.5, 0.5], [0.35, 0.55]];
      let anyHit = false;
      const lumList = [];

      for (const [u, v] of sampleUVs) {
        const rgba = renderFractal(
          vec2(u, v),
          vec2(800, 600),
          f.id,
          z,
          vec3(0, 0, 0),
          rotMat,
          0.0,
          0,
          f.iters[0],
          f.iters[1],
          1.0,
          f.steps[0],
          f.steps[1],
          f.eps[0],
          f.eps[1],
          f.slicer[0],
          f.slicer[1],
          f.slicer[2],
          paramsVec,
          vec3(...f.base),
          vec3(...f.accent)
        );

        const finite = rgba.every((c) => Number.isFinite(c) && c >= 0 && c <= 1.0001);
        check(finite, `${f.name} z=${z} uv=(${u},${v}) out-of-range RGBA: ${rgba}`);
        const lum = rgba[0] + rgba[1] + rgba[2];
        if (lum > 0.01) anyHit = true;
        lumList.push(lum.toFixed(3));
      }

      // At nominal zoom and modest zoom, at least one primary sample should hit solid surface
      if (z >= 0.35 && z <= 4.5 && f.id === 0) {
        check(anyHit, `Mandelbulb z=${z} returned all-black pixels across sample UVs`);
      }
      console.log(
        `${f.name.padEnd(14)} | zoom=${String(z).padStart(5)} | DE(-1.5)=${deTest.x.toFixed(4)} | lum(center,off)=[${lumList.join(', ')}] | ${anyHit ? 'HIT' : 'MISS'}`
      );
    }
  }

  console.log('-------------------------------------------------------------------');
  if (failures > 0) {
    console.error(`Probe failed with ${failures} error(s).`);
    process.exit(1);
  }
  console.log('All WGSL shader checks passed.');
}

main();
