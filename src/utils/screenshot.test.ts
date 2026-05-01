import { takeWallpaperScreenshot } from './screenshot';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

vi.mock('three', async () => {
    const actual = await vi.importActual('three') as any;
    return {
        ...actual,
    };
});

vi.mock('three/webgpu', async () => {
    const renderObject = {
        setPixelRatio: vi.fn(),
        setSize: vi.fn(),
        renderAsync: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
        init: vi.fn().mockResolvedValue(undefined),
    };
    return {
        WebGPURenderer: vi.fn().mockImplementation(function() { return renderObject; }),
        MeshBasicNodeMaterial: class { set colorNode(v: any) {}; dispose() {} }
    };
});

describe('takeWallpaperScreenshot', () => {
  beforeEach(() => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock'),
          toBlob: vi.fn((cb) => cb(new Blob(['mock_content'], { type: 'image/jpeg' }))),
          getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() })
        } as any;
      }
      if (tag === 'a') {
        const link = {
            href: '',
            download: '',
            click: vi.fn()
        };
        return link as any;
      }
      return document.createElement(tag);
    });
    
    vi.spyOn(document.body, 'appendChild').mockImplementation((v) => v);
    vi.spyOn(document.body, 'removeChild').mockImplementation((v) => v);
  });

  afterEach(() => {
      vi.restoreAllMocks();
  });

  it('runs successfully with standard params', async () => {
    await takeWallpaperScreenshot({
        fractalType: 0,
        zoom: 2.0,
        offset: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        parameters: { qualityOffset: 0, param1: 1, param2: 2, param3: 3, baseColor: '#ffffff', accentColor: '#000000' },
        slicerEnabled: false,
        slicerOffset: 0,
        slicerAxis: 2,
        adaptiveSettledIterations: 50,
        settledSteps: 100,
        interactiveSteps: 0,
        interactiveEpsilon: 0.001,
        settledEpsilon: 0.0001
    });

    // Check we instantiated a renderer
    expect(WebGPURenderer).toHaveBeenCalled();
  });
});
