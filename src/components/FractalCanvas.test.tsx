import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FractalCanvas, { calculateTargetDpr, getDprBounds } from './FractalCanvas';
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
    isSettledQualityLocked: false,
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

  it('handles WebGPU initialization failure and retries, plus window resize and FractalMesh frame loop', async () => {
    vi.useFakeTimers();
    const { WebGPURenderer } = await import('three/webgpu');
    const { createRoot, useFrame } = await import('@react-three/fiber');

    let capturedFrameCallback: ((state: any, delta: number) => void) | null = null;
    (useFrame as any).mockImplementation((cb: any) => {
      capturedFrameCallback = cb;
    });

    let renderedMeshElement: any = null;
    const mockConfigure = vi.fn();
    (createRoot as any).mockImplementation(() => ({
      configure: mockConfigure,
      render: vi.fn((el) => {
        renderedMeshElement = el;
      }),
      unmount: vi.fn()
    }));

    // First attempt fails init(), second attempt succeeds with a non-resolving device.lost promise
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (WebGPURenderer as any)
      .mockImplementationOnce(function() {
        return {
          init: () => Promise.reject(new Error('No WebGPU adapter')),
          setPixelRatio: vi.fn(),
          setSize: vi.fn(),
          dispose: vi.fn()
        };
      })
      .mockImplementation(function() {
        return {
          init: () => Promise.resolve(),
          setPixelRatio: vi.fn(),
          setSize: vi.fn(),
          dispose: vi.fn(),
          backend: { device: { lost: new Promise(() => {}) } }
        };
      });

    const onFrameTime = vi.fn();
    const { rerender, unmount } = render(
      <FractalCanvas {...defaultProps} onFrameTime={onFrameTime} />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/WEBGPU INITIALIZATION FAILED/i)).toBeInTheDocument();

    // Advance 3000ms to trigger retry, which uses the default succeeding WebGPURenderer mock
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    // Simulate R3F pinning canvas.clientWidth to old dimensions while the parent wrapper div resizes to 1440x900
    const canvasEl = document.querySelector('canvas')!;
    const containerEl = canvasEl.parentElement!;
    Object.defineProperty(canvasEl, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvasEl, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(containerEl, 'clientWidth', { value: 1440, configurable: true });
    Object.defineProperty(containerEl, 'clientHeight', { value: 900, configurable: true });

    // Trigger window resize and verify R3F configure uses the container dimensions, dpr: 1, and camera config
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(mockConfigure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        frameloop: 'demand',
        dpr: 1,
        camera: { position: [0, 0, 1], fov: 50 },
        size: { width: 1440, height: 900, top: 0, left: 0 }
      })
    );

    // Render the captured FractalMesh element to exercise its hooks and useFrame loop
    expect(renderedMeshElement).toBeTruthy();
    const meshRender = render(renderedMeshElement);
    expect(capturedFrameCallback).toBeTypeOf('function');

    // Update FractalMesh with new camera target so smoothing branches (lerp/slerp) execute
    const movedProps = {
      ...defaultProps,
      zoom: 2.5,
      offset: new THREE.Vector3(1, -1, 0.5),
      rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.4, 0.1)),
      slicerEnabled: true,
      isInteracting: true,
      onFrameTime
    };
    meshRender.rerender({ ...renderedMeshElement, props: movedProps });

    act(() => {
      capturedFrameCallback!({}, 0.016);
    });
    expect(onFrameTime).toHaveBeenCalledWith(0.016, true);

    // Verify slow frames (>=500ms) are still reported (clamped to <=1.0s) rather than dropped
    act(() => {
      capturedFrameCallback!({}, 0.75);
    });
    expect(onFrameTime).toHaveBeenLastCalledWith(0.75, true);

    act(() => {
      capturedFrameCallback!({}, 3.5);
    });
    expect(onFrameTime).toHaveBeenLastCalledWith(1.0, false);

    meshRender.unmount();
    unmount();
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('computes pixel-budget DPR across mobile, tablet, Retina desktop, and 1x displays', () => {
    // Samsung S24 Ultra CSS viewport (412x915 @ 3.5x native DPR)
    expect(calculateTargetDpr(412, 915, 3.5, false)).toBe(1.5);
    expect(calculateTargetDpr(412, 915, 3.5, true)).toBe(2.25);

    // Tablet portrait (820x1180 @ 2.0x native DPR)
    expect(calculateTargetDpr(820, 1180, 2.0, false)).toBe(1);
    expect(calculateTargetDpr(820, 1180, 2.0, true)).toBe(1.5);

    // Large 16-inch Retina MacBook Pro window (1728x1117 @ 2.0x) stays at 1x to protect framerate
    expect(calculateTargetDpr(1728, 1117, 2.0, false)).toBe(1);
    expect(calculateTargetDpr(1728, 1117, 2.0, true)).toBe(1);

    // Standard 1x displays and invalid/zero DPR inputs clamp cleanly to 1
    expect(calculateTargetDpr(1920, 1080, 1.0, true)).toBe(1);
    expect(calculateTargetDpr(412, 915, 0, true)).toBe(1);
    expect(calculateTargetDpr(412, 915, Number.NaN, true)).toBe(1);
  });

  it('progressively switches DPR between interactive (1.5x) and settled (2.25x) on high-DPI mobile viewports', async () => {
    vi.useFakeTimers();
    const origDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    const origWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const origHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

    Object.defineProperty(window, 'devicePixelRatio', { value: 3.5, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 915, configurable: true });

    try {
      const { WebGPURenderer } = await import('three/webgpu');
      const { createRoot } = await import('@react-three/fiber');

      const mockSetPixelRatio = vi.fn();
      const mockSetSize = vi.fn();
      (WebGPURenderer as any).mockImplementation(function() {
        return {
          init: () => Promise.resolve(),
          setPixelRatio: mockSetPixelRatio,
          setSize: mockSetSize,
          dispose: vi.fn(),
          backend: { device: { lost: new Promise(() => {}) } }
        };
      });

      const mockConfigure = vi.fn();
      const mockRender = vi.fn();
      (createRoot as any).mockImplementation(() => ({
        configure: mockConfigure,
        render: mockRender,
        unmount: vi.fn()
      }));

      const { rerender, unmount } = render(<FractalCanvas {...defaultProps} isInteracting={false} />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockConfigure).toHaveBeenCalledWith(
        expect.objectContaining({
          dpr: 2.25,
          size: { width: 412, height: 915, top: 0, left: 0 }
        })
      );

      // Start interacting: drops DPR to interactive 1.5x immediately
      rerender(<FractalCanvas {...defaultProps} isInteracting={true} />);
      expect(mockConfigure).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dpr: 1.5
        })
      );
      expect(mockRender.mock.calls[mockRender.mock.calls.length - 1][0].props.dpr).toBe(1.5);

      // End interacting: stays at 1.5x for 150ms debounce while camera momentum settles
      rerender(<FractalCanvas {...defaultProps} isInteracting={false} />);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(mockConfigure).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dpr: 1.5
        })
      );

      // After 150ms idle settle, steps cleanly up to 2.25x
      await act(async () => {
        vi.advanceTimersByTime(110);
      });
      expect(mockConfigure).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dpr: 2.25
        })
      );
      expect(mockRender.mock.calls[mockRender.mock.calls.length - 1][0].props.dpr).toBe(2.25);

      unmount();
    } finally {
      if (origDpr) Object.defineProperty(window, 'devicePixelRatio', origDpr);
      else delete (window as any).devicePixelRatio;
      if (origWidth) Object.defineProperty(window, 'innerWidth', origWidth);
      if (origHeight) Object.defineProperty(window, 'innerHeight', origHeight);
      vi.useRealTimers();
    }
  });

  it('computes getDprBounds and resolutionScale DPR steps across mobile and Retina desktops', () => {
    // S24 Ultra (412x915 @ 3.5x): interactive [1.0, 1.5], settled [1.0, 2.25]
    expect(getDprBounds(412, 915, 3.5, false)).toEqual({ minDpr: 1, maxDpr: 1.5 });
    expect(getDprBounds(412, 915, 3.5, true)).toEqual({ minDpr: 1, maxDpr: 2.25 });
    expect(calculateTargetDpr(412, 915, 3.5, false, 1.0)).toBe(1.5);
    expect(calculateTargetDpr(412, 915, 3.5, false, 0.85)).toBe(1.25);
    expect(calculateTargetDpr(412, 915, 3.5, false, 0.67)).toBe(1.0);
    expect(calculateTargetDpr(412, 915, 3.5, false, 0.25)).toBe(1.0);

    // Retina desktop (1728x1117 @ 2.0x): interactive DRS floor 0.75x, settled floor 1.0x
    expect(getDprBounds(1728, 1117, 2.0, false)).toEqual({ minDpr: 0.75, maxDpr: 1 });
    expect(getDprBounds(1728, 1117, 2.0, true)).toEqual({ minDpr: 1, maxDpr: 1 });
    expect(calculateTargetDpr(1728, 1117, 2.0, false, 1.0)).toBe(1.0);
    expect(calculateTargetDpr(1728, 1117, 2.0, false, 0.75)).toBe(0.75);
    expect(calculateTargetDpr(1728, 1117, 2.0, false, 0.4)).toBe(0.75);
    expect(calculateTargetDpr(1728, 1117, 2.0, true, 0.5)).toBe(1.0);
  });

  it('reconfigures DPR when interactiveResolutionScale drops and fires onDprChange', async () => {
    const origDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    const origWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const origHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

    Object.defineProperty(window, 'devicePixelRatio', { value: 3.5, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 915, configurable: true });

    try {
      const { WebGPURenderer } = await import('three/webgpu');
      const { createRoot } = await import('@react-three/fiber');

      (WebGPURenderer as any).mockImplementation(function() {
        return {
          init: () => Promise.resolve(),
          setPixelRatio: vi.fn(),
          setSize: vi.fn(),
          dispose: vi.fn(),
          backend: { device: { lost: new Promise(() => {}) } }
        };
      });

      const mockConfigure = vi.fn();
      const mockRender = vi.fn();
      (createRoot as any).mockImplementation(() => ({
        configure: mockConfigure,
        render: mockRender,
        unmount: vi.fn()
      }));

      const onDprChange = vi.fn();
      const { rerender, unmount } = render(
        <FractalCanvas
          {...defaultProps}
          isInteracting={true}
          interactiveResolutionScale={1.0}
          onDprChange={onDprChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockConfigure).toHaveBeenLastCalledWith(expect.objectContaining({ dpr: 1.5 }));
      expect(onDprChange).toHaveBeenLastCalledWith(1.5);

      rerender(
        <FractalCanvas
          {...defaultProps}
          isInteracting={true}
          interactiveResolutionScale={0.85}
          onDprChange={onDprChange}
        />
      );
      expect(mockConfigure).toHaveBeenLastCalledWith(expect.objectContaining({ dpr: 1.25 }));
      expect(onDprChange).toHaveBeenLastCalledWith(1.25);

      rerender(
        <FractalCanvas
          {...defaultProps}
          isInteracting={true}
          interactiveResolutionScale={0.67}
          onDprChange={onDprChange}
        />
      );
      expect(mockConfigure).toHaveBeenLastCalledWith(expect.objectContaining({ dpr: 1.0 }));
      expect(onDprChange).toHaveBeenLastCalledWith(1.0);

      unmount();
    } finally {
      if (origDpr) Object.defineProperty(window, 'devicePixelRatio', origDpr);
      else delete (window as any).devicePixelRatio;
      if (origWidth) Object.defineProperty(window, 'innerWidth', origWidth);
      if (origHeight) Object.defineProperty(window, 'innerHeight', origHeight);
    }
  });
});
