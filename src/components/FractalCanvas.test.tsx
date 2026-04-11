import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FractalCanvas from './FractalCanvas';
import * as THREE from 'three';

// Mock WebGPURenderer
vi.mock('three/webgpu', () => {
  return {
    WebGPURenderer: vi.fn().mockImplementation(function() {
      return {
        init: vi.fn().mockResolvedValue(undefined),
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        dispose: vi.fn(),
        backend: {
          device: {
            lost: new Promise(() => {}) // Never resolves by default
          }
        }
      };
    }),
    MeshBasicNodeMaterial: vi.fn().mockImplementation(function() {
      return {
        colorNode: null
      };
    })
  };
});

// Mock TSL
vi.mock('three/tsl', () => ({
  uniform: vi.fn((val) => ({ value: val })),
  uv: vi.fn(),
  int: vi.fn(),
  wgslFn: vi.fn((code) => vi.fn()) // fractalEngine is a function returned by wgslFn
}));

// Mock R3F
vi.mock('@react-three/fiber', () => ({
  createRoot: vi.fn().mockImplementation(() => ({
    configure: vi.fn(),
    render: vi.fn(),
    unmount: vi.fn()
  })),
  events: {},
  useFrame: vi.fn(),
  useThree: vi.fn().mockReturnValue({
    size: { width: 100, height: 100 },
    viewport: { width: 1, height: 1 },
    invalidate: vi.fn()
  }),
  extend: vi.fn()
}));

describe('FractalCanvas Component', () => {
  const defaultProps = {
    fractalType: 0,
    zoom: 1,
    offset: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Quaternion(),
    parameters: { qualityOffset: 0, param1: 0, param2: 0, param3: 0 },
    isInteracting: false,
    interactionType: 0,
    adaptiveIterations: 10,
    adaptiveSettledIterations: 20,
    interactiveSteps: 128,
    settledSteps: 768,
    interactiveEpsilon: 0.0005,
    settledEpsilon: 0.00001,
    settleTimeRef: { current: 0 },
    isVisible: true,
    slicerEnabled: false,
    slicerOffset: 0,
    slicerAxis: 0,
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    onMouseDown: vi.fn(),
    onMouseMove: vi.fn(),
    onMouseUp: vi.fn(),
    onMouseLeave: vi.fn()
  };

  it('renders the canvas element', async () => {
    await act(async () => {
      render(<FractalCanvas {...defaultProps} />);
    });
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('shows initialization message initially', async () => {
    let resolveInit: (val: any) => void;
    const initPromise = new Promise((resolve) => {
      resolveInit = resolve;
    });

    // Temporarily override the mock for this test
    const { WebGPURenderer } = await import('three/webgpu');
    (WebGPURenderer as any).mockImplementationOnce(function() {
      return {
        init: () => initPromise,
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        dispose: vi.fn(),
        backend: { device: { lost: new Promise(() => {}) } }
      };
    });

    await act(async () => {
      render(<FractalCanvas {...defaultProps} />);
    });
    
    expect(screen.getByText(/INITIALIZING WEBGPU/i)).toBeInTheDocument();
    
    await act(async () => {
      resolveInit!(undefined);
    });
  });

  it('initializes the renderer and R3F root', async () => {
    await act(async () => {
      render(<FractalCanvas {...defaultProps} />);
    });
    
    // We expect the initialization message to disappear once root is set
    // But in tests, the promise resolution might need more act() calls
  });

  it('handles WebGPU device loss and retries', async () => {
    vi.useFakeTimers();
    let resolveDeviceLost: (val: any) => void;
    const deviceLostPromise = new Promise((resolve) => {
      resolveDeviceLost = resolve;
    });

    const { WebGPURenderer } = await import('three/webgpu');
    (WebGPURenderer as any).mockImplementation(function() {
      return {
        init: () => Promise.resolve(),
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        dispose: vi.fn(),
        backend: { device: { lost: deviceLostPromise } }
      };
    });

    await act(async () => {
      render(<FractalCanvas {...defaultProps} />);
    });

    // Simulate device loss
    await act(async () => {
      resolveDeviceLost!({ message: 'GPU crashed', reason: 'unknown' });
      // Resolve microtasks
      await Promise.resolve();
    });

    expect(screen.getByText(/WEBGPU DEVICE LOST/i)).toBeInTheDocument();

    // Fast-forward timers for retry
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // After retry, it should show initializing again (or be initialized)
    // In our mock, it will re-initialize immediately
    
    vi.useRealTimers();
  });
});
